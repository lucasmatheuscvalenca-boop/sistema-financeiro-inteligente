import { cn } from "@/lib/cn";

export type ProgressTone = "petrol" | "green" | "blue" | "gold" | "warning" | "negative" | "navy";

const fills: Record<ProgressTone, string> = {
  petrol: "bg-accent",
  green: "bg-leaf-600 dark:bg-leaf-400",
  blue: "bg-sky-700 dark:bg-sky-400",
  gold: "bg-gold-500",
  warning: "bg-gold-600 dark:bg-gold-300",
  negative: "bg-red-500",
  navy: "bg-forest-700 dark:bg-forest-300",
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
      className={cn("w-full overflow-hidden rounded-sm bg-surface-2", size === "sm" ? "h-1" : "h-2", className)}
    >
      <div className={cn("progress-grow h-full rounded-sm transition-[width] duration-700", fills[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, tone = "petrol", children }: { value: number; size?: number; stroke?: number; tone?: "petrol" | "gold" | "warning"; children?: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "gold" ? "var(--color-gold-500)" : tone === "warning" ? "var(--warning)" : "var(--accent)";
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
