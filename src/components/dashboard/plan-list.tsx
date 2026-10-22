import Link from "next/link";
import { CalendarClock, CircleCheckBig, ClipboardList, Database, PiggyBank, ShieldAlert, Target, TrendingUp, Wallet } from "lucide-react";
import type { PlanItem, PlanKind } from "@/domain/daily-plan";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MascotArt } from "@/components/mascots/mascot-art";
import type { MascotId } from "@/mascots/catalog";
import { cn } from "@/lib/cn";

const KIND: Record<PlanKind, { icon: typeof Target; className: string }> = {
  setup: { icon: Wallet, className: "bg-petrol-50 text-petrol-700 dark:bg-petrol-900/40 dark:text-petrol-200" },
  pending: { icon: ClipboardList, className: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  bills: { icon: CalendarClock, className: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  budget: { icon: ShieldAlert, className: "bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300" },
  goal: { icon: Target, className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  reserve: { icon: PiggyBank, className: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  risk: { icon: TrendingUp, className: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  data: { icon: Database, className: "bg-surface-2 text-muted" },
  invest: { icon: TrendingUp, className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

export function PlanList({ items, mascotId }: { items: PlanItem[]; mascotId: MascotId }) {
  return (
    <Card className="flex flex-col">
      <header className="px-5 pt-5">
        <h2 className="text-base font-semibold">Seu plano de hoje</h2>
      </header>
      {items.length === 0 ? (
        <div className="flex flex-1 items-center gap-4 px-5 pb-5 pt-3">
          <MascotArt id={mascotId} state="celebration" size={72} />
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <CircleCheckBig className="size-4 text-positive" /> Nada pendente para hoje
            </p>
            <p className="mt-0.5 text-sm text-muted">Contas, orçamento, aportes e reserva estão em dia pelas regras do seu plano.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line px-5 pb-2">
          {items.map((item) => {
            const k = KIND[item.kind];
            const Icon = k.icon;
            return (
              <li key={item.key} className="flex items-center gap-3 py-3.5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", k.className)}>
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted">{item.detail}</p>
                </div>
                <Link href={item.action.href} className={buttonClass(item.primary ? "outline" : "secondary", "sm", "shrink-0 rounded-full px-4")}>
                  {item.action.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
