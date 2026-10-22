import { buildDailyPlan, heroInsight, percentChange, type HeroInsight, type PlanItem } from "@/domain/daily-plan";
import { addMonthsToKey, endOfMonth, monthKey, parts, startOfMonth, dateWithClampedDay, type ISODate, type MonthKey } from "@/domain/dates";
import { accountBalances, monthTotals } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import type { ServiceContext } from "./context";
import { getEmergencyOverview } from "./emergency";
import { loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";
import { getNetWorth, type NetWorthOverview } from "./net-worth";
import { getRetirementOverview } from "./retirement";
import { getFinancialSnapshot, type FinancialSnapshot } from "./snapshot";
import { safetyMargin } from "./spend";

export interface Kpi {
  valueCents: Cents;
  /** Variação percentual; null quando não há base comparável. */
  deltaPct: number | null;
  /** Texto da base de comparação (“vs. mesmo período do mês anterior”). */
  basis: string;
}

export interface GoalProgressItem {
  key: string;
  name: string;
  kind: string;
  currentCents: Cents;
  targetCents: Cents;
  pct: number;
  href: string;
  /** Data-alvo, quando houver. */
  targetDate: ISODate | null;
  note?: string;
}

export interface Dashboard {
  snap: FinancialSnapshot;
  netWorth: NetWorthOverview;
  kpis: { free: Kpi; income: Kpi; expense: Kpi; netWorth: Kpi };
  plan: PlanItem[];
  hero: HeroInsight;
  goalsProgress: GoalProgressItem[];
  chart: Array<{ month: MonthKey; income: Cents; expense: Cents }>;
}

/**
 * Painel do mês. Todos os números vêm dos lançamentos e cadastros; as variações usam
 * bases comparáveis (no mês corrente, o mesmo intervalo de dias do mês anterior).
 */
export async function getDashboard(ctx: ServiceContext, month?: MonthKey): Promise<Dashboard> {
  const current = monthKey(ctx.today);
  const m = month ?? current;
  const isCurrent = m === current;
  const [snap, netWorth, emergency, retirement, margin, history] = await Promise.all([
    getFinancialSnapshot(ctx, m),
    getNetWorth(ctx),
    getEmergencyOverview(ctx),
    getRetirementOverview(ctx),
    safetyMargin(ctx),
    loadTransactions(ctx, { to: endOfMonth(m) }),
  ]);
  const ledger = history.map(toLedgerTx);

  // Receitas e despesas: no mês corrente compara com o mesmo número de dias do mês anterior.
  const prevMonth = addMonthsToKey(m, -1);
  const cutoffDay = isCurrent ? parts(ctx.today).day : 31;
  const prevCutoff = dateWithClampedDay(parts(startOfMonth(prevMonth)).year, parts(startOfMonth(prevMonth)).month, cutoffDay);
  const curCutoff = isCurrent ? ctx.today : endOfMonth(m);
  const curT = monthTotals(ledger.filter((t) => t.date <= curCutoff), m).realized;
  const prevT = monthTotals(ledger.filter((t) => t.date <= prevCutoff), prevMonth).realized;
  const basis = isCurrent ? "vs. mesmo período do mês anterior" : "vs. mês anterior";

  // Saldo das contas de gastos: hoje (ou fim do mês consultado) × fim do mês anterior.
  const spending = snap.accounts.filter((a) => snap.cash.spendingAccountIds.includes(a.id));
  const balanceAt = (date: ISODate) => {
    // Contas abertas depois da data não existiam ainda: ficam fora da base de comparação.
    const existing = spending.filter((a) => !a.initialBalanceDate || a.initialBalanceDate <= date);
    const map = accountBalances(existing.map(toLedgerAccount), ledger, { asOf: date });
    return existing.reduce((sum, a) => sum + (map.get(a.id) ?? 0), 0);
  };
  const freeNowRef = isCurrent ? snap.totals.availableCents : balanceAt(endOfMonth(m));
  const freePrev = balanceAt(endOfMonth(prevMonth));

  const nwPrev = netWorth.history.find((h) => h.month === prevMonth)?.netWorthCents;

  const kpis: Dashboard["kpis"] = {
    free: { valueCents: isCurrent ? snap.totals.freeCents : freeNowRef, deltaPct: percentChange(freeNowRef, freePrev), basis: "saldo das contas de gastos vs. fim do mês anterior" },
    income: { valueCents: curT.incomeCents, deltaPct: percentChange(curT.incomeCents, prevT.incomeCents), basis },
    expense: { valueCents: curT.expenseCents, deltaPct: percentChange(curT.expenseCents, prevT.expenseCents), basis },
    netWorth: { valueCents: netWorth.summary.netWorthCents, deltaPct: nwPrev === undefined ? null : percentChange(netWorth.summary.netWorthCents, nwPrev), basis: "vs. fotografia do mês anterior" },
  };

  const ev = emergency.evaluation;
  const minimumMonths = emergency.settings.minimumMonths;
  const reserveGapToMin = Math.max(0, ev.monthlyEssentialCents * Math.min(minimumMonths, ev.targetMonths) - ev.currentCents);
  const activeGoals = snap.goals.filter((g) => g.goal.status === "active");

  // Folga do mês: menor saldo previsto até o fim do mês − margem − aportes do mês já vencidos e não feitos
  // (os aportes com data a partir de hoje já estão na projeção).
  const { year: ty, month: tm } = parts(ctx.today);
  const pendingContributions = activeGoals.reduce((sum, g) => {
    if (dateWithClampedDay(ty, tm, g.goal.contributionDay) >= ctx.today) return sum;
    const target = g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents ?? 0;
    return sum + Math.max(0, target - g.diagnosis.contributedThisMonthCents);
  }, 0);
  const extra = isCurrent && snap.projection ? snap.projection.lowestConfirmed.balanceCents - margin.cents - pendingContributions : null;

  const plan = isCurrent
    ? buildDailyPlan({
        today: ctx.today,
        hasAccounts: snap.dataQuality.hasAccounts,
        goals: activeGoals.map((g) => ({
          id: g.goal.id,
          name: g.goal.name,
          status: g.goal.status as "active",
          health: g.diagnosis.health,
          monthlyTargetCents: g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents,
          contributedThisMonthCents: g.diagnosis.contributedThisMonthCents,
          contributionDay: g.goal.contributionDay,
        })),
        budgetLines: snap.budget.lines.map((l) => ({ categoryName: l.categoryName, usedPct: l.usedPct, status: l.status })),
        payables: snap.payables,
        overdue: snap.overdue,
        reserve: emergency.configured || ev.monthlyEssentialCents > 0 ? { belowMinimum: ev.belowMinimum, gapToMinimumCents: reserveGapToMin } : null,
        lastDataUpdate: snap.dataQuality.lastDataUpdate,
        extraCents: extra,
      })
    : [];

  const byDate = (a: { goal: { targetDate: string | null } }, b: { goal: { targetDate: string | null } }) => (a.goal.targetDate ?? "9999").localeCompare(b.goal.targetDate ?? "9999");
  const onTrack = activeGoals.filter((g) => g.diagnosis.health === "on_track" && g.goal.targetDate).sort(byDate)[0];
  const atRisk = activeGoals.filter((g) => g.diagnosis.health === "at_risk").sort(byDate)[0];
  const exceeded = snap.budget.lines.find((l) => l.status === "exceeded");
  const hero = heroInsight({
    today: ctx.today,
    hasAccounts: snap.dataQuality.hasAccounts,
    firstNegativeDate: snap.projection?.firstNegativeConfirmed ?? null,
    exceededBudget: exceeded?.categoryName ?? null,
    reserveBelowMinimum: ev.belowMinimum,
    onTrackGoal: onTrack ? { id: onTrack.goal.id, name: onTrack.goal.name, targetDate: onTrack.goal.targetDate! } : null,
    atRiskGoal: atRisk ? { id: atRisk.goal.id, name: atRisk.goal.name } : null,
    monthEndConfirmedCents: snap.monthEnd?.confirmedCents ?? null,
  });

  const goalsProgress: GoalProgressItem[] = activeGoals.map((g) => ({
    key: g.goal.id,
    name: g.goal.name,
    kind: g.goal.kind,
    currentCents: g.balances.balanceCents,
    targetCents: g.goal.targetCents,
    pct: g.diagnosis.progressPct,
    href: `/metas/${g.goal.id}`,
    targetDate: g.goal.targetDate,
  }));
  if (ev.targetCents > 0) {
    goalsProgress.push({ key: "reserva", name: "Reserva de emergência", kind: "emergency", currentCents: ev.currentCents, targetCents: ev.targetCents, pct: ev.progressPct, href: "/reserva", targetDate: ev.completionDate });
  }
  if (retirement.saved && retirement.result && retirement.result.requiredCapitalRealCents > 0) {
    const cur = retirement.input.currentWealthCents;
    const req = retirement.result.requiredCapitalRealCents;
    goalsProgress.push({
      key: "aposentadoria",
      name: "Aposentadoria",
      kind: "retirement",
      currentCents: cur,
      targetCents: req,
      pct: Math.min(100, (cur / req) * 100),
      href: "/aposentadoria",
      targetDate: null,
      note: "Capital necessário em valores de hoje",
    });
  }

  const chart = [5, 4, 3, 2, 1, 0].map((i) => {
    const mk = addMonthsToKey(m, -i);
    const t = monthTotals(ledger, mk).realized;
    return { month: mk, income: t.incomeCents, expense: t.expenseCents };
  });

  return { snap, netWorth, kpis, plan, hero, goalsProgress, chart };
}
