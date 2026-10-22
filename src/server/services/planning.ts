import { and, eq } from "drizzle-orm";
import { addMonthsToKey, endOfMonth, monthKey, startOfMonth } from "@/domain/dates";
import { average } from "@/domain/insights";
import type { Cents } from "@/domain/money";
import { monthlyFactor, type Frequency } from "@/domain/recurrence";
import * as s from "../db/schema";
import type { ServiceContext } from "./context";
import { loadTransactions } from "./ledger";
import { listBudgets } from "./budgets";

export interface MonthlyBasis {
  incomeCents: Cents;
  incomeSource: "recurring" | "average" | "profile" | "none";
  expenseCents: Cents;
  expenseSource: "average" | "budgets" | "recurring" | "profile" | "none";
  essentialCents: Cents;
  essentialSource: "average" | "profile" | "none";
  nonEssentialCents: Cents;
  capacityCents: Cents;
  premises: string[];
  monthsOfHistory: number;
}

/**
 * Estimativa mensal usada no planejamento (metas, reserva, aposentadoria). Usa a base
 * mais conservadora disponível e informa de onde veio cada número.
 */
export async function estimateMonthlyBasis(ctx: ServiceContext): Promise<MonthlyBasis> {
  const current = monthKey(ctx.today);
  const months = [1, 2, 3].map((i) => addMonthsToKey(current, -i));
  const txs = await loadTransactions(ctx, { from: startOfMonth(months[2]!), to: endOfMonth(months[0]!) });
  const per = months.map((m) => {
    let income = 0;
    let expense = 0;
    let essential = 0;
    for (const t of txs) {
      if (t.status !== "realized" || monthKey(t.date) !== m) continue;
      if (t.kind === "income") income += t.amountCents;
      else if (t.kind === "expense") {
        expense += t.amountCents;
        if (t.essential) essential += t.amountCents;
      } else if (t.kind === "refund") {
        expense -= t.amountCents;
        if (t.essential) essential -= t.amountCents;
      }
    }
    return { m, income, expense, essential, hasData: income > 0 || expense > 0 };
  });
  const withData = per.filter((p) => p.hasData);
  const [profile] = await ctx.db.select().from(s.financialProfiles).where(eq(s.financialProfiles.userId, ctx.userId)).limit(1);
  const recurrences = await ctx.db
    .select()
    .from(s.recurrences)
    .where(and(eq(s.recurrences.userId, ctx.userId), eq(s.recurrences.active, true)));
  const recurringIncome = Math.round(
    recurrences
      .filter((r) => r.kind === "income" && r.certainty === "scheduled")
      .reduce((sum, r) => sum + r.amountCents * monthlyFactor(r.frequency as Frequency, r.interval), 0),
  );
  const recurringExpense = Math.round(
    recurrences.filter((r) => r.kind === "expense").reduce((sum, r) => sum + r.amountCents * monthlyFactor(r.frequency as Frequency, r.interval), 0),
  );
  const budgets = await listBudgets(ctx, current);
  const budgetTotal = budgets.reduce((sum, b) => sum + b.limitCents, 0);
  const premises: string[] = [];

  let incomeCents = 0;
  let incomeSource: MonthlyBasis["incomeSource"] = "none";
  const avgIncome = average(withData.map((p) => p.income));
  if (recurringIncome > 0) {
    incomeCents = recurringIncome;
    incomeSource = "recurring";
    premises.push("Renda mensal: soma das receitas recorrentes confirmadas.");
  } else if (avgIncome > 0) {
    incomeCents = avgIncome;
    incomeSource = "average";
    premises.push(`Renda mensal: média realizada dos últimos ${withData.length} mês(es).`);
  } else if (profile?.monthlyNetIncomeCents) {
    incomeCents = profile.monthlyNetIncomeCents;
    incomeSource = "profile";
    premises.push("Renda mensal: valor informado no briefing.");
  } else {
    premises.push("Renda mensal desconhecida: cadastre receitas ou complete o briefing.");
  }

  const avgExpense = average(withData.map((p) => p.expense));
  const profileExpense = (profile?.essentialExpensesCents ?? 0) + (profile?.variableExpensesCents ?? 0);
  const candidates: Array<[MonthlyBasis["expenseSource"], Cents]> = [
    ["average", avgExpense],
    ["budgets", budgetTotal],
    ["recurring", recurringExpense],
    ["profile", withData.length === 0 ? profileExpense : 0],
  ];
  const [expenseSource, expenseCents] = candidates.reduce<[MonthlyBasis["expenseSource"], Cents]>((best, c) => (c[1] > best[1] ? c : best), ["none", 0]);
  if (expenseSource !== "none") {
    const label = { average: "média realizada dos últimos meses", budgets: "soma dos orçamentos do mês", recurring: "despesas recorrentes", profile: "valores informados no briefing", none: "" }[expenseSource];
    premises.push(`Despesa mensal: ${label} (a maior entre as bases disponíveis, por prudência).`);
  }

  const avgEssential = average(withData.map((p) => p.essential));
  let essentialCents = avgEssential;
  let essentialSource: MonthlyBasis["essentialSource"] = avgEssential > 0 ? "average" : "none";
  if (essentialCents <= 0 && profile?.essentialExpensesCents) {
    essentialCents = profile.essentialExpensesCents;
    essentialSource = "profile";
  }
  return {
    incomeCents,
    incomeSource,
    expenseCents,
    expenseSource,
    essentialCents,
    essentialSource,
    nonEssentialCents: Math.max(0, expenseCents - essentialCents),
    capacityCents: incomeCents - expenseCents,
    premises,
    monthsOfHistory: withData.length,
  };
}
