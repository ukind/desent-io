# monis.rent — Design System

Editorial showroom: a warm paper ground, near-black ink, one vermilion accent,
and a noho-inspired category color system. Reference: [noho](https://noho.ink)
(Awwwards SOTD Sep 2026) — cream ground + saturated product tiles.

## Tokens (`src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--bone` | `#F4F1EA` | page ground, 3D canvas background (exact match, invisible poster→canvas handoff) |
| `--ink` | `#1C1917` | primary text (~15:1 on bone) |
| `--ink-soft` | `#57534E` | secondary text, eyebrows (6.7:1) |
| `--accent` | `#FF4D14` | graphics only — white text on it fails AA |
| `--accent-deep` | `#B93A0A` | CTA fills, accent text (5.1:1 on bone) |
| `--line` | `#D9D3C6` | hairlines, card borders |
| `--tile-desk` | `#FF4D14` | category tile: desks |
| `--tile-chair` | `#2F45FF` | category tile: seating |
| `--tile-monitor` | `#0E9F8A` | category tile: monitors |
| `--tile-lamp` | `#F5A524` | category tile: lighting |
| `--tile-accessory` | `#6B7F3E` | category tile: accessories |
| error | `#B91C1C` | keep a true red — vermilion errors are unreadable |

Tailwind v4: `@theme inline` maps these to `bg-bone`, `text-ink`, `border-line`,
`bg-tile-desk`, and the fonts below. No `tailwind.config.ts` (Tailwind v4).

## Type

- **Newsreader** (serif, `font-display`) — wordmark, page headlines, confirmation copy.
- **Schibsted Grotesk** (`font-sans`) — UI text, card names, labels.
- **IBM Plex Mono** (`font-mono`) — prices, eyebrows, SKU-register labels. All
  money renders in mono through `formatUsd`.

## Backgrounds

- Paper grain: `body::after` fixed SVG feTurbulence at 4% opacity, above all
  content, `pointer-events: none`.
- 3D scene: background `#f4f1ea` exactly equals `--bone`; fog `#f4f1ea` 14→34
  dissolves the floor edge into the paper; floor `#e6ddcc` roughness 0.95.
- Poster (LCP element + WebGL fallback): DOM composition — bone gradient,
  serif headline "Arrange the room. / Rent the setup.", noho-style color mosaic
  (cobalt square, amber circle, vermilion circle, olive square), thin vermilion ring.

## Motion

One orchestrated page-load reveal only: `.animate-rise` (rise 0.6s,
cubic-bezier(0.22,1,0.36,1)) on the poster headline + sub-line. Everything else
is 150ms color transitions. `prefers-reduced-motion` zeroes all durations
(globals.css) and the device-slice `reducedMotion` flag skips the drag
spring-back.

## Components

- **Catalog cards**: white card on bone rail; photo sits on the category's
  saturated tile with `mix-blend-multiply` (white product-shot backgrounds
  disappear into the color); category eyebrow with color dot; mono price.
- **Summary bar**: bone/95 + blur, mono total, ink-active segmented toggle,
  accent-deep CTA (hover→ink), "Start over" link (replaceScene with items: []).
- **Header**: serif "monis" + mono ".rent"; right side shows the five category
  chips — the color system at a glance.
- **Item context menu** (right-click a placed item): Rotate 90° + Remove;
  rotates route through `commitPlacement` (full D10 re-validation); closes on
  outside press / Escape.
- **Camera presets**: bone pills, pressed = ink; active state via `aria-pressed`.

## Hard rules

- Keep every `aria-*`/`role` attribute and the `focus-visible:outline-2` rings
  (WCAG 2.4.7; plan criteria count them).
- Keep the builder-shell mount flag (`setMounted` effect) — it is the SSR
  contract; the summary bar must not render in server HTML.
- `frameloop="demand"` stays. Invalidation paths: `useSceneInvalidation`
  (in-canvas store subscriber) + module `invalidate()` re-export. Do NOT add a
  drei `<Environment>` with children — its priority `useFrame` takes over the
  render loop in demand mode.
- All money through `formatUsd` + `selectPricing`; no component-side money math.
- Desk-surface items cannot rest on the floor (resolveSnap rejects) — the drag
  ghost shows red for it; that is the intended validation, not a bug.
