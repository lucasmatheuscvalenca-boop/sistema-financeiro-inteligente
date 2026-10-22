import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, CreditCard, Hand, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { IncomeExpenseChart } from "@/components/charts/charts";
import { AskMascot } from "@/components/dashboard/ask-mascot";
import { GoalsProgress } from "@/components/dashboard/goals-progress";
import { DashboardHero } from "@/components/dashboard/hero";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { PlanList } from "@/components/dashboard/plan-list";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { addMonthsToKey, assertMonthKey, formatDateShort, formatMonthKey, formatMonthShort, monthKey } from "@/domain/dates";
import { voiceFor, toneToState } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { refreshAlerts } from "@/server/services/alerts";
import { getBriefing } from "@/server/services/briefing";
import { getDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Início" };


function safeMonth(m: string | undefined, fallback: string): string {
  if (!m) return fallback;
  try {
    return assertMonthKey(m);
  } catch {
    return fallback;
  }
}

function greetingFor(hour: number): string {
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string; inicio?: string }> }) {
  const app = await requireOnboarded();
  const { ctx, mascotId } = app;
  const params = await searchParams;
  const current = monthKey(ctx.today);
  const month = safeMonth(params.mes, current);
  const isCurrent = month === current;

  if (isCurrent) await refreshAlerts(ctx);
  const [dash, briefing] = await Promise.all([getDashboard(ctx, month), getBriefing(ctx)]);
  const { snap, kpis, plan, hero, goalsProgress } = dash;

  const voice = voiceFor(mascotId);
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: app.prefs.timezone }).format(now));
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: app.prefs.timezone }).format(now).replace(".", "");
  const firstName = app.user.name.split(" ")[0] ?? "";
  const periodOptions = Array.from({ length: 14 }, (_, i) => addMonthsToKey(current, 1 - i)).map((m) => ({ value: m, label: formatMonthKey(m).replace(/^./, (c) => c.toUpperCase()) }));
  if (!periodOptions.some((o) => o.value === month)) periodOptions.push({ value: month, label: formatMonthKey(month) });

  const briefingIncomplete = !briefing.completed.personal || !briefing.completed.financial || !briefing.completed.life;
  const hasDemo = snap.accounts.some((a) => a.source === "demo") || snap.cards.some((c) => c.source === "demo");
  const m = snap.monthTotals;
  const budget = snap.budget;
  const chartData = dash.chart.map((d) => ({ month: formatMonthShort(d.month), income: d.income, expense: d.expense }));
  const mascotState = params.inicio ? "celebration" : toneToState(hero.tone);

  return (
    <div className="space-y-5 lg:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-[28px]">
            {greetingFor(hour)}, {firstName} <Hand className="size-6 -rotate-12 text-gold-500" aria-hidden />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isCurrent ? "Vamos continuar evoluindo? Aqui está o seu panorama de hoje." : `Você está vendo ${formatMonthKey(month)}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted first-letter:uppercase md:block">{dateLabel}</p>
          <PeriodSelect value={month} options={periodOptions} />
        </div>
      </header>

      {isCurrent ? <DashboardHero mascotId={mascotId} state={mascotState} headline={voice.headline(hero.tone)} message={hero.message} href={hero.href} linkLabel={hero.linkLabel} /> : null}

      {hasDemo ? (
        <Callout tone="info" title="Há dados de demonstração na sua conta">
          Contas marcadas com <DemoBadge /> vêm do conector de demonstração e são fictícias. Você pode removê-las em <Link href="/conexoes" className="underline">Conexões</Link>.
        </Callout>
      ) : null}
      {briefingIncomplete ? (
        <Callout tone="info" title="Seu perfil financeiro está incompleto" action={<ButtonLink href="/configuracoes/briefing" size="sm" variant="secondary">Completar</ButtonLink>}>
          Com mais informações, a reserva recomendada, o diagnóstico e o plano de aposentadoria ficam mais precisos.
        </Callout>
      ) : null}

      {/* Celular: saldo em destaque e ações rápidas */}
      <div className="space-y-3 lg:hidden">
        <Link href="/contas" className="card-hover flex items-center justify-between rounded-[var(--radius-card)] border border-petrol-200 bg-surface p-5 shadow-[var(--shadow-card)] dark:border-petrol-800">
          <div>
            <p className="text-xs font-medium text-link">Saldo disponível</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              <Money cents={kpis.free.valueCents} tone="none" />
            </p>
            {kpis.free.deltaPct !== null ? (
              <p className={cn("mt-1 text-sm font-medium", kpis.free.deltaPct >= 0 ? "text-positive" : "text-negative")}>
                {kpis.free.deltaPct >= 0 ? "↗" : "↘"} {Math.abs(kpis.free.deltaPct).toFixed(0)}% desde o fim do mês anterior
              </p>
            ) : null}
          </div>
          <ChevronRight className="size-5 text-muted" />
        </Link>
        <QuickActions />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Indicadores do mês">
        <div className="hidden lg:block">
          <KpiCard label="Saldo disponível" cents={kpis.free.valueCents} deltaPct={kpis.free.deltaPct} basis="vs. fim do mês anterior" tone="green" icon={<Wallet className="size-5" />} />
        </div>
        <KpiCard label={isCurrent ? "Receitas no mês" : "Receitas"} cents={kpis.income.valueCents} deltaPct={kpis.income.deltaPct} basis={kpis.income.basis} tone="green" icon={<TrendingUp className="size-5" />} />
        <KpiCard label={isCurrent ? "Despesas no mês" : "Despesas"} cents={kpis.expense.valueCents} deltaPct={kpis.expense.deltaPct} basis={kpis.expense.basis} tone="red" goodWhenUp={false} icon={<TrendingDown className="size-5" />} />
        <div className="col-span-2 lg:col-span-1">
          <KpiCard label="Patrimônio total" cents={kpis.netWorth.valueCents} deltaPct={kpis.netWorth.deltaPct} basis={kpis.netWorth.basis} tone="blue" icon={<Landmark className="size-5" />} />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-6">
        {isCurrent ? <PlanList items={plan} mascotId={mascotId} /> : (
          <Card className="p-5">
            <h2 className="text-base font-semibold">Seu plano de hoje</h2>
            <p className="mt-2 text-sm text-muted">O plano do dia é calculado para o mês atual. <Link href="/painel" className="text-link underline">Voltar para hoje</Link></p>
          </Card>
        )}
        <GoalsProgress items={goalsProgress} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-6">
        <Card>
          <CardHeader title="Receitas e despesas" description="Realizado nos últimos 6 meses. Transferências e pagamentos de fatura não entram." />
          <CardBody>
            {chartData.every((d) => d.income === 0 && d.expense === 0) ? (
              <EmptyState title="Ainda não há movimentações realizadas" description="Registre ou importe receitas e despesas para ver a evolução mês a mês." action={<ButtonLink href="/movimentacoes?nova=1" size="sm">Lançar movimentação</ButtonLink>} />
            ) : (
              <IncomeExpenseChart data={chartData} />
            )}
          </CardBody>
        </Card>
        <div className="space-y-5 lg:space-y-6">
          {isCurrent && snap.monthEnd ? (
            <Card>
              <CardHeader title="Previsão de fechamento" description="Saldo livre previsto para o último dia do mês." icon={<CalendarClock className="size-4" />} />
              <CardBody className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted">Só confirmados</p>
                  <p className="mt-0.5 text-lg font-bold">
                    <Money cents={snap.monthEnd.confirmedCents} />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Com estimativas</p>
                  <p className="mt-0.5 text-lg font-bold">
                    <Money cents={snap.monthEnd.withEstimatedCents} />
                  </p>
                  <p className="text-[11px] text-muted">Estimativas não são garantidas</p>
                </div>
                {snap.projection?.firstNegativeConfirmed ? (
                  <Callout tone="negative" className="col-span-2" title={`Saldo negativo previsto em ${formatDateShort(snap.projection.firstNegativeConfirmed)}`}>
                    Veja o <Link href="/fluxo-de-caixa" className="underline">fluxo de caixa</Link> para entender a causa.
                  </Callout>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Contas a pagar" description={isCurrent ? "Até o fim do mês" : "No mês"} action={<Link href="/movimentacoes?status=scheduled" className="text-xs font-medium text-link hover:underline">Ver todas</Link>} />
            <CardBody>
              {snap.payables.length === 0 ? (
                <p className="text-sm text-muted">Nenhum compromisso previsto.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {snap.payables.slice(0, 5).map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{p.label}</span>
                        <span className="text-xs text-muted">{formatDateShort(p.date)}</span>
                      </span>
                      <Money cents={-p.amountCents} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3 lg:gap-6">
        <Card>
          <CardHeader
            title="Orçamento do mês"
            description={budget.lines.length ? `${budget.totals.usedPct.toFixed(0)}% do planejado comprometido` : "Defina limites por categoria"}
            action={<Link href={`/orcamento?mes=${month}`} className="text-xs font-medium text-link hover:underline">Abrir</Link>}
          />
          <CardBody>
            {budget.lines.length === 0 ? (
              <EmptyState title="Sem orçamento" description="Limites por categoria mostram quanto ainda dá para gastar." action={<ButtonLink href="/orcamento" size="sm">Definir orçamento</ButtonLink>} />
            ) : (
              <ul className="space-y-3">
                {[...budget.lines].sort((a, b) => b.usedPct - a.usedPct).slice(0, 4).map((l) => (
                  <li key={l.categoryId}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="truncate">{l.categoryName}</span>
                      <span className={cn("tabular-nums", l.status === "exceeded" ? "text-negative" : "text-muted")}>{l.usedPct.toFixed(0)}%</span>
                    </div>
                    <Progress size="sm" value={l.usedPct} tone={l.status === "exceeded" ? "negative" : l.status === "warning" ? "warning" : "petrol"} label={l.categoryName} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Faturas" icon={<CreditCard className="size-4" />} action={<Link href="/cartoes" className="text-xs font-medium text-link hover:underline">Cartões</Link>} />
          <CardBody className="space-y-4">
            {snap.cards.length === 0 ? (
              <EmptyState title="Nenhum cartão" description="Cadastre seus cartões para acompanhar faturas e limites." action={<ButtonLink href="/cartoes" size="sm" variant="secondary">Cadastrar cartão</ButtonLink>} />
            ) : (
              snap.cards.slice(0, 3).map((c) => (
                <div key={c.id} className="text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex items-center gap-1.5 font-medium">
                      {c.name} {c.source === "demo" ? <DemoBadge /> : null}
                    </span>
                    <span className="text-xs text-muted">
                      Disponível <Money cents={c.limit.availableCents} tone="none" />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Aberta: <Money cents={c.openInvoice?.totalCents ?? 0} tone="none" />
                    {c.nextDue ? (
                      <>
                        {" "}
                        · a pagar <Money cents={c.nextDue.outstandingCents} tone="none" /> em {formatDateShort(c.nextDue.dueDate)}
                      </>
                    ) : null}
                  </p>
                  <Progress size="sm" className="mt-1.5" value={c.limit.usedPct} tone={c.limit.usedPct > 90 ? "negative" : c.limit.usedPct > 70 ? "warning" : "navy"} label={`Limite usado do ${c.name}`} />
                </div>
              ))
            )}
          </CardBody>
        </Card>
        <AskMascot mascotId={mascotId} />
      </div>

      {isCurrent && m.estimated.incomeCents > 0 ? (
        <p className="text-xs text-muted">
          <Badge tone="warning">estimado</Badge> <Money cents={m.estimated.incomeCents} tone="none" /> em receitas estimadas não entram no saldo nem nas previsões confirmadas.
        </p>
      ) : null}

      <Link href="/revisao" className="card-hover flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm shadow-[var(--shadow-card)]">
        <span>
          <span className="block font-medium">Revisão financeira</span>
          <span className="text-xs text-muted">Cinco minutos para manter tudo em dia</span>
        </span>
        <ArrowRight className="size-4 text-muted" />
      </Link>
    </div>
  );
}
