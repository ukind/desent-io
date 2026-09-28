'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { DESK_TOP_Y, ROOM_SIZE } from '@/lib/placement';
import { useStore } from '@/lib/store';
import type { QualityTier } from '@/lib/store/device-slice';
import { invalidate, useSceneInvalidation } from './use-scene-invalidation';
import { PlacedItems } from './placed-item';
import { DragController } from './drag-controller';

/**
 * The canvas core (research Q2): demand frameloop — zero frames at idle;
 * frames flow only during orbit, drag and animation windows. This module family
 * is the only place three/r3f/drei may be imported (eslint no-restricted-imports,
 * Slice 7).
 *
 * Quality tiers (FRD:61, FRD:154): drei's PerformanceMonitor samples the frames
 * the canvas renders — under demand mode that is interaction time. The exact
 * sampling window is unverified until the spike (Verification Notes) — confirm
 * on device that idle gaps do not produce spurious declines. The tier is
 * device-local state (never persisted), read back here as the reactive dpr
 * prop. Antialias is fixed at context creation, so dpr step-down IS the AA
 * lever.
 */

/** dpr [min, max] per tier — the FRD:61 cap (≤ 1.5) is the high tier's max. */
const DPR_LADDER: Record<QualityTier, [number, number]> = {
  high: [1, 1.5],
  medium: [1, 1.25],
  low: [1, 1],
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

/** Camera presets (FRD:55 one-tap angles) — spherical angles around the room center. */
const PRESETS = {
  corner: { azimuth: Math.PI / 4, polar: Math.PI / 3 },
  front: { azimuth: 0, polar: Math.PI / 2.4 },
  top: { azimuth: 0, polar: 0.2 },
} as const;

type PresetId = keyof typeof PRESETS;

/** The OrbitControls surface the rig needs — typed locally, no three-family type import beyond scene/. */
interface ControlsLike {
  readonly target: { x: number; y: number; z: number };
  update(): void;
}

/**
 * Registers the preset jump with the DOM overlay. The jump is click-driven, not
 * effect-driven: re-clicking the active preset after orbiting away must move the
 * camera again, and an effect keyed on the preset id would not re-fire.
 *
 * The jump sets the camera position from spherical coordinates around the
 * controls target and lets controls.update() re-derive its state —
 * version-proof, unlike the setAzimuthalAngle/setPolarAngle setters (not on the
 * documented OrbitControls surface at the pinned three line; research:50's
 * prescription is superseded — see D12). The zoom radius the user orbited to is
 * preserved; controls clamp the result to the distance and polar limits on
 * update.
 */
function PresetRig({ register }: { register: (fn: (id: PresetId) => void) => void }) {
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null;
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (!controls) return;
    register((id) => {
      const p = PRESETS[id];
      const dx = camera.position.x - controls.target.x;
      const dy = camera.position.y - controls.target.y;
      const dz = camera.position.z - controls.target.z;
      const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const sinPhi = Math.sin(p.polar);
      camera.position.set(
        controls.target.x + radius * sinPhi * Math.sin(p.azimuth),
        controls.target.y + radius * Math.cos(p.polar),
        controls.target.z + radius * sinPhi * Math.cos(p.azimuth),
      );
      controls.update();
      invalidate();
    });
  }, [controls, camera, register]);
  return null;
}

/**
 * In-canvas scene content. The D6 auto-invalidate subscriber
 * (use-scene-invalidation) is mounted here: every store scene/tier change
 * requests one frame.
 */
