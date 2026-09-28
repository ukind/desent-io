import type { StateCreator } from 'zustand';
import type { Duration, Scene, SceneItem, SnapZone } from '../types';
import { CATALOG_BY_ID } from '../catalog';
import { findFreeSlot, findHostDesk, resolveSnap } from '../placement';
import type { StoreState } from './index';

/**
 * Persisted slice — the only state the codec encodes and pricing reads (FRD:67).
 * Store split per D1 refinement 1 (scene / ui / device files composed in
 * index.ts): everything in this slice survives hydration; nothing in
 * ui-slice/device-slice does.
 *
 * The store contains zero I/O (D1 refinement 2): no browser storage, no URL
 * writes, no network. Persistence side-effects live in
 * src/lib/scene-persistence.ts (Slice 5) as a store subscriber.
 *
 * The add, drop and move paths validate through lib/placement before state
 * changes (D10): an invalid one is a no-op that returns false, so the placed
 * list is never corrupted (FRD:67). Desk passengers ride without re-validation
 * — see the ponytail note in commitPlacement.
 *
 * A desk owns its passengers: removing a desk cascades the desk items that
 * rested on it; moving a desk carries them by translation, and a desk that
 * carries passengers refuses to rotate. Store state therefore always upholds
 * "every desk item has a host desk" (hydration upholds it via D8 re-resolution
 * before replaceScene).
 */

/** One pending placement handed to commitPlacement by the drag controller (Slice 9). */
export interface PlacementDrop {
  sku: string;
  /** Raw pointer position from the drag raycast; resolveSnap quantizes and clamps it. */
  position: [number, number, number];
  /** Zone from the drag raycast (desk planes tested before floor). */
  snapZone: SnapZone;
  rotationY: number;
  /** Id of the desk whose surface the raycast hit (desk drops). Falls back to findHostDesk. */
  hostDeskId?: string;
  /** Set when re-placing an existing item — excludes it from its own collision check. */
  selfId?: string;
}

export interface SceneSlice {
  scene: Scene;
  /**
   * Catalog-rail add (click / Enter key). Places the item through findFreeSlot
   * on its catalog surface. Returns false — a no-op — when the sku is unknown
   * or nothing fits (FRD:67).
   */
  addItem(sku: string): boolean;
  /**
   * Drag commit. Re-validates the drop through resolveSnap (the ghost preview
   * already ran it — this is the store-side gate D10 requires) and appends a
   * new item or moves the selfId item. Returns false on an invalid drop: the
   * caller spring-backs, state is untouched.
   */
  commitPlacement(drop: PlacementDrop): boolean;
  removeItem(id: string): void;
  /**
   * Rotate an item a quarter turn. Reuses the commitPlacement gate: the new
   * rotation is re-snapped and collision-checked exactly like a drop, so an
   * orientation that no longer fits its surface is a no-op (D10). A desk that
   * carries passengers refuses to rotate (the same rule a desk move obeys).
   */
  rotateItem(id: string): boolean;
  setDuration(duration: Duration): void;
  /**
   * Wholesale replace for hydration (Slice 5). Trusts its input: the
   * persistence module validates every item through placement before calling
   * this (Verification Notes, Slice 5 caller contract).
   */
  replaceScene(scene: Scene): void;
}

/** The desk a desk-zone drop landed on: the raycast hit when it is a desk, else the desk under the raw XZ. */
function resolveHostDesk(drop: PlacementDrop, items: SceneItem[]): SceneItem | undefined {
  const hit = drop.hostDeskId ? items.find((item) => item.id === drop.hostDeskId) : undefined;
  if (hit && CATALOG_BY_ID.get(hit.sku)?.category === 'desk') return hit;
  return findHostDesk({ sku: drop.sku, position: drop.position }, items, CATALOG_BY_ID) ?? undefined;
}

