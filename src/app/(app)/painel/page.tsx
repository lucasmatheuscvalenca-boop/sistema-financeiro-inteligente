import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronLeft, ChevronRight, CircleHelp, CreditCard, Landmark, Plus, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { IncomeExpenseChart } from "@/components/charts/charts";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Delta, EmptyState, Money, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { addMonthsToKey, assertMonthKey, endOfMonth, formatDateShort, formatMonthKey, monthKey, startOfMonth } from "@/domain/dates";
import { monthTotals } from "@/domain/ledger";
import { voiceFor, toneToState, type Tone } from "@/mascots/voice";
import { requireOnboarded } from "@/server/auth/current";
import { refreshAlerts } from "@/server/services/alerts";
import { getBriefing } from "@/server/services/briefing";
import { loadTransactions, toLedgerTx } from "@/server/services/ledger";
import { getNetWorth } from "@/server/services/net-worth";
import { getFinancialSnapshot } from "@/server/services/snapshot";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Painel" };

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function safeMonth(m: string | undefined, fallback: string): string {
  if (!m) return fallback;
  try {
    return assertMonthKey(m);
  } catch {
    return fallback;
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string; inicio?: string }> }) {
  const app = await requireOnboarded();
  const { ctx, mascotId } = app;
  const params = await searchParams;
  const current = monthKey(ctx.today);
  const month = safeMonth(params.mes, current);
  const isCurrent = month === current;

  const [snap, netWorth, alerts, briefing, history] = await Promise.all([
    getFinancialSnapshot(ctx, month),
    getNetWorth(ctx),
    isCurrent ? refreshAlerts(ctx) : Promise.resolve([]),
    getBriefing(ctx),
    loadTransactions(ctx, { from: startOfMonth(addMonthsToKey(month, -5)), to: endOfMonth(month) }),
  ]);
  const ledger = history.map(toLedgerTx);
  const chartData = [5, 4, 3, 2, 1, 0].map((i) => {
    const m = addMonthsToKey(month, -i);
    const t = monthTotals(ledger, m);
    return { month: `${MONTH_ABBR[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`, income: t.realized.incomeCents, expense: t.realized.expenseCents };
  });

  const voice = voiceFor(mascotId);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: app.prefs.timezone }).format(new Date()));
  const tone: Tone = !snap.dataQuality.hasAccounts
    ? "unknown"
    : alerts.some((a) => a.severity === "important")
      ? "critical"
      : alerts.some((a) => a.severity === "attention")
        ? "caution"
        : snap.monthEnd && snap.monthEnd.confirmedCents > 0
          ? "positive"
          : "neutral";
  const m = snap.monthTotals;
  const prev = snap.previousMonthTotals;
  const incomeProjected = m.realized.incomeCents + m.scheduled.incomeCents;
  const expenseProjected = m.realized.expenseCents + m.scheduled.expenseCents;
  const briefingIncomplete = !briefing.completed.personal || !briefing.completed.financial || !briefing.completed.life;
  const hasDemo = snap.accounts.some((a) => a.source === "demo") || snap.cards.some((c) => c.source === "demo");
  const activeGoals = snap.goals.filter((g) => g.goal.status === "active");
  const budget = snap.budget;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-gradient-to-br from-navy-900 via-navy-800 to-petrol-800 p-5 text-white shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:p-6">
        <MascotArt id={mascotId} size={92} state={params.inicio ? "celebration" : toneToState(tone)} className="rounded-full bg-white/5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-navy-100">{voice.greeting(app.user.name.split(" ")[0] ?? "", hour)}</p>
          <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{voice.headline(tone)}</h1>
          <p className="mt-1 text-sm text-navy-100">
            Dados até {formatDateShort(snap.asOf)} · {formatMonthKey(month)}
            {snap.dataQuality.lastDataUpdate ? ` · último lançamento em ${formatDateShort(snap.dataQuality.lastDataUpdate)}` : ""}
          </p>
        </div>
        <form action="/posso-gastar" className="flex w-full gap-2 sm:w-auto">
          <label htmlFor="quick-spend" className="sr-only">
            Valor que você quer gastar
          </label>
          <div className="relative flex-1 sm:w-40">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-navy-200">R$</span>
            <input id="quick-spend" name="valor" inputMode="decimal" placeholder="0,00" className="h-11 w-full rounded-xl border border-white/20 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-gold-300" />
          </div>
          <button className={buttonClass("gold", "md", "h-11")}>
            <CircleHelp className="size-4" /> Posso gastar?
          </button>
        </form>
      </section>

      {hasDemo ? (
        <Callout tone="info" title="Há dados de demonstração na sua conta">
          Contas marcadas com <DemoBadge /> vêm do conector de demonstração e são fictícias. Você pode removê-las em <Link href="/conexoes" className="underline">Conexões</Link>.
        </Callout>
      ) : null}
      {!snap.dataQuality.hasAccounts ? (
        <Callout tone="warning" title="Cadastre sua primeira conta" action={<ButtonLink href="/contas" size="sm">Cadastrar</ButtonLink>}>
          Sem contas, saldos e projeções ficam incompletos. Você também pode importar um extrato.
        </Callout>
      ) : null}
      {briefingIncomplete ? (
        <Callout tone="info" title="Seu briefing está incompleto" action={<ButtonLink href="/configuracoes/briefing" size="sm" variant="secondary">Completar</ButtonLink>}>
          Com mais informações, a reserva recomendada, o diagnóstico e o plano de aposentadoria ficam mais precisos.
        </Callout>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold first-letter:uppercase">{formatMonthKey(month)}</h2>
        <div className="flex items-center gap-1">
          <Link aria-label="Mês anterior" href={`/painel?mes=${addMonthsToKey(month, -1)}`} className="rounded-lg p-2 hover:bg-surface-2">
            <ChevronLeft className="size-5" />
          </Link>
          {!isCurrent ? (
            <Link href="/painel" className="rounded-lg px-2 py-1 text-sm text-petrol-600 hover:bg-surface-2 dark:text-petrol-300">
              Hoje
            </Link>
          ) : null}
          <Link aria-label="Próximo mês" href={`/painel?mes=${addMonthsToKey(month, 1)}`} className="rounded-lg p-2 hover:bg-surface-2">
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Stat
            icon={<Wallet className="size-3.5" />}
            label="Saldo livre hoje"
            value={<Money cents={snap.totals.freeCents} />}
            hint={snap.totals.reservedForGoalsCents > 0 ? <>Disponível {<Money cents={snap.totals.availableCents} tone="none" />}, já das metas {<Money cents={snap.totals.reservedForGoalsCents} tone="none" />}</> : "Contas disponíveis para gastos"}
          />
        </Card>
        <Card className="p-4">
          <Stat icon={<Landmark className="size-3.5" />} label="Patrimônio líquido estimado" value={<Money cents={netWorth.summary.netWorthCents} />} hint={netWorth.summary.estimatedSharePct > 0 ? `${netWorth.summary.estimatedSharePct.toFixed(0)}% dos ativos são estimativas` : "Contas, bens e dívidas"} />
        </Card>
        <Card className="p-4">
          <Stat
            icon={<TrendingUp className="size-3.5" />}
            label="Receitas do mês"
            value={<Money cents={m.realized.incomeCents} />}
            hint={
              <>
                {m.scheduled.incomeCents ? <>+ <Money cents={m.scheduled.incomeCents} tone="none" /> previstas. </> : null}
                {m.estimated.incomeCents ? <>{<Money cents={m.estimated.incomeCents} tone="none" />} estimadas (não contadas). </> : null}
                <Delta current={m.realized.incomeCents} previous={prev.realized.incomeCents} />
              </>
            }
          />
        </Card>
        <Card className="p-4">
          <Stat
            icon={<TrendingDown className="size-3.5" />}
            label="Despesas do mês"
            value={<Money cents={m.realized.expenseCents} />}
            hint={
              <>
                {m.scheduled.expenseCents ? <>+ <Money cents={m.scheduled.expenseCents} tone="none" /> previstas. </> : null}
                <Delta current={m.realized.expenseCents} previous={prev.realized.expenseCents} invert />
              </>
            }
          />
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isCurrent && snap.monthEnd ? (
            <Card>
              <CardHeader title="Projeção de fechamento do mês" description="Saldo livre previsto para o último dia, depois de contas, faturas e aportes planejados." icon={<CalendarClock className="size-4" />} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Stat label="Só valores confirmados" value={<Money cents={snap.monthEnd.confirmedCents} />} />
                <Stat label="Incluindo estimativas" value={<Money cents={snap.monthEnd.withEstimatedCents} />} hint="Estimativas não são garantidas" />
                <Stat label="Margem do mês (receitas − despesas)" value={<Money cents={incomeProjected - expenseProjected} signed />} hint="Realizado + previsto" />
                {snap.projection?.firstNegativeConfirmed ? (
                  <Callout tone="negative" className="sm:col-span-3" title={`Saldo negativo previsto em ${formatDateShort(snap.projection.firstNegativeConfirmed)}`}>
                    Veja o <Link href="/fluxo-de-caixa" className="underline">fluxo de caixa</Link> para entender quais compromissos causam o aperto.
                  </Callout>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Receitas e despesas" description="Valores realizados nos últimos 6 meses (transferências e pagamentos de fatura não entram)." />
            <CardBody>
              {chartData.every((d) => d.income === 0 && d.expense === 0) ? (
                <EmptyState title="Ainda não há movimentações realizadas" description="Registre ou importe receitas e despesas para ver a evolução mês a mês." action={<ButtonLink href="/movimentacoes" size="sm">Lançar movimentação</ButtonLink>} />
              ) : (
                <IncomeExpenseChart data={chartData} />
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Contas a pagar" description={isCurrent ? "Até o fim do mês" : "No mês"} action={<Link href="/movimentacoes?status=scheduled" className="text-xs text-petrol-600 hover:underline dark:text-petrol-300">Ver todas</Link>} />
              <CardBody>
                {snap.payables.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum compromisso previsto.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {snap.payables.slice(0, 6).map((p, i) => (
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
                {snap.overdue.length ? <p className="mt-3 text-xs text-warning">{snap.overdue.length} lançamento(s) previsto(s) com data passada aguardando confirmação.</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Valores a receber" description={isCurrent ? "Até o fim do mês" : "No mês"} />
              <CardBody>
                {snap.receivables.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum recebimento previsto.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {snap.receivables.slice(0, 6).map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate">{r.label}</span>
                          <span className="text-xs text-muted">
                            {formatDateShort(r.date)} {r.certainty === "estimated" ? <Badge tone="warning">estimado</Badge> : null}
                          </span>
                        </span>
                        <Money cents={r.amountCents} signed />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Orçamento do mês"
              description={budget.lines.length ? `${budget.totals.usedPct.toFixed(0)}% do planejado comprometido` : "Defina limites por categoria para acompanhar o mês"}
              action={<Link href={`/orcamento?mes=${month}`} className="text-xs text-petrol-600 hover:underline dark:text-petrol-300">Abrir orçamento</Link>}
            />
            <CardBody>
              {budget.lines.length === 0 ? (
                <EmptyState title="Sem orçamento definido" description="Limites por categoria ajudam a saber quanto ainda dá para gastar." action={<ButtonLink href="/orcamento" size="sm">Definir orçamento</ButtonLink>} />
              ) : (
                <div className="space-y-3">
                  <Progress value={budget.totals.usedPct} tone={budget.totals.usedPct > 100 ? "negative" : budget.totals.usedPct > 85 ? "warning" : "petrol"} label="Orçamento total" />
                  <p className="text-xs text-muted">
                    <Money cents={budget.totals.committedCents} tone="none" /> de <Money cents={budget.totals.limitCents} tone="none" />
                    {budget.unbudgetedSpentCents > 0 ? <> · <Money cents={budget.unbudgetedSpentCents} tone="none" /> em categorias sem orçamento</> : null}
                  </p>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {[...budget.lines].sort((a, b) => b.usedPct - a.usedPct).slice(0, 6).map((l) => (
                      <li key={l.categoryId}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="truncate">{l.categoryName}</span>
                          <span className={cn("tabular-nums", l.status === "exceeded" ? "text-negative" : "text-muted")}>{l.usedPct.toFixed(0)}%</span>
                        </div>
                        <Progress size="sm" value={l.usedPct} tone={l.status === "exceeded" ? "negative" : l.status === "warning" ? "warning" : "petrol"} label={l.categoryName} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Prioridades e alertas" action={<Link href="/alertas" className="text-xs text-petrol-600 hover:underline dark:text-petrol-300">Todos</Link>} />
            <CardBody className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-sm text-muted">{isCurrent ? "Nenhum ponto de atenção agora." : "Alertas são exibidos no mês atual."}</p>
              ) : (
                alerts.slice(0, 4).map((a) => (
                  <Link key={a.id} href={a.href} className="block rounded-2xl border border-line p-3 transition hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={a.severity === "important" ? "negative" : a.severity === "attention" ? "warning" : "info"}>{a.severity === "important" ? "Importante" : a.severity === "attention" ? "Atenção" : "Info"}</Badge>
                      <p className="truncate text-sm font-medium">{a.title}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{a.cause}</p>
                    <p className="mt-1 text-xs font-medium text-petrol-700 dark:text-petrol-300">→ {a.action}</p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Saldo por conta" action={<Link href="/contas" className="text-xs text-petrol-600 hover:underline dark:text-petrol-300">Gerenciar</Link>} />
            <CardBody>
              {snap.accounts.length === 0 ? (
                <ButtonLink href="/contas" size="sm" variant="secondary">
                  <Plus className="size-4" /> Adicionar conta
                </ButtonLink>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {snap.accounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate">
                          {a.name} {a.source === "demo" ? <DemoBadge /> : null}
                        </span>
                        <span className="text-xs text-muted">{{ spending: "Gastos", reserve: "Reserva", goals: "Metas", investment: "Investimento" }[a.purpose]}</span>
                      </span>
                      <Money cents={a.balanceCents} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {snap.cards.length ? (
            <Card>
              <CardHeader title="Faturas" icon={<CreditCard className="size-4" />} />
              <CardBody className="space-y-3">
                {snap.cards.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted">Limite disponível {<Money cents={c.limit.availableCents} tone="none" />}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Fatura aberta: <Money cents={c.openInvoice?.totalCents ?? 0} tone="none" /> (fecha {c.openInvoice ? formatDateShort(c.openInvoice.ref.closingDate) : "—"})
                      {c.nextDue ? (
                        <>
                          {" "}
                          · a pagar <Money cents={c.nextDue.outstandingCents} tone="none" /> em {formatDateShort(c.nextDue.dueDate)}
                        </>
                      ) : null}
                    </p>
                    <Progress size="sm" className="mt-1.5" value={c.limit.usedPct} tone={c.limit.usedPct > 90 ? "negative" : c.limit.usedPct > 70 ? "warning" : "navy"} label={`Limite usado do ${c.name}`} />
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Metas" icon={<Target className="size-4" />} description={snap.contributionsThisMonthCents ? <>Aportes no mês: <Money cents={snap.contributionsThisMonthCents} tone="none" /></> : undefined} action={<Link href="/metas" className="text-xs text-petrol-600 hover:underline dark:text-petrol-300">Ver metas</Link>} />
            <CardBody className="space-y-3">
              {activeGoals.length === 0 ? (
                <ButtonLink href="/metas/nova" size="sm" variant="secondary">
                  <Plus className="size-4" /> Criar uma meta
                </ButtonLink>
              ) : (
                activeGoals.slice(0, 4).map((g) => (
                  <Link key={g.goal.id} href={`/metas/${g.goal.id}`} className="block">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="truncate font-medium">{g.goal.name}</span>
                      <span className="tabular-nums text-muted">{g.diagnosis.progressPct.toFixed(0)}%</span>
                    </div>
                    <Progress size="sm" value={g.diagnosis.progressPct} tone={g.diagnosis.health === "at_risk" || g.diagnosis.health === "overdue" ? "warning" : "petrol"} label={g.goal.name} />
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Link href="/revisao" className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm transition hover:bg-surface-2">
            <span>
              <span className="block font-medium">Revisão da semana</span>
              <span className="text-xs text-muted">5 minutos para manter tudo em dia</span>
            </span>
            <ArrowRight className="size-4 text-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
}
