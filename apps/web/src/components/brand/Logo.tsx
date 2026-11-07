/** Marca do MY OFFICE AI: uma mesa com monitor em pixel art (arte própria) + nome em fonte pixelada. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="2" width="12" height="9" fill="#5cc8ff" />
      <rect x="3" y="3" width="10" height="7" fill="#0d1730" />
      <rect x="4" y="4" width="4" height="1" fill="#3ddc97" />
      <rect x="4" y="6" width="6" height="1" fill="#b197fc" />
      <rect x="4" y="8" width="3" height="1" fill="#5cc8ff" />
      <rect x="7" y="11" width="2" height="2" fill="#34508a" />
      <rect x="2" y="13" width="12" height="1" fill="#34508a" />
      <rect x="1" y="14" width="1" height="1" fill="#233863" />
      <rect x="14" y="14" width="1" height="1" fill="#233863" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {!compact && (
        <span className="font-pixel text-lg leading-none tracking-wide text-ink">
          MY OFFICE <span className="text-signal">AI</span>
        </span>
      )}
    </span>
  );
}
