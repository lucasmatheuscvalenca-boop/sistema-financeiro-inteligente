import "dotenv/config";
import { eq } from "drizzle-orm";
import { addDays, addMonths, startOfMonth, type ISODate } from "../src/domain/dates";
import { closeDb, getDb } from "../src/server/db/client";
import * as s from "../src/server/db/schema";
import { createAccount } from "../src/server/services/accounts";
import { saveBriefingSection } from "../src/server/services/briefing";
import { upsertBudget } from "../src/server/services/budgets";
import { createCard, listInvoices, payInvoice } from "../src/server/services/cards";
import { listCategories } from "../src/server/services/categories";
import { makeContext } from "../src/server/services/context";
import { saveEmergencySettings } from "../src/server/services/emergency";
import { addContribution, createGoal } from "../src/server/services/goals";
import { upsertAsset, upsertDebt } from "../src/server/services/net-worth";
import { completeOnboarding, selectMascot } from "../src/server/services/preferences";
import { createRecurrence, materializeOccurrence, pendingOccurrences } from "../src/server/services/recurrences";
import { saveRetirementPlan } from "../src/server/services/retirement";
import { createTransaction } from "../src/server/services/transactions";
import { registerUser } from "../src/server/services/users";

/**
 * Conta de demonstração com dados 100% FICTÍCIOS, para conhecer o produto sem digitar nada.
 * Recriada a cada execução (apaga só a conta com este e-mail).
 */
