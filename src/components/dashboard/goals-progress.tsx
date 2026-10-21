import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { GoalCover } from "@/components/planning/goal-cover";
import { formatMoney } from "@/domain/money";
import type { GoalProgressItem } from "@/server/services/dashboard";

const TONES: ProgressTone[] = ["green", "blue", "petrol"];

function compact(cents: number) {
  return formatMoney(cents).replace(/,00$/, "");
}

export function GoalsProgress({ items }: { items: GoalProgressItem[] }) {
  return (
    <Card className="flex flex-col">
      <header className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-base font-semibold">Progresso das metas</h2>
        <Link href="/metas" className="inline-flex items-center gap-0.5 text-sm font-medium text-link hover:underline">
          Ver todas <ChevronRight className="size-4" />
        </Link>
      </header>
      {items.length === 0 ? (
        <EmptyState className="m-5" title="Nenhuma meta ainda" description="Crie um projeto (viagem, carro, reserva) e acompanhe o aporte necessário mês a mês." action={<Link href="/metas/nova" className="text-sm font-medium text-link underline">Criar meta</Link>} />
      ) : (
        <ul className="space-y-1 px-3 pb-3 pt-2">
          {items.slice(0, 4).map((g, i) => (
            <li key={g.key}>
              <Link href={g.href} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2">
                <GoalCover kind={g.kind} className="size-14 shrink-0 overflow-hidden rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs text-muted">
                      {compact(g.currentCents)} / {compact(g.targetCents)}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">{Math.floor(g.pct)}%</p>
                  </div>
                  <Progress className="mt-1.5" size="sm" value={g.pct} tone={TONES[i % TONES.length]} label={`Progresso de ${g.name}`} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
