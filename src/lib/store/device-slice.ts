import type { StateCreator } from 'zustand';
import type { StoreState } from './index';

/**
 * Render quality tier — device-local (FRD:154), never persisted. Driven by
 * drei's PerformanceMonitor (Slice 7); workspace-scene maps the tier to the
 * dpr/shadow ladder [1,1.5] → [1,1.25] → [1,1].
 */
export type QualityTier = 'high' | 'medium' | 'low';

/**
 * Transient/device slice — never persisted (FRD:67 drag state, FRD:154
 * quality). `pendingSku` is the rail → canvas drag handoff: a catalog card
 * pointerdown stages the sku, the drag controller (Slice 9) consumes it and
 * clears it on commit or cancel. `dragging` is the canvas-active drag flag the
 * scene gates interaction on (Slice 7/9): it suspends orbit for the duration of
 * a drag. The reduced-motion flag (Slice 9, D14) mirrors the media query and
 * gates the spring-back tween.
 */
export interface DeviceSlice {
  qualityTier: QualityTier;
  dragging: boolean;
  pendingSku: string | null;
  reducedMotion: boolean;
  setQualityTier(tier: QualityTier): void;
  setDragging(dragging: boolean): void;
  setPendingSku(sku: string | null): void;
  setReducedMotion(reducedMotion: boolean): void;
}

export const createDeviceSlice: StateCreator<StoreState, [], [], DeviceSlice> = (set) => ({
  qualityTier: 'high',
  dragging: false,
  pendingSku: null,
  reducedMotion: false,
  setQualityTier: (qualityTier) => set({ qualityTier }),
  setDragging: (dragging) => set({ dragging }),
  setPendingSku: (pendingSku) => set({ pendingSku }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
});
