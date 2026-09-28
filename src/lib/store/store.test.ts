import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import { DESK_TOP_Y } from '../placement';

beforeEach(() => {
  useStore.setState({ scene: { items: [], duration: 'week' } });
});

describe('slice composition', () => {
  it('exposes all three slices', () => {
    const state = useStore.getState();
    expect(state.scene).toEqual({ items: [], duration: 'week' });
    expect(state.bottomSheetOpen).toBe(false);
    expect(state.hintDismissed).toBe(false);
    expect(state.qualityTier).toBe('high');
    expect(state.dragging).toBe(false);
    expect(state.pendingSku).toBeNull();
  });

  it('device setters update transient state', () => {
    useStore.getState().setQualityTier('low');
    useStore.getState().setDragging(true);
    useStore.getState().setPendingSku('monitor-1c');
    const state = useStore.getState();
    expect(state.qualityTier).toBe('low');
    expect(state.dragging).toBe(true);
    expect(state.pendingSku).toBe('monitor-1c');
  });
});

describe('addItem', () => {
  it('places a floor item and returns true', () => {
    expect(useStore.getState().addItem('chair-ergonomic')).toBe(true);
    const items = useStore.getState().scene.items;
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe('chair-ergonomic');
    expect(items[0].snapZone).toBe('floor');
  });

  it('mints unique instance ids outside the decoder scheme', () => {
    useStore.getState().addItem('chair-ergonomic');
    useStore.getState().addItem('accessory-whiteboard');
    const ids = useStore.getState().scene.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).not.toMatch(/^item-/);
  });

  it('rejects an unknown sku', () => {
    expect(useStore.getState().addItem('sku-that-left')).toBe(false);
    expect(useStore.getState().scene.items).toHaveLength(0);
  });

  it('rejects a desk item when no desk is placed', () => {
    expect(useStore.getState().addItem('monitor-1c')).toBe(false);
  });

  it('places a desk item on the placed desk', () => {
    useStore.getState().addItem('desk-electrical');
    expect(useStore.getState().addItem('monitor-1c')).toBe(true);
    const monitor = useStore.getState().scene.items[1];
    expect(monitor.snapZone).toBe('desk');
    expect(monitor.position[1]).toBe(DESK_TOP_Y);
  });
});

