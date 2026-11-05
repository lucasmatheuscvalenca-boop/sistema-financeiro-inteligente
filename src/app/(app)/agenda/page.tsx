import type { Metadata } from "next";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { addDays, formatDateShort, weekdayName } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { buildCashContext } from "@/server/services/cashflow";

export const metadata: Metadata = { title: "Agenda" };

const KIND: Record<string, string> = { income: "entrada", expense: "conta", transfer_out: "transferência", transfer_in: "transferência", invoice: "fatura", goal_contribution: "aporte em meta" };

/** Tudo que entra e sai nos próximos 30 dias, dia a dia. */
export default async function AgendaPage() {
  const { ctx } = await requireOnboarded();
  const cash = await buildCashContext(ctx, 30);
  const until = addDays(ctx.today, 30);
  const events = cash.events.filter((e) => e.date >= ctx.today && e.date <= until);
  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="O que vem por aí" title="Agenda" description={`Contas, faturas, recebimentos e aportes previstos até ${formatDateShort(until)}.`} />
      {cash.overdue.length ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-semibold">{cash.overdue.length === 1 ? "1 previsto com data passada ainda não confirmado" : `${cash.overdue.length} previstos com data passada ainda não confirmados`}</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {cash.overdue.slice(0, 5).map((o, i) => (
              <li key={i}>
                {formatDateShort(o.date)} · {o.label} · <Money cents={o.kind === "income" ? o.amountCents : -o.amountCents} signed />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {byDay.size === 0 ? (
        <EmptyState title="Nada previsto" description="Cadastre contas recorrentes (aluguel, luz, assinaturas) ou conecte um banco para a agenda se preencher sozinha." />
      ) : (
        [...byDay.entries()].map(([date, list]) => (
          <Card key={date} className="overflow-hidden">
            <p className="border-b border-line bg-surface-2/60 px-4 py-2 text-xs font-semibold text-muted first-letter:uppercase">
              {date === ctx.today ? "Hoje" : weekdayName(date)}, {formatDateShort(date)}
            </p>
            <ul className="divide-y divide-line">
              {list.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <CategoryIcon kind={e.amountCents >= 0 ? "income" : e.kind === "invoice" ? "card_payment" : e.kind === "goal_contribution" ? "transfer" : "expense"} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.label}</span>
                    <span className="block text-xs text-muted">
                      {KIND[e.kind] ?? e.kind}
                      {e.certainty === "estimated" ? " · estimado" : ""}
                      {e.optional ? " · planejado" : ""}
                    </span>
                  </span>
                  {e.certainty === "estimated" ? <Badge tone="warning">estimado</Badge> : null}
                  <Money cents={e.amountCents} signed className="shrink-0 text-sm" />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
