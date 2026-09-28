import { BuilderShell } from '@/components/builder-shell';
import { ScenePoster } from '@/components/scene-poster';

/**
 * Server Component (research Q1): the poster is server-rendered static HTML —
 * the LCP element paints before any 3D byte. The canvas mount (Slice 7) layers
 * over it inside BuilderShell.
 */
export default function Home() {
  return (
    /* Definite height: the rail's internal scroll needs a bounded ancestor
       (h-full against a min-height-only body resolves to content height and
       the catalog stretches the page). 3.5rem = the h-14 header. */
    <main className="relative h-[calc(100dvh-3.5rem)] overflow-hidden">
      <ScenePoster className="absolute inset-0" />
      <BuilderShell />
    </main>
  );
}
