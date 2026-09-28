import { create } from 'zustand';
import { createDeviceSlice } from './device-slice';
import { createSceneSlice } from './scene-slice';
import { createUiSlice } from './ui-slice';
import type { DeviceSlice } from './device-slice';
import type { SceneSlice } from './scene-slice';
import type { UiSlice } from './ui-slice';

/**
 * The one store, composed from three slices by persistence class (D1
 * refinement 1). Slice files import this type-only — type-only circular
 * imports are erased at compile time; this is the documented zustand slices
 * pattern.
 */
export type StoreState = SceneSlice & UiSlice & DeviceSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createSceneSlice(...a),
  ...createUiSlice(...a),
  ...createDeviceSlice(...a),
}));

/**
 * Hydration is NOT called here: the store stays I/O-free (D1 refinement 2) and
 * importing scene-persistence from the store would be a cycle. The persistence
 * module (Slice 5) owns hydration + the URL-writer/storage-mirror subscriber;
 * the builder shell (Slice 6) activates it at module scope — before first
 * render, never in useEffect.
 */
