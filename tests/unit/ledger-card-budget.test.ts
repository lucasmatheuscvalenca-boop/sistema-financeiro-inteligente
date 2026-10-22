import { describe, expect, it } from "vitest";
import { evaluateBudget, simulateBudgetAdjustments } from "@/domain/budget";
import { buildInstallmentSchedule, invoiceForPurchase, invoiceStatus, limitUsage } from "@/domain/credit-card";
import {
  accountBalances,
  expensesByCategory,
  invoiceTotals,
  monthTotals,
  validateLedgerTx,
  type LedgerTx,
} from "@/domain/ledger";

const cycle = { closingDay: 25, dueDay: 5 };

describe("faturas de cartão", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento vai para a próxima", () => {
    expect(invoiceForPurchase("2026-10-24", cycle)).toEqual({ closingDate: "2026-10-25", dueDate: "2026-11-05", reference: "2026-11" });
    expect(invoiceForPurchase("2026-10-25", cycle)).toEqual({ closingDate: "2026-11-25", dueDate: "2026-12-05", reference: "2026-12" });
  });

  it("vencimento depois do fechamento no mesmo mês", () => {
    expect(invoiceForPurchase("2026-10-02", { closingDay: 3, dueDay: 10 })).toEqual({
      closingDate: "2026-10-03",
      dueDate: "2026-10-10",
      reference: "2026-10",
    });
  });

  it("fechamento no dia 31 em fevereiro", () => {
    expect(invoiceForPurchase("2026-02-15", { closingDay: 31, dueDay: 10 }).closingDate).toBe("2026-02-28");
  });

  it("parcelas caem em faturas consecutivas e somam o total", () => {
    const schedule = buildInstallmentSchedule({ totalCents: 100000, count: 3, firstDate: "2026-10-20", cycle });
    expect(schedule.map((s) => s.amountCents)).toEqual([33334, 33333, 33333]);
    expect(schedule.map((s) => s.invoice!.dueDate)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
    expect(schedule.map((s) => s.date)).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
    expect(() => buildInstallmentSchedule({ totalCents: 100, count: 0, firstDate: "2026-10-20" })).toThrow();
  });

  it("status da fatura", () => {
    const invoice = invoiceForPurchase("2026-10-10", cycle);
    const base = { invoice, cycle, totalCents: 50000 };
    expect(invoiceStatus({ ...base, paidCents: 0, today: "2026-10-20" })).toBe("open");
    expect(invoiceStatus({ ...base, paidCents: 0, today: "2026-10-28" })).toBe("closed");
    expect(invoiceStatus({ ...base, paidCents: 20000, today: "2026-10-28" })).toBe("partially_paid");
    expect(invoiceStatus({ ...base, paidCents: 50000, today: "2026-10-28" })).toBe("paid");
    expect(invoiceStatus({ ...base, paidCents: 0, today: "2026-11-06" })).toBe("overdue");
  });

  it("parcelas futuras comprometem o limite", () => {
    const usage = limitUsage(500000, 100000 + 66666);
    expect(usage.availableCents).toBe(333334);
    expect(usage.overLimit).toBe(false);
    expect(limitUsage(1000, 1500).overLimit).toBe(true);
  });
});