describe('commitPlacement', () => {
  it('commits a valid drop and snaps it', () => {
    useStore.getState().addItem('desk-electrical');
    const ok = useStore.getState().commitPlacement({
      sku: 'monitor-1c',
      position: [0.03, 0.75, 0.07],
      snapZone: 'desk',
      rotationY: 0,
      hostDeskId: useStore.getState().scene.items[0].id,
    });
    expect(ok).toBe(true);
    expect(useStore.getState().scene.items[1].position).toEqual([0.05, DESK_TOP_Y, 0.05]);
  });

  it('rejects an invalid drop without touching state', () => {
    useStore.getState().addItem('chair-ergonomic');
    const before = structuredClone(useStore.getState().scene);
    const ok = useStore.getState().commitPlacement({
      sku: 'chair-ergonomic',
      position: [0, 0, 0],
      snapZone: 'floor',
      rotationY: 0,
    });
    expect(ok).toBe(false);
    expect(useStore.getState().scene).toEqual(before);
  });

  it('moves an existing item via selfId without changing the count', () => {
    useStore.getState().addItem('chair-ergonomic');
    const id = useStore.getState().scene.items[0].id;
    const ok = useStore.getState().commitPlacement({
      sku: 'chair-ergonomic',
      position: [2, 0, 2],
      snapZone: 'floor',
      rotationY: 0,
      selfId: id,
    });
    expect(ok).toBe(true);
    const items = useStore.getState().scene.items;
    expect(items).toHaveLength(1);
    expect(items[0].position).toEqual([2, 0, 2]);
  });

  it('carries desk passengers when the desk moves', () => {
    useStore.getState().addItem('desk-electrical');
    useStore.getState().addItem('monitor-1c');
    const deskId = useStore.getState().scene.items[0].id;
    const ok = useStore.getState().commitPlacement({
      sku: 'desk-electrical',
      position: [1, 0, 0],
      snapZone: 'floor',
      rotationY: 0,
      selfId: deskId,
    });
    expect(ok).toBe(true);
    const items = useStore.getState().scene.items;
    expect(items).toHaveLength(2);
    expect(items[0].position).toEqual([1, 0, 0]);
    expect(items[1].position).toEqual([1, DESK_TOP_Y, 0]);
  });

  it('rejects a desk rotation while it has passengers', () => {
    useStore.getState().addItem('desk-electrical');
    useStore.getState().addItem('monitor-1c');
    const deskId = useStore.getState().scene.items[0].id;
    const before = structuredClone(useStore.getState().scene);
    const ok = useStore.getState().commitPlacement({
      sku: 'desk-electrical',
      position: [0, 0, 0],
      snapZone: 'floor',
      rotationY: Math.PI / 2,
      selfId: deskId,
    });
    expect(ok).toBe(false);
    expect(useStore.getState().scene).toEqual(before);
  });

  it('allows a desk rotation with no passengers', () => {
    useStore.getState().addItem('desk-electrical');
    const deskId = useStore.getState().scene.items[0].id;
    const ok = useStore.getState().commitPlacement({
      sku: 'desk-electrical',
      position: [0, 0, 0],
      snapZone: 'floor',
      rotationY: Math.PI / 2,
      selfId: deskId,
    });
    expect(ok).toBe(true);
    expect(useStore.getState().scene.items[0].rotationY).toBeCloseTo(Math.PI / 2, 3);
  });

  it('does not reject a move that re-states an unrounded stored rotation', () => {
    useStore.getState().replaceScene({
      items: [
        { id: 'd-1', sku: 'desk-electrical', position: [0, 0, 0], rotationY: 1.5708, snapZone: 'floor' },
        { id: 'm-1', sku: 'monitor-1c', position: [0, DESK_TOP_Y, 0], rotationY: 0, snapZone: 'desk' },
      ],
      duration: 'week',
    });
    const ok = useStore.getState().commitPlacement({
      sku: 'desk-electrical',
      position: [1, 0, 0],
      rotationY: 1.5708,
      snapZone: 'floor',
      selfId: 'd-1',
    });
    expect(ok).toBe(true);
    expect(useStore.getState().scene.items[0].position).toEqual([1, 0, 0]);
  });

  it('rejects a selfId that does not exist', () => {
    expect(
      useStore.getState().commitPlacement({
        sku: 'chair-ergonomic',
        position: [2, 0, 2],
        snapZone: 'floor',
        rotationY: 0,
        selfId: 'no-such-id',
      }),
    ).toBe(false);
  });
});

describe('removeItem', () => {
  it('removes one item', () => {
    useStore.getState().addItem('chair-ergonomic');
    const id = useStore.getState().scene.items[0].id;
    useStore.getState().removeItem(id);
    expect(useStore.getState().scene.items).toHaveLength(0);
  });

  it('cascades desk items when their host desk is removed', () => {
    useStore.getState().addItem('desk-electrical');
    useStore.getState().addItem('monitor-1c');
    const deskId = useStore.getState().scene.items[0].id;
    useStore.getState().removeItem(deskId);
    expect(useStore.getState().scene.items).toHaveLength(0);
  });

  it('ignores an unknown id', () => {
    useStore.getState().addItem('chair-ergonomic');
    const before = structuredClone(useStore.getState().scene);
    useStore.getState().removeItem('no-such-id');
    expect(useStore.getState().scene).toEqual(before);
  });
});

describe('duration and hydration entry', () => {
  it('setDuration switches to month', () => {
    useStore.getState().setDuration('month');
    expect(useStore.getState().scene.duration).toBe('month');
  });

  it('replaceScene swaps the scene wholesale', () => {
    const scene = { items: [], duration: 'month' as const };
    useStore.getState().replaceScene(scene);
    expect(useStore.getState().scene).toEqual(scene);
  });
});
