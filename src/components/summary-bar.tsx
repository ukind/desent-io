'use client';

import { useRouter } from 'next/navigation';
import { encodeScene } from '@/lib/scene-codec';
import { formatUsd, selectPricing } from '@/lib/pricing';
import { useStore } from '@/lib/store';

/**
 * Sticky total (FRD:52). Pricing is derived, never stored: the component
 * re-renders from the store and selectPricing recomputes. The CTA builds the
 * full codec URL — decodeScene on the checkout side requires the version
 * parameter, so `?s=` alone would fail the version check.
 */
export function SummaryBar() {
  const router = useRouter();
  const total = useStore((s) => selectPricing(s.scene).total);
  const label = useStore((s) => selectPricing(s.scene).label);
  const discountCopy = useStore((s) => selectPricing(s.scene).discountCopy);
  const duration = useStore((s) => s.scene.duration);
  const itemCount = useStore((s) => s.scene.items.length);
  const setDuration = useStore((s) => s.setDuration);

  const startOver = () => {
    const { scene, replaceScene } = useStore.getState();
    replaceScene({ ...scene, items: [] });
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-bone/95 backdrop-blur md:right-80">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </p>
          <p className="font-mono text-lg font-medium leading-tight">
            {formatUsd(total)}
            <span className="ml-1 font-sans text-sm font-normal text-ink-soft">{label}</span>
          </p>
          {discountCopy && <p className="text-xs text-emerald-700">{discountCopy}</p>}
        </div>
        <div
          role="group"
          aria-label="Billing period"
          className="rounded-full border border-line bg-white p-0.5"
        >
          <button
            type="button"
            aria-pressed={duration === 'week'}
            onClick={() => setDuration('week')}
            className={`rounded-full px-3 py-1 text-sm transition-colors duration-150 ${
              duration === 'week' ? 'bg-ink text-bone' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Weekly
          </button>
          <button
            type="button"
            aria-pressed={duration === 'month'}
            onClick={() => setDuration('month')}
            className={`rounded-full px-3 py-1 text-sm transition-colors duration-150 ${
              duration === 'month' ? 'bg-ink text-bone' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Monthly
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {itemCount > 0 && (
            <button
              type="button"
              onClick={startOver}
              className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              Start over
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(`/checkout?${encodeScene(useStore.getState().scene)}`)}
            disabled={itemCount === 0}
            className="rounded-full bg-accent-deep px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ink"
          >
            Rent Your Setup!
          </button>
        </div>
      </div>
    </footer>
  );
}