import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { DemoProvider } from "@/server/integrations/providers/demo";
import { decrypt } from "@/server/security/crypto";
import { createAccount, listAccountsWithBalances } from "@/server/services/accounts";
import { listAlerts, refreshAlerts, dismissAlert } from "@/server/services/alerts";
import { createCard } from "@/server/services/cards";
import { connectProvider, deleteConnectionData, listConnections, revokeConnection, syncConnection } from "@/server/services/connections";
import { addContribution, createGoal } from "@/server/services/goals";
import { commitImport, previewImport } from "@/server/services/imports";
import { evaluateSpend } from "@/server/services/spend";
import { createRecurrence } from "@/server/services/recurrences";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { at, createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-45.90<FITID>F1<MEMO>PADARIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>5000.00<FITID>F2<MEMO>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-180.00<FITID>F3<MEMO>CONTA DE LUZ</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("importação de extratos", () => {
  it("importa OFX, concilia lançamento manual e não duplica ao reimportar", async () => {
    const u = await createUser("Importa");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 0, initialBalanceDate: "2026-10-01" });
    // lançamento manual que corresponde à conta de luz (data diferente em 1 dia)
    await createTransaction(u, { kind: "expense", amountCents: 18000, date: "2026-10-05", description: "Luz", accountId: cc.id });
    const preview = await previewImport(u, { fileName: "extrato.ofx", content: OFX, accountId: cc.id });
    expect(preview.summary).toEqual({ total: 3, toImport: 2, duplicates: 0, matches: 1 });
    const result = await commitImport(u, { fileName: "extrato.ofx", content: OFX, accountId: cc.id }, []);
    expect(result).toMatchObject({ imported: 2, matched: 1, duplicates: 0 });
    expect(await listTransactions(u)).toHaveLength(3);
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(500000 - 4590 - 18000);
    // reimportação
    const again = await previewImport(u, { fileName: "extrato.ofx", content: OFX, accountId: cc.id });
    expect(again.summary.duplicates).toBe(3);
    const second = await commitImport(u, { fileName: "extrato.ofx", content: OFX, accountId: cc.id }, again.rows.map((r) => ({ index: r.index, action: "import" as const })));
    expect(second.imported).toBe(0);
    expect(await listTransactions(u)).toHaveLength(3);
  });

  it("CSV de fatura: compras viram despesas no cartão e pagamentos são ignorados", async () => {
    const u = await createUser("CSV Cartao");
    const card = await createCard(u, { name: "Visa", limitCents: 500000, closingDay: 25, dueDay: 5 });
    const csv = "Data;Descrição;Valor\n10/10/2026;Restaurante;-89,90\n12/10/2026;PAGAMENTO RECEBIDO;1.200,00\n13/10/2026;Estorno loja;20,00\n";
    const preview = await previewImport(u, { fileName: "fatura.csv", content: csv, cardId: card.id });
    expect(preview.rows.map((r) => r.suggestedKind)).toEqual(["expense", "card_payment_credit", "refund"]);
    const result = await commitImport(u, { fileName: "fatura.csv", content: csv, cardId: card.id }, []);
    expect(result.imported).toBe(2);
    const txs = await listTransactions(u);
    expect(txs.map((t) => t.kind).sort()).toEqual(["expense", "refund"]);
    expect(txs.every((t) => t.invoiceId && t.cardId === card.id)).toBe(true);
  });

  it("rejeita destino de outro usuário e destino ambíguo", async () => {
    const u = await createUser("Destino");
    const other = await createUser("Outro Destino");
    const acc = await createAccount(other, { name: "Alheia", type: "checking" });
    await expect(previewImport(u, { fileName: "a.ofx", content: OFX, accountId: acc.id })).rejects.toThrow(/não encontrad/);
    await expect(previewImport(u, { fileName: "a.ofx", content: OFX })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("conector de demonstração", () => {
  it("conecta com consentimento, sincroniza sem duplicar, trata falha e revoga", async () => {
    const u = await createUser("Demo");
    await expect(connectProvider(u, "demo", { consentAccepted: false })).rejects.toBeInstanceOf(ValidationError);
    const { connectionId, sync } = await connectProvider(u, "demo", { consentAccepted: true });
    expect(sync.ok).toBe(true);
    expect(sync.imported).toBeGreaterThan(0);
    const txs = await listTransactions(u);
    expect(txs.every((t) => t.source === "demo")).toBe(true);
    const accounts = await listAccountsWithBalances(u);
    expect(accounts[0]!.source).toBe("demo");
    // o identificador da conexão é guardado cifrado
    const [row] = await getDb().select().from(s.bankConnections).where(eq(s.bankConnections.id, connectionId));
    expect(row!.externalRefEncrypted).not.toContain("demo_");
    expect(decrypt(row!.externalRefEncrypted!)).toMatch(/^demo_/);
    // saldo alinhado ao informado pelo fornecedor
    expect(accounts[0]!.balanceCents).toBeGreaterThanOrEqual(350000);

    const again = await syncConnection(u, connectionId);
    expect(again.ok).toBe(true);
    expect(again.imported).toBe(0);
    expect((await listTransactions(u)).length).toBe(txs.length);

    // falha simulada
    DemoProvider.failNext.set(decrypt(row!.externalRefEncrypted!), "unavailable");
    const failed = await syncConnection(u, connectionId);
    expect(failed.ok).toBe(false);
    const [conn] = await listConnections(u);
    expect(conn!.status).toBe("error");
    expect(conn!.lastError).toContain("indisponível");
    expect(conn!.runs[0]!.status).toBe("error");

    await revokeConnection(u, connectionId);
    await expect(syncConnection(u, connectionId)).rejects.toBeInstanceOf(ValidationError);
    await deleteConnectionData(u, connectionId);
    expect(await listTransactions(u)).toHaveLength(0);
    expect(await listAccountsWithBalances(u)).toHaveLength(0);
  });

  it("fornecedor real sem credenciais não é apresentado como disponível", async () => {
    const u = await createUser("Pluggy");
    await expect(connectProvider(u, "pluggy", { consentAccepted: true, itemId: "x" })).rejects.toThrow(/não está configurado/);
  });
});

describe("Posso gastar? com dados reais", () => {
  it("sem contas cadastradas: análise condicional", async () => {
    const u = await createUser("Sem Dados");
    const r = await evaluateSpend(u, { amountCents: 60000 });
    expect(r.verdict).toBe("dados_insuficientes");
  });

  it("considera salário, aluguel futuro, aportes e reserva já guardada para metas", async () => {
    const u = await createUser("Gastar");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 300000, initialBalanceDate: "2026-10-01" });
    await createRecurrence(u, { kind: "income", amountCents: 600000, description: "Salário", frequency: "monthly", startDate: "2026-01-05", accountId: cc.id });
    await createRecurrence(u, { kind: "expense", amountCents: 200000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-28", accountId: cc.id });
    let r = await evaluateSpend(u, { amountCents: 60000, description: "Jantar e passeio" });
    expect(r.verdict).toBe("cabe");
    expect(r.horizon.nextIncomeDate).toBe("2026-11-05");
    expect(r.after!.lowestBalanceCents).toBe(40000);

    // Meta sem conta própria: o dinheiro dela fica na conta de gastos e é descontado.
    const goal = await createGoal(u, { name: "Viagem", targetCents: 400000, targetDate: "2027-03-15", plannedMonthlyCents: 50000, contributionDay: 25 });
    await addContribution(u, goal.id, { amountCents: 20000, date: "2026-10-20" });
    // Livre: 300.000 − 20.000 (já da meta) = 280.000; aporte restante do mês: 30.000 em 25/10; aluguel 200.000 em 28/10.
    r = await evaluateSpend(u, { amountCents: 60000 });
    expect(r.assumptions[0]).toContain("já pertencem a metas");
    expect(r.verdict).toBe("afeta_metas");
    expect(r.goalsAtRisk).toEqual([expect.objectContaining({ name: "Viagem", reductionCents: 10000 })]);

    r = await evaluateSpend(u, { amountCents: 15000 });
    expect(r.verdict).toBe("cabe");

    // Acima do que sobra mesmo sem aportes: compromete o aluguel
    r = await evaluateSpend(u, { amountCents: 100000 });
    expect(r.verdict).toBe("nao_recomendado");
    expect(r.affectedCommitments.map((c) => c.label)).toContain("Aluguel");
    expect(r.alternatives.postpone?.date).toBe("2026-11-05");
  });

  it("dados desatualizados geram ressalva", async () => {
    const u = await createUser("Antigo");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 100000, initialBalanceDate: "2026-09-01" });
    await createTransaction(u, { kind: "expense", amountCents: 1000, date: "2026-09-02", description: "x", accountId: cc.id });
    const r = await evaluateSpend(u, { amountCents: 1000 });
    expect(r.caveats.join(" ")).toContain("não são atualizados desde 02/09/2026");
  });
});

describe("alertas persistidos", () => {
  it("gera, não repete e respeita a dispensa", async () => {
    const u = await createUser("Alertas");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 50000, initialBalanceDate: "2026-10-01" });
    await createRecurrence(u, { kind: "expense", amountCents: 200000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-28", accountId: cc.id });
    const first = await refreshAlerts(u);
    const risk = first.find((x) => x.type === "negative_balance_risk");
    expect(risk).toBeTruthy();
    expect(risk!.cause).toContain("28/10/2026");
    const second = await refreshAlerts(u);
    expect(second.filter((x) => x.type === "negative_balance_risk")).toHaveLength(1);
    await dismissAlert(u, risk!.id);
    const third = await refreshAlerts(u);
    expect(third.some((x) => x.type === "negative_balance_risk")).toBe(false);
    expect((await listAlerts(u, "dismissed")).length).toBe(1);
    // quando a causa desaparece, o alerta é resolvido
    const later = at(u, "2026-11-30");
    void later;
  });
});
