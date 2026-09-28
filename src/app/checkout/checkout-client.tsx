'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { decodeScene } from '@/lib/scene-codec';
import { formatUsd, selectPricing } from '@/lib/pricing';
import { CheckoutForm } from './checkout-form';

/**
 * Checkout reads the scene from the URL — the same codec string the builder's
 * CTA wrote (locked Slice 10 caller contract). The full query string goes to
 * the decoder in one piece: reading a single parameter would drop the version
 * marker, the decoder would return null, and the page would always show the
 * empty-setup state.
 */
export function CheckoutClient() {
  const params = useSearchParams();
  const decoded = decodeScene(params.toString(), CATALOG_BY_ID);

  if (!decoded || decoded.items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white p-8 text-center">
        <p className="font-display text-2xl">Your setup is empty</p>
        <p className="mt-2 text-sm text-ink-soft">
          Add desks, chairs and accessories in the builder first.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-ink px-4 py-2 text-sm text-bone transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-ink"
        >
          Back to the builder
        </Link>
      </div>
    );
  }

  const pricing = selectPricing(decoded);

  return (
    <div className="space-y-6">
      {decoded.dropped > 0 && (
        <p className="rounded-lg border border-line bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {decoded.dropped} item{decoded.dropped === 1 ? '' : 's'} from the shared link{' '}
          {decoded.dropped === 1 ? 'is' : 'are'} no longer available.
        </p>
      )}
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {decoded.items.map((item) => {
          const entry = CATALOG_BY_ID.get(item.sku);
          // Unreachable through the decoder — unknown skus are dropped before
          // this point; the guard keeps a future catalog edit from crashing.
          if (!entry) return null;
          return (
            <li key={item.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{entry.name}</span>
              <span className="font-mono text-sm text-ink-soft">
                {`${formatUsd(entry.weeklyPrice)}/wk`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="rounded-lg border border-ink bg-white p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">Total</p>
        <p className="mt-1 font-mono text-2xl font-medium">
          {formatUsd(pricing.total)}
          <span className="ml-1 font-sans text-sm font-normal text-ink-soft">{pricing.label}</span>
        </p>
        {pricing.discountCopy && <p className="mt-1 text-xs text-emerald-700">{pricing.discountCopy}</p>}
      </div>
      <CheckoutForm />
    </div>
  );
}