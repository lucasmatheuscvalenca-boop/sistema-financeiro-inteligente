import { and, eq, max, ne } from "drizzle-orm";
import { projectCashFlow, type CashFlowProjection } from "@/domain/cashflow";
import { addMonthsToKey, diffDays, endOfMonth, monthKey, startOfMonth, type ISODate, type MonthKey } from "@/domain/dates";
import { monthTotals, type MonthTotals } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { listAccountsWithBalances, type AccountWithBalance } from "./accounts";
import { getBudgetEvaluation } from "./budgets";
import { listCardsOverview, type CardOverview } from "./cards";
import { buildCashContext, type CashContext } from "./cashflow";
import type { ServiceContext } from "./context";
import { listGoals, type GoalView } from "./goals";
import { loadTransactions, toLedgerTx } from "./ledger";

export interface DataQuality {
  lastDataUpdate: ISODate | null;
  hasAccounts: boolean;
  hasIncomeInfo: boolean;
  hasBankConnection: boolean;
  connectionStale: boolean;
  missing: string[];
}

export interface FinancialSnapshot {
  asOf: ISODate;
  generatedAt: string;
  month: MonthKey;
  isCurrentMonth: boolean;
  accounts: AccountWithBalance[];
  totals: {
    availableCents: Cents;
    reservedForGoalsCents: Cents;
    freeCents: Cents;
    reserveCents: Cents;
    goalsAccountsCents: Cents;
    investmentCents: Cents;
  };
  monthTotals: MonthTotals;
  previousMonthTotals: MonthTotals;
  receivables: Array<{ date: ISODate; label: string; amountCents: Cents; certainty: "confirmed" | "estimated" }>;
  payables: Array<{ date: ISODate; label: string; amountCents: Cents }>;
  overdue: CashContext["overdue"];
  cards: CardOverview[];
  budget: Awaited<ReturnType<typeof getBudgetEvaluation>>;
  goals: GoalView[];
  contributionsThisMonthCents: Cents;
  projection: CashFlowProjection | null;
  monthEnd: { confirmedCents: Cents; withEstimatedCents: Cents } | null;
  dataQuality: DataQuality;
  activeAlerts: number;
  cash: CashContext;
}

export async function getDataQuality(ctx: ServiceContext, hasAccounts: boolean, events: CashContext["events"]): Promise<DataQuality> {
  const [[last], connections] = await Promise.all([
    ctx.db.select({ d: max(s.transactions.date) }).from(s.transactions).where(and(eq(s.transactions.userId, ctx.userId), eq(s.transactions.status, "realized"))),
    ctx.db
      .select()
      .from(s.bankConnections)
      .where(and(eq(s.bankConnections.userId, ctx.userId), ne(s.bankConnections.status, "revoked"))),
  ]);
  const missing: string[] = [];
  if (!hasAccounts) missing.push("Cadastre pelo menos uma conta disponível para gastos.");
  const hasIncomeInfo = events.some((e) => e.kind === "income" && e.certainty === "confirmed");
  const real = connections.filter((c) => !c.isDemo);
  const stale = connections.some((c) => c.status === "error" || !c.lastSyncAt || Date.now() - c.lastSyncAt.getTime() > 24 * 3600 * 1000);
  return {
    lastDataUpdate: last?.d ?? null,
    hasAccounts,
    hasIncomeInfo,
    hasBankConnection: real.length > 0,
    connectionStale: stale && connections.length > 0,
    missing,
  };
}

export async function getFinancialSnapshot(ctx: ServiceContext, month?: MonthKey): Promise<FinancialSnapshot> {
  const current = monthKey(ctx.today);
  const m = month ?? current;
  const isCurrent = m === current;
  const [accounts, cash, cards, budget, goals, txRows, activeAlertRows] = await Promise.all([
    listAccountsWithBalances(ctx),
    buildCashContext(ctx, 90),
    listCardsOverview(ctx),
    getBudgetEvaluation(ctx, m),
    listGoals(ctx, { includeShared: false }),
    loadTransactions(ctx, { from: startOfMonth(addMonthsToKey(m, -1)), to: endOfMonth(m) }),
    ctx.db
      .select({ id: s.alerts.id })
      .from(s.alerts)
      .where(and(eq(s.alerts.userId, ctx.userId), eq(s.alerts.status, "active"))),
  ]);
  const activeAlerts = activeAlertRows.length;
  const ledger = txRows.map(toLedgerTx);
  const sumBy = (p: string) => accounts.filter((a) => a.purpose === p).reduce((sum, a) => sum + a.balanceCents, 0);

  const monthEndDate = endOfMonth(m);
  let projection: CashFlowProjection | null = null;
  let monthEnd: FinancialSnapshot["monthEnd"] = null;
  if (isCurrent) {
    projection = projectCashFlow({ startDate: ctx.today, endDate: monthEndDate, openingCents: cash.freeCents, events: cash.events });
    monthEnd = { confirmedCents: projection.closingConfirmedCents, withEstimatedCents: projection.closingWithEstimatedCents };
  }
  const inMonth = (d: ISODate) => d >= (isCurrent ? ctx.today : startOfMonth(m)) && d <= monthEndDate;
  const receivables = cash.events
    .filter((e) => e.amountCents > 0 && (e.kind === "income" || e.kind === "transfer_in") && inMonth(e.date))
    .map((e) => ({ date: e.date, label: e.label, amountCents: e.amountCents, certainty: e.certainty }));
  const payables = cash.events
    .filter((e) => e.amountCents < 0 && !e.optional && inMonth(e.date))
    .map((e) => ({ date: e.date, label: e.label, amountCents: -e.amountCents }));

  const contributionsThisMonth = goals.reduce((sum, g) => sum + g.diagnosis.contributedThisMonthCents, 0);
  const dataQuality = await getDataQuality(ctx, cash.hasSpendingAccounts, cash.events);
  return {
    asOf: ctx.today,
    generatedAt: new Date().toISOString(),
    month: m,
    isCurrentMonth: isCurrent,
    accounts,
    totals: {
      availableCents: cash.availableCents,
      reservedForGoalsCents: cash.reservedForGoalsCents,
      freeCents: cash.freeCents,
      reserveCents: sumBy("reserve"),
      goalsAccountsCents: sumBy("goals"),
      investmentCents: sumBy("investment"),
    },
    monthTotals: monthTotals(ledger, m),
    previousMonthTotals: monthTotals(ledger, addMonthsToKey(m, -1)),
    receivables,
    payables,
    overdue: cash.overdue,
    cards,
    budget,
    goals,
    contributionsThisMonthCents: contributionsThisMonth,
    projection,
    monthEnd,
    dataQuality,
    activeAlerts,
    cash,
  };
}

export function daysSince(date: ISODate | null, today: ISODate): number | null {
  return date ? diffDays(date, today) : null;
}
