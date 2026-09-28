import type { StateCreator } from 'zustand';
import type { StoreState } from './index';

/**
 * Session UI slice — lives for the tab session, never persisted (D1
 * refinement 1). Not in the URL, not in the storage mirror: a refresh resets
 * the sheet and re-shows the hint, which is the desired behavior for both.
 */
export interface UiSlice {
  /** Mobile bottom sheet (catalog) visibility. The desktop rail ignores it. */
  bottomSheetOpen: boolean;
  /** The one-line starter hint — dismissed once, re-shown on reload. */
  hintDismissed: boolean;
  /** Open item context menu: viewport coords + the item id, or null. */
  contextMenu: { x: number; y: number; itemId: string } | null;
  setBottomSheetOpen(open: boolean): void;
  dismissHint(): void;
  openContextMenu(at: { x: number; y: number; itemId: string }): void;
  closeContextMenu(): void;
}

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set) => ({
  bottomSheetOpen: false,
  hintDismissed: false,
  contextMenu: null,
  setBottomSheetOpen: (bottomSheetOpen) => set({ bottomSheetOpen }),
  dismissHint: () => set({ hintDismissed: true }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
});