const EMAIL = process.env.DEMO_EMAIL ?? "demo@rumo.exemplo";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demonstracao-2026";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Seed de demonstração bloqueado em produção (defina ALLOW_DEMO_SEED=1 para forçar).");
  }
  const db = getDb();
  await db.delete(s.users).where(eq(s.users.email, EMAIL));
  const user = await registerUser(db, { name: "Pessoa Demonstração", email: EMAIL, password: PASSWORD });
  const ctx = makeContext(db, user.id, process.env.APP_TIMEZONE ?? "America/Sao_Paulo");
  const today = ctx.today;
  const monthStart = startOfMonth(today);
  const threeMonthsAgo = addMonths(monthStart, -3);

  await selectMascot(ctx, "coruja");
  await saveBriefingSection(ctx, "personal", { preferredName: "Demo", birthYear: 1991, employmentStatus: "clt", household: "couple", dependents: 0, country: "BR", currency: "BRL" }, { complete: true });
  await saveBriefingSection(
    ctx,
    "financial",
    { monthlyNetIncomeCents: 850000, essentialExpensesCents: 420000, variableExpensesCents: 180000, hasDebts: true, debtsMonthlyCents: 65000, debtsTotalCents: 1450000, currentReserveCents: 1200000, investmentsCents: 2500000 },
    { complete: true },
  );
  await saveBriefingSection(ctx, "life", { shortTermGoals: "Viagem para o Chile", mediumTermGoals: "Trocar de carro", longTermGoals: "Aposentar aos 60", financialIndependence: true, desiredRetirementAge: 60, desiredRetirementIncomeCents: 900000, priorities: ["seguranca", "experiencias"] }, { complete: true });
  await completeOnboarding(ctx);

  const cats = await listCategories(ctx);
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  const corrente = await createAccount(ctx, { name: "Conta corrente (fictícia)", type: "checking", initialBalanceCents: 420000, initialBalanceDate: threeMonthsAgo });
  const reserva = await createAccount(ctx, { name: "Reserva (fictícia)", type: "savings", initialBalanceCents: 1200000, initialBalanceDate: threeMonthsAgo });
  const investimentos = await createAccount(ctx, { name: "Investimentos (fictícia)", type: "investment", purpose: "goals", initialBalanceCents: 300000, initialBalanceDate: threeMonthsAgo });
  const cartao = await createCard(ctx, { name: "Cartão (fictício)", limitCents: 800000, closingDay: 25, dueDay: 5, defaultPaymentAccountId: corrente.id });

  const recs = [
    await createRecurrence(ctx, { kind: "income", amountCents: 850000, description: "Salário", frequency: "monthly", dayOfMonth: 5, startDate: addDays(threeMonthsAgo, 4), accountId: corrente.id, categoryId: cat("Salário"), incomeType: "salary" }),
    await createRecurrence(ctx, { kind: "expense", amountCents: 220000, description: "Aluguel", frequency: "monthly", dayOfMonth: 8, startDate: addDays(threeMonthsAgo, 7), accountId: corrente.id, categoryId: cat("Moradia"), essential: true }),
    await createRecurrence(ctx, { kind: "expense", amountCents: 38000, description: "Luz, água e internet", frequency: "monthly", dayOfMonth: 12, startDate: addDays(threeMonthsAgo, 11), accountId: corrente.id, categoryId: cat("Contas da casa"), essential: true }),
    await createRecurrence(ctx, { kind: "expense", amountCents: 65000, description: "Parcela do empréstimo", frequency: "monthly", dayOfMonth: 15, startDate: addDays(threeMonthsAgo, 14), accountId: corrente.id, categoryId: cat("Outras despesas"), essential: true }),
    await createRecurrence(ctx, { kind: "expense", amountCents: 5590, description: "Streaming", frequency: "monthly", dayOfMonth: 20, startDate: addDays(threeMonthsAgo, 19), cardId: cartao.id, categoryId: cat("Assinaturas") }),
    await createRecurrence(ctx, { kind: "transfer", amountCents: 50000, description: "Guardar para a reserva", frequency: "monthly", dayOfMonth: 6, startDate: addDays(threeMonthsAgo, 5), accountId: corrente.id, toAccountId: reserva.id }),
  ];
  // Ocorrências passadas confirmadas como realizadas.
  for (const occ of await pendingOccurrences(ctx, threeMonthsAgo, addDays(today, -1), recs)) {
    await materializeOccurrence(ctx, occ.recurrence.id, occ.date, { status: "realized" });
  }

  // Gastos variáveis (valores fixos para o resultado ser reproduzível).
  const variable: Array<[number, number, string, string, "card" | "account"]> = [
    [2, 48700, "Supermercado", "Mercado", "card"],
    [9, 31250, "Feira e hortifrúti", "Mercado", "account"],
    [13, 8990, "Aplicativo de transporte", "Transporte", "card"],
    [16, 12400, "Restaurante", "Restaurantes e delivery", "card"],
    [21, 52300, "Supermercado", "Mercado", "card"],
    [24, 6500, "Farmácia", "Saúde", "account"],
    [27, 15900, "Cinema e lanche", "Lazer", "card"],
  ];
  for (let m = 0; m <= 3; m++) {
    const base = addMonths(threeMonthsAgo, m);
    for (const [day, amount, desc, category, via] of variable) {
      const date = addDays(base, day - 1) as ISODate;
      if (date >= today) continue;
      await createTransaction(ctx, { kind: "expense", amountCents: amount + m * 350, date, description: desc, categoryId: cat(category), ...(via === "card" ? { cardId: cartao.id } : { accountId: corrente.id }) });
    }
  }
  await createTransaction(ctx, { kind: "expense", amountCents: 240000, date: addDays(monthStart, 2) < today ? addDays(monthStart, 2) : today, description: "Notebook em 6x", categoryId: cat("Compras"), cardId: cartao.id, installments: 6 });

  // Faturas já vencidas foram pagas em dia (pagamento da fatura não é despesa nova).
  for (const inv of await listInvoices(ctx, cartao.id)) {
    if (inv.dueDate < today && inv.outstandingCents > 0) {
      await payInvoice(ctx, { invoiceId: inv.id, accountId: corrente.id, amountCents: inv.outstandingCents, date: inv.dueDate });
    }
  }

  const month = today.slice(0, 7);
  for (const [name, limit] of [["Mercado", 120000], ["Restaurantes e delivery", 30000], ["Lazer", 25000], ["Transporte", 20000]] as const) {
    await upsertBudget(ctx, { categoryId: cat(name), month, limitCents: limit });
  }

  const viagem = await createGoal(ctx, { name: "Viagem ao Chile", kind: "travel", targetCents: 1500000, targetDate: addMonths(today, 9), priority: 2, holdingAccountId: investimentos.id, contributionDay: 6, expectedAnnualReturnBps: 1000 });
  await addContribution(ctx, viagem.id, { amountCents: 300000, date: threeMonthsAgo, note: "Saldo inicial" });
  await createGoal(ctx, { name: "Troca de carro", kind: "vehicle", targetCents: 4000000, targetDate: addMonths(today, 30), priority: 3 });

  await saveEmergencySettings(ctx, { targetMonths: 6, minimumMonths: 3, desiredMonthsToComplete: 18 });
  await upsertAsset(ctx, { name: "Tesouro IPCA+ (fictício)", category: "retirement", valueCents: 2500000, provenance: "informed", valuedAt: today, liquid: false });
  await upsertDebt(ctx, { name: "Empréstimo pessoal (fictício)", category: "loan", outstandingCents: 1450000, monthlyPaymentCents: 65000, interestRateMonthlyBps: 189, remainingInstallments: 28, provenance: "informed", valuedAt: today });
  await saveRetirementPlan(ctx, {
    currentAge: 35,
    retirementAge: 60,
    lifeExpectancy: 90,
    desiredMonthlyIncomeCents: 900000,
    otherMonthlyIncomeCents: 250000,
    currentWealthCents: 2500000,
    monthlyContributionCents: 80000,
    annualInflation: 0.045,
    annualNominalReturn: 0.105,
    safetyMarginPct: 0.1,
    mode: "consume",
  });

  console.log("Conta de demonstração criada (dados fictícios).");
  console.log(`  E-mail: ${EMAIL}`);
  console.log(`  Senha:  ${PASSWORD}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("Falha no seed de demonstração:", err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
