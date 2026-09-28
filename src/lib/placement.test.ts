import { describe, expect, it } from 'vitest';
import {
  DESK_TOP_Y,
  ROOM_SIZE,
  collides,
  findFreeSlot,
  findHostDesk,
  resolveSnap,
  rotatedExtents,
} from './placement';
import { CATALOG_BY_ID } from './catalog';
import type { CatalogItem, SceneItem } from './types';

function placed(
  id: string,
  sku: string,
  position: [number, number, number],
  rotationY: number,
  catalog: ReadonlyMap<string, CatalogItem>,
): SceneItem {
  const entry = catalog.get(sku);
  if (!entry) throw new Error(`unknown test sku: ${sku}`);
  return { id, sku, position, rotationY, snapZone: entry.surface };
}

const DESK = placed('desk-1', 'desk-electrical', [0, 0, 0], 0, CATALOG_BY_ID);
const MONITOR = placed('m-1', 'monitor-1c', [0, DESK_TOP_Y, 0], 0, CATALOG_BY_ID);

// Test-only catalog: a desk item wider than a desk, a desk item that almost
// fills a desk, and a floor item too large for the room. Keeps edge cases out
// of the real 20-item catalog.
const OVERSIZED_DESK_ITEM: CatalogItem = {
  sku: 'test-oversized-desk-item',
  name: 'Test Oversized Desk Item',
  category: 'accessory',
  surface: 'desk',
  weeklyPrice: 1,
  footprint: [2, 2],
  model: { kind: 'primitive', primitive: 'keyboard' },
};
const WIDE_DESK_ITEM: CatalogItem = {
  sku: 'test-wide-desk-item',
  name: 'Test Wide Desk Item',
  category: 'accessory',
  surface: 'desk',
  weeklyPrice: 1,
  footprint: [1.5, 0.7],
  model: { kind: 'primitive', primitive: 'keyboard' },
};
const OVERSIZED_FLOOR_ITEM: CatalogItem = {
  sku: 'test-oversized-floor-item',
  name: 'Test Oversized Floor Item',
  category: 'accessory',
  surface: 'floor',
  weeklyPrice: 1,
  footprint: [ROOM_SIZE + 1, ROOM_SIZE + 1],
  model: { kind: 'primitive', primitive: 'whiteboard' },
};
const TEST_CATALOG = new Map<string, CatalogItem>([
  ...CATALOG_BY_ID,
  [OVERSIZED_DESK_ITEM.sku, OVERSIZED_DESK_ITEM],
  [WIDE_DESK_ITEM.sku, WIDE_DESK_ITEM],
  [OVERSIZED_FLOOR_ITEM.sku, OVERSIZED_FLOOR_ITEM],
]);

describe('rotatedExtents', () => {
  it('keeps extents at 0 rotation', () => {
    expect(rotatedExtents([1.6, 0.8], 0)).toEqual([1.6, 0.8]);
  });

  it('swaps extents at 90 degrees', () => {
    const [w, d] = rotatedExtents([1.6, 0.8], Math.PI / 2);
    expect(w).toBeCloseTo(0.8, 5);
    expect(d).toBeCloseTo(1.6, 5);
  });

  it('grows the AABB at 45 degrees', () => {
    const [w, d] = rotatedExtents([1.6, 0.8], Math.PI / 4);
    expect(w).toBeGreaterThan(1.6);
    expect(d).toBeGreaterThan(0.8);
  });
});

