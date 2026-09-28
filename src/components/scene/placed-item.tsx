'use client';

import { Component, useEffect, type ReactNode } from 'react';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { DESK_TOP_Y } from '@/lib/placement';
import { useStore } from '@/lib/store';
import type { CatalogItem, SceneItem } from '@/lib/types';
import { GltfModel } from './model-loader';
import { PrimitiveModel } from './primitives';
import { invalidate } from './use-scene-invalidation';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * Renders the placed scene inside the canvas Suspense boundary
 * (workspace-scene.tsx). One group per SceneItem, positioned and rotated from
 * store state; the D6 store subscriber already requests a frame on every scene
 * change, so no per-item subscription logic lives here.
 */

/**
 * Requests one frame after a suspended model resolves (D6 post-suspense call
 * site). Rendered as a sibling of the suspending model, so its effect runs in
 * the same commit the resolved model lands in — a cached model just costs one
 * harmless extra frame request on mount.
 */
function InvalidateOnResolve() {
  useEffect(() => {
    invalidate();
  }, []);
  return null;
}

/**
 * Per-item failure boundary (FRD:67 asset-failure fallbacks): a rejected GLB
 * fetch swaps that one item to its footprint stand-in instead of crashing the
 * canvas. Scoped per item so one bad asset cannot take down the scene.
 */
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Stand-in for a failed GLB: a slab-and-legs desk or a plain footprint box. */
function FootprintFallback({ entry }: { entry: CatalogItem }) {
  const [w, d] = entry.footprint;
  if (entry.category === 'desk') {
    return (
      <group>
        <mesh position={[0, DESK_TOP_Y - 0.02, 0]} castShadow>
          <boxGeometry args={[w, 0.04, d]} />
          <meshStandardMaterial color="#b45309" />
        </mesh>
        {[
          [-w / 2 + 0.05, -d / 2 + 0.05],
          [w / 2 - 0.05, -d / 2 + 0.05],
          [-w / 2 + 0.05, d / 2 - 0.05],
          [w / 2 - 0.05, d / 2 - 0.05],
        ].map(([x, z]) => (
          <mesh key={`${x}-${z}`} position={[x, DESK_TOP_Y / 2, z]} castShadow>
            <boxGeometry args={[0.04, DESK_TOP_Y, 0.04]} />
            <meshStandardMaterial color="#57534e" />
          </mesh>
        ))}
      </group>
    );
  }
  const height = entry.category === 'chair' ? 0.9 : 0.3;
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <boxGeometry args={[w, height, d]} />
      <meshStandardMaterial color="#a8a29e" />
    </mesh>
  );
}

function ModelFor({ entry }: { entry: CatalogItem }) {
  if (entry.model.kind === 'primitive') {
    return <PrimitiveModel kind={entry.model.primitive} footprint={entry.footprint} />;
  }
  return (
    <ModelErrorBoundary fallback={<FootprintFallback entry={entry} />}>
      <GltfModel url={entry.model.url} />
      <InvalidateOnResolve />
    </ModelErrorBoundary>
  );
}

function PlacedItem({ item }: { item: SceneItem }) {
  const entry = CATALOG_BY_ID.get(item.sku);
  // Hydration and the store actions guarantee a known sku; the guard keeps a
  // future catalog edit from crashing the canvas.
  if (!entry) return null;
  const openMenu = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    useStore.getState().openContextMenu({
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      itemId: item.id,
    });
  };
  return (
    <group
      position={item.position}
      rotation-y={item.rotationY}
      userData={{ itemId: item.id }}
      onContextMenu={openMenu}
    >
      <ModelFor entry={entry} />
    </group>
  );
}

/** The one store read for the scene list — mounted once inside the canvas. */
export function PlacedItems() {
  const items = useStore((s) => s.scene.items);
  return (
    <>
      {items.map((item) => (
        <PlacedItem key={item.id} item={item} />
      ))}
    </>
  );
}
