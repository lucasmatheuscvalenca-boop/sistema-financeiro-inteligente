import { cn } from "@/lib/cn";

export type ProgressTone = "petrol" | "green" | "blue" | "gold" | "warning" | "negative" | "navy";

const fills: Record<ProgressTone, string> = {
  petrol: "bg-gradient-to-r from-petrol-500 to-petrol-400",
  green: "bg-gradient-to-r from-emerald-500 to-teal-400",
  blue: "bg-gradient-to-r from-sky-500 to-cyan-400",
  gold: "bg-gradient-to-r from-gold-500 to-gold-300",
  warning: "bg-amber-500",
  negative: "bg-red-500",
  navy: "bg-navy-700 dark:bg-navy-300",
};

export function Progress({ value, tone = "petrol", label, className, size = "md" }: { value: number; tone?: ProgressTone; label?: string; className?: string; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-surface-2", size === "sm" ? "h-1.5" : "h-2.5", className)}
    >
      <div className={cn("progress-grow h-full rounded-full transition-[width] duration-700", fills[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, tone = "petrol", children }: { value: number; size?: number; stroke?: number; tone?: "petrol" | "gold" | "warning"; children?: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "gold" ? "var(--color-gold-500)" : tone === "warning" ? "#d97706" : "var(--color-petrol-500)";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-semibold">{children ?? `${Math.round(pct)}%`}</div>
    </div>
  );
}
