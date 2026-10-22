import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Busca global (transações, metas, contas e telas). Formulário GET, funciona sem JavaScript. */
export function SearchBox({ defaultValue, className }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/busca" role="search" className={cn("relative", className)}>
      <label htmlFor="busca-global" className="sr-only">
        Buscar
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id="busca-global"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar transações, metas, relatórios…"
        className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm shadow-[var(--shadow-card)] transition placeholder:text-muted/80 focus:border-petrol-400 focus:outline-none focus:ring-2 focus:ring-petrol-400/25"
      />
    </form>
  );
}
