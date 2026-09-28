import { describe, expect, it } from 'vitest';
import { decodeScene, encodeScene } from './scene-codec';
import { CATALOG_BY_ID } from './catalog';
import type { Scene, SceneItem } from './types';

function item(
  sku: string,
  index: number,
  position: [number, number, number],
  rotationY: number,
  snapZone: SceneItem['snapZone'],
): SceneItem {
  return { id: `item-${index}`, sku, position, rotationY, snapZone };
}

const STARTER: Scene = {
  items: [
    item('desk-electrical', 0, [0, 0, 0], 0, 'floor'),
    item('chair-ergonomic', 1, [0.8, 0, 0.4], 1.57, 'floor'),
    item('monitor-1c', 2, [0, 0.75, -0.2], 0, 'desk'),
  ],
  duration: 'week',
};

/** A 6.5-priced item at the origin — the only place a price digit can leak from. */
const HALFER: Scene = {
  items: [item('monitor-a24i-2026', 3, [0, 0, 0], 0, 'desk')],
  duration: 'week',
};

describe('encodeScene', () => {
  it('emits the versioned DSL', () => {
    expect(encodeScene(STARTER)).toBe(
      'v=1&d=w&s=desk-electrical@0,0,0,0,f;chair-ergonomic@0.8,0,0.4,1.57,f;monitor-1c@0,0.75,-0.2,0,d',
    );
  });

  it('encodes skus only — never price values, names or instance ids', () => {
    const mixed: Scene = { items: [...STARTER.items, ...HALFER.items], duration: 'week' };
    const encoded = encodeScene(mixed);
    expect(encoded).not.toContain('item-');
    expect(encoded).not.toContain('6.5');
    expect(encoded).not.toContain('Electrical Adjustable Desk');
  });

  it('omits the s parameter for an empty scene', () => {
    expect(encodeScene({ items: [], duration: 'week' })).toBe('v=1&d=w');
  });

  it('drops a non-finite position instead of writing an unreadable link', () => {
    const broken: Scene = {
      items: [item('monitor-1c', 0, [NaN, 0, 0], 0, 'desk')],
      duration: 'week',
    };
    expect(encodeScene(broken)).toBe('v=1&d=w');
  });

  it('drops an out-of-range position before it can reach exponent form', () => {
    const absurd: Scene = {
      items: [item('monitor-1c', 0, [1e5, 0, 0], 0, 'desk')],
      duration: 'week',
    };
    expect(encodeScene(absurd)).toBe('v=1&d=w');
  });

  it('trims positions to three decimals', () => {
    const precise: Scene = {
      items: [item('monitor-1c', 0, [1.5708, 0, 0], 0, 'desk')],
      duration: 'week',
    };
    expect(encodeScene(precise)).toBe('v=1&d=w&s=monitor-1c@1.571,0,0,0,d');
  });
});

