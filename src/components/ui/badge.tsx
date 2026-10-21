import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "positive" | "warning" | "negative" | "info" | "gold" | "demo";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  positive: "bg-petrol-50 text-petrol-700 dark:bg-petrol-900/60 dark:text-petrol-200",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  negative: "bg-orange-50 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  info: "bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-100",
  gold: "bg-gold-50 text-gold-700 dark:bg-gold-700/30 dark:text-gold-200",
  demo: "bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:ring-fuchsia-700",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Selo obrigatório para qualquer dado vindo do conector de demonstração. */
export function DemoBadge() {
  return (
    <Badge tone="demo" title="Dado fictício do conector de demonstração">
      DEMONSTRAÇÃO
    </Badge>
  );
}
