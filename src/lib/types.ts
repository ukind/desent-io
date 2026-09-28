// Leaf shared types. Everything may import from here; nothing imports from it.

/** Where an item can rest. Matches catalog `surface` values. */
export type SnapZone = 'desk' | 'floor';

/** Rental billing period. */
export type Duration = 'week' | 'month';

/** One placed item. Position in meters, Y up, XZ is the floor plane. */
export interface SceneItem {
  id: string;
  sku: string;
  position: [number, number, number];
  /** Radians around the Y axis. */
  rotationY: number;
  snapZone: SnapZone;
}

/** Persisted scene state — the unit the codec encodes and pricing reads. */
export interface Scene {
  items: SceneItem[];
  duration: Duration;
}

/** How an item renders in 3D: a GLB archetype or a primitive stand-in. */
export type ModelSource =
  | { kind: 'gltf'; url: string }
  | { kind: 'primitive'; primitive: PrimitiveKind };

export type PrimitiveKind =
  | 'monitor'
  | 'lamp'
  | 'light-bar'
  | 'keyboard'
  | 'mouse'
  | 'webcam'
  | 'coffee-machine'
  | 'power-strip'
  | 'whiteboard';

export type CatalogCategory = 'desk' | 'chair' | 'monitor' | 'lamp' | 'accessory';

/** Catalog entry — the contract drag guardrails and pricing read. */
export interface CatalogItem {
  sku: string;
  name: string;
  category: CatalogCategory;
  /** Where the item rests when placed fresh. */
  surface: SnapZone;
  /** Weekly rent in USD, "From" variant minimum. */
  weeklyPrice: number;
  /** XZ footprint in meters, [width, depth] — input to AABB collision. */
  footprint: [number, number];
  model: ModelSource;
}
