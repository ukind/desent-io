import { CATALOG_BY_ID } from './catalog';
import { findFreeSlot, findHostDesk, resolveSnap } from './placement';
import { decodeScene, encodeScene } from './scene-codec';
import { useStore } from './store';
import type { Duration, Scene, SceneItem } from './types';

/**
 * Persistence side-effects for the persisted scene slice (D1 refinement 2).
 * The store itself contains zero I/O; this module owns the three browser
 * touchpoints:
 *
 *   1. Hydration — read the scene from the URL, fall back to the localStorage
 *      mirror, then the starter scene, and write it to the store once.
 *   2. URL projection — a debounced `history.replaceState` write on every
 *      persisted-slice change (never `router.replace`: that triggers a Next
 *      navigation cycle per drop).
 *   3. localStorage mirror — a write-through copy of the same encoded string,
 *      so a bare-URL arrival can restore the last scene.
 *
 * The URL is the source of truth; the mirror is a convenience copy. Both are
 * read back through the same pure codec — never `JSON.parse` (Slice 5 caller
 * contract). Every restored item is re-validated through lib/placement before
 * it reaches the store (D8), so a stale link can never corrupt scene state
 * (FRD:67).
 *
 * The builder shell (Slice 6) calls `hydrateFromClient()` and
 * `activatePersistence()` at module scope, before first render — never in
 * `useEffect`, which would flash an empty scene.
 */

/** localStorage key for the write-through mirror — bump alongside the codec VERSION when the DSL changes. */
const MIRROR_KEY = 'monis.scene.v1';

/** Trailing debounce for the URL + mirror write, coalescing add/remove bursts. */
const WRITE_DEBOUNCE_MS = 300;

/**
 * Starter scene (D9, FRD:56/196): a desk with a chair in front of it. Seeded
 * here, not in the store's initial state — the store starts empty so SSR output
 * and client hydration cannot diverge (Slice 4 note).
 */
export const STARTER_SCENE: Scene = {
  items: [
    { id: 'starter-desk', sku: 'desk-electrical', position: [0, 0, 0], rotationY: 0, snapZone: 'floor' },
    { id: 'starter-chair', sku: 'chair-ergonomic', position: [0, 0, 1.2], rotationY: 0, snapZone: 'floor' },
  ],
  duration: 'week',
};

function isDesk(sku: string): boolean {
  return CATALOG_BY_ID.get(sku)?.category === 'desk';
}

/**
 * Re-resolves one decoded item through lib/placement (D8). Tries the item's
 * stored position first; a position that no longer fits (hand-edited link,
 * catalog change, missing host desk) is re-placed by findFreeSlot. Returns null
 * when nothing fits — the caller drops the item (FRD:67).
 */
function placeItem(item: SceneItem, accepted: SceneItem[]): SceneItem | null {
  const entry = CATALOG_BY_ID.get(item.sku);
  if (!entry) return null;
  const host = entry.surface === 'desk' ? findHostDesk(item, accepted, CATALOG_BY_ID) : null;
  const snap = resolveSnap(
    item.position,
    item.snapZone,
    item.sku,
    item.rotationY,
    accepted,
    CATALOG_BY_ID,
    undefined,
    host ?? undefined,
  );
  if (snap) return { ...item, position: snap.position, snapZone: snap.snapZone };
  const slot = findFreeSlot(item.sku, item.rotationY, accepted, CATALOG_BY_ID);
  if (slot) return { ...item, position: slot.position, snapZone: slot.snapZone };
  return null;
}

/**
 * Re-validates a decoded scene through lib/placement before it reaches the
 * store (D8, Slice 5 caller contract). Desks are processed first so a desk item
 * always sees its host desk, whatever order the payload carried them in — a
 * desk item can precede its host when the user moved it onto a desk added
 * later. Returns the accepted items plus the count refused.
 */
export function reconcileScene(items: SceneItem[]): { items: SceneItem[]; dropped: number } {
  const accepted: SceneItem[] = [];
  let dropped = 0;
  const ordered = [
    ...items.filter((item) => isDesk(item.sku)),
    ...items.filter((item) => !isDesk(item.sku)),
  ];
  for (const item of ordered) {
    const placed = placeItem(item, accepted);
    if (placed) accepted.push(placed);
    else dropped += 1;
  }
  return { items: accepted, dropped };
}

/** Reads the localStorage mirror, or null when absent or unavailable. */
function readMirror(): string | null {
  try {
    return window.localStorage.getItem(MIRROR_KEY);
  } catch {
    return null;
  }
}

/** Writes the localStorage mirror. A failure (private mode, quota) is ignored. */
function writeMirror(encoded: string): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, encoded);
  } catch {
    // The URL is the source of truth; a failed mirror write must never break
    // the builder.
  }
}

/**
 * Reads the initial scene: URL first (source of truth), then the localStorage
 * mirror, then the starter scene. Every path goes through the pure codec —
 * never `JSON.parse` (Slice 5 caller contract).
 */
function readInitialScene(): { items: SceneItem[]; duration: Duration; dropped: number } {
  const fromUrl = decodeScene(window.location.search, CATALOG_BY_ID);
  if (fromUrl) return fromUrl;
  const mirror = readMirror();
  if (mirror !== null) {
    const fromMirror = decodeScene(mirror, CATALOG_BY_ID);
    if (fromMirror) return fromMirror;
  }
  return { items: STARTER_SCENE.items, duration: STARTER_SCENE.duration, dropped: 0 };
}

/**
 * Hydrates the store from the URL / mirror / starter scene, once, at module
 * scope in the builder shell (Slice 6), before first render — never in
 * `useEffect`. Returns the scene
 * written plus the total number of items refused (codec drops + placement
 * re-resolution drops), so the builder can announce "Restored N of M items"
 * (D7). On the server it is a no-op that returns the store's current scene.
 */
export function hydrateFromClient(): { scene: Scene; dropped: number } {
  if (typeof window === 'undefined') {
    return { scene: useStore.getState().scene, dropped: 0 };
  }
  const initial = readInitialScene();
  const reconciled = reconcileScene(initial.items);
  const scene: Scene = { items: reconciled.items, duration: initial.duration };
  useStore.getState().replaceScene(scene);
  return { scene, dropped: initial.dropped + reconciled.dropped };
}

/**
 * Wires the persisted slice to the URL and the localStorage mirror. Called once
 * by the builder shell at module scope, before first render. Returns an
 * unsubscribe that also cancels a pending debounced write.
 *
 * The store write is never debounced (FRD:52 — the total updates on every
 * add/remove); only the URL + mirror projection is, to coalesce bursts.
 */
export function activatePersistence(): () => void {
  if (typeof window === 'undefined') return () => {};

  let timer: ReturnType<typeof setTimeout> | undefined;

  const project = () => {
    timer = undefined;
    const encoded = encodeScene(useStore.getState().scene);
    window.history.replaceState(null, '', `${window.location.pathname}?${encoded}`);
    writeMirror(encoded);
  };

  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.scene === prev.scene) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(project, WRITE_DEBOUNCE_MS);
  });

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
  };
}
