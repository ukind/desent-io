import type { CatalogItem, SceneItem, SnapZone } from './types';

/**
 * Pure placement math: snap quantization, zone-scoped XZ AABB collision,
 * extent clamping and hydration re-resolution (D8, D10). No React, no three.js,
 * no I/O. Consumers: the persistence module (Slice 5) re-places invalid items
 * at hydration; the drag controller (Slice 9) commits or spring-backs each drop.
 *
 * The catalog map is injected, never imported — same pattern as scene-codec
 * (D1 refinement 3, D10).
 */

/** Desk surface height in meters (Y up). Desk items rest at this height. */
export const DESK_TOP_Y = 0.75;

/** Square floor play area in meters (XZ), centered on the origin. */
export const ROOM_SIZE = 6;

/** Snap grid pitch in meters. */
export const SNAP_GRID = 0.05;

/** Search grid pitch for findFreeSlot — coarser than the snap grid. */
const SEARCH_STEP = 0.25;

/** A validated placement: final position plus the zone it belongs to. */
export interface SnapResult {
  position: [number, number, number];
  snapZone: SnapZone;
}

/** Half-extents of an item's XZ AABB after a rotationY. */
export function rotatedExtents(
  footprint: [number, number],
  rotationY: number,
): [number, number] {
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  return [
    footprint[0] * cos + footprint[1] * sin,
    footprint[0] * sin + footprint[1] * cos,
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToGrid(value: number): number {
  return Number((Math.round(value / SNAP_GRID) * SNAP_GRID).toFixed(3));
}

function overlapsXZ(
  a: [number, number],
  aExt: [number, number],
  b: [number, number],
  bExt: [number, number],
): boolean {
  return (
    Math.abs(a[0] - b[0]) < (aExt[0] + bExt[0]) / 2 &&
    Math.abs(a[1] - b[1]) < (aExt[1] + bExt[1]) / 2
  );
}

/**
 * Zone-scoped XZ AABB collision. Items on different surfaces never collide —
 * a monitor on the desk and a chair on the floor below it coexist.
 * An unknown candidate sku counts as occupied; unknown neighbours are skipped
 * (hydration drops them before placement ever sees them).
 */
// ponytail: collision is zone-scoped, not host-scoped — a hand-edited URL can
// place overlapping desks (decodeScene never collision-checks), and then two
// items on different desks can false-positive near the shared edge.
// Go host-scoped if that ships.
export function collides(
  candidate: {
    sku: string;
    zone: SnapZone;
    position: [number, number, number];
    rotationY: number;
    id?: string;
  },
  placed: SceneItem[],
  catalog: ReadonlyMap<string, CatalogItem>,
): boolean {
  const entry = catalog.get(candidate.sku);
  if (!entry) return true;
  const [cw, cd] = rotatedExtents(entry.footprint, candidate.rotationY);
  for (const other of placed) {
    if (candidate.id !== undefined && other.id === candidate.id) continue;
    if (other.snapZone !== candidate.zone) continue;
    const otherEntry = catalog.get(other.sku);
    if (!otherEntry) continue;
    const [ow, od] = rotatedExtents(otherEntry.footprint, other.rotationY);
    if (
      overlapsXZ(
        [candidate.position[0], candidate.position[2]],
        [cw, cd],
        [other.position[0], other.position[2]],
        [ow, od],
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validates one raw drop: quantizes to the snap grid, clamps to the real desk
 * or floor extents (D10), then collision-checks. Returns null when the drop is
 * invalid — the caller spring-backs; the placed list is never mutated.
 *
 * `zone` comes from the drag raycast (desk planes tested before floor, Slice 9).
 * An item can only rest on its catalog surface — a monitor forced onto the
 * floor is a rejection, mirroring the codec's zone/surface rule. Desk drops
 * without a host desk are rejected the same way.
 */
export function resolveSnap(
  raw: [number, number, number],
  zone: SnapZone,
  sku: string,
  rotationY: number,
  placed: SceneItem[],
  catalog: ReadonlyMap<string, CatalogItem>,
  selfId?: string,
  hostDesk?: SceneItem,
): SnapResult | null {
  // Last-resort invariant on the untrusted inputs: the drag raycast (Slice 9)
  // is raw pointer math, so a non-finite drop or rotation can never produce a
  // placement. Store positions (hostDesk, placed) are finite by construction —
  // decodeScene's DECIMAL gate rejects NaN/Infinity on restore, and every
  // commit path passes through this guard. raw[1] is ignored: Y is set by zone.
  if (
    !Number.isFinite(rotationY) ||
    !Number.isFinite(raw[0]) ||
    !Number.isFinite(raw[2])
  ) {
    return null;
  }
  const entry = catalog.get(sku);
  if (!entry || entry.surface !== zone) return null;
  if (zone === 'desk' && !hostDesk) return null;

  const [ew, ed] = rotatedExtents(entry.footprint, rotationY);

  let center: [number, number];
  let half: [number, number];
  if (zone === 'desk') {
    const deskEntry = catalog.get(hostDesk!.sku);
    if (!deskEntry || deskEntry.category !== 'desk') return null;
    const [dw, dd] = rotatedExtents(deskEntry.footprint, hostDesk!.rotationY);
    center = [hostDesk!.position[0], hostDesk!.position[2]];
    half = [dw / 2, dd / 2];
  } else {
    center = [0, 0];
    half = [ROOM_SIZE / 2, ROOM_SIZE / 2];
  }

  // An item larger than its surface can never sit fully on it.
  if (ew / 2 > half[0] || ed / 2 > half[1]) return null;

  const x = clamp(
    snapToGrid(raw[0]),
    center[0] - half[0] + ew / 2,
    center[0] + half[0] - ew / 2,
  );
  const z = clamp(
    snapToGrid(raw[2]),
    center[1] - half[1] + ed / 2,
    center[1] + half[1] - ed / 2,
  );
  const position: [number, number, number] = [x, zone === 'desk' ? DESK_TOP_Y : 0, z];

  if (collides({ sku, zone, position, rotationY, id: selfId }, placed, catalog)) {
    return null;
  }
  return { position, snapZone: zone };
}

/**
 * The desk whose surface contains the item's XZ center, or null. The
 * persistence module (Slice 5) uses this to detect desk items whose host desk
 * disappeared at hydration (D8); the drag controller (Slice 9) uses it to pick
 * the snap host under the pointer.
 */
export function findHostDesk(
  item: Pick<SceneItem, 'sku' | 'position'>,
  placed: SceneItem[],
  catalog: ReadonlyMap<string, CatalogItem>,
): SceneItem | null {
  const entry = catalog.get(item.sku);
  if (!entry || entry.surface !== 'desk') return null;
  for (const candidate of placed) {
    const deskEntry = catalog.get(candidate.sku);
    if (!deskEntry || deskEntry.category !== 'desk') continue;
    const [dw, dd] = rotatedExtents(deskEntry.footprint, candidate.rotationY);
    if (
      Math.abs(item.position[0] - candidate.position[0]) <= dw / 2 &&
      Math.abs(item.position[2] - candidate.position[2]) <= dd / 2
    ) {
      return candidate;
    }
  }
  return null;
}

/** Coarse outward scan of one surface; returns the first free spot or null. */
function scanSurface(
  sku: string,
  rotationY: number,
  placed: SceneItem[],
  catalog: ReadonlyMap<string, CatalogItem>,
  center: [number, number],
  half: [number, number],
  zone: SnapZone,
  selfId?: string,
): SnapResult | null {
  const entry = catalog.get(sku);
  if (!entry) return null;
  const [ew, ed] = rotatedExtents(entry.footprint, rotationY);
  if (ew / 2 > half[0] || ed / 2 > half[1]) return null;

  const offsets: [number, number][] = [];
  for (let x = -half[0] + ew / 2; x <= half[0] - ew / 2 + 1e-9; x += SEARCH_STEP) {
    for (let z = -half[1] + ed / 2; z <= half[1] - ed / 2 + 1e-9; z += SEARCH_STEP) {
      offsets.push([x, z]);
    }
  }
  // The exact center is not always on the coarse grid (e.g. a 6 m room at
  // 0.25 step starts at -2.675 and never lands on 0) — always try it first.
  offsets.unshift([0, 0]);
  offsets.sort(
    (a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]),
  );

  for (const [dx, dz] of offsets) {
    const position: [number, number, number] = [
      Number((center[0] + dx).toFixed(3)),
      zone === 'desk' ? DESK_TOP_Y : 0,
      Number((center[1] + dz).toFixed(3)),
    ];
    if (!collides({ sku, zone, position, rotationY, id: selfId }, placed, catalog)) {
      return { position, snapZone: zone };
    }
  }
  return null;
}

/**
 * Finds a free spot for an item on its catalog surface — the hydration
 * re-resolution path (D8): a desk item whose host desk disappeared, or a
 * restored position that collides. Desk items scan each placed desk's surface;
 * floor items scan the room. Returns null when nothing fits — the caller drops
 * the item (FRD:67 never corrupts state).
 */
export function findFreeSlot(
  sku: string,
  rotationY: number,
  placed: SceneItem[],
  catalog: ReadonlyMap<string, CatalogItem>,
  selfId?: string,
): SnapResult | null {
  const entry = catalog.get(sku);
  if (!entry) return null;

  if (entry.surface === 'desk') {
    for (const desk of placed) {
      const deskEntry = catalog.get(desk.sku);
      if (!deskEntry || deskEntry.category !== 'desk') continue;
      const [dw, dd] = rotatedExtents(deskEntry.footprint, desk.rotationY);
      const slot = scanSurface(
        sku,
        rotationY,
        placed,
        catalog,
        [desk.position[0], desk.position[2]],
        [dw / 2, dd / 2],
        'desk',
        selfId,
      );
      if (slot) return slot;
    }
    return null;
  }

  return scanSurface(
    sku,
    rotationY,
    placed,
    catalog,
    [0, 0],
    [ROOM_SIZE / 2, ROOM_SIZE / 2],
    'floor',
    selfId,
  );
}
