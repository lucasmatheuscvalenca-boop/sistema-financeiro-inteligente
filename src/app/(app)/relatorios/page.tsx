import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { IncomeExpenseChart, SingleLineChart } from "@/components/charts/charts";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { CategoryIcon } from "@/components/finance/category-icon";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { Progress } from "@/components/ui/progress";
import { addMonthsToKey, assertMonthKey, formatMonthKey, formatMonthShort, monthKey, type MonthKey } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { getNetWorth } from "@/server/services/net-worth";
import { categoryBreakdown, monthlySeries } from "@/server/services/reports";
import { cn } from "@/lib/cn";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Relatórios" };

const label = (m: string) => formatMonthShort(m as MonthKey);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  let month = monthKey(ctx.today);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {
    // mês inválido: usa o atual
  }
  const [series, breakdown, netWorth] = await Promise.all([monthlySeries(ctx, month, 12), categoryBreakdown(ctx, month), getNetWorth(ctx)]);
  const totals = series.reduce((acc, p) => ({ income: acc.income + p.incomeCents, expense: acc.expense + p.expenseCents }), { income: 0, expense: 0 });
  const withIncome = series.filter((p) => p.savingsRatePct !== null);
  const avgRate = totals.income > 0 ? ((totals.income - totals.expense) / totals.income) * 100 : null;
  const hasData = series.some((p) => p.incomeCents || p.expenseCents);
  const current = monthKey(ctx.today);
  const periodOptions = Array.from({ length: 24 }, (_, i) => addMonthsToKey(current, -i)).map((m) => ({ value: m, label: formatMonthKey(m).replace(/^./, (c) => c.toUpperCase()) }));
  if (!periodOptions.some((o) => o.value === month)) periodOptions.push({ value: month, label: formatMonthKey(month) });
  // A tabela começa no primeiro mês com movimentações (o gráfico mantém os 12 meses).
  const firstWithData = series.findIndex((p) => p.incomeCents || p.expenseCents);
  const tableRows = series.slice(firstWithData === -1 ? series.length - 1 : firstWithData).reverse();
  // O gráfico também começa no primeiro mês com dados, mas mostra ao menos 6 meses para não virar duas barras largas.
  const chartRows = series.slice(Math.max(0, Math.min(firstWithData === -1 ? series.length : firstWithData, series.length - 6)));
  const nwData = netWorth.history.map((h) => ({ month: label(h.month), value: h.netWorthCents }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acompanhamento"
        title="Relatórios"
        description={`Últimos 12 meses até ${formatMonthKey(month)}. Valores realizados; transferências e pagamentos de fatura não entram.`}
        actions={
          <a href={`/api/relatorios/movimentacoes?mes=${month}`} className={buttonClass("secondary")} download>
            <Download className="size-4" /> Exportar CSV do mês
          </a>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Até o mês</span>
        <PeriodSelect value={month} options={periodOptions} basePath="/relatorios" label="Mês final dos relatórios" />
      </div>

      <StatStrip>
        <Stat label="Receitas (12 meses)" value={<Money cents={totals.income} tone="none" />} />
        <Stat label="Despesas (12 meses)" value={<Money cents={totals.expense} tone="none" />} />
        <Stat label="Resultado (12 meses)" value={<Money cents={totals.income - totals.expense} />} />
        <Stat label="Taxa de poupança" value={avgRate === null ? "—" : `${avgRate.toFixed(0)}%`} hint={`${plural(withIncome.length, "mês", "meses")} com receita`} />
      </StatStrip>

      <Section title="Receitas e despesas" description="Mês a mês, valores realizados.">{hasData ? <IncomeExpenseChart data={chartRows.map((p) => ({ month: label(p.month), income: p.incomeCents, expense: p.expenseCents }))} /> : <EmptyState title="Sem movimentações no período" description="Registre ou importe movimentações para ver os relatórios." />}
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Section title={`Despesas por categoria — ${formatMonthKey(month)}`} description={breakdown.totalCents ? <>Total: <Money cents={breakdown.totalCents} tone="none" /></> : "Nenhuma despesa realizada no mês."}>
            {breakdown.slices.length === 0 ? (
              <EmptyState title="Sem despesas no mês" description="As categorias aparecem aqui assim que houver despesas realizadas." />
            ) : (
              <ul className="space-y-3">
                {breakdown.slices.slice(0, 10).map((c) => (
                  <li key={c.key} className="flex items-center gap-3">
                    <CategoryIcon kind="expense" icon={c.icon} color={c.color} className="size-9" />
                    <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/movimentacoes?mes=${month}${c.key === "__sem_categoria__" ? "&categoria=sem" : `&categoria=${c.key}`}`} className="truncate hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-muted">
                        <Money cents={c.cents} tone="none" className="text-ink" /> · {c.sharePct.toFixed(0)}%
                      </span>
                    </div>
                    <Progress size="sm" value={c.sharePct} tone="petrol" label={`${c.name}: ${c.sharePct.toFixed(0)}% das despesas`} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Section>
        <Section title="Evolução do patrimônio" description="Fotografias mensais (contas + bens − dívidas)." action={<Link href="/patrimonio" className="text-xs font-medium text-link hover:underline">Detalhes</Link>}>
            {nwData.length < 2 ? (
              <EmptyState title="Histórico em construção" description="O patrimônio é fotografado uma vez por mês; o gráfico aparece a partir do segundo mês." />
            ) : (
              <SingleLineChart data={nwData} xKey="month" yKey="value" label="Patrimônio líquido" xLabel="Mês" />
            )}
        </Section>
      </div>

      <Section title="Resultado por mês" description="Taxa de poupança = (receitas − despesas) ÷ receitas.">
        <div className="scroll-hint">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Mês</th>
                <th className="py-1.5 text-right font-medium">Receitas</th>
                <th className="py-1.5 text-right font-medium">Despesas</th>
                <th className="py-1.5 text-right font-medium">Resultado</th>
                <th className="py-1.5 text-right font-medium">Poupança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tableRows.map((p) => (
                <tr key={p.month}>
                  <td className="py-2 first-letter:uppercase">{formatMonthKey(p.month)}</td>
                  <td className="py-2 text-right tabular-nums"><Money cents={p.incomeCents} tone="none" /></td>
                  <td className="py-2 text-right tabular-nums"><Money cents={p.expenseCents} tone="none" /></td>
                  <td className="py-2 text-right tabular-nums"><Money cents={p.netCents} signed /></td>
                  <td className={cn("py-2 text-right tabular-nums", p.savingsRatePct !== null && p.savingsRatePct < 0 && "text-negative")}>{p.savingsRatePct === null ? "—" : `${p.savingsRatePct.toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
