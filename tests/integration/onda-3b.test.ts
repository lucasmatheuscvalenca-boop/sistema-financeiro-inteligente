import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { createAccount, listAccountsWithBalances } from "@/server/services/accounts";
import { computeAlertCandidates } from "@/server/services/alerts";
import { createCard } from "@/server/services/cards";
import { pendingOccurrences } from "@/server/services/recurrences";
import { reserveUses, recordReserveUse } from "@/server/services/reserve-use";
import { createRecurrence } from "@/server/services/recurrences";
import { autoCopyBudgets, deleteBudget, listBudgets, upsertBudget } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { at, createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

describe("onda 3B", () => {
  it("usei a reserva: transfere, guarda o motivo e cria a reposição mensal", async () => {
    const u = await createUser("Reserva");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 10_000, initialBalanceDate: "2026-10-01" });
    const res = await createAccount(u, { name: "Reserva", type: "savings", purpose: "reserve", initialBalanceCents: 600_000, initialBalanceDate: "2026-10-01" });
    const r = await recordReserveUse(u, { fromAccountId: res.id, toAccountId: cc.id, amountCents: 120_000, reason: "Conserto do carro", months: 6, refillDay: 5, date: "2026-10-20" });
    expect(r).toEqual({ monthlyCents: 20_000, firstDate: "2026-11-05" });
    const balances = new Map((await listAccountsWithBalances(u)).map((a) => [a.name, a.balanceCents]));
    expect(balances.get("Reserva")).toBe(480_000);
    expect(balances.get("Conta")).toBe(130_000);
    const occ = await pendingOccurrences(u, "2026-10-21", "2027-12-31");
    expect(occ.filter((o) => o.recurrence.description.startsWith("Repor a reserva"))).toHaveLength(6);
    const h = await reserveUses(u);
    expect(h.uses[0]).toMatchObject({ reason: "Conserto do carro", amountCents: 120_000 });
    expect(h.refills[0]).toMatchObject({ amountCents: 20_000, count: 6, endMonth: "2027-04" });
  });

  it("só aceita sair de uma conta de reserva", async () => {
    const u = await createUser("Reserva Errada");
    const a = await createAccount(u, { name: "A", type: "checking" });
    const b = await createAccount(u, { name: "B", type: "checking" });
    await expect(recordReserveUse(u, { fromAccountId: a.id, toAccountId: b.id, amountCents: 100, reason: "teste", months: 3, refillDay: 5, date: "2026-10-20" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("lembretes: fatura fechando e despesa anual chegando entram nos avisos", async () => {
    const u = at(await createUser("Lembretes"), "2026-10-24");
    const cc = await createAccount(u, { name: "Conta", type: "checking", initialBalanceCents: 100_000, initialBalanceDate: "2026-10-01" });
    await createCard(u, { name: "Visa", limitCents: 100_000, closingDay: 25, dueDay: 5 });
    await createRecurrence(u, { kind: "expense", certainty: "estimated", amountCents: 50_000, description: "Seguro do carro", accountId: cc.id, frequency: "yearly", dayOfMonth: 1, startDate: "2026-11-01" });
    const alerts = await computeAlertCandidates(u);
    const titles = alerts.map((a) => a.title);
    expect(titles).toContain("A fatura do Visa fecha amanhã");
    expect(titles).toContain("Seguro do carro vence em 8 dias");
  });
});

describe("orçamento copia o mês anterior sozinho", () => {
  it("copia uma vez no mês atual e não volta a copiar depois que a pessoa apaga", async () => {
    const u = await createUser("Orcamento Auto"); // hoje = 2026-10-21
    const mercado = (await listCategories(u, { kind: "expense" })).find((c) => c.name === "Mercado")!;
    await upsertBudget(u, { categoryId: mercado.id, month: "2026-09", limitCents: 100_000 });
    expect(await autoCopyBudgets(u, "2026-11")).toBeNull();
    expect(await autoCopyBudgets(u, "2026-10")).toEqual({ from: "2026-09", count: 1 });
    const copied = await listBudgets(u, "2026-10");
    expect(copied.map((b) => b.limitCents)).toEqual([100_000]);
    expect(await autoCopyBudgets(u, "2026-10")).toBeNull();
    await deleteBudget(u, copied[0]!.id);
    expect(await autoCopyBudgets(u, "2026-10")).toBeNull();
    expect(await listBudgets(u, "2026-10")).toHaveLength(0);
  });
});

describe("assistente registra gasto por texto", () => {
  it("propõe com categoria e conta, não grava sozinho, e grava ao confirmar", async () => {
    const { askAssistant, setLlmProvider } = await import("@/server/ai/assistant");
    const { chatActions } = await import("@/server/ai/chat-actions");
    const { selectMascot } = await import("@/server/services/preferences");
    const { confirmQuickEntry } = await import("@/server/services/quick-entry");
    const { listTransactions } = await import("@/server/services/transactions");
    setLlmProvider(null);
    const u = await createUser("Gasto Texto");
    await selectMascot(u, "banqueiro");
    await createAccount(u, { name: "Conta do dia a dia", type: "checking" });
    const r = await askAssistant(u, { message: "gastei 80 no mercado" });
    expect(r.answer.text).toMatch(/Despesa de R\$\s80,00: Mercado \(Mercado\), 21\/10\/2026, na conta Conta do dia a dia/);
    expect(await listTransactions(u, {})).toHaveLength(0);
    const actions = chatActions(r.answer.tools);
    const confirm = actions.find((a) => a.kind === "confirm")!;
    expect(actions.map((a) => a.label)).toEqual(["Confirmar e gravar", "Ajustar antes"]);
    await confirmQuickEntry(u, confirm.payload as never);
    // Tocar de novo (ou abrir a conversa em outro aparelho) não duplica.
    await expect(confirmQuickEntry(u, confirm.payload as never)).rejects.toThrow("Este lançamento já foi gravado.");
    const { recordedProposals } = await import("@/server/services/quick-entry");
    expect((await recordedProposals(u, [String(confirm.payload!.proposalId)])).size).toBe(1);
    const txs = await listTransactions(u, {});
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ kind: "expense", amountCents: 8_000, description: "Mercado", date: "2026-10-21" });
    expect(txs[0]!.categoryId).toBeTruthy();
  });
});