export const createSceneSlice: StateCreator<StoreState, [], [], SceneSlice> = (set, get) => ({
  scene: { items: [], duration: 'week' },

  addItem: (sku) => {
    if (!CATALOG_BY_ID.has(sku)) return false;
    const { scene } = get();
    const slot = findFreeSlot(sku, 0, scene.items, CATALOG_BY_ID);
    if (!slot) return false;
    const item: SceneItem = {
      // Instance ids are minted here, never the decoder's positional scheme —
      // that scheme is decoder-assigned only and would collide with a restored
      // item (Verification Notes, Slice 4 id contract).
      id: crypto.randomUUID(),
      sku,
      position: slot.position,
      rotationY: 0,
      snapZone: slot.snapZone,
    };
    set({ scene: { ...scene, items: [...scene.items, item] } });
    return true;
  },

  commitPlacement: (drop) => {
    const { scene } = get();
    const self = drop.selfId ? scene.items.find((item) => item.id === drop.selfId) : undefined;
    if (drop.selfId && !self) return false;
    if (self && self.sku !== drop.sku) return false;

    const hostDesk = drop.snapZone === 'desk' ? resolveHostDesk(drop, scene.items) : undefined;

    const snap = resolveSnap(
      drop.position,
      drop.snapZone,
      drop.sku,
      drop.rotationY,
      scene.items,
      CATALOG_BY_ID,
      drop.selfId,
      hostDesk,
    );
    if (!snap) return false;

    if (self) {
      const selfIsDesk = CATALOG_BY_ID.get(self.sku)?.category === 'desk';
      const passengerIds = new Set(
        selfIsDesk
          ? scene.items
              .filter(
                (item) =>
                  item.snapZone === 'desk' &&
                  findHostDesk(item, scene.items, CATALOG_BY_ID)?.id === self.id,
              )
              .map((item) => item.id)
          : [],
      );
      // Rotation is not an interaction yet (Slice 9 has no rotate gesture), so a
      // desk move keeps its orientation. A desk that carries passengers refuses
      // to rotate: translation preserves every passenger's offset (and so its
      // host), while a rotation could swing one off the surface. Both sides are
      // compared at codec precision — a stored rotation can arrive unrounded via
      // replaceScene (decodeScene clamps but does not round), so a move that
      // only re-states the stored rotation must not be rejected.
      const nextRot = Number(drop.rotationY.toFixed(3));
      if (passengerIds.size > 0 && nextRot !== Number(self.rotationY.toFixed(3))) return false;
      const dx = snap.position[0] - self.position[0];
      const dz = snap.position[2] - self.position[2];
      set({
        scene: {
          ...scene,
          items: scene.items.map((item) => {
            if (item.id === self.id) {
              return {
                ...item,
                position: snap.position,
                rotationY: nextRot,
                snapZone: snap.snapZone,
              };
            }
            // ponytail: passengers ride by translation and are not
            // re-collision-checked at the destination — the desk body's own
            // resolveSnap check covers the desk footprint, not the passengers
            // (collides skips desk-zone items for a floor candidate). Re-check
            // per passenger if passenger-vs-foreign-item overlaps ship.
            if (passengerIds.has(item.id)) {
              const nextPos: [number, number, number] = [
                Number((item.position[0] + dx).toFixed(3)),
                item.position[1],
                Number((item.position[2] + dz).toFixed(3)),
              ];
              return { ...item, position: nextPos };
            }
            return item;
          }),
        },
      });
    } else {
      const item: SceneItem = {
        id: crypto.randomUUID(),
        sku: drop.sku,
        position: snap.position,
        rotationY: Number(drop.rotationY.toFixed(3)),
        snapZone: snap.snapZone,
      };
      set({ scene: { ...scene, items: [...scene.items, item] } });
    }
    return true;
  },

  removeItem: (id) => {
    const { scene } = get();
    const remaining = scene.items.filter((item) => item.id !== id);
    if (remaining.length === scene.items.length) return;
    // A removed desk orphans the desk items that rested on it — cascade them
    // so the "every desk item has a host" invariant holds in store state.
    const items = remaining.filter(
      (item) => item.snapZone !== 'desk' || findHostDesk(item, remaining, CATALOG_BY_ID) !== null,
    );
    set({ scene: { ...scene, items } });
  },

  rotateItem: (id) => {
    const { scene, commitPlacement } = get();
    const item = scene.items.find((candidate) => candidate.id === id);
    if (!item) return false;
    const hostDeskId = findHostDesk(item, scene.items, CATALOG_BY_ID)?.id;
    return commitPlacement({
      sku: item.sku,
      position: item.position,
      snapZone: item.snapZone,
      rotationY: item.rotationY + Math.PI / 2,
      hostDeskId,
      selfId: id,
    });
  },

  setDuration: (duration) => {
    set({ scene: { ...get().scene, duration } });
  },

  replaceScene: (scene) => {
    set({ scene });
  },
});
