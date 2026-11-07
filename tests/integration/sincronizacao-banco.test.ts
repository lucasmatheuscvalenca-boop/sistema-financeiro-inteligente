import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import type { BankDataProvider, ProviderAccount, ProviderTransaction } from "@/server/integrations/provider";
import { registerProvider } from "@/server/integrations/registry";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { listCardsOverview } from "@/server/services/cards";
import { connectProvider, syncConnection } from "@/server/services/connections";
import { createRecurrence, pendingOccurrences } from "@/server/services/recurrences";
import { listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

const users: string[] = [];
const newUser = async (name: string) => {
  const u = await createUser(name);
  users.push(u.userId);
  return u;
};

afterAll(async () => {
  // As conexões deste fornecedor simulado não podem sobrar para a rotina diária de outros testes.
  if (users.length) await getDb().delete(s.users).where(inArray(s.users.id, users));
  await closeDb();
});

interface FakeItem {
  institution: string;
  accounts: ProviderAccount[];
  txs: Record<string, ProviderTransaction[]>;
}

/** Fornecedor simulado: cada item é um banco, com contas, cartões e lançamentos controlados pelo teste. */
function fakeBank(items: Record<string, FakeItem>): BankDataProvider {
  return {
    id: "banco-teste",
    label: "Banco de teste",
    isDemo: false,
    isConfigured: () => true,
    async connect({ itemId }) {
      const item = items[itemId!]!;
      return { externalRef: itemId!, institutionName: item.institution, consent: { scopes: ["accounts"], purpose: "teste", expiresAt: null, providerConsentId: null } };
    },
    async fetchAccounts(ref) {
      return items[ref]!.accounts;
    },
    async fetchTransactions(ref, account) {
      return items[ref]!.txs[account] ?? [];
    },
    async revoke() {},
  };
}

const tx = (account: string, id: string, date: string, description: string, amountCents: number, category: string | null = null): ProviderTransaction => ({
  externalId: id,
  accountExternalId: account,
  date,
  description,
  amountCents,
  category,
});

const checking = (externalId: string, name: string, balanceCents: number): ProviderAccount => ({ externalId, name, type: "checking", balanceCents });

describe("sincronização com o banco", () => {
  it("dá baixa na recorrência prevista e marca a despesa essencial pela categoria", async () => {
    const items: Record<string, FakeItem> = { r1: { institution: "Banco R", accounts: [checking("cc-r", "Banco R · conta", 0)], txs: {} } };
    registerProvider(fakeBank(items));
    const u = await newUser("Sync Recorrencia");
    const { connectionId } = await connectProvider(u, "banco-teste", { itemId: "r1", consentAccepted: true });
    const [account] = await listAccountsWithBalances(u);
    const aluguel = await createRecurrence(u, { kind: "expense", amountCents: 150000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-05", accountId: account!.id });
    expect((await pendingOccurrences(u, "2026-10-01", "2026-10-31")).map((o) => o.recurrence.id)).toEqual([aluguel.id]);

    items.r1!.txs["cc-r"] = [tx("cc-r", "t-aluguel", "2026-10-06", "ALUGUEL OUTUBRO", -150000), tx("cc-r", "t-mercado", "2026-10-07", "SUPERMERCADO BOM PRECO", -23000, "Groceries")];
    items.r1!.accounts = [checking("cc-r", "Banco R · conta", -173000)];
    const r = await syncConnection(u, connectionId);
    expect(r).toMatchObject({ ok: true, imported: 2 });

    const txs = await listTransactions(u, {});
    const rent = txs.find((t) => t.description === "ALUGUEL OUTUBRO")!;
    expect(rent).toMatchObject({ recurrenceId: aluguel.id, occurrenceDate: "2026-10-05" });
    // A ocorrência de outubro sai da projeção: o aluguel não conta duas vezes.
    expect(await pendingOccurrences(u, "2026-10-01", "2026-10-31")).toHaveLength(0);
    expect(txs.find((t) => t.description === "SUPERMERCADO BOM PRECO")!.essential).toBe(true);
  });

  for (const order of ["sai primeiro", "entra primeiro"] as const) {
    it(`transferência entre contas de bancos diferentes vira uma transferência só (${order})`, async () => {
      const items: Record<string, FakeItem> = {
        a: { institution: "Banco A", accounts: [checking("cc-a", "Banco A · conta", 50000)], txs: { "cc-a": [tx("cc-a", "a-1", "2026-10-10", "PIX ENVIADO MARIA SILVA", -50000)] } },
        b: { institution: "Banco B", accounts: [checking("cc-b", "Banco B · conta", 50000)], txs: { "cc-b": [tx("cc-b", "b-1", "2026-10-11", "PIX RECEBIDO MARIA SILVA", 50000)] } },
      };
      registerProvider(fakeBank(items));
      const u = await newUser(`Sync Transferencia ${order}`);
      const [first, second] = order === "sai primeiro" ? ["a", "b"] : ["b", "a"];
      const c1 = await connectProvider(u, "banco-teste", { itemId: first!, consentAccepted: true });
      const c2 = await connectProvider(u, "banco-teste", { itemId: second!, consentAccepted: true });
      expect(c2.sync).toMatchObject({ ok: true, imported: 0, matched: 1 });

      const accounts = await listAccountsWithBalances(u);
      const a = accounts.find((x) => x.name === "Banco A · conta")!;
      const b = accounts.find((x) => x.name === "Banco B · conta")!;
      let txs = await listTransactions(u, {});
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({ kind: "transfer", accountId: a.id, toAccountId: b.id, amountCents: 50000, categoryId: null });

      // Sincronizar de novo os dois bancos não cria nada: cada lado reconhece a transferência.
      expect(await syncConnection(u, c1.connectionId)).toMatchObject({ ok: true, imported: 0, duplicates: 1 });
      expect(await syncConnection(u, c2.connectionId)).toMatchObject({ ok: true, imported: 0, duplicates: 1 });
      txs = await listTransactions(u, {});
      expect(txs).toHaveLength(1);
      const balances = await listAccountsWithBalances(u);
      expect(balances.find((x) => x.id === a.id)!.balanceCents).toBe(50000);
      expect(balances.find((x) => x.id === b.id)!.balanceCents).toBe(50000);
    });
  }

  it("aplicação entre contas do mesmo banco: as duas linhas formam uma transferência só", async () => {
    const items: Record<string, FakeItem> = {
      m: {
        institution: "Banco M",
        accounts: [checking("cc-m", "Banco M · conta", 0), { externalId: "inv-m", name: "Banco M · CDB", type: "investment", balanceCents: 100000 }],
        txs: { "cc-m": [tx("cc-m", "m-1", "2026-10-15", "APLICACAO CDB", -100000)], "inv-m": [tx("inv-m", "m-2", "2026-10-16", "CDB DIARIO - APLICACAO", 100000)] },
      },
    };
    registerProvider(fakeBank(items));
    const u = await newUser("Sync Aplicacao");
    const { connectionId, sync } = await connectProvider(u, "banco-teste", { itemId: "m", consentAccepted: true });
    expect(sync).toMatchObject({ ok: true, imported: 1, matched: 1 });
    expect(await listTransactions(u, {})).toHaveLength(1);
    expect(await syncConnection(u, connectionId)).toMatchObject({ ok: true, imported: 0, duplicates: 2 });
    expect(await listTransactions(u, {})).toHaveLength(1);
  });

  it("pagamento de fatura sem o nome do cartão vai para o cartão cuja fatura fechada tem o mesmo valor", async () => {
    const card = (externalId: string, name: string): ProviderAccount => ({ externalId, name, type: "credit_card", balanceCents: 0, creditLimitCents: 500000, closingDay: 1, dueDay: 10 });
    const items: Record<string, FakeItem> = {
      c: {
        institution: "Banco C",
        accounts: [card("gold", "Banco C · cartão Gold"), card("black", "Banco C · cartão Black"), checking("cc-c", "Banco C · conta", 0)],
        txs: {
          gold: [tx("gold", "g-1", "2026-09-15", "LIVRARIA", -30000)],
          black: [tx("black", "k-1", "2026-09-12", "LOJA DE ROUPAS", -50000), tx("black", "k-2", "2026-09-20", "RESTAURANTE", -30000)],
          "cc-c": [tx("cc-c", "p-1", "2026-10-10", "PAGAMENTO DE FATURA", -80000)],
        },
      },
    };
    registerProvider(fakeBank(items));
    const u = await newUser("Sync Fatura");
    await connectProvider(u, "banco-teste", { itemId: "c", consentAccepted: true });
    const cards = await listCardsOverview(u);
    const black = cards.find((c) => c.name === "Banco C · cartão Black")!;
    const payment = (await listTransactions(u, {})).find((t) => t.kind === "card_payment")!;
    expect(payment.cardId).toBe(black.id);
    // E a fatura de setembro do Black fica paga.
    const invoice = black.invoices.find((i) => i.closingDate === "2026-10-01")!;
    expect(invoice).toMatchObject({ totalCents: 80000, paymentsCents: 80000 });
  });
});
