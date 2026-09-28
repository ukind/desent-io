'use client';

import type { PrimitiveKind } from '@/lib/types';

/**
 * Primitive stand-ins for the catalog items rendered without a GLB (D9 hybrid
 * assets). Each shape is built with its base at y=0 — the placed-item group
 * carries the desk-top or floor height. Flat, wide shapes size from the
 * catalog footprint (monitor panel, light bar, keyboard, coffee machine, power
 * strip, whiteboard); small items use fixed sizes. Colors are fixed tints,
 * never textures (no texture bytes on the low tier).
 *
 * A GLB item that fails to load falls back to a footprint-shaped stand-in in
 * placed-item.tsx (FRD:67), so a broken asset never leaves an invisible item.
 */

const TINTS: Record<PrimitiveKind, string> = {
  monitor: '#1f2937',
  lamp: '#e7e5e4',
  'light-bar': '#1f2937',
  keyboard: '#374151',
  mouse: '#374151',
  webcam: '#1f2937',
  'coffee-machine': '#9ca3af',
  'power-strip': '#e7e5e4',
  whiteboard: '#fafaf9',
};

function Box({
  size,
  position,
  color,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/** One stand-in shape per PrimitiveKind, sized from the catalog footprint [width, depth]. */
export function PrimitiveModel({
  kind,
  footprint,
}: {
  kind: PrimitiveKind;
  footprint: [number, number];
}) {
  const color = TINTS[kind];
  const [w, d] = footprint;

  switch (kind) {
    case 'monitor':
      return (
        <group>
          <Box size={[0.18, 0.02, d * 0.75]} position={[0, 0.01, 0]} color={color} />
          <Box size={[0.03, 0.18, 0.03]} position={[0, 0.11, 0]} color={color} />
          <Box size={[w, 0.3, 0.02]} position={[0, 0.35, 0]} color={color} />
        </group>
      );
    case 'lamp':
      // ponytail: one lamp shape for desk + floor lamps — split per sku if the
      // visual gap ships badly.
      return (
        <group>
          <mesh position={[0, 0.01, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 0.02, 16]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <Box size={[0.02, 0.34, 0.02]} position={[0, 0.19, 0]} color={color} />
          <Box size={[0.12, 0.06, 0.12]} position={[0, 0.4, 0]} color={color} />
        </group>
      );
    case 'light-bar':
      return (
        <group>
          <Box size={[0.05, 0.05, 0.04]} position={[0, 0.025, 0]} color={color} />
          <Box size={[w, 0.03, 0.06]} position={[0, 0.065, 0]} color={color} />
        </group>
      );
    case 'keyboard':
      return <Box size={[w, 0.02, d]} position={[0, 0.01, 0]} color={color} />;
    case 'mouse':
      return <Box size={[0.06, 0.03, 0.09]} position={[0, 0.015, 0]} color={color} />;
    case 'webcam':
      return (
        <group>
          <Box size={[0.06, 0.07, 0.03]} position={[0, 0.035, 0]} color={color} />
          <Box size={[0.08, 0.06, 0.04]} position={[0, 0.1, 0]} color={color} />
        </group>
      );
    case 'coffee-machine':
      return (
        <group>
          <Box size={[w, 0.28, d]} position={[0, 0.14, 0]} color={color} />
          <Box size={[w * 0.6, 0.06, d * 0.8]} position={[0, 0.31, 0]} color={color} />
        </group>
      );
    case 'power-strip':
      return <Box size={[w, 0.03, d]} position={[0, 0.015, 0]} color={color} />;
    case 'whiteboard':
      return (
        <group>
          <Box size={[w, 0.9, 0.03]} position={[0, 0.46, 0]} color={color} />
          <Box size={[0.06, 0.02, d]} position={[-w / 3, 0.01, 0]} color="#57534e" />
          <Box size={[0.06, 0.02, d]} position={[w / 3, 0.01, 0]} color="#57534e" />
        </group>
      );
  }
}
