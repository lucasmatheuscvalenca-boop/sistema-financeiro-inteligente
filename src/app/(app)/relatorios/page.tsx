import type { Metadata } from "next";
import Link from "next/link";
import { Download, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { IncomeExpenseChart, SingleLineChart } from "@/components/charts/charts";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { assertMonthKey, formatMonthKey, monthKey } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { getNetWorth } from "@/server/services/net-worth";
import { categoryBreakdown, monthlySeries } from "@/server/services/reports";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Relatórios" };

const ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const label = (m: string) => `${ABBR[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

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
      <form className="flex flex-wrap items-center gap-2 text-sm" action="/relatorios">
        <label htmlFor="mes" className="text-muted">
          Até o mês
        </label>
        <input id="mes" name="mes" type="month" defaultValue={month} className="h-10 rounded-xl border border-line bg-surface px-3" />
        <button className={buttonClass("secondary", "md")}>Atualizar</button>
      </form>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Receitas (12 meses)" cents={totals.income} deltaPct={null} basis="" tone="green" icon={<TrendingUp className="size-5" />} />
        <KpiCard label="Despesas (12 meses)" cents={totals.expense} deltaPct={null} basis="" tone="red" icon={<TrendingDown className="size-5" />} />
        <KpiCard label="Resultado (12 meses)" cents={totals.income - totals.expense} deltaPct={null} basis="" tone="teal" icon={<Wallet className="size-5" />} />
        <Card className="h-full p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 sm:size-10 dark:bg-sky-900/40 dark:text-sky-300">
              <PiggyBank className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted">Taxa de poupança</p>
              <p className="mt-0.5 text-lg font-bold sm:text-xl">{avgRate === null ? "—" : `${avgRate.toFixed(0)}%`}</p>
              <p className="mt-1 text-xs text-muted">{withIncome.length} mês(es) com receita</p>
            </div>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Receitas e despesas" description="Mês a mês, valores realizados." />
        <CardBody>{hasData ? <IncomeExpenseChart data={series.map((p) => ({ month: label(p.month), income: p.incomeCents, expense: p.expenseCents }))} /> : <EmptyState title="Sem movimentações no período" description="Registre ou importe movimentações para ver os relatórios." />}</CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Despesas por categoria — ${formatMonthKey(month)}`} description={breakdown.totalCents ? <>Total: <Money cents={breakdown.totalCents} tone="none" /></> : "Nenhuma despesa realizada no mês."} />
          <CardBody>
            {breakdown.slices.length === 0 ? (
              <EmptyState title="Sem despesas no mês" description="As categorias aparecem aqui assim que houver despesas realizadas." />
            ) : (
              <ul className="space-y-3">
                {breakdown.slices.slice(0, 10).map((c) => (
                  <li key={c.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/movimentacoes?mes=${month}${c.key === "__sem_categoria__" ? "&categoria=sem" : `&categoria=${c.key}`}`} className="truncate hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-muted">
                        <Money cents={c.cents} tone="none" className="text-ink" /> · {c.sharePct.toFixed(0)}%
                      </span>
                    </div>
                    <Progress size="sm" value={c.sharePct} tone="blue" label={`${c.name}: ${c.sharePct.toFixed(0)}% das despesas`} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolução do patrimônio" description="Fotografias mensais (contas + bens − dívidas)." action={<Link href="/patrimonio" className="text-xs font-medium text-link hover:underline">Detalhes</Link>} />
          <CardBody>
            {nwData.length < 2 ? (
              <EmptyState title="Histórico em construção" description="O patrimônio é fotografado uma vez por mês; o gráfico aparece a partir do segundo mês." />
            ) : (
              <SingleLineChart data={nwData} xKey="month" yKey="value" label="Patrimônio líquido" xLabel="Mês" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Resultado por mês" description="Taxa de poupança = (receitas − despesas) ÷ receitas." />
        <CardBody className="overflow-x-auto">
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
              {[...series].reverse().map((p) => (
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
        </CardBody>
      </Card>
    </div>
  );
}
