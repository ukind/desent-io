'use client';

// Slice 7 (MODIFY): Component/ReactNode added to the react import; next/dynamic added.
import { Component, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { CatalogRail } from '@/components/catalog-rail';
import { SummaryBar } from '@/components/summary-bar';
import { activatePersistence, hydrateFromClient } from '@/lib/scene-persistence';
import { useStore } from '@/lib/store';

/**
 * Module scope, before first render — never in useEffect (Slice 5 activation
 * order: hydrate first, then activate). On the server both calls are no-ops,
 * so SSR renders the empty scene and the client renders the hydrated one.
 */
const hydration = hydrateFromClient();
activatePersistence();

const restoredCount = hydration.scene.items.length;
const droppedCount = hydration.dropped;

/**
 * Slice 7 (MODIFY): the lazy scene boundary. Server-side rendering is off,
 * which is legal only inside a client component (it throws in Server
 * Components). The loading component renders nothing on purpose: the poster
 * underlay is the placeholder (research Q1 — the dynamic fallback never appears
 * in the initial HTML anyway).
 */
const WorkspaceScene = dynamic(
  () => import('@/components/scene/workspace-scene').then((m) => m.WorkspaceScene),
  { ssr: false, loading: () => null },
);

/**
 * Slice 7 (MODIFY): WebGL capability probe (research Q9 fallback Tier 0) — run
 * before mounting the canvas. A WebGL-unavailable browser keeps the poster
 * permanently and the builder stays usable: rail, total and CTA are all
 * DOM-side (the keyboard path is also the canvas-failure path).
 */
function probeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Slice 7 (MODIFY): whole-canvas error boundary (research Q2 failure class 1).
 * A chunk-load or context-creation failure lands here — poster + notice. It
 * cannot be a Suspense fallback (Suspense handles pending, not rejected).
 * Self-contained: no error-reporting call inside (FRD:63, D4).
 */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-bone/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
          3D preview unavailable
        </p>
      );
    }
    return this.props.children;
  }
}

/**
 * Client shell for the builder page. Owns the pieces of UI that read hydrated
 * scene state and must stay out of the SSR HTML (Slice 5 SSR contract): the
 * dropped-items announcement (D7) and the summary bar — both gated behind a
 * mount flag. The live region itself renders from the first paint (empty is
 * SSR-safe) so assistive tech announces the text when it lands after mount.
 * The catalog rail renders on the server too: catalog data is static and
 * identical on both sides.
 */
export function BuilderShell() {
  const [mounted, setMounted] = useState(false);
  const [webglOk, setWebglOk] = useState(false);
  useEffect(() => {
    // The mount flag is the SSR contract (Slice 5): the summary bar and the
    // dropped-items announcement must not render in the server HTML. This is
    // the one intentional post-mount state write.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setWebglOk(probeWebGL());
  }, []);

  const hintDismissed = useStore((s) => s.hintDismissed);
  const dismissHint = useStore((s) => s.dismissHint);
  const contextMenu = useStore((s) => s.contextMenu);
  const closeContextMenu = useStore((s) => s.closeContextMenu);
  const rotateItem = useStore((s) => s.rotateItem);
  const removeItem = useStore((s) => s.removeItem);

  // The context menu closes on any press outside it and on Escape. The press
  // that opened it (right-click) happens before this effect mounts, so it
  // cannot immediately close its own menu.
  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-context-menu]')) return;
      closeContextMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  const announcement =
    mounted && droppedCount > 0
      ? `Restored ${restoredCount} of ${restoredCount + droppedCount} items`
      : '';

  return (
    <div className="relative flex h-full">
      <div className="relative flex-1">
        {/* Slice 7 (MODIFY): canvas mount — the poster underlay shows through
            until the canvas lands; a WebGL-less browser or a crashed canvas
            keeps the poster and shows the notice instead. */}
        {mounted && webglOk && (
          <SceneErrorBoundary>
            <WorkspaceScene />
          </SceneErrorBoundary>
        )}
        {mounted && !webglOk && (
          <p className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-bone/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
            3D preview unavailable
          </p>
        )}
        {!hintDismissed && (
          <p className="pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-bone/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
            Click a catalog item to add it — drag it here to move
            <button
              type="button"
              onClick={dismissHint}
              aria-label="Dismiss hint"
              className="pointer-events-auto text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              ×
            </button>
          </p>
        )}
        <p
          aria-live="polite"
          className={
            announcement
              ? 'pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-line bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-sm'
              : 'sr-only'
          }
        >
          {announcement}
        </p>
      </div>
      <CatalogRail />
      {mounted && <SummaryBar />}
      {contextMenu && (
        <div
          data-context-menu
          role="menu"
          aria-label="Item actions"
          className="fixed z-40 min-w-36 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 160),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              rotateItem(contextMenu.itemId);
              closeContextMenu();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bone focus-visible:outline-2 focus-visible:outline-ink"
          >
            Rotate 90°
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              removeItem(contextMenu.itemId);
              closeContextMenu();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-bone focus-visible:outline-2 focus-visible:outline-ink"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
