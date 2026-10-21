import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { generateAlerts, throttleAlerts, type AlertCandidate } from "@/domain/alerts";
import { projectCashFlow } from "@/domain/cashflow";
import { addDays, addMonthsToKey, endOfMonth, monthKey, startOfMonth } from "@/domain/dates";
import { average } from "@/domain/insights";
import * as s from "../db/schema";
import { NotFoundError } from "../errors";
import { listCategories } from "./categories";
import type { ServiceContext } from "./context";
import { getEmergencyOverview } from "./emergency";
import { loadTransactions } from "./ledger";
import { getFinancialSnapshot } from "./snapshot";

export type AlertRow = typeof s.alerts.$inferSelect;

/** Gastos do mês por categoria-mãe comparados à média dos 3 meses anteriores. */
async function categorySpending(ctx: ServiceContext) {
  const current = monthKey(ctx.today);
  const from = startOfMonth(addMonthsToKey(current, -3));
  const [txs, categories] = await Promise.all([loadTransactions(ctx, { from, to: endOfMonth(current) }), listCategories(ctx, { kind: "expense", includeArchived: true })]);
  const top = new Map(categories.map((c) => [c.id, c.parentId ?? c.id]));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const byMonth = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (t.status !== "realized" || (t.kind !== "expense" && t.kind !== "refund") || !t.categoryId) continue;
    const m = monthKey(t.date);
    const cat = top.get(t.categoryId) ?? t.categoryId;
    const map = byMonth.get(m) ?? new Map();
    map.set(cat, (map.get(cat) ?? 0) + (t.kind === "expense" ? t.amountCents : -t.amountCents));
    byMonth.set(m, map);
  }
  const previous = [1, 2, 3].map((i) => addMonthsToKey(current, -i)).filter((m) => byMonth.has(m));
  if (previous.length === 0) return [];
  const cats = new Set<string>([...(byMonth.get(current)?.keys() ?? [])]);
  return [...cats].map((categoryId) => ({
    categoryId,
    name: names.get(categoryId) ?? "Categoria",
    currentCents: byMonth.get(current)?.get(categoryId) ?? 0,
    averageCents: average(previous.map((m) => byMonth.get(m)?.get(categoryId) ?? 0)),
  }));
}

/** Recorrências cujo valor efetivamente lançado subiu entre as duas últimas ocorrências. */
async function recurringChanges(ctx: ServiceContext) {
  const rows = await ctx.db
    .select({ recurrenceId: s.transactions.recurrenceId, amount: s.transactions.amountCents, date: s.transactions.date, name: s.recurrences.description })
    .from(s.transactions)
    .innerJoin(s.recurrences, eq(s.recurrences.id, s.transactions.recurrenceId))
    .where(and(eq(s.transactions.userId, ctx.userId), isNotNull(s.transactions.recurrenceId), eq(s.transactions.status, "realized"), eq(s.transactions.kind, "expense")))
    .orderBy(desc(s.transactions.date));
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = grouped.get(r.recurrenceId!) ?? [];
    if (list.length < 2) list.push(r);
    grouped.set(r.recurrenceId!, list);
  }
  return [...grouped.entries()]
    .filter(([, list]) => list.length === 2)
    .map(([id, [last, prev]]) => ({ id, name: last!.name, previousCents: prev!.amount, currentCents: last!.amount }));
}

