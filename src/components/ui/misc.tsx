import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-link">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Money({ cents, className, signed = false, tone = "auto", currency = "BRL" }: { cents: number; className?: string; signed?: boolean; tone?: "auto" | "none"; currency?: string }) {
  const value = formatMoney(Math.abs(cents), currency);
  const sign = cents < 0 ? "−" : signed && cents > 0 ? "+" : "";
  const color = tone === "none" ? "" : cents < 0 ? "text-negative" : signed && cents > 0 ? "text-positive" : "";
  return <span className={cn("tabular-nums", color, className)}>{`${sign}${value}`}</span>;
}

export function Stat({ label, value, hint, icon, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-muted">sem variação</span>;
  if (previous === 0) return <span className="text-muted">sem base no mês anterior</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={good ? "text-positive" : "text-negative"}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs mês anterior
    </span>
  );
}

export function EmptyState({ title, description, action, art, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; art?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center", className)}>
      {art ? <div className="mb-3">{art}</div> : null}
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted", className)}>{children}</h2>;
}
