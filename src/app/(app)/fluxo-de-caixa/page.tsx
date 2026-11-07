import type { Metadata } from "next";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/lazy";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { delayIncome, projectCashFlow } from "@/domain/cashflow";
import { addDays, formatDateBR } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { buildCashContext } from "@/server/services/cashflow";

export const metadata: Metadata = { title: "Fluxo de caixa" };

const KIND_LABEL: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  invoice: "Fatura",
  goal_contribution: "Aporte planejado",
  transfer_out: "Transferência",
  transfer_in: "Transferência",
  purchase: "Compra",
};

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ dias?: string; aportes?: string; atraso?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  const days = [30, 60, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const includeGoals = sp.aportes !== "nao";
  const delay = [5, 10, 15].includes(Number(sp.atraso)) ? Number(sp.atraso) : 0;
  const cash = await buildCashContext(ctx, days);
  const range = { startDate: ctx.today, endDate: addDays(ctx.today, days), openingCents: cash.freeCents, includeOptional: includeGoals };
  // Cenário "e se a renda atrasar?": a mesma projeção com as receitas deslocadas, comparada com a normal.
  const base = projectCashFlow({ ...range, events: cash.events });
  const p = delay ? projectCashFlow({ ...range, events: delayIncome(cash.events, delay) }) : base;
  const data = p.days.map((d) => ({ date: d.date, confirmed: d.confirmedCents, withEstimated: d.withEstimatedCents }));
  const hasEstimated = p.totals.estimatedInCents > 0 || p.totals.estimatedOutCents > 0;
  const events = p.days.flatMap((d) => d.events.map((e) => ({ ...e, balance: d.confirmedCents })));
  const link = (patch: Record<string, string>) => `/fluxo-de-caixa?${new URLSearchParams({ dias: String(days), aportes: includeGoals ? "sim" : "nao", atraso: String(delay), ...patch })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Fluxo de caixa" description="Projeção diária do saldo livre nas contas de gasto, com contas previstas, recorrências, faturas e aportes planejados." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[30, 60, 90].map((d) => (
          <Link key={d} href={link({ dias: String(d) })} className={cn("rounded-full border px-3 py-1", d === days ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted")}>
            {d} dias
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-line" />
        <Link href={link({ aportes: includeGoals ? "nao" : "sim" })} className="rounded-full border border-line px-3 py-1 text-muted hover:bg-surface-2">
          {includeGoals ? "Simular sem aportes em metas" : "Incluir aportes em metas"}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="E se a renda atrasar?">
        <span className="text-muted">E se a renda atrasar?</span>
        {[0, 5, 10, 15].map((d) => (
          <Link key={d} href={link({ atraso: String(d) })} aria-current={d === delay ? "true" : undefined} className={cn("rounded-full border px-3 py-1", d === delay ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted hover:bg-surface-2")}>
            {d === 0 ? "No dia" : `${d} dias`}
          </Link>
        ))}
      </div>
      {delay ? (
        <Callout tone={p.firstNegativeConfirmed && !base.firstNegativeConfirmed ? "negative" : "info"} title={`Simulação: receitas ${delay} dias atrasadas`}>
          O menor saldo vai de <Money cents={base.lowestConfirmed.balanceCents} tone="none" /> ({formatDateBR(base.lowestConfirmed.date)}) para <Money cents={p.lowestConfirmed.balanceCents} tone="none" /> ({formatDateBR(p.lowestConfirmed.date)}).{" "}
          {p.firstNegativeConfirmed && !base.firstNegativeConfirmed
            ? `Com o atraso o saldo fica negativo a partir de ${formatDateBR(p.firstNegativeConfirmed)}: vale ter uma reserva na conta de gastos ou combinar a data das contas para depois do salário.`
            : p.firstNegativeConfirmed
              ? "O saldo já ficaria negativo mesmo sem atraso."
              : "Mesmo com o atraso o saldo não fica negativo."}
        </Callout>
      ) : null}
      {!cash.hasSpendingAccounts ? <Callout tone="warning" title="Sem contas disponíveis para gastos">Cadastre uma conta com finalidade “disponível para gastos” para projetar o caixa.</Callout> : null}
      {p.firstNegativeConfirmed && !delay ? (
        <Callout tone="negative" title={`Saldo negativo previsto a partir de ${formatDateBR(p.firstNegativeConfirmed)}`}>
          O ponto mais baixo é <Money cents={p.lowestConfirmed.balanceCents} tone="none" /> em {formatDateBR(p.lowestConfirmed.date)}. Revise despesas não essenciais, adie compras ou reprograme aportes.
        </Callout>
      ) : null}
      <StatStrip>
        <Stat label="Saldo livre hoje" value={<Money cents={cash.freeCents} />} hint={cash.reservedForGoalsCents ? <>já descontados <Money cents={cash.reservedForGoalsCents} tone="none" /> de metas</> : undefined} />
        <Stat label="Menor saldo no período" value={<Money cents={p.lowestConfirmed.balanceCents} />} hint={formatDateBR(p.lowestConfirmed.date)} />
        <Stat label="Entradas confirmadas" value={<Money cents={p.totals.confirmedInCents} />} hint={p.totals.estimatedInCents ? <>+ <Money cents={p.totals.estimatedInCents} tone="none" /> estimadas</> : undefined} />
        <Stat label="Saídas confirmadas" value={<Money cents={-p.totals.confirmedOutCents} />} hint={`Saldo final: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.closingConfirmedCents / 100)}`} />
      </StatStrip>
      <Section title={`Próximos ${days} dias`} description={hasEstimated ? "Linha contínua: só valores confirmados. Tracejada: incluindo estimativas (não garantidas)." : "Só valores confirmados. Quando houver receitas estimadas, como comissões, uma linha tracejada mostra o saldo incluindo essas estimativas."}>
          <CashFlowChart data={data} showEstimated={hasEstimated} />
      </Section>
      {cash.overdue.length ? (
        <Section title="Previstos com data passada" description="Despesas não confirmadas entram hoje na projeção, por prudência. Receitas não confirmadas ficam de fora.">
            <ul className="divide-y divide-line text-sm">
              {cash.overdue.map((o, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatDateBR(o.date)} · {o.label}
                  </span>
                  <Money cents={o.kind === "income" ? o.amountCents : -o.amountCents} signed />
                </li>
              ))}
            </ul>
        </Section>
      ) : null}
      <Section title="Eventos do período">
        <div className="scroll-hint">
          {events.length === 0 ? (
            <p className="text-sm text-muted">Nenhum evento previsto. Cadastre recorrências e lançamentos futuros para enriquecer a projeção.</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Tipo</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th className="py-2 text-right font-medium">Saldo do dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="py-2 text-muted">{formatDateBR(e.date)}</td>
                    <td className="py-2">{e.label}</td>
                    <td className="py-2">
                      <span className="text-muted">{KIND_LABEL[e.kind]}</span> {e.certainty === "estimated" ? <Badge tone="warning">estimado</Badge> : null}
                    </td>
                    <td className="py-2 text-right">
                      <Money cents={e.amountCents} signed />
                    </td>
                    <td className="py-2 text-right">
                      <Money cents={e.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </div>
  );
}
