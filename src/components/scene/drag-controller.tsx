'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { DESK_TOP_Y, ROOM_SIZE, findHostDesk, rotatedExtents, resolveSnap } from '@/lib/placement';
import { useStore } from '@/lib/store';
import type { SceneItem, SnapZone } from '@/lib/types';
import { invalidate } from './use-scene-invalidation';

/**
 * Pointer drag pipeline (Slice 9). Two entry paths share one drag state:
 *
 *   - Rail handoff — a catalog card stages its sku on pointerdown
 *     (device-slice pendingSku); the first pressed pointermove anywhere
 *     starts the drag. A plain click never starts one: the rail's onClick
 *     adds the item instead.
 *   - Grab — a canvas pointerdown whose topmost hit walks up to a placed
 *     item's group (userData.itemId, placed-item.tsx) picks that item up.
 *     The grab becomes a move only after real pointer travel, so a click
 *     never relocates an item.
 *
 * The ghost is a footprint-sized box proxy, never the real model (D9); a
 * moved item hides while its ghost flies. Desk planes are tested before the
 * floor (research ordering); host lookup reuses the locked placement helper.
 * A drop counts as being on the room only when the canvas itself is the
 * element under the pointer — an overlay (the mobile sheet, the sticky bar,
 * the preset row) covers that pixel and takes the release instead. The
 * preview snap is advisory — the store's commitPlacement re-validates every
 * drop (D10) and its boolean is authoritative. A refused move spring-backs
 * to the drag origin (a short tween, skipped under reduced motion); a
 * refused rail drop just cancels. OrbitControls is suspended for the drag
 * and restored after.
 *
 * This component holds no React state: every per-frame value lives in refs
 * read inside useFrame, so pointer moves never re-render React (Performance
 * Considerations). All frame requests go through the sanctioned invalidation
 * path: the ghost-follow move, the spring-back tween (its first frame
 * included), and the drag-end repaint that clears a cancelled ghost.
 */

/** Ghost slab height in meters. */
const GHOST_HEIGHT = 0.08;

/** Spring-back tween duration in milliseconds; skipped under reduced motion. */
const SPRING_BACK_MS = 160;

/** Pointer travel in pixels before a grab counts as a move, not a click. */
const DRAG_THRESHOLD_PX = 4;

const VALID_COLOR = '#10b981';
const INVALID_COLOR = '#ef4444';

/** The OrbitControls surface this controller needs — typed locally (see PresetRig). */
interface ControlsLike {
  enabled: boolean;
}

interface DragState {
  sku: string;
  /** Set when an existing item is being moved; absent for a rail drop. */
  selfId?: string;
  /** Stored position of a moved item — the spring-back target. */
  origin?: [number, number, number];
  /**
   * A move re-states the item's stored rotation (the Slice 4 echo contract:
   * a drag never silently resets a rotated item); a rail drop starts at 0.
   */
  rotationY: number;
  /** The hidden original while a moved item is in flight. */
  grabbedObject: THREE.Object3D | null;
  /** Pointerdown origin, for the click-versus-drag threshold (grabs only). */
  startX: number;
  startY: number;
  /** True once the pointer has travelled past the threshold. */
  moved: boolean;
  springBack: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null;
}