describe('resolveSnap', () => {
  it('quantizes to the snap grid and sets desk Y', () => {
    const result = resolveSnap(
      [0.03, 0, 0.07],
      'desk',
      'monitor-1c',
      0,
      [DESK],
      CATALOG_BY_ID,
      undefined,
      DESK,
    );
    expect(result).not.toBeNull();
    expect(result!.position).toEqual([0.05, DESK_TOP_Y, 0.05]);
    expect(result!.snapZone).toBe('desk');
  });

  it('rests floor items at Y 0', () => {
    const result = resolveSnap([1, 5, 1], 'floor', 'chair-ergonomic', 0, [], CATALOG_BY_ID);
    expect(result!.position[1]).toBe(0);
  });

  it('rejects a zone that contradicts the catalog surface', () => {
    expect(resolveSnap([0, 0, 0], 'floor', 'monitor-1c', 0, [], CATALOG_BY_ID)).toBeNull();
  });

  it('rejects an unknown sku', () => {
    expect(resolveSnap([0, 0, 0], 'floor', 'sku-that-left', 0, [], CATALOG_BY_ID)).toBeNull();
  });

  it('rejects a desk drop without a host desk', () => {
    expect(resolveSnap([0, 0.75, 0], 'desk', 'monitor-1c', 0, [], CATALOG_BY_ID)).toBeNull();
  });

  it('clamps floor drops into the room', () => {
    const result = resolveSnap([10, 0, 10], 'floor', 'chair-ergonomic', 0, [], CATALOG_BY_ID);
    // chair half-extent 0.325, room half 3.
    expect(result!.position).toEqual([2.675, 0, 2.675]);
  });

  it('clamps desk drops onto the host desk surface', () => {
    const result = resolveSnap(
      [5, 0.75, 0],
      'desk',
      'monitor-1c',
      0,
      [DESK],
      CATALOG_BY_ID,
      undefined,
      DESK,
    );
    // monitor half-width 0.275, desk half-width 0.8.
    expect(result!.position).toEqual([0.525, DESK_TOP_Y, 0]);
  });

  it('rejects an item larger than its surface', () => {
    // Desk item wider than the desk (2 > 1.6): reaches the size branch, not the
    // sku or zone guards.
    expect(
      resolveSnap(
        [0, 0.75, 0],
        'desk',
        'test-oversized-desk-item',
        0,
        [DESK],
        TEST_CATALOG,
        undefined,
        DESK,
      ),
    ).toBeNull();
    // Floor item larger than the room (7 > 6).
    expect(
      resolveSnap([0, 0, 0], 'floor', 'test-oversized-floor-item', 0, [], TEST_CATALOG),
    ).toBeNull();
  });

  it('rejects a non-finite drop position', () => {
    expect(
      resolveSnap([NaN, 0, 0], 'floor', 'chair-ergonomic', 0, [], CATALOG_BY_ID),
    ).toBeNull();
    expect(
      resolveSnap(
        [0, 0, Infinity],
        'desk',
        'monitor-1c',
        0,
        [DESK],
        CATALOG_BY_ID,
        undefined,
        DESK,
      ),
    ).toBeNull();
  });

  it('rejects a non-finite rotation', () => {
    expect(
      resolveSnap([0, 0, 0], 'floor', 'chair-ergonomic', NaN, [], CATALOG_BY_ID),
    ).toBeNull();
  });

  it('rejects a collision without mutating the placed list', () => {
    const scene = [DESK, MONITOR];
    const snapshot = JSON.parse(JSON.stringify(scene)) as SceneItem[];
    const result = resolveSnap(
      [0.1, 0.75, 0],
      'desk',
      'monitor-a24i',
      0,
      scene,
      CATALOG_BY_ID,
      undefined,
      DESK,
    );
    expect(result).toBeNull();
    expect(scene).toEqual(snapshot);
  });

  it('ignores items on other zones when checking collision', () => {
    const chair = placed('c-1', 'chair-ergonomic', [0, 0, 0], 0, CATALOG_BY_ID);
    const result = resolveSnap(
      [0, 0.75, 0],
      'desk',
      'monitor-1c',
      0,
      [DESK, chair],
      CATALOG_BY_ID,
      undefined,
      DESK,
    );
    expect(result).not.toBeNull();
  });

  it('excludes the re-snapped item itself from collision via selfId', () => {
    const scene = [DESK, MONITOR];
    expect(
      resolveSnap([0, 0.75, 0], 'desk', 'monitor-1c', 0, scene, CATALOG_BY_ID, undefined, DESK),
    ).toBeNull();
    expect(
      resolveSnap([0, 0.75, 0], 'desk', 'monitor-1c', 0, scene, CATALOG_BY_ID, 'm-1', DESK),
    ).not.toBeNull();
  });
});

