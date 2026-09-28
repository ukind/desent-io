import type { CatalogItem, Duration, Scene, SceneItem, SnapZone } from './types';

/**
 * Pure URL codec for the persisted scene. One module, three consumers: builder
 * hydration, debounced `history.replaceState` writes, and checkout parsing.
 *
 * Format — a versioned query string, no leading `?`:
 *
 *     v=1&d=w&s=sku@x,y,z,rotationY,zone;sku@x,y,z,rotationY,zone
 *
 * `zone` is `f` (floor) or `d` (desk). Instance ids are not encoded: the decoder
 * reassigns them positionally. Prices and names are not encoded either, so a price
 * edit never invalidates a link someone shared last week.
 *
 * The DSL beats base64 JSON: about 600-800 characters for 20 items against 800-1100,
 * human-readable, diffable, and free of the `btoa` non-Latin1 pitfall. The `v=1`
 * prefix buys schema evolution — an unknown version returns null and the caller falls back.
 *
 * This module imports no catalog data (D1 refinement 3). Callers that want sku and
 * zone validation pass the catalog map; the codec then reads only the injected map.
 */
const VERSION = '1';

/**
 * Positions are meters inside a room and rotations are radians, so anything at
 * 10 km magnitude is corrupt store data, not a placement. Dropped on encode:
 * at 1e21 and above `toFixed` would switch to exponent form, which the decoder
 * rejects — this guard keeps that unreachable.
 */
const MAX_MAGNITUDE = 1e4;

/** Plain decimal only: rejects `''` (which `Number` turns into 0), `NaN`, `1e3`, `-0.5x`. */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

const ZONE_TO_CHAR: Record<SnapZone, string> = { floor: 'f', desk: 'd' };
const CHAR_TO_ZONE: Record<string, SnapZone> = { f: 'floor', d: 'desk' };
const DURATION_TO_CHAR: Record<Duration, string> = { week: 'w', month: 'm' };
const CHAR_TO_DURATION: Record<string, Duration> = { w: 'week', m: 'month' };

/** A decoded scene plus the count of payload items the decoder refused. */
export interface DecodedScene extends Scene {
  dropped: number;
}

/** A sku that survives percent-decoding without breaking the `@` / `,` / `;` / `&` separators. */
const SAFE_SKU = /^[A-Za-z0-9._-]+$/;

function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Keeps a hand-edited link from injecting an absurd coordinate into state
 * (research Q4: "out-of-bounds clamped"). This is the sanity bound, not the room
 * bound -- clamping to the actual desk and floor extents is lib/placement.ts.
 */
function clampMagnitude(value: number): number {
  return Math.min(Math.max(value, -MAX_MAGNITUDE), MAX_MAGNITUDE);
}

/**
 * Encodes a scene into the query string. Never throws: an item with a non-finite
 * or out-of-range position, an unknown zone or an unsafe sku is left out rather
 * than written into a link that cannot be read back (FRD:67 — invalid drops never
 * corrupt state).
 *
 * The store's add and drag-commit actions validate before persisting, so this guard
 * is a last-resort invariant, not a runtime path — that is why it stays silent
 * instead of carrying a drop count into the shared contract.
 */
export function encodeScene(scene: Scene): string {
  const durationChar = DURATION_TO_CHAR[scene.duration] ?? DURATION_TO_CHAR.week;
  const parts = [`v=${VERSION}`, `d=${durationChar}`];

  const encoded: string[] = [];
  for (const item of scene.items) {
    if (!SAFE_SKU.test(item.sku)) continue;
    const zoneChar = ZONE_TO_CHAR[item.snapZone];
    if (!zoneChar) continue;
    const numbers = [item.position[0], item.position[1], item.position[2], item.rotationY];
    const finite = numbers.every(
      (n) => Number.isFinite(n) && Math.abs(n) <= MAX_MAGNITUDE,
    );
    if (!finite) continue;
    encoded.push(`${item.sku}@${numbers.map(formatNumber).join(',')},${zoneChar}`);
  }

  if (encoded.length > 0) parts.push(`s=${encoded.join(';')}`);
  return parts.join('&');
}

/**
 * Decodes a query string. Tolerates a leading `?`, a null/undefined input (SSR), and
 * percent-encoded separators.
 *
 * Returns null when there is nothing to hydrate from: empty input, or a version this
 * build does not understand. The caller then falls back to the localStorage mirror or
 * the starter scene. A well-formed payload with a single bad item is not null — the bad
 * item is counted in `dropped` and the rest survive. A payload with no `s` parameter is
 * a legitimately emptied scene, not a fallback trigger.
 *
 * The catalog map is required: unknown skus and zones that contradict the catalog
 * surface are dropped here, so no caller can hydrate corrupt items (research Q4,
 * FRD:67). The map is injected, never imported — the codec stays catalog-agnostic.
 */
export function decodeScene(
  search: string | null | undefined,
  catalog: ReadonlyMap<string, CatalogItem>,
): DecodedScene | null {
  const raw = (search ?? '').replace(/^\?/, '').trim();
  if (raw === '') return null;

  const params = new URLSearchParams(raw);
  if (params.get('v') !== VERSION) return null;

  const items: SceneItem[] = [];
  let dropped = 0;
  const payload = params.get('s');
  if (payload) {
    for (const token of payload.split(';')) {
      if (token === '') continue; // a trailing separator is not an item
      const item = decodeItem(token, items.length, catalog);
      if (item) items.push(item);
      else dropped += 1;
    }
  }

  return {
    items,
    duration: CHAR_TO_DURATION[params.get('d') ?? ''] ?? 'week',
    dropped,
  };
}

function decodeItem(
  token: string,
  index: number,
  catalog: ReadonlyMap<string, CatalogItem>,
): SceneItem | null {
  const separator = token.indexOf('@');
  if (separator <= 0) return null;

  const sku = token.slice(0, separator);
  const fields = token.slice(separator + 1).split(',');
  if (fields.length !== 5) return null;

  const numbers: number[] = [];
  for (const field of fields.slice(0, 4)) {
    if (!DECIMAL.test(field)) return null;
    numbers.push(Number(field));
  }

  const snapZone = CHAR_TO_ZONE[fields[4]];
  if (!snapZone) return null;

  const entry = catalog.get(sku);
  // Unknown sku, or a zone that contradicts the catalog surface, is a stale or
  // hand-edited link. Drop it; never guess (D1 refinement 3, D7).
  if (!entry || entry.surface !== snapZone) return null;

  return {
    id: `item-${index}`,
    sku,
    position: [clampMagnitude(numbers[0]), clampMagnitude(numbers[1]), clampMagnitude(numbers[2])],
    rotationY: clampMagnitude(numbers[3]),
    snapZone,
  };
}
