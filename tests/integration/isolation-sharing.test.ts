import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { archiveAccount, createAccount, getAccount, listAccountsWithBalances, setActualBalance, updateAccount } from "@/server/services/accounts";
import { upsertBudget } from "@/server/services/budgets";
import { createCard, getCard, listInvoices, payInvoice } from "@/server/services/cards";
import { listCategories } from "@/server/services/categories";
import type { ServiceContext } from "@/server/services/context";
import { addContribution, createGoal, deleteGoal, getGoal, listGoals, updateGoal } from "@/server/services/goals";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { addDeclaredMemory, listMemory, deleteMemory, updateMemory } from "@/server/services/memory";
import { createRecurrence, getRecurrence, materializeOccurrence } from "@/server/services/recurrences";
import { acceptShare, goalAccess, inviteToGoal, listIncomingShares, revokeShare } from "@/server/services/sharing";
import { getFinancialSnapshot } from "@/server/services/snapshot";
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

let a: Awaited<ReturnType<typeof createUser>>;
let b: Awaited<ReturnType<typeof createUser>>;
let aAccount: string;
let aTx: string;
let aGoal: string;
let aCard: string;
let aRecurrence: string;

beforeAll(async () => {
  a = await createUser("Ana Dona");
  b = await createUser("Bruno Outro");
  aAccount = (await createAccount(a, { name: "Conta da Ana", type: "checking", initialBalanceCents: 500000, initialBalanceDate: "2026-10-01" })).id;
  aTx = (await createTransaction(a, { kind: "expense", amountCents: 12000, date: "2026-10-10", description: "Mercado da Ana", accountId: aAccount }))[0]!.id;
  aGoal = (await createGoal(a, { name: "Viagem da Ana", targetCents: 800000, targetDate: "2027-06-30" })).id;
  aCard = (await createCard(a, { name: "Cartão da Ana", limitCents: 300000, closingDay: 25, dueDay: 5 })).id;
  aRecurrence = (await createRecurrence(a, { kind: "expense", amountCents: 150000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-05", accountId: aAccount })).id;
});

afterAll(async () => {
  await closeDb();
});

async function expectNotFound(p: Promise<unknown>) {
  await expect(p).rejects.toBeInstanceOf(NotFoundError);
}

describe("isolamento entre usuários (acesso cruzado)", () => {
  it("B não lê nem altera dados de A", async () => {
    await expectNotFound(getAccount(b, aAccount));
    await expectNotFound(updateAccount(b, aAccount, { name: "invadido" }));
    await expectNotFound(archiveAccount(b, aAccount));
    await expectNotFound(setActualBalance(b, aAccount, 0));
    await expectNotFound(getTransaction(b, aTx));
    await expectNotFound(updateTransaction(b, aTx, { amountCents: 1 }));
    await expectNotFound(deleteTransaction(b, aTx));
    await expectNotFound(getGoal(b, aGoal));
    await expectNotFound(updateGoal(b, aGoal, { name: "x" }));
    await expectNotFound(deleteGoal(b, aGoal));
    await expectNotFound(addContribution(b, aGoal, { amountCents: 100, date: "2026-10-20" }));
    await expectNotFound(getCard(b, aCard));
    await expectNotFound(listInvoices(b, aCard));
    await expectNotFound(getRecurrence(b, aRecurrence));
    await expectNotFound(materializeOccurrence(b, aRecurrence, "2026-10-05"));
  });

  it("B não consegue usar contas, cartões ou categorias de A nos próprios lançamentos", async () => {
    await expectNotFound(createTransaction(b, { kind: "expense", amountCents: 100, date: "2026-10-10", description: "x", accountId: aAccount }));
    await expectNotFound(createTransaction(b, { kind: "expense", amountCents: 100, date: "2026-10-10", description: "x", cardId: aCard }));
    const aCategory = (await listCategories(a, { kind: "expense" }))[0]!;
    const bAccount = (await createAccount(b, { name: "Conta do Bruno", type: "checking" })).id;
    await expectNotFound(createTransaction(b, { kind: "expense", amountCents: 100, date: "2026-10-10", description: "x", accountId: bAccount, categoryId: aCategory.id }));
    await expectNotFound(upsertBudget(b, { categoryId: aCategory.id, month: "2026-10", limitCents: 1000 }));
    await expectNotFound(createTransaction(b, { kind: "transfer", amountCents: 100, date: "2026-10-10", description: "x", accountId: bAccount, toAccountId: aAccount }));
    const invoices = await listInvoices(a, aCard);
    void invoices;
  });

  it("listagens e retratos financeiros só trazem dados do próprio usuário", async () => {
    expect((await listTransactions(b)).every((t) => t.userId === b.userId)).toBe(true);
    expect((await listTransactions(b)).some((t) => t.id === aTx)).toBe(false);
    expect((await listAccountsWithBalances(b)).some((x) => x.id === aAccount)).toBe(false);
    expect((await listGoals(b, { includeShared: true })).some((g) => g.goal.id === aGoal)).toBe(false);
    const snapB = await getFinancialSnapshot(b);
    expect(snapB.totals.availableCents).toBe(0);
    const snapA = await getFinancialSnapshot(a);
    expect(snapA.totals.availableCents).toBe(488000);
  });

  it("memória contextual é individual", async () => {
    const item = await addDeclaredMemory(a, { kind: "preference", content: "Prefiro viajar na baixa temporada" });
    expect((await listMemory(b)).length).toBe(0);
    await expectNotFound(deleteMemory(b, item.id));
  });

  it("apagar um item de memória remove o conteúdo também do histórico", async () => {
    const item = await addDeclaredMemory(a, { kind: "fact", content: "Conteúdo sensível que deve sumir" });
    await updateMemory(a, item.id, { kind: "fact", content: "Conteúdo sensível corrigido" });
    await deleteMemory(a, item.id);
    const rows = await a.db.select().from(s.memoryItemHistory).where(eq(s.memoryItemHistory.memoryItemId, item.id));
    expect(rows.map((r) => r.action)).toEqual(["delete"]);
    expect(JSON.stringify(rows)).not.toContain("sensível");
    expect((await listMemory(a)).some((m) => m.id === item.id)).toBe(false);
  });

  it("pagamento de fatura de outro usuário é rejeitado", async () => {
    const tx = await createTransaction(a, { kind: "expense", amountCents: 5000, date: "2026-10-12", description: "Compra", cardId: aCard });
    const invoiceId = tx[0]!.invoiceId!;
    const bAccount = (await createAccount(b, { name: "Conta B2", type: "checking" })).id;
    await expectNotFound(payInvoice(b, { invoiceId, accountId: bAccount, amountCents: 5000, date: "2026-10-30" }));
    await expectNotFound(payInvoice(a, { invoiceId, accountId: bAccount, amountCents: 5000, date: "2026-10-30" }));
  });
});

describe("compartilhamento familiar", () => {
  let c: ServiceContext & { email: string };
  let d: ServiceContext & { email: string };
  let goalId: string;
  let otherGoalId: string;

  beforeAll(async () => {
    c = await createUser("Casal Um");
    d = await createUser("Casal Dois");
    goalId = (await createGoal(c, { name: "Casamento", targetCents: 3000000, targetDate: "2028-05-01" })).id;
    otherGoalId = (await createGoal(c, { name: "Meta privada", targetCents: 100000, targetDate: "2027-01-01" })).id;
    await createAccount(c, { name: "Conta privada", type: "checking", initialBalanceCents: 900000 });
  });

  it("convite com escopo de visualização dá acesso só àquela meta", async () => {
    const { token } = await inviteToGoal(c, { goalId, email: d.email, permission: "view" });
    expect((await listIncomingShares(d)).some((x) => x.status === "pending")).toBe(true);
    await acceptShare(d, { token });
    const shared = await listGoals(d, { includeShared: true });
    expect(shared.map((g) => g.goal.name)).toEqual(["Casamento"]);
    expect(shared[0]!.access).toBe("view");
    // Nada além da meta compartilhada
    await expectNotFound(getGoal(d, otherGoalId));
    expect((await listAccountsWithBalances(d)).length).toBe(0);
    expect((await listTransactions(d)).length).toBe(0);
    // Visualização não permite aportar nem editar
    await expect(addContribution(d, goalId, { amountCents: 1000, date: "2026-10-20" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateGoal(d, goalId, { targetCents: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("convite só pode ser aceito pela conta do e-mail convidado", async () => {
    const intruder = await createUser("Intruso");
    const { token } = await inviteToGoal(c, { goalId: otherGoalId, email: "alguem@exemplo.com", permission: "view" });
    await expectNotFound(acceptShare(intruder, { token }));
  });

  it("revogação remove o acesso imediatamente", async () => {
    const [share] = (await listIncomingShares(d)).filter((x) => x.status === "accepted");
    await revokeShare(c, share!.id);
    await expectNotFound(goalAccess(d, goalId));
    expect((await listGoals(d, { includeShared: true })).length).toBe(0);
  });

  it("permissão de aporte registra o aporte sem mexer nas contas de ninguém", async () => {
    const { token } = await inviteToGoal(c, { goalId, email: d.email, permission: "contribute" });
    await acceptShare(d, { token });
    await addContribution(d, goalId, { amountCents: 25000, date: "2026-10-20", note: "Minha parte" });
    const view = await getGoal(c, goalId);
    expect(view.balances.balanceCents).toBe(25000);
    expect(view.contributions[0]!.contributorName).toBe("Casal Dois");
    // Quem recebeu não pode resgatar nem informar conta de origem
    await expect(addContribution(d, goalId, { kind: "withdrawal", amountCents: 1000, date: "2026-10-20" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