describe('decodeScene', () => {
  it('round-trips a scene deep-equal', () => {
    const decoded = decodeScene(encodeScene(STARTER), CATALOG_BY_ID);
    expect(decoded).not.toBeNull();
    expect(decoded!.items).toEqual(STARTER.items);
    expect(decoded!.duration).toBe('week');
    expect(decoded!.dropped).toBe(0);
  });

  it('round-trips the month duration', () => {
    const decoded = decodeScene(encodeScene({ ...STARTER, duration: 'month' }), CATALOG_BY_ID);
    expect(decoded!.duration).toBe('month');
  });

  it('tolerates a leading question mark and percent-encoded separators', () => {
    const encoded = encodeScene(STARTER);
    expect(decodeScene(`?${encoded}`, CATALOG_BY_ID)!.items).toHaveLength(3);
    expect(decodeScene(encoded.replaceAll(';', '%3B'), CATALOG_BY_ID)!.items).toHaveLength(3);
  });

  it('returns null for empty, null and undefined input', () => {
    expect(decodeScene('', CATALOG_BY_ID)).toBeNull();
    expect(decodeScene('?', CATALOG_BY_ID)).toBeNull();
    expect(decodeScene(null, CATALOG_BY_ID)).toBeNull();
    expect(decodeScene(undefined, CATALOG_BY_ID)).toBeNull();
  });

  it('returns null for an unknown version', () => {
    expect(decodeScene('v=2&d=w&s=monitor-1c@0,0,0,0,d', CATALOG_BY_ID)).toBeNull();
    expect(decodeScene('garbage', CATALOG_BY_ID)).toBeNull();
  });

  it('keeps a version-only payload as a legitimately empty scene', () => {
    const decoded = decodeScene('v=1&d=w', CATALOG_BY_ID);
    expect(decoded!.items).toHaveLength(0);
    expect(decoded!.dropped).toBe(0);
  });

  it('drops an unknown sku', () => {
    const decoded = decodeScene('v=1&d=w&s=sku-that-left@0,0,0,0,f', CATALOG_BY_ID);
    expect(decoded!.items).toHaveLength(0);
    expect(decoded!.dropped).toBe(1);
  });

  it('drops a zone that contradicts the catalog surface', () => {
    // monitor-1c is a desk item; claiming floor must not survive.
    const decoded = decodeScene('v=1&d=w&s=monitor-1c@0,0,0,0,f', CATALOG_BY_ID);
    expect(decoded!.items).toHaveLength(0);
    expect(decoded!.dropped).toBe(1);
  });

  it('drops malformed items without throwing and keeps the rest', () => {
    const payload = 'v=1&d=w&s=monitor-1c@0,0,0,0,d;@@@;monitor-a27i@1,2;monitor-a27i@1,2,3,4,9';
    const decoded = decodeScene(payload, CATALOG_BY_ID);
    expect(decoded!.items).toHaveLength(1);
    expect(decoded!.items[0].sku).toBe('monitor-1c');
    expect(decoded!.dropped).toBe(3);
  });

  it('does not count a trailing separator as a dropped item', () => {
    const decoded = decodeScene('v=1&d=w&s=monitor-1c@0,0,0,0,d;', CATALOG_BY_ID);
    expect(decoded!.items).toHaveLength(1);
    expect(decoded!.dropped).toBe(0);
  });

  it('rejects NaN, empty and exponent numeric fields', () => {
    expect(decodeScene('v=1&d=w&s=monitor-1c@NaN,0,0,0,d', CATALOG_BY_ID)!.dropped).toBe(1);
    expect(decodeScene('v=1&d=w&s=monitor-1c@,0,0,0,d', CATALOG_BY_ID)!.dropped).toBe(1);
    expect(decodeScene('v=1&d=w&s=monitor-1c@1e3,0,0,0,d', CATALOG_BY_ID)!.dropped).toBe(1);
  });

  it('falls back to week for a missing or unknown duration char', () => {
    expect(decodeScene('v=1&s=monitor-1c@0,0,0,0,d', CATALOG_BY_ID)!.duration).toBe('week');
    expect(decodeScene('v=1&d=q&s=monitor-1c@0,0,0,0,d', CATALOG_BY_ID)!.duration).toBe('week');
  });

  it('reassigns ids positionally after a drop', () => {
    const decoded = decodeScene(
      'v=1&d=w&s=ghost-sku@0,0,0,0,f;monitor-1c@0,0,0,0,d',
      CATALOG_BY_ID,
    );
    expect(decoded!.items).toHaveLength(1);
    expect(decoded!.items[0].id).toBe('item-0');
  });
});

describe('decodeScene bounds', () => {
  it('clamps an out-of-range coordinate instead of trusting the link', () => {
    const decoded = decodeScene('v=1&d=w&s=monitor-1c@99999,0,0,0,d', CATALOG_BY_ID);
    expect(decoded!.items[0].position).toEqual([10000, 0, 0]);
  });

  it('keeps a clamped value stable through re-encode', () => {
    const decoded = decodeScene('v=1&d=w&s=monitor-1c@-99999,0,0,99999.5,d', CATALOG_BY_ID);
    expect(encodeScene({ items: decoded!.items, duration: decoded!.duration })).toBe(
      'v=1&d=w&s=monitor-1c@-10000,0,0,10000,d',
    );
  });
});