function SceneContent() {
  const qualityTier = useStore((state) => state.qualityTier);
  useSceneInvalidation();

  return (
    <>
      {/* The DOM bone, exactly — the poster→canvas handoff stays invisible. */}
      <color attach="background" args={['#f4f1ea']} />
      {/* Distance haze: the floor edge dissolves into the paper ground. */}
      <fog attach="fog" args={['#f4f1ea', 14, 34]} />
      {/* Warm three-point lighting, plain lights only. A drei <Environment>
          with Lightformer children registers a priority useFrame, which takes
          over the r3f render loop — demand-mode frames then stop auto-rendering
          the main scene (observed as a blank canvas). */}
      <hemisphereLight args={['#fffdf7', '#cbbfa8', 0.55]} />
      <ambientLight intensity={0.25} />
      {/* Shadows are a high-tier feature: conditional rendering of the casting
          light is the reliable lever (flipping gl.shadowMap.enabled needs
          material.needsUpdate on affected materials in some three versions). */}
      {qualityTier === 'high' ? (
        <directionalLight
          castShadow
          position={[4, 6, 3]}
          intensity={1.1}
          shadow-mapSize={[1024, 1024]}
        />
      ) : (
        <directionalLight position={[4, 6, 3]} intensity={1.1} />
      )}
      {/* The floor adopts the placement extent exactly — the Slice 7 anchor:
          placement clamps to this square, so the visible floor must match. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow={qualityTier === 'high'}>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color="#e6ddcc" roughness={0.95} />
      </mesh>
      {/* Placed items render here; the boundary absorbs GLTF suspension and
          the post-resolve effect requests the frame (D6). */}
      <Suspense fallback={null}>
        <PlacedItems />
      </Suspense>
    </>
  );
}

// ponytail: the tier ladder is decline-only — a transient dip permanently
// downgrades until reload. Add an onIncline step-up with flipflops latching if
// that ships badly on desktop.
export function WorkspaceScene() {
  const qualityTier = useStore((state) => state.qualityTier);
  const setQualityTier = useStore((state) => state.setQualityTier);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const jumpRef = useRef<(id: PresetId) => void>(() => {});

  const jump = (id: PresetId) => {
    // Refuse the preset jump mid-drag (D15). The flag is read imperatively —
    // subscribing here would re-render this component (which holds <Canvas>)
    // and re-apply the Canvas's inline camera literal.
    if (useStore.getState().dragging) return;
    setPreset(id);
    jumpRef.current(id);
  };

  const register = useCallback((fn: (id: PresetId) => void) => {
    jumpRef.current = fn;
  }, []);

  const stepDown = () => {
    const current = TIER_ORDER.indexOf(useStore.getState().qualityTier);
    const next = TIER_ORDER[Math.max(current - 1, 0)];
    if (next !== useStore.getState().qualityTier) setQualityTier(next);
  };

  return (
    <div className="absolute inset-0" onContextMenu={(event) => event.preventDefault()}>
      <Canvas
        frameloop="demand"
        dpr={DPR_LADDER[qualityTier]}
        shadows
        camera={{ position: [4.5, 3.2, 5.5], fov: 45 }}
      >
        <PerformanceMonitor bounds={() => [55, 120]} onDecline={stepDown} />
        <SceneContent />
        <PresetRig register={register} />
        <OrbitControls
          makeDefault
          target={[0, DESK_TOP_Y, 0]}
          enablePan={false}
          minDistance={2}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2 - 0.05}
          onStart={() => setPreset(null)}
        />
        <DragController />
      </Canvas>
      {/* Preset overlay: bottom-24 clears the locked sticky summary bar
          (bottom-0, z-20) and sits opposite the mobile catalog trigger
          (bottom-20 left-4); flex-wrap keeps the row inside narrow viewports.
          Manual orbit clears the pressed state — no button claims an angle the
          user has since moved away from. */}
      <div
        role="group"
        aria-label="Camera presets"
        className="absolute bottom-24 right-4 z-10 flex flex-wrap justify-end gap-1"
      >
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={preset === id}
            onClick={() => jump(id)}
            className={`rounded-full px-3 py-1 text-xs capitalize shadow transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ink ${
              preset === id ? 'bg-ink text-bone' : 'bg-bone/90 text-ink-soft hover:bg-bone hover:text-ink'
            }`}
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}
