import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '@/lib/store';

export { invalidate } from '@react-three/fiber';

/**
 * The single sanctioned invalidation path (D6). In demand frameloop mode a
 * frame renders only when someone asks for one; every frame request in the app
 * funnels through this module:
 *
 *   - `useSceneInvalidation()` — mounted once inside the canvas
 *     (workspace-scene.tsx). Subscribes to the store and requests one frame per
 *     scene or quality-tier change, so DOM-side actions (rail add, duration
 *     toggle, tier step-down) can never leave the canvas stale.
 *   - `invalidate()` — the imperative escape hatch for the D6 call sites that
 *     live outside React commits: camera presets (Slice 7), ghost-follow and
 *     spring-back (Slice 9), post-suspense model resolution (Slice 8).
 *
 * A React commit inside the canvas tree also auto-invalidates (r3f behavior);
 * the subscriber is the belt-and-braces path for store changes read
 * imperatively (`useStore.getState()`) that produce no commit.
 *
 * Convention is mechanically enforced: this is the only module that imports
 * `invalidate` from @react-three/fiber — the Success Criteria grep counts
 * exactly one such import line across src/.
 */

/**
 * Store-subscriber auto-invalidation. Must be called from a component inside
 * `<Canvas>` — it reads the instance's invalidate through useThree.
 */
export function useSceneInvalidation(): void {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.scene !== prev.scene || state.qualityTier !== prev.qualityTier) {
          invalidate();
        }
      }),
    [invalidate],
  );
}