export async function computeAlertCandidates(ctx: ServiceContext): Promise<AlertCandidate[]> {
  const [snapshot, emergency, spending, recurring, [retirement], connections] = await Promise.all([
    getFinancialSnapshot(ctx),
    getEmergencyOverview(ctx),
    categorySpending(ctx),
    recurringChanges(ctx),
    ctx.db.select({ updatedAt: s.retirementPlans.updatedAt }).from(s.retirementPlans).where(eq(s.retirementPlans.userId, ctx.userId)),
    ctx.db.select().from(s.bankConnections).where(eq(s.bankConnections.userId, ctx.userId)),
  ]);
  const next30 = projectCashFlow({ startDate: ctx.today, endDate: addDays(ctx.today, 30), openingCents: snapshot.cash.freeCents, events: snapshot.cash.events, includeOptional: false });
  return generateAlerts({
    today: ctx.today,
    availableCents: snapshot.totals.freeCents,
    cashFlow: snapshot.dataQuality.hasAccounts
      ? { firstNegativeConfirmed: next30.firstNegativeConfirmed, lowestBalanceCents: next30.lowestConfirmed.balanceCents, lowestDate: next30.lowestConfirmed.date }
      : null,
    budgetLines: snapshot.budget.lines,
    categorySpending: spending,
    goals: snapshot.goals
      .filter((g) => g.access === "owner" && g.goal.status === "active")
      .map((g) => ({
        goalId: g.goal.id,
        name: g.goal.name,
        health: g.diagnosis.health,
        requiredPerPeriodCents: g.diagnosis.required.perPeriodCents,
        contributedThisMonthCents: g.diagnosis.contributedThisMonthCents,
        contributionDay: g.goal.contributionDay,
      })),
    recurringChanges: recurring,
    reserve: emergency.evaluation,
    upcomingBills: snapshot.cash.events
      .filter((e) => e.amountCents < 0 && !e.optional && e.kind !== "invoice")
      .map((e, i) => ({ id: e.sourceId ?? `ev${i}`, date: e.date, label: e.label, amountCents: -e.amountCents })),
    invoices: snapshot.cards.flatMap((c) =>
      c.invoices.filter((i) => i.outstandingCents > 0 && i.status !== "open" && i.status !== "future").map((i) => ({ id: i.id, cardName: c.name, dueDate: i.dueDate, outstandingCents: i.outstandingCents })),
    ),
    retirementPlanUpdatedAt: retirement ? retirement.updatedAt.toISOString().slice(0, 10) : null,
    lastDataUpdate: snapshot.dataQuality.lastDataUpdate,
    staleConnections: connections
      .filter((c) => c.status !== "revoked" && (c.status === "error" || !c.lastSyncAt || Date.now() - c.lastSyncAt.getTime() > 24 * 3600 * 1000))
      .map((c) => ({ id: c.id, name: c.institutionName, lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString().slice(0, 10) : null })),
  });
}

/**
 * Recalcula alertas: grava os novos (sem repetir os já existentes, inclusive dispensados),
 * respeita o limite diário e marca como resolvidos os que deixaram de valer.
 */
export async function refreshAlerts(ctx: ServiceContext): Promise<AlertRow[]> {
  const candidates = await computeAlertCandidates(ctx);
  const [prefs] = await ctx.db.select({ max: s.userPreferences.maxAlertsPerDay }).from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId));
  const existing = await ctx.db.select({ fingerprint: s.alerts.fingerprint }).from(s.alerts).where(eq(s.alerts.userId, ctx.userId));
  const known = new Set(existing.map((e) => e.fingerprint));
  const fresh = throttleAlerts(
    candidates.filter((c) => !known.has(c.fingerprint)),
    prefs?.max ?? 5,
  );
  if (fresh.length > 0) {
    await ctx.db
      .insert(s.alerts)
      .values(
        fresh.map((c) => ({
          userId: ctx.userId,
          type: c.type,
          severity: c.severity,
          title: c.title,
          cause: c.cause,
          impact: c.impact,
          action: c.action,
          href: c.href,
          fingerprint: c.fingerprint,
          data: c.data ?? null,
        })),
      )
      .onConflictDoNothing({ target: [s.alerts.userId, s.alerts.fingerprint] });
  }
  const current = candidates.map((c) => c.fingerprint);
  await ctx.db
    .update(s.alerts)
    .set({ status: "resolved" })
    .where(and(eq(s.alerts.userId, ctx.userId), eq(s.alerts.status, "active"), current.length ? notInArray(s.alerts.fingerprint, current) : undefined));
  return listAlerts(ctx);
}

export async function listAlerts(ctx: ServiceContext, status: "active" | "dismissed" | "resolved" = "active"): Promise<AlertRow[]> {
  const rows = await ctx.db
    .select()
    .from(s.alerts)
    .where(and(eq(s.alerts.userId, ctx.userId), eq(s.alerts.status, status)))
    .orderBy(desc(s.alerts.createdAt));
  const order = { important: 0, attention: 1, info: 2 } as Record<string, number>;
  return rows.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}

export async function dismissAlert(ctx: ServiceContext, id: string): Promise<void> {
  const r = await ctx.db
    .update(s.alerts)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(and(eq(s.alerts.id, id), eq(s.alerts.userId, ctx.userId)))
    .returning({ id: s.alerts.id });
  if (r.length === 0) throw new NotFoundError("Alerta não encontrado");
}

export async function markAlertsRead(ctx: ServiceContext, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ctx.db
    .update(s.alerts)
    .set({ readAt: new Date() })
    .where(and(eq(s.alerts.userId, ctx.userId), inArray(s.alerts.id, ids)));
}
