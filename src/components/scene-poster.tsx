/**
 * Static poster — the LCP element and the canvas fallback (Slice 7). A
 * DOM composition, not an image: gradient ground, editorial type, one
 * geometric accent. The 3D canvas covers it once mounted; a WebGL-less
 * browser keeps it as the permanent backdrop (research Q1/Q9).
 */
export function ScenePoster({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${className ?? ''} overflow-hidden bg-[linear-gradient(180deg,#f6f3ec_0%,#ece7db_100%)]`}
    >
      {/* noho-style color mosaic: saturated geometry on the paper ground. */}
      <div className="absolute right-[14%] top-[16%] h-20 w-20 bg-tile-chair md:h-28 md:w-28" />
      <div className="absolute right-[26%] top-[30%] h-10 w-10 rounded-full bg-tile-lamp md:h-14 md:w-14" />
      <div className="absolute -left-10 bottom-[30%] h-24 w-24 rounded-full bg-tile-desk/90 md:h-32 md:w-32" />
      <div className="absolute bottom-[22%] right-[8%] h-14 w-14 bg-tile-accessory md:h-20 md:w-20" />
      {/* Geometric accent: one thin vermilion ring, bleeding off the right edge. */}
      <div className="absolute -right-32 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 rounded-full border border-accent/40" />
      <div className="absolute inset-0 flex flex-col justify-between p-6 md:p-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-soft">
          Workspace rental — build it in 3D
        </p>
        <div>
          <p className="animate-rise max-w-xl font-display text-4xl leading-[1.05] md:text-6xl">
            Arrange the room.
            <br />
            <span className="italic text-accent-deep">Rent the setup.</span>
          </p>
          <p className="animate-rise mt-4 font-mono text-xs text-ink-soft" style={{ animationDelay: '120ms' }}>
            Click to add, drag to arrange — the total follows.
          </p>
        </div>
      </div>
    </div>
  );
}