export function DragController() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;

  const ghostRef = useRef<THREE.Mesh>(null);
  const dragRef = useRef<DragState | null>(null);
  const targetPos = useRef(new THREE.Vector3());
  const controlsRef = useRef<ControlsLike | null>(null);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const deskPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_TOP_Y), []);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  // The media query is synced into the device slice on mount and on change —
  // the store is the single source (D14); this component is its only writer.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => useStore.getState().setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const finishDrag = useCallback(() => {
    dragRef.current = null;
    const s = useStore.getState();
    s.setDragging(false);
    s.setPendingSku(null);
    const c = controlsRef.current;
    if (c) c.enabled = true;
    invalidate();
  }, []);

  useFrame(() => {
    const ghost = ghostRef.current;
    const drag = dragRef.current;
    if (!ghost) return;
    if (drag?.springBack) {
      const { from, to, start } = drag.springBack;
      const t = Math.min((performance.now() - start) / SPRING_BACK_MS, 1);
      ghost.position.lerpVectors(from, to, t);
      invalidate();
      if (t >= 1) {
        if (drag.grabbedObject) drag.grabbedObject.visible = true;
        ghost.visible = false;
        finishDrag();
      }
      return;
    }
    if (drag) ghost.position.copy(targetPos.current);
  });

  useEffect(() => {
    const el = gl.domElement;

    const setNdc = (event: PointerEvent): boolean => {
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      if (x < -1 || x > 1 || y < -1 || y > 1) return false;
      ndc.set(x, y);
      return true;
    };

    /**
     * True when the canvas itself is the element under the pointer. A captured
     * pointer retargets its events to the canvas, so the event target cannot
     * answer this — the DOM hit-test does, and it skips pointer-events-none
     * pills the way a real release would.
     */
    const onCanvas = (event: PointerEvent): boolean =>
      document.elementFromPoint(event.clientX, event.clientY) === el;

    const pickItem = (event: PointerEvent): { item: SceneItem; object: THREE.Object3D } | null => {
      if (!setNdc(event)) return null;
      raycaster.setFromCamera(ndc, camera);
      const [first] = raycaster.intersectObjects(scene.children, true);
      if (!first) return null;
      let obj: THREE.Object3D | null = first.object;
      while (obj) {
        const itemId = obj.userData.itemId as string | undefined;
        if (itemId) {
          const item = useStore.getState().scene.items.find((i) => i.id === itemId);
          return item ? { item, object: obj } : null;
        }
        obj = obj.parent;
      }
      return null;
    };

    /**
     * Drop target under the pointer: desk planes first, then the floor — the
     * research ordering. A hit outside every desk footprint, or off the room,
     * is no target at all.
     */
    const pickDrop = (): { point: THREE.Vector3; zone: SnapZone; hostDesk?: SceneItem } | null => {
      raycaster.setFromCamera(ndc, camera);
      const drag = dragRef.current;
      if (drag && raycaster.ray.intersectPlane(deskPlane, hitPoint)) {
        const hostDesk = findHostDesk(
          { sku: drag.sku, position: [hitPoint.x, DESK_TOP_Y, hitPoint.z] },
          useStore.getState().scene.items,
          CATALOG_BY_ID,
        );
        if (hostDesk) return { point: hitPoint, zone: 'desk', hostDesk };
      }
      if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
        if (Math.abs(hitPoint.x) <= ROOM_SIZE / 2 && Math.abs(hitPoint.z) <= ROOM_SIZE / 2) {
          return { point: hitPoint, zone: 'floor' };
        }
      }
      return null;
    };

    const showGhost = (valid: boolean) => {
      const ghost = ghostRef.current;
      if (!ghost) return;
      ghost.visible = true;
      (ghost.material as THREE.MeshBasicMaterial).color.set(valid ? VALID_COLOR : INVALID_COLOR);
    };

    const hideGhost = () => {
      const ghost = ghostRef.current;
      if (ghost) ghost.visible = false;
    };

    const beginDrag = (
      state: Pick<DragState, 'sku' | 'rotationY'> &
        Partial<Pick<DragState, 'selfId' | 'origin' | 'grabbedObject' | 'startX' | 'startY'>>,
    ) => {
      dragRef.current = {
        sku: state.sku,
        rotationY: state.rotationY,
        selfId: state.selfId,
        origin: state.origin,
        grabbedObject: state.grabbedObject ?? null,
        startX: state.startX ?? 0,
        startY: state.startY ?? 0,
        moved: false,
        springBack: null,
      };
      const entry = CATALOG_BY_ID.get(state.sku);
      if (entry) {
        const [ew, ed] = rotatedExtents(entry.footprint, state.rotationY);
        ghostRef.current?.scale.set(ew, 1, ed);
      }
      const s = useStore.getState();
      s.setDragging(true);
      const c = controlsRef.current;
      if (c) c.enabled = false;
    };

    const previewSnap = (
      drop: { point: THREE.Vector3; zone: SnapZone; hostDesk?: SceneItem },
      drag: DragState,
    ) =>
      resolveSnap(
        [drop.point.x, drop.point.y, drop.point.z],
        drop.zone,
        drag.sku,
        drag.rotationY,
        useStore.getState().scene.items,
        CATALOG_BY_ID,
        drag.selfId,
        drop.hostDesk,
      );

    const updateGhost = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // A grab becomes a move only after real pointer travel: a click on a
      // placed item must not relocate it to the ground point under the cursor.
      if (!drag.moved) {
        if (
          drag.selfId &&
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        drag.moved = true;
      }
      // The original hides on the first real move, not on the grab — a plain
      // click on a placed item must not make it blink.
      if (drag.grabbedObject?.visible) drag.grabbedObject.visible = false;
      const drop = onCanvas(event) && setNdc(event) ? pickDrop() : null;
      if (!drop) {
        hideGhost();
      } else {
        const snap = previewSnap(drop, drag);
        if (snap) {
          targetPos.current.set(
            snap.position[0],
            snap.position[1] + GHOST_HEIGHT / 2,
            snap.position[2],
          );
          showGhost(true);
        } else {
          targetPos.current.set(drop.point.x, drop.point.y + GHOST_HEIGHT / 2, drop.point.z);
          showGhost(false);
        }
      }
      invalidate();
    };

    const endDrag = (committed: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      const reveal = () => {
        if (drag.grabbedObject) drag.grabbedObject.visible = true;
        hideGhost();
      };
      if (committed) {
        reveal();
        finishDrag();
        return;
      }
      if (drag.selfId && drag.origin) {
        const ghost = ghostRef.current;
        if (ghost?.visible && !useStore.getState().reducedMotion) {
          drag.springBack = {
            from: ghost.position.clone(),
            to: new THREE.Vector3(
              drag.origin[0],
              drag.origin[1] + GHOST_HEIGHT / 2,
              drag.origin[2],
            ),
            start: performance.now(),
          };
          invalidate();
          return;
        }
        reveal();
        finishDrag();
        return;
      }
      // A rail drop with nowhere to go: the ghost disappears, nothing is added.
      reveal();
      finishDrag();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (dragRef.current) return;
      if (!event.isPrimary || !(event.buttons & 1)) return;
      const picked = pickItem(event);
      if (!picked) return;
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      beginDrag({
        sku: picked.item.sku,
        selfId: picked.item.id,
        origin: picked.item.position,
        rotationY: picked.item.rotationY,
        grabbedObject: picked.object,
        startX: event.clientX,
        startY: event.clientY,
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.springBack) return;
      if (!drag) {
        if (!event.isPrimary || !(event.buttons & 1)) return;
        const sku = useStore.getState().pendingSku;
        if (!sku) return;
        // Rail handoff: the staged sku becomes a drag on the first pressed
        // move. Touch may never get here — the browser can cancel the pointer
        // stream for scrolling; tap-to-add is the mobile path (ponytail:
        // mouse/pen-first drag).
        beginDrag({ sku, rotationY: 0 });
      }
      updateGhost(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        // Staged but never dragged: clear the handoff so a stale sku cannot
        // become a phantom drag on a later canvas press. The rail click still
        // adds — click fires after pointerup.
        useStore.getState().setPendingSku(null);
        return;
      }
      if (drag.springBack) return;
      if (!drag.moved) {
        // A click, not a drag: nothing was hidden and nothing moves.
        endDrag(false);
        return;
      }
      let committed = false;
      if (onCanvas(event) && setNdc(event)) {
        const drop = pickDrop();
        const snap = drop ? previewSnap(drop, drag) : null;
        if (drop && snap) {
          committed = useStore.getState().commitPlacement({
            sku: drag.sku,
            position: [drop.point.x, drop.point.y, drop.point.z],
            snapZone: drop.zone,
            rotationY: drag.rotationY,
            hostDeskId: drop.hostDesk?.id,
            selfId: drag.selfId,
          });
        }
      }
      endDrag(committed);
    };

    const onPointerCancel = () => {
      const drag = dragRef.current;
      if (drag?.springBack) return;
      if (!drag) {
        // A cancel before any move (the browser reclaiming a touch for
        // scroll) must still clear the staged handoff.
        useStore.getState().setPendingSku(null);
        return;
      }
      endDrag(false);
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [gl, scene, camera, raycaster, ndc, hitPoint, deskPlane, floorPlane, finishDrag]);

  return (
    <mesh ref={ghostRef} visible={false} raycast={() => null} renderOrder={10}>
      <boxGeometry args={[1, GHOST_HEIGHT, 1]} />
      <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}
