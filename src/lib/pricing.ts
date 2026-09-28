import type { Duration, Scene } from './types';
import { CATALOG_BY_ID } from './catalog';

/**
 * Billing periods and the discount framing (FRD:53).
 *
 * Monthly price is a derived multiplier, never a stored per-item field: monis.rent
 * publishes weekly prices only, so a stored monthly price would fabricate data.
 * `weeksPerMonth` (4) and `multiplier` (2) together are the "2 weeks free" claim —
 * four billed weeks at half the weekly rate. Keep the two in step.
 */
export interface DurationInfo {
  /** Display label beside the total. */
  label: string;
  /** Billed weeks in one calendar month. */
  weeksPerMonth: number;
  /** Multiplier applied to the weekly total. */
  multiplier: number;
  /** Discount copy, or null when there is no discount to frame. */
  discountCopy: string | null;
}

export const DURATIONS: Record<Duration, DurationInfo> = {
  week: { label: 'Per week', weeksPerMonth: 1, multiplier: 1, discountCopy: null },
  month: {
    label: 'Per month',
    weeksPerMonth: 4,
    multiplier: 2,
    discountCopy: '2 weeks free vs. weekly rate',
  },
};

export interface Pricing {
  /** Sum of catalog weekly prices for resolvable items. */
  weeklyTotal: number;
  /** `weeklyTotal` scaled by the duration multiplier — the number the total badge shows. */
  total: number;
  label: string;
  discountCopy: string | null;
}

/**
 * The one money calculation: sticky total badge (FRD:52) and checkout itemized
 * total (FRD:54) both call this. Dependency direction is store → pricing → catalog.
 *
 * Returns a fresh object, so consumers must select the primitive field they render
 * (`selectPricing(s.scene).total`), never the whole object, or every store write
 * re-renders them.
 */
export function selectPricing(scene: Scene): Pricing {
  let weeklyTotal = 0;
  for (const item of scene.items) {
    const entry = CATALOG_BY_ID.get(item.sku);
    // A sku the catalog no longer carries (stale localStorage mirror) must never
    // make the total NaN or throw (FRD:67).
    if (entry) weeklyTotal += entry.weeklyPrice;
  }
  const duration = DURATIONS[scene.duration] ?? DURATIONS.week;
  return {
    weeklyTotal,
    total: weeklyTotal * duration.multiplier,
    label: duration.label,
    discountCopy: duration.discountCopy,
  };
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * Formats an amount as USD with two decimals. Shared by the rail cards, the total
 * badge and the checkout rows so the three cannot drift in style.
 */
export function formatUsd(amount: number): string {
  return usdFormatter.format(amount);
}
