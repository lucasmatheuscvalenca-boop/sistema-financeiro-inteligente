import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ConflictError, ValidationError } from "@/server/errors";
import { createAccount, listAccountsWithBalances, setActualBalance } from "@/server/services/accounts";
import { getBudgetEvaluation, upsertBudget } from "@/server/services/budgets";
import { createCard, listCardsOverview, listInvoices, payInvoice } from "@/server/services/cards";
import { buildCashContext } from "@/server/services/cashflow";
import { listCategories } from "@/server/services/categories";
import { addContribution, createGoal, getGoal, goalAllocationPlan } from "@/server/services/goals";
import { createRecurrence, materializeOccurrence, pendingOccurrences } from "@/server/services/recurrences";
import { getFinancialSnapshot } from "@/server/services/snapshot";
import { confirmTransaction, createTransaction, deleteTransaction, listTransactions, transactionHistory, updateTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("movimentações com persistência real", () => {
  it("transferência entre contas próprias não vira receita nem despesa", async () => {
    const u = await createUser("Transfer");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 100000, initialBalanceDate: "2026-10-01" });
    const pp = await createAccount(u, { name: "Poupança", type: "savings", initialBalanceCents: 0, initialBalanceDate: "2026-10-01" });
    await createTransaction(u, { kind: "transfer", amountCents: 40000, date: "2026-10-15", description: "Guardar", accountId: cc.id, toAccountId: pp.id });
    const snap = await getFinancialSnapshot(u);
    expect(snap.monthTotals.realized).toEqual({ incomeCents: 0, expenseCents: 0, netCents: 0 });
    const balances = await listAccountsWithBalances(u);
    expect(balances.find((x) => x.id === cc.id)!.balanceCents).toBe(60000);
    expect(balances.find((x) => x.id === pp.id)!.balanceCents).toBe(40000);
    expect(snap.totals.reserveCents).toBe(40000); // poupança marcada como reserva por padrão
    await expect(createTransaction(u, { kind: "transfer", amountCents: 1, date: "2026-10-15", description: "x", accountId: cc.id, toAccountId: cc.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("compra no cartão + pagamento da fatura = uma única despesa", async () => {
    const u = await createUser("Cartao");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 500000, initialBalanceDate: "2026-09-01" });
    const card = await createCard(u, { name: "Visa", limitCents: 300000, closingDay: 25, dueDay: 5 });
    const mercado = (await listCategories(u, { kind: "expense" })).find((c) => c.name === "Mercado")!;
    const [purchase] = await createTransaction(u, { kind: "expense", amountCents: 20000, date: "2026-09-12", description: "Compra", cardId: card.id, categoryId: mercado.id });
    expect(purchase!.invoiceId).toBeTruthy();
    const invoices = await listInvoices(u, card.id);
    expect(invoices[0]!.dueDate).toBe("2026-10-05");
    await payInvoice(u, { invoiceId: purchase!.invoiceId!, accountId: cc.id, amountCents: 20000, date: "2026-10-05" });
    const sept = await getFinancialSnapshot(u, "2026-09");
    const oct = await getFinancialSnapshot(u, "2026-10");
    expect(sept.monthTotals.realized.expenseCents).toBe(20000);
    expect(oct.monthTotals.realized.expenseCents).toBe(0); // o pagamento não é despesa
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(480000);
    const [paid] = await listInvoices(u, card.id);
    expect(paid!.status).toBe("paid");
    expect(paid!.outstandingCents).toBe(0);
    // essencial herdado da categoria
    expect(purchase!.essential).toBe(true);
  });

  it("parcelamento no cartão distribui parcelas nas faturas e compromete o limite", async () => {
    const u = await createUser("Parcelas");
    const card = await createCard(u, { name: "Master", limitCents: 500000, closingDay: 25, dueDay: 5 });
    const created = await createTransaction(u, { kind: "expense", amountCents: 120000, date: "2026-10-20", description: "Notebook", cardId: card.id, installments: 3 });
    expect(created.map((t) => t.amountCents)).toEqual([40000, 40000, 40000]);
    expect(created.map((t) => t.description)).toEqual(["Notebook (1/3)", "Notebook (2/3)", "Notebook (3/3)"]);
    expect(created.map((t) => t.status)).toEqual(["realized", "scheduled", "scheduled"]);
    const overview = (await listCardsOverview(u))[0]!;
    expect(overview.invoices).toHaveLength(3);
    expect(overview.limit.committedCents).toBe(120000);
    expect(overview.limit.availableCents).toBe(380000);
    // excluir o plano remove todas as parcelas
    expect(await deleteTransaction(u, created[1]!.id, "plan")).toBe(3);
    expect(await listTransactions(u)).toHaveLength(0);
  });

  it("recorrência gera ocorrências virtuais e impede lançar a mesma ocorrência duas vezes", async () => {
    const u = await createUser("Recorrente");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 300000 });
    const r = await createRecurrence(u, { kind: "expense", amountCents: 150000, description: "Aluguel", frequency: "monthly", startDate: "2026-08-05", accountId: cc.id });
    const pending = await pendingOccurrences(u, "2026-10-01", "2026-12-31");
    expect(pending.map((p) => p.date)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    await materializeOccurrence(u, r.id, "2026-10-05");
    await expect(materializeOccurrence(u, r.id, "2026-10-05")).rejects.toBeInstanceOf(ConflictError);
    await expect(materializeOccurrence(u, r.id, "2026-10-06")).rejects.toBeInstanceOf(ValidationError);
    expect((await pendingOccurrences(u, "2026-10-01", "2026-12-31")).map((p) => p.date)).toEqual(["2026-11-05", "2026-12-05"]);
    const cash = await buildCashContext(u, 60);
    expect(cash.events.filter((e) => e.label === "Aluguel").map((e) => e.date)).toEqual(["2026-11-05", "2026-12-05"]);
  });

  it("comissão estimada só entra no saldo depois de confirmada; histórico registra alterações", async () => {
    const u = await createUser("Comissao");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 0 });
    const [c] = await createTransaction(u, { kind: "income", status: "estimated", amountCents: 200000, date: "2026-10-28", description: "Comissão esperada", accountId: cc.id, incomeType: "commission" });
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(0);
    const snap = await getFinancialSnapshot(u);
    expect(snap.monthEnd!.confirmedCents).toBe(0);
    expect(snap.monthEnd!.withEstimatedCents).toBe(200000);
    await expect(createTransaction(u, { kind: "income", status: "realized", amountCents: 1, date: "2026-12-01", description: "x", accountId: cc.id })).rejects.toBeInstanceOf(ValidationError);
    await updateTransaction(u, c!.id, { amountCents: 180000 });
    await confirmTransaction(u, c!.id, { date: "2026-10-21" });
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(180000);
    const history = await transactionHistory(u, c!.id);
    expect(history.map((h) => h.action)).toEqual(["create", "update", "update"]);
    expect(history[1]!.changes.amountCents).toEqual({ from: 200000, to: 180000 });
  });

  it("ajuste de saldo não cria lançamentos fictícios", async () => {
    const u = await createUser("Ajuste");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 10000, initialBalanceDate: "2026-10-01" });
    await createTransaction(u, { kind: "expense", amountCents: 3000, date: "2026-10-10", description: "x", accountId: cc.id });
    await setActualBalance(u, cc.id, 50000);
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(50000);
    expect(await listTransactions(u)).toHaveLength(1);
  });

  it("orçamento excedido com subcategorias somadas na categoria-mãe", async () => {
    const u = await createUser("Orcamento");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 900000 });
    const cats = await listCategories(u, { kind: "expense" });
    const moradia = cats.find((c) => c.name === "Moradia")!;
    const aluguel = cats.find((c) => c.name === "Aluguel")!;
    await upsertBudget(u, { categoryId: moradia.id, month: "2026-10", limitCents: 150000 });
    await createTransaction(u, { kind: "expense", amountCents: 140000, date: "2026-10-05", description: "Aluguel", accountId: cc.id, categoryId: aluguel.id });
    await createTransaction(u, { kind: "expense", amountCents: 30000, date: "2026-10-28", description: "Conserto", accountId: cc.id, categoryId: moradia.id });
    const evaluation = await getBudgetEvaluation(u, "2026-10");
    const line = evaluation.lines[0]!;
    expect(line.spentCents).toBe(140000);
    expect(line.scheduledCents).toBe(30000);
    expect(line.status).toBe("exceeded");
    const income = (await listCategories(u, { kind: "income" }))[0]!;
    await expect(upsertBudget(u, { categoryId: income.id, month: "2026-10", limitCents: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("aporte com conta de origem cria transferência; priorização aponta conflito", async () => {
    const u = await createUser("Metas");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 500000, initialBalanceDate: "2026-10-01" });
    const inv = await createAccount(u, { name: "Investimentos", type: "investment", purpose: "goals", initialBalanceCents: 0, initialBalanceDate: "2026-10-01" });
    await createRecurrence(u, { kind: "income", amountCents: 500000, description: "Salário", frequency: "monthly", startDate: "2026-01-05", accountId: cc.id });
    await createRecurrence(u, { kind: "expense", amountCents: 400000, description: "Custos fixos", frequency: "monthly", startDate: "2026-01-06", accountId: cc.id });
    const viagem = await createGoal(u, { name: "Viagem", targetCents: 600000, targetDate: "2027-03-15", priority: 1, holdingAccountId: inv.id });
    await createGoal(u, { name: "Carro", targetCents: 3000000, targetDate: "2027-10-01", priority: 3 });
    await addContribution(u, viagem.id, { amountCents: 100000, date: "2026-10-20", sourceAccountId: cc.id });
    const balances = await listAccountsWithBalances(u);
    expect(balances.find((x) => x.id === cc.id)!.balanceCents).toBe(400000);
    expect(balances.find((x) => x.id === inv.id)!.balanceCents).toBe(100000);
    expect((await getFinancialSnapshot(u)).monthTotals.realized.expenseCents).toBe(0);
    const view = await getGoal(u, viagem.id);
    expect(view.balances.balanceCents).toBe(100000);
    expect(view.diagnosis.required.perPeriodCents).toBe(100000); // 500.000 restantes em 5 aportes
    const plan = await goalAllocationPlan(u);
    expect(plan.capacityCents).toBe(100000);
    expect(plan.allocation.hasConflict).toBe(true);
    expect(plan.allocation.allocations.map((x) => [x.name, x.allocatedCents])).toEqual([
      ["Viagem", 100000],
      ["Carro", 0],
    ]);
  });
});
