import Link from "next/link";
import { ShieldCheck, Sunset, Target } from "lucide-react";
import { cn } from "@/lib/cn";

export type PlanTab = "metas" | "reserva" | "aposentadoria";

const TABS: Array<{ id: PlanTab; href: string; label: string; icon: typeof Target }> = [
  { id: "metas", href: "/metas", label: "Metas", icon: Target },
  { id: "reserva", href: "/reserva", label: "Reserva", icon: ShieldCheck },
  { id: "aposentadoria", href: "/aposentadoria", label: "Aposentadoria", icon: Sunset },
];

/** Os três planos de longo prazo vivem na mesma aba: metas, reserva de emergência e aposentadoria. */
export function PlanTabs({ current }: { current: PlanTab }) {
  return (
    <nav aria-label="Planos" className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1">
      {TABS.map((t) => {
        const active = t.id === current;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition", active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.9} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