describe("regras contábeis", () => {
  const accounts = [
    { id: "corrente", initialBalanceCents: 100000 },
    { id: "poupanca", initialBalanceCents: 0 },
  ];

  it("transferência entre contas próprias não é receita nem despesa", () => {
    const txs: LedgerTx[] = [
      { id: "t1", kind: "transfer", status: "realized", amountCents: 30000, date: "2026-10-10", accountId: "corrente", toAccountId: "poupanca" },
    ];
    const totals = monthTotals(txs, "2026-10");
    expect(totals.realized).toEqual({ incomeCents: 0, expenseCents: 0, netCents: 0 });
    const balances = accountBalances(accounts, txs);
    expect(balances.get("corrente")).toBe(70000);
    expect(balances.get("poupanca")).toBe(30000);
  });

  it("compra no cartão + pagamento da fatura não gera dupla contagem", () => {
    const txs: LedgerTx[] = [
      { id: "c1", kind: "expense", status: "realized", amountCents: 20000, date: "2026-10-12", cardId: "visa", invoiceId: "inv1", categoryId: "mercado" },
      { id: "p1", kind: "card_payment", status: "realized", amountCents: 20000, date: "2026-10-30", accountId: "corrente", cardId: "visa", invoiceId: "inv1" },
    ];
    const totals = monthTotals(txs, "2026-10");
    expect(totals.realized.expenseCents).toBe(20000);
    expect(accountBalances(accounts, txs).get("corrente")).toBe(80000);
    expect(invoiceTotals(txs)).toMatchObject({ totalCents: 20000, paymentsCents: 20000, outstandingCents: 0 });
    expect(expensesByCategory(txs).get("mercado")).toBe(20000);
  });

  it("estorno reduz a despesa da categoria e a fatura", () => {
    const txs: LedgerTx[] = [
      { id: "c1", kind: "expense", status: "realized", amountCents: 20000, date: "2026-10-12", cardId: "visa", categoryId: "roupas" },
      { id: "r1", kind: "refund", status: "realized", amountCents: 5000, date: "2026-10-15", cardId: "visa", categoryId: "roupas" },
    ];
    expect(monthTotals(txs, "2026-10").realized.expenseCents).toBe(15000);
    expect(invoiceTotals(txs).totalCents).toBe(15000);
    expect(expensesByCategory(txs).get("roupas")).toBe(15000);
  });

  it("receita estimada (comissão) não entra no saldo disponível", () => {
    const txs: LedgerTx[] = [
      { id: "s", kind: "income", status: "realized", amountCents: 500000, date: "2026-10-05", accountId: "corrente" },
      { id: "c", kind: "income", status: "estimated", amountCents: 200000, date: "2026-10-20", accountId: "corrente" },
    ];
    expect(accountBalances(accounts, txs).get("corrente")).toBe(600000);
    const totals = monthTotals(txs, "2026-10");
    expect(totals.realized.incomeCents).toBe(500000);
    expect(totals.estimated.incomeCents).toBe(200000);
  });

  it("lançamentos anteriores à data do saldo inicial não alteram o saldo", () => {
    const txs: LedgerTx[] = [
      { id: "old", kind: "expense", status: "realized", amountCents: 5000, date: "2026-09-30", accountId: "corrente" },
      { id: "new", kind: "expense", status: "realized", amountCents: 2000, date: "2026-10-01", accountId: "corrente" },
    ];
    const balances = accountBalances([{ id: "corrente", initialBalanceCents: 100000, initialBalanceDate: "2026-10-01" }], txs);
    expect(balances.get("corrente")).toBe(98000);
    // mas a despesa antiga continua no resultado de setembro
    expect(monthTotals(txs, "2026-09").realized.expenseCents).toBe(5000);
  });

  it("valida a forma das transações", () => {
    expect(() => validateLedgerTx({ kind: "transfer", status: "realized", amountCents: 100, date: "2026-10-01", accountId: "a", toAccountId: "a" })).toThrow();
    expect(() => validateLedgerTx({ kind: "expense", status: "realized", amountCents: 100, date: "2026-10-01", accountId: "a", cardId: "c" })).toThrow();
    expect(() => validateLedgerTx({ kind: "expense", status: "realized", amountCents: -5, date: "2026-10-01", accountId: "a" })).toThrow();
    expect(() => validateLedgerTx({ kind: "income", status: "realized", amountCents: 100, date: "2026-10-01", cardId: "c" })).toThrow();
    expect(() => validateLedgerTx({ kind: "card_payment", status: "realized", amountCents: 100, date: "2026-10-01", accountId: "a" })).toThrow();
  });
});

describe("orçamento", () => {
  const lines = [
    { categoryId: "lazer", categoryName: "Lazer", limitCents: 50000 },
    { categoryId: "mercado", categoryName: "Mercado", limitCents: 100000, alertThresholdPct: 90 },
  ];

  it("identifica orçamento excedido, alerta e projeção pelo ritmo", () => {
    const evaluation = evaluateBudget({
      month: "2026-10",
      today: "2026-10-10",
      lines,
      spentByCategory: new Map([
        ["lazer", 60000],
        ["mercado", 40000],
        ["transporte", 15000],
      ]),
      scheduledByCategory: new Map([["mercado", 10000]]),
    });
    const lazer = evaluation.lines.find((l) => l.categoryId === "lazer")!;
    const mercado = evaluation.lines.find((l) => l.categoryId === "mercado")!;
    expect(lazer.status).toBe("exceeded");
    expect(lazer.remainingCents).toBe(-10000);
    expect(mercado.committedCents).toBe(50000);
    expect(mercado.status).toBe("ok");
    // 40.000 em 10 de 31 dias -> ritmo projeta 124.000
    expect(mercado.projectedCents).toBe(124000);
    expect(mercado.projectedStatus).toBe("exceeded");
    expect(evaluation.unbudgetedSpentCents).toBe(15000);
  });

  it("simula ajustes sem alterar os dados", () => {
    const evaluation = evaluateBudget({ month: "2026-10", today: "2026-10-31", lines, spentByCategory: new Map([["lazer", 45000]]) });
    expect(evaluation.lines[0]!.status).toBe("warning");
    const sim = simulateBudgetAdjustments(evaluation, [{ categoryId: "lazer", newLimitCents: 30000 }], 500000);
    expect(sim.before.marginCents).toBe(350000);
    expect(sim.after.marginCents).toBe(370000);
    expect(sim.lines[0]!.newStatus).toBe("exceeded");
    expect(lines[0]!.limitCents).toBe(50000);
  });
});
