import { describe, expect, it } from 'vitest';
import { STARTER_SCENE, reconcileScene } from './scene-persistence';
import { DESK_TOP_Y } from './placement';
import type { SceneItem } from './types';

function item(
  id: string,
  sku: string,
  position: [number, number, number],
  rotationY: number,
  snapZone: SceneItem['snapZone'],
): SceneItem {
  return { id, sku, position, rotationY, snapZone };
}

describe('reconcileScene', () => {
  it('keeps a valid scene unchanged', () => {
    const items = [
      item('d-1', 'desk-electrical', [0, 0, 0], 0, 'floor'),
      item('c-1', 'chair-ergonomic', [0, 0, 1.2], 0, 'floor'),
      item('m-1', 'monitor-1c', [0, DESK_TOP_Y, 0], 0, 'desk'),
    ];
    const result = reconcileScene(items);
    expect(result.dropped).toBe(0);
    expect(result.items).toEqual(items);
  });

  it('re-places a colliding item instead of dropping it', () => {
    const items = [
      item('d-1', 'desk-electrical', [0, 0, 0], 0, 'floor'),
      item('c-1', 'chair-ergonomic', [0, 0, 0], 0, 'floor'),
    ];
    const result = reconcileScene(items);
    expect(result.dropped).toBe(0);
    expect(result.items).toHaveLength(2);
    const chair = result.items.find((i) => i.id === 'c-1')!;
    expect(chair.position).not.toEqual([0, 0, 0]);
  });

  it('re-places a desk item whose host desk is missing', () => {
    const items = [
      item('d-1', 'desk-electrical', [0, 0, 0], 0, 'floor'),
      item('m-1', 'monitor-1c', [5, DESK_TOP_Y, 5], 0, 'desk'),
    ];
    const result = reconcileScene(items);
    expect(result.dropped).toBe(0);
    const monitor = result.items.find((i) => i.id === 'm-1')!;
    expect(monitor.snapZone).toBe('desk');
    expect(Math.abs(monitor.position[0])).toBeLessThanOrEqual(0.8);
    expect(Math.abs(monitor.position[2])).toBeLessThanOrEqual(0.4);
  });

  it('drops a desk item when no desk exists at all', () => {
    const items = [item('m-1', 'monitor-1c', [0, DESK_TOP_Y, 0], 0, 'desk')];
    const result = reconcileScene(items);
    expect(result.items).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  it('drops an item with an unknown sku', () => {
    const items = [item('x-1', 'sku-that-left', [0, 0, 0], 0, 'floor')];
    const result = reconcileScene(items);
    expect(result.items).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  it('places a desk item on its host even when the host comes later in the payload', () => {
    const items = [
      item('m-1', 'monitor-1c', [2, DESK_TOP_Y, 0], 0, 'desk'),
      item('d-1', 'desk-electrical', [0, 0, 0], 0, 'floor'),
      item('d-2', 'desk-mechanical', [2, 0, 0], 0, 'floor'),
    ];
    const result = reconcileScene(items);
    expect(result.dropped).toBe(0);
    const monitor = result.items.find((i) => i.id === 'm-1')!;
    expect(monitor.position).toEqual([2, DESK_TOP_Y, 0]);
  });

  it('keeps the starter scene valid', () => {
    const result = reconcileScene(STARTER_SCENE.items);
    expect(result.dropped).toBe(0);
    expect(result.items).toHaveLength(2);
  });
});
