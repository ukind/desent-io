import { describe, expect, it } from 'vitest';
import { DURATIONS, formatUsd, selectPricing } from './pricing';
import type { Duration, Scene, SceneItem } from './types';

function item(sku: string, index: number): SceneItem {
  return { id: `item-${index}`, sku, position: [0, 0, 0], rotationY: 0, snapZone: 'floor' };
}

function scene(skus: string[], duration: Duration = 'week'): Scene {
  return { items: skus.map(item), duration };
}

describe('selectPricing', () => {
  it('sums catalog weekly prices', () => {
    const result = selectPricing(scene(['desk-electrical', 'chair-ergonomic']));
    expect(result.weeklyTotal).toBe(12);
    expect(result.total).toBe(12);
    expect(result.label).toBe('Per week');
    expect(result.discountCopy).toBeNull();
  });

  it('applies the monthly multiplier and discount copy', () => {
    const result = selectPricing(scene(['desk-electrical', 'chair-ergonomic'], 'month'));
    expect(result.weeklyTotal).toBe(12);
    expect(result.total).toBe(24);
    expect(result.label).toBe('Per month');
    expect(result.discountCopy).toBe('2 weeks free vs. weekly rate');
  });

  it('counts an unknown sku as zero instead of NaN', () => {
    const result = selectPricing(scene(['desk-electrical', 'sku-that-left-the-catalog']));
    expect(result.weeklyTotal).toBe(6);
    expect(result.total).toBe(6);
  });

  it('sums half-dollar prices exactly', () => {
    const result = selectPricing(scene(['monitor-a24i-2026', 'accessory-whiteboard']));
    expect(result.weeklyTotal).toBe(11);
  });

  it('returns zero for an empty scene', () => {
    const result = selectPricing(scene([]));
    expect(result.weeklyTotal).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe('DURATIONS', () => {
  it('frames the month as four billed weeks at half rate', () => {
    expect(DURATIONS.month.weeksPerMonth).toBe(4);
    expect(DURATIONS.month.multiplier).toBe(2);
    expect(DURATIONS.week.multiplier).toBe(1);
    expect(DURATIONS.week.discountCopy).toBeNull();
  });
});

describe('formatUsd', () => {
  it('formats with two decimals', () => {
    expect(formatUsd(6.5)).toBe('$6.50');
    expect(formatUsd(12)).toBe('$12.00');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
