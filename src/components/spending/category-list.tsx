import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { SpendingCategory } from "@/server/services/spending";

const FALLBACK = ["#2cc5c5", "#e07a2e", "#8ea3c0", "#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24"];

export function categoryColor(c: { color: string | null }, index: number): string {
  return c.color ?? FALLBACK[index % FALLBACK.length]!;
}

/** Barra única com todas as categorias, proporcional ao gasto. */
export function SpendingBar({ categories, className }: { categories: SpendingCategory[]; className?: string }) {
  if (categories.length === 0) return null;
  return (
    <div className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2", className)} aria-hidden>
      {categories.map((c, i) => (
        <span key={c.id ?? "none"} style={{ width: `${Math.max(1.5, c.pct)}%`, background: categoryColor(c, i) }} className="h-full" />
      ))}
    </div>
  );
}

/** Rosca em SVG puro: sem biblioteca, renderiza no servidor e não pisca ao carregar. */
export function SpendingDonut({ categories, totalLabel, caption, size = 136 }: { categories: SpendingCategory[]; totalLabel: string; caption: string; size?: number }) {
  const r = 15.9;
  const circ = 2 * Math.PI * r;
  // Cada fatia começa onde a anterior terminou (soma acumulada calculada antes de desenhar).
  const slices = categories.reduce<Array<{ c: SpendingCategory; len: number; start: number }>>((acc, c) => {
    const start = acc.length ? acc[acc.length - 1]!.start + acc[acc.length - 1]!.len : 0;
    return [...acc, { c, len: (Math.max(0, c.pct) / 100) * circ, start }];
  }, []);
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label={`${totalLabel}, ${caption}`} className="shrink-0">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
      {slices.map(({ c, len, start }, i) => (
        <circle key={c.id ?? "none"} cx="21" cy="21" r={r} fill="none" stroke={categoryColor(c, i)} strokeWidth="6" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-start + circ / 4} />
      ))}
      <text x="21" y="20.2" textAnchor="middle" fontSize="5" fontWeight="800" fill="var(--ink)">
        {totalLabel}
      </text>
      <text x="21" y="25.6" textAnchor="middle" fontSize="2.7" fill="var(--muted)">
        {caption}
      </text>
    </svg>
  );
}

/** Lista de categorias com cor, percentual e valor; cada linha leva aos lançamentos dela. */
export function CategoryRows({ categories, month, limit, compact = false }: { categories: SpendingCategory[]; month: string; limit?: number; compact?: boolean }) {
  const rows = limit ? categories.slice(0, limit) : categories;
  return (
    <ul className="divide-y divide-line">
      {rows.map((c, i) => (
        <li key={c.id ?? "none"}>
          <Link href={`/movimentacoes?mes=${month}&tipo=expense&categoria=${c.id ?? "sem"}`} className={cn("flex items-center gap-3 transition hover:bg-surface-2/60", compact ? "py-2" : "py-2.5")}>
            {compact ? <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: categoryColor(c, i) } as CSSProperties} aria-hidden /> : <CategoryIcon kind="expense" icon={c.icon} color={categoryColor(c, i)} className="size-9" />}
            <span className="min-w-0 flex-1 truncate text-sm">
              {c.name} <span className="ml-1 text-xs text-muted">{c.pct.toFixed(0)}%</span>
              {!compact && c.children.length ? <span className="block truncate text-xs text-muted">{c.children.map((ch) => ch.name).join(" · ")}</span> : null}
            </span>
            <Money cents={c.cents} tone="none" className="shrink-0 text-sm font-semibold" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
