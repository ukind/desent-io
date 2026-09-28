'use client';

import { CATALOG } from '@/lib/catalog';
import { formatUsd } from '@/lib/pricing';
import { useStore } from '@/lib/store';

/**
 * Catalog rail (desktop) and bottom sheet (mobile). Cards are real buttons, so
 * Enter/Space add an item (the keyboard path). A pointerdown stages the sku for
 * the rail → canvas drag handoff (Slice 9); the click adds it. Photos follow the
 * convention /photos/<sku>.jpg (downloaded from strapi.monis.rent, D2).
 * Items group under category eyebrows — the spec-sheet register.
 */

const GROUP_ORDER = ['desk', 'chair', 'monitor', 'lamp', 'accessory'] as const;

/** Category eyebrow + the saturated tile the product photo sits on (noho-style). */
const GROUPS: Record<(typeof GROUP_ORDER)[number], { label: string; tile: string }> = {
  desk: { label: 'Desks', tile: 'var(--tile-desk)' },
  chair: { label: 'Seating', tile: 'var(--tile-chair)' },
  monitor: { label: 'Monitors', tile: 'var(--tile-monitor)' },
  lamp: { label: 'Lighting', tile: 'var(--tile-lamp)' },
  accessory: { label: 'Accessories', tile: 'var(--tile-accessory)' },
};

export function CatalogRail() {
  const addItem = useStore((s) => s.addItem);
  const bottomSheetOpen = useStore((s) => s.bottomSheetOpen);
  const setBottomSheetOpen = useStore((s) => s.setBottomSheetOpen);

  const groups = GROUP_ORDER.map((category) => ({
    category,
    items: CATALOG.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const cards = (
    <>
      {groups.map((group) => (
        <section key={group.category} className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: GROUPS[group.category].tile }}
            />
            {GROUPS[group.category].label}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {group.items.map((item) => (
              <button
                key={item.sku}
                type="button"
                onClick={() => addItem(item.sku)}
                className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-2 text-left transition-colors duration-150 hover:border-ink focus-visible:outline-2 focus-visible:outline-ink"
              >
                <span
                  className="relative block aspect-square w-full overflow-hidden rounded-md"
                  style={{ backgroundColor: GROUPS[group.category].tile }}
                >
                  <img
                    src={`/photos/${item.sku}.jpg`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover mix-blend-multiply"
                  />
                </span>
                <span className="text-sm font-medium leading-tight">{item.name}</span>
                <span className="font-mono text-xs text-ink-soft">
                  {`${formatUsd(item.weeklyPrice)}/wk`}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );

  return (
    <>
      {/* Mobile: trigger + bottom sheet overlay (no canvas resize — Performance Considerations). */}
      <button
        type="button"
        onClick={() => setBottomSheetOpen(true)}
        className="fixed bottom-20 left-4 z-20 rounded-full bg-ink px-4 py-2 text-sm text-bone shadow-lg md:hidden"
      >
        Browse catalog
      </button>

      {bottomSheetOpen && (
        <div
          role="dialog"
          aria-label="Catalog"
          className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-bone p-4 shadow-2xl md:hidden"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
              Catalog
            </h2>
            <button
              type="button"
              onClick={() => setBottomSheetOpen(false)}
              aria-label="Close catalog"
              className="text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              ×
            </button>
          </div>
          {cards}
        </div>
      )}

      {/* Desktop rail */}
      <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-bone md:flex">
        <h2 className="border-b border-line px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
          Catalog — {CATALOG.length} items
        </h2>
        <div className="flex-1 overflow-y-auto p-3">{cards}</div>
      </aside>
    </>
  );
}