import { and, eq, inArray, isNull } from "drizzle-orm";
import { invoiceForPurchase } from "@/domain/credit-card";
import { projectCashFlow, type CashEvent, type CashFlowProjection } from "@/domain/cashflow";
import { addDays, startOfMonth, type ISODate } from "@/domain/dates";
import { contributionDates } from "@/domain/goals";
import { accountBalances } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { cycleOf } from "./cards";
import type { ServiceContext } from "./context";
import { listGoals } from "./goals";
import { loadAccounts, loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";
import { pendingOccurrences } from "./recurrences";

export interface CashContext {
  /** Saldo realizado das contas "disponíveis para gastos". */
  availableCents: Cents;
  /** Parte desse saldo que já pertence a metas (metas sem conta própria ou guardadas em conta de gastos). */
  reservedForGoalsCents: Cents;
  /** Disponível − reservado para metas. */
  freeCents: Cents;
  spendingAccountIds: string[];
  events: CashEvent[];
  /** Lançamentos previstos com data passada que ainda não foram confirmados. */
  overdue: Array<{ date: ISODate; label: string; amountCents: Cents; kind: "income" | "expense" }>;
  hasSpendingAccounts: boolean;
}

/**
 * Monta os eventos futuros de caixa nas contas de gasto:
 * - lançamentos previstos/estimados (transferências só contam quando cruzam a fronteira das contas de gasto);
 * - ocorrências de recorrências ainda não lançadas;
 * - faturas de cartão a vencer (compras + parcelas − estornos − pagamentos já feitos/agendados);
 * - aportes planejados em metas (opcionais, para simular cenários sem aportes).
 * Por prudência, despesas previstas vencidas e não confirmadas entram hoje; receitas vencidas não entram.
 */
export async function buildCashContext(ctx: ServiceContext, horizonDays = 90, opts: { includeGoalContributions?: boolean } = {}): Promise<CashContext> {
  const today = ctx.today;
  const to = addDays(today, horizonDays);
  const [accounts, txRows, cards] = await Promise.all([
    loadAccounts(ctx),
    loadTransactions(ctx),
    ctx.db
      .select()
      .from(s.creditCards)
      .where(and(eq(s.creditCards.userId, ctx.userId), isNull(s.creditCards.archivedAt))),
  ]);
  const spending = new Set(accounts.filter((a) => a.purpose === "spending").map((a) => a.id));
  const balances = accountBalances(accounts.map(toLedgerAccount), txRows.map(toLedgerTx), { asOf: today });
  const available = [...spending].reduce((sum, id) => sum + (balances.get(id) ?? 0), 0);
  const events: CashEvent[] = [];
  const overdue: CashContext["overdue"] = [];

  const push = (date: ISODate, amount: Cents, label: string, kind: CashEvent["kind"], certainty: CashEvent["certainty"], sourceId?: string) => {
    if (amount === 0) return;
    events.push({ date, amountCents: amount, label, kind, certainty, sourceId });
  };

  // 1) Lançamentos previstos e estimados fora do cartão.
  const scheduledPaymentsByInvoice = new Map<string, Cents>();
  for (const t of txRows) {
    if (t.status === "realized") continue;
    if (t.cardId && t.kind !== "card_payment") continue; // compras no cartão entram pela fatura
    const isPast = t.date < today;
    const certainty = t.status === "estimated" ? "estimated" : "confirmed";
    let amount = 0;
    let kind: CashEvent["kind"] = "expense";
    if (t.kind === "income" && t.accountId && spending.has(t.accountId)) {
      amount = t.amountCents;
      kind = "income";
    } else if (t.kind === "expense" && t.accountId && spending.has(t.accountId)) {
      amount = -t.amountCents;
    } else if (t.kind === "refund" && t.accountId && spending.has(t.accountId)) {
      amount = t.amountCents;
      kind = "income";
    } else if (t.kind === "transfer") {
      const fromSpending = !!t.accountId && spending.has(t.accountId);
      const toSpending = !!t.toAccountId && spending.has(t.toAccountId);
      if (fromSpending && !toSpending) {
        amount = -t.amountCents;
        kind = "transfer_out";
      } else if (!fromSpending && toSpending) {
        amount = t.amountCents;
        kind = "transfer_in";
      }
    } else if (t.kind === "card_payment") {
      if (t.invoiceId) scheduledPaymentsByInvoice.set(t.invoiceId, (scheduledPaymentsByInvoice.get(t.invoiceId) ?? 0) + t.amountCents);
      if (t.accountId && spending.has(t.accountId)) amount = -t.amountCents;
      kind = "invoice";
    }
    if (amount === 0) continue;
    if (isPast) {
      overdue.push({ date: t.date, label: t.description, amountCents: Math.abs(amount), kind: amount > 0 ? "income" : "expense" });
      if (amount < 0) push(today, amount, `${t.description} (vencido, não confirmado)`, kind, certainty, t.id);
      else push(today, amount, `${t.description} (atrasado, não confirmado)`, kind, "estimated", t.id);
      continue;
    }
    if (t.date <= to) push(t.date, amount, t.description, kind, certainty, t.id);
  }

  // 2) Recorrências ainda não lançadas (inclui as do mês corrente já vencidas).
  const occurrences = await pendingOccurrences(ctx, startOfMonth(today), to);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const virtualInvoiceCharges = new Map<string, { cardId: string; dueDate: ISODate; closingDate: ISODate; amount: Cents; label: string }>();
  for (const o of occurrences) {
    const r = o.recurrence;
    const certainty = o.certainty === "estimated" ? "estimated" : "confirmed";
    if (r.cardId) {
      const card = cardById.get(r.cardId);
      if (!card || o.date < today) continue;
      const inv = invoiceForPurchase(o.date, cycleOf(card));
      const key = `${card.id}|${inv.closingDate}`;
      const entry = virtualInvoiceCharges.get(key) ?? { cardId: card.id, dueDate: inv.dueDate, closingDate: inv.closingDate, amount: 0, label: card.name };
      entry.amount += o.amountCents;
      virtualInvoiceCharges.set(key, entry);
      continue;
    }
    let amount = 0;
    let kind: CashEvent["kind"] = "expense";
    if (r.kind === "income" && r.accountId && spending.has(r.accountId)) {
      amount = o.amountCents;
      kind = "income";
    } else if (r.kind === "expense" && r.accountId && spending.has(r.accountId)) amount = -o.amountCents;
    else if (r.kind === "transfer") {
      const fromSpending = !!r.accountId && spending.has(r.accountId);
      const toSpending = !!r.toAccountId && spending.has(r.toAccountId);
      if (fromSpending && !toSpending) {
        amount = -o.amountCents;
        kind = "transfer_out";
      } else if (!fromSpending && toSpending) {
        amount = o.amountCents;
        kind = "transfer_in";
      }
    }
    if (amount === 0) continue;
    if (o.date < today) {
      if (amount < 0) {
        overdue.push({ date: o.date, label: r.description, amountCents: -amount, kind: "expense" });
        push(today, amount, `${r.description} (vencido, não confirmado)`, kind, certainty, r.id);
      } else {
        overdue.push({ date: o.date, label: r.description, amountCents: amount, kind: "income" });
      }
      continue;
    }
    push(o.date, amount, r.description, kind, certainty, r.id);
  }

  // 3) Faturas de cartão.
  if (cards.length > 0) {
    const invoices = await ctx.db
      .select()
      .from(s.cardInvoices)
      .where(and(eq(s.cardInvoices.userId, ctx.userId), inArray(s.cardInvoices.cardId, cards.map((c) => c.id))));
    const byInvoice = new Map<string, { charges: Cents; refunds: Cents; paid: Cents }>();
    for (const t of txRows) {
      if (!t.invoiceId || t.status === "estimated") continue;
      const e = byInvoice.get(t.invoiceId) ?? { charges: 0, refunds: 0, paid: 0 };
      if (t.kind === "expense") e.charges += t.amountCents;
      else if (t.kind === "refund") e.refunds += t.amountCents;
      else if (t.kind === "card_payment" && t.status === "realized") e.paid += t.amountCents;
      byInvoice.set(t.invoiceId, e);
    }
    const seen = new Set<string>();
    for (const inv of invoices) {
      const card = cardById.get(inv.cardId)!;
      const totals = byInvoice.get(inv.id) ?? { charges: 0, refunds: 0, paid: 0 };
      const key = `${inv.cardId}|${inv.closingDate}`;
      seen.add(key);
      const virtual = virtualInvoiceCharges.get(key)?.amount ?? 0;
      const outstanding = totals.charges + virtual - totals.refunds - totals.paid - (scheduledPaymentsByInvoice.get(inv.id) ?? 0);
      if (outstanding <= 0) continue;
      const date = inv.dueDate < today ? today : inv.dueDate;
      if (date > to) continue;
      const label = `Fatura ${card.name} (${inv.reference})${inv.dueDate < today ? " — vencida" : ""}`;
      if (inv.dueDate < today) overdue.push({ date: inv.dueDate, label, amountCents: outstanding, kind: "expense" });
      push(date, -outstanding, label, "invoice", "confirmed", inv.id);
    }
    for (const [key, v] of virtualInvoiceCharges) {
      if (seen.has(key) || v.dueDate > to) continue;
      push(v.dueDate, -v.amount, `Fatura ${v.label} (recorrências previstas)`, "invoice", "confirmed");
    }
  }

  // 4) Aportes planejados e dinheiro já reservado para metas nas contas de gasto.
  let reserved = 0;
  if (opts.includeGoalContributions !== false) {
    const goals = await listGoals(ctx);
    for (const g of goals) {
      if (g.access !== "owner") continue;
      const holdingIsSpending = !g.goal.holdingAccountId || spending.has(g.goal.holdingAccountId);
      if (holdingIsSpending && g.balances.balanceCents > 0) reserved += g.balances.balanceCents;
      if (g.goal.status !== "active" || g.diagnosis.remainingCents <= 0) continue;
      const planned = g.goal.plannedMonthlyCents ?? g.diagnosis.required.perPeriodCents ?? 0;
      if (planned <= 0) continue;
      const end = g.goal.targetDate && g.goal.targetDate < to ? g.goal.targetDate : to;
      let remaining = g.diagnosis.remainingCents;
      for (const date of contributionDates(today, end, g.goal.contributionDay)) {
        let amount = planned;
        if (date.slice(0, 7) === today.slice(0, 7)) amount = Math.max(0, planned - g.diagnosis.contributedThisMonthCents);
        amount = Math.min(amount, remaining);
        if (amount <= 0) continue;
        remaining -= amount;
        events.push({ date, amountCents: -amount, label: `Aporte planejado: ${g.goal.name}`, kind: "goal_contribution", certainty: "confirmed", optional: true, sourceId: g.goal.id });
      }
    }
  }

  return {
    availableCents: available,
    reservedForGoalsCents: reserved,
    freeCents: available - reserved,
    spendingAccountIds: [...spending],
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    overdue,
    hasSpendingAccounts: spending.size > 0,
  };
}

export async function cashFlowProjection(ctx: ServiceContext, days = 60, includeGoals = true): Promise<{ cash: CashContext; projection: CashFlowProjection }> {
  const cash = await buildCashContext(ctx, days);
  const projection = projectCashFlow({
    startDate: ctx.today,
    endDate: addDays(ctx.today, days),
    openingCents: cash.freeCents,
    events: cash.events,
    includeOptional: includeGoals,
  });
  return { cash, projection };
}
