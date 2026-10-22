import type { Metadata } from "next";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Money, PageHeader, Stat } from "@/components/ui/misc";
import { projectCashFlow } from "@/domain/cashflow";
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

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ dias?: string; aportes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  const days = [30, 60, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const includeGoals = sp.aportes !== "nao";
  const cash = await buildCashContext(ctx, days);
  const p = projectCashFlow({ startDate: ctx.today, endDate: addDays(ctx.today, days), openingCents: cash.freeCents, events: cash.events, includeOptional: includeGoals });
  const data = p.days.map((d) => ({ date: d.date, confirmed: d.confirmedCents, withEstimated: d.withEstimatedCents }));
  const hasEstimated = p.totals.estimatedInCents > 0 || p.totals.estimatedOutCents > 0;
  const events = p.days.flatMap((d) => d.events.map((e) => ({ ...e, balance: d.confirmedCents })));
  const link = (patch: Record<string, string>) => `/fluxo-de-caixa?${new URLSearchParams({ dias: String(days), aportes: includeGoals ? "sim" : "nao", ...patch })}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central financeira" title="Fluxo de caixa" description="Projeção diária do saldo livre nas contas de gasto, com contas previstas, recorrências, faturas e aportes planejados." />
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
      {!cash.hasSpendingAccounts ? <Callout tone="warning" title="Sem contas disponíveis para gastos">Cadastre uma conta com finalidade “disponível para gastos” para projetar o caixa.</Callout> : null}
      {p.firstNegativeConfirmed ? (
        <Callout tone="negative" title={`Saldo negativo previsto a partir de ${formatDateBR(p.firstNegativeConfirmed)}`}>
          O ponto mais baixo é <Money cents={p.lowestConfirmed.balanceCents} tone="none" /> em {formatDateBR(p.lowestConfirmed.date)}. Revise despesas não essenciais, adie compras ou reprograme aportes.
        </Callout>
      ) : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label="Saldo livre hoje" value={<Money cents={cash.freeCents} />} hint={cash.reservedForGoalsCents ? <>já descontados <Money cents={cash.reservedForGoalsCents} tone="none" /> de metas</> : undefined} />
        </Card>
        <Card className="p-4">
          <Stat label="Menor saldo no período" value={<Money cents={p.lowestConfirmed.balanceCents} />} hint={formatDateBR(p.lowestConfirmed.date)} />
        </Card>
        <Card className="p-4">
          <Stat label="Entradas confirmadas" value={<Money cents={p.totals.confirmedInCents} />} hint={p.totals.estimatedInCents ? <>+ <Money cents={p.totals.estimatedInCents} tone="none" /> estimadas</> : undefined} />
        </Card>
        <Card className="p-4">
          <Stat label="Saídas confirmadas" value={<Money cents={-p.totals.confirmedOutCents} />} hint={`Saldo final: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.closingConfirmedCents / 100)}`} />
        </Card>
      </section>
      <Card>
        <CardHeader title={`Próximos ${days} dias`} description="Linha contínua: só valores confirmados. Tracejada: incluindo estimativas (não garantidas)." />
        <CardBody>
          <CashFlowChart data={data} showEstimated={hasEstimated} />
        </CardBody>
      </Card>
      {cash.overdue.length ? (
        <Card>
          <CardHeader title="Previstos com data passada" description="Despesas não confirmadas entram hoje na projeção, por prudência. Receitas não confirmadas ficam de fora." />
          <CardBody>
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
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Eventos do período" />
        <CardBody className="overflow-x-auto">
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
        </CardBody>
      </Card>
    </div>
  );
}
