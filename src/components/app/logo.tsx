import { cn } from "@/lib/cn";

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
        <rect width="40" height="40" rx="12" fill={inverted ? "#ffffff" : "#0B1F3A"} />
        <path d="M11 27 L18 19 L23 23 L30 13" stroke="#14B8A6" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="30" cy="13" r="3" fill="#C9A227" />
      </svg>
      {!compact ? <span className={cn("font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight", inverted ? "text-white" : "text-ink")}>Rumo</span> : null}
    </span>
  );
}
