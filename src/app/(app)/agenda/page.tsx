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

  const entradas = events.filter((e) => e.amountCents > 0).reduce((t, e) => t + e.amountCents, 0);
  const saidas = events.filter((e) => e.amountCents < 0).reduce((t, e) => t + e.amountCents, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Agenda" description={`Contas, faturas, recebimentos e aportes previstos até ${formatDateShort(until)}.`} />
      {/* Computador: a lista ocupa a coluna larga e o resumo do período fica ao lado. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <aside className="space-y-3 lg:order-2 lg:sticky lg:top-24">
        <Card className="p-4">
          <p className="text-sm font-medium">Até {formatDateShort(until)}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Entradas previstas</dt>
              <dd>
                <Money cents={entradas} signed />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Saídas previstas</dt>
              <dd>
                <Money cents={saidas} signed />
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-medium">
              <dt>Saldo do período</dt>
              <dd>
                <Money cents={entradas + saidas} signed />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">{events.length === 1 ? "1 compromisso" : `${events.length} compromissos`} em {byDay.size === 1 ? "1 dia" : `${byDay.size} dias`}.</p>
        </Card>
      </aside>
      <div className="min-w-0 space-y-4 lg:order-1">
      {cash.overdue.length ? (
        <div className="border-l-[3px] border-l-warning bg-surface px-4 py-3 text-sm">
          <p className="font-semibold">{cash.overdue.length === 1 ? "1 previsto com data passada ainda não confirmado" : `${cash.overdue.length} previstos com data passada ainda não confirmados`}</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {cash.overdue.slice(0, 5).map((o, i) => (
              <li key={i}>
                {formatDateShort(o.date)} · {o.label} · <Money cents={o.kind === "income" ? o.amountCents : -o.amountCents} signed />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {byDay.size === 0 ? (
        <EmptyState title="Nada previsto" description="Cadastre contas recorrentes (aluguel, luz, assinaturas) ou conecte um banco para a agenda se preencher sozinha." />
      ) : (
        [...byDay.entries()].map(([date, list]) => (
          <section key={date}>
            <p className="border-b border-ink/80 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted first-letter:uppercase dark:border-line">
              {date === ctx.today ? "Hoje" : weekdayName(date)}, {formatDateShort(date)}
            </p>
            <ul className="divide-y divide-line">
              {list.map((e, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
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
          </section>
        ))
      )}
      </div>
      </div>
    </div>
  );
}
