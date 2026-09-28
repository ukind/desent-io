'use client';

import { useMemo } from 'react';
import { Clone, useGLTF } from '@react-three/drei';
import type { Mesh } from 'three';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { STARTER_SCENE } from '@/lib/scene-persistence';

/**
 * Shared-archetype GLTF loading. useGLTF caches per URL, and the Clone
 * component instances the loaded scene per placement — mounting the cached
 * scene object directly is the classic "second chair disappears" bug, because
 * an Object3D can only have one parent.
 *
 * Draco decoding is off (second argument): D9 compresses with meshopt only
 * (`gltfpack -cc`), and drei's default Draco path fetches its decoder from a
 * CDN at runtime — the same trap class as the recorded Environment-preset
 * note. Meshopt decoding stays on (drei default).
 */

/**
 * Starter-scene GLBs preload at module scope so the starter models are in
 * flight before the canvas mounts (D9). The `typeof window` guard matches the SSR-safety convention the
 * persistence module records for module scope. While public/models/ is empty
 * these fetches 404; whether the rejection surfaces as an unhandled promise
 * rejection is a pinned-version question recorded in Verification Notes — the
 * render path is safe either way, because the per-item boundary in
 * placed-item.tsx catches the rejected loader promise.
 */
if (typeof window !== 'undefined') {
  for (const item of STARTER_SCENE.items) {
    const entry = CATALOG_BY_ID.get(item.sku);
    if (entry?.model.kind === 'gltf') useGLTF.preload(entry.model.url, false);
  }
}

/** One placement of a shared archetype — always a fresh instance of the cached scene. */
export function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, false);
  // GLTFLoader leaves meshes unflagged for shadow casting, which would leave
  // the Slice 7 high-tier shadow lever with nothing to cast. Flag the shared
  // archetype once; Clone instances inherit the flag.
  useMemo(() => {
    scene.traverse((obj) => {
      if ((obj as Mesh).isMesh) (obj as Mesh).castShadow = true;
    });
  }, [scene]);
  return <Clone object={scene} />;
}