describe('collides', () => {
  it('treats an unknown candidate sku as occupied', () => {
    expect(
      collides(
        { sku: 'sku-that-left', zone: 'floor', position: [0, 0, 0], rotationY: 0 },
        [],
        CATALOG_BY_ID,
      ),
    ).toBe(true);
  });

  it('skips neighbours with unknown skus', () => {
    const ghost: SceneItem = {
      id: 'g-1',
      sku: 'ghost-sku',
      position: [0, 0, 0],
      rotationY: 0,
      snapZone: 'floor',
    };
    expect(
      collides(
        { sku: 'chair-ergonomic', zone: 'floor', position: [0, 0, 0], rotationY: 0 },
        [ghost],
        CATALOG_BY_ID,
      ),
    ).toBe(false);
  });
});

describe('findHostDesk', () => {
  it('returns the desk under a desk item', () => {
    expect(findHostDesk(MONITOR, [DESK, MONITOR], CATALOG_BY_ID)).toBe(DESK);
  });

  it('returns null off the desk surface', () => {
    expect(
      findHostDesk({ sku: 'monitor-1c', position: [2, DESK_TOP_Y, 0] }, [DESK], CATALOG_BY_ID),
    ).toBeNull();
  });

  it('returns null for floor items', () => {
    const chair = placed('c-1', 'chair-ergonomic', [0, 0, 0], 0, CATALOG_BY_ID);
    expect(findHostDesk(chair, [DESK, chair], CATALOG_BY_ID)).toBeNull();
  });
});

describe('findFreeSlot', () => {
  it('places a floor item at the room center when empty', () => {
    const slot = findFreeSlot('chair-ergonomic', 0, [], CATALOG_BY_ID);
    expect(slot).toEqual({ position: [0, 0, 0], snapZone: 'floor' });
  });

  it('returns null for a desk item when no desk is placed', () => {
    expect(findFreeSlot('monitor-1c', 0, [], CATALOG_BY_ID)).toBeNull();
  });

  it('finds a spot on the placed desk for a desk item', () => {
    const slot = findFreeSlot('monitor-1c', 0, [DESK], CATALOG_BY_ID);
    expect(slot).not.toBeNull();
    expect(slot!.snapZone).toBe('desk');
    expect(slot!.position[1]).toBe(DESK_TOP_Y);
    expect(Math.abs(slot!.position[0])).toBeLessThanOrEqual(0.8);
    expect(Math.abs(slot!.position[2])).toBeLessThanOrEqual(0.4);
  });

  it('moves to the second desk when the first is full', () => {
    const desk2 = placed('desk-2', 'desk-mechanical', [2, 0, 0], 0, CATALOG_BY_ID);
    const wide = placed('w-1', 'test-wide-desk-item', [0, DESK_TOP_Y, 0], 0, TEST_CATALOG);
    const slot = findFreeSlot('test-wide-desk-item', 0, [DESK, desk2, wide], TEST_CATALOG);
    expect(slot).toEqual({ position: [2, DESK_TOP_Y, 0], snapZone: 'desk' });
  });

  it('returns null when the item cannot fit anywhere', () => {
    expect(findFreeSlot('test-oversized-floor-item', 0, [DESK], TEST_CATALOG)).toBeNull();
  });

  it('excludes the re-placed item itself via selfId', () => {
    const slot = findFreeSlot('monitor-1c', 0, [DESK, MONITOR], CATALOG_BY_ID, 'm-1');
    expect(slot).toEqual({ position: [0, DESK_TOP_Y, 0], snapZone: 'desk' });
  });
});
