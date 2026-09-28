import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG } from '../catalog';
import { useStore } from './index';

/**
 * Right-click rotate (post-plan UI addition). rotateItem must route through
 * the same commitPlacement gate as a drag drop: re-snap + collision check,
 * no-op on an orientation that no longer fits (D10).
 */

const floorChairSku =
  CATALOG.find((item) => item.surface === 'floor' && item.category === 'chair')?.sku ?? '';

beforeEach(() => {
  useStore.setState({ scene: { items: [], duration: 'week' } });
});

describe('rotateItem', () => {
  it('rotates a floor item a quarter turn in place', () => {
    useStore.setState({
      scene: {
        duration: 'week',
        items: [
          { id: 'a', sku: floorChairSku, position: [0, 0, 0], rotationY: 0, snapZone: 'floor' },
        ],
      },
    });
    expect(useStore.getState().rotateItem('a')).toBe(true);
    const item = useStore.getState().scene.items[0];
    expect(item.rotationY).toBeCloseTo(Math.PI / 2, 3);
    expect(item.position[0]).toBeCloseTo(0, 3);
    expect(item.position[2]).toBeCloseTo(0, 3);
  });

  it('accumulates rotations through full turns', () => {
    useStore.setState({
      scene: {
        duration: 'week',
        items: [
          {
            id: 'a',
            sku: floorChairSku,
            position: [1, 0, 1],
            rotationY: Math.PI * 1.5,
            snapZone: 'floor',
          },
        ],
      },
    });
    expect(useStore.getState().rotateItem('a')).toBe(true);
    // 1.5π + 0.5π ≈ 2π — a full circle back to the start (float-ulp tolerance).
    expect(useStore.getState().scene.items[0].rotationY).toBeCloseTo(Math.PI * 2, 3);
  });

  it('is a no-op for an unknown id', () => {
    expect(useStore.getState().rotateItem('missing')).toBe(false);
    expect(useStore.getState().scene.items).toHaveLength(0);
  });
});
