import { afterAll, describe, expect, it } from "vitest";
import { monthTotals } from "@/domain/ledger";
import { closeDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { createAccount, listAccountsWithBalances } from "@/server/services/accounts";
import { createCard, listCardsOverview } from "@/server/services/cards";
import { commitImport, previewImport, undoImport } from "@/server/services/imports";
import { toLedgerTx } from "@/server/services/ledger";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { createRecurrence, pendingOccurrences } from "@/server/services/recurrences";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const totalsOf = async (u: Awaited<ReturnType<typeof createUser>>, month: string) => monthTotals((await listTransactions(u, {})).map(toLedgerTx), month as `${number}-${number}`).realized;

describe("importação com valores certos", () => {
  it("fatura Nubank em CSV (compras positivas): compras viram despesa, não estorno", async () => {
    const u = await createUser("Fatura Nubank");
    const card = await createCard(u, { name: "Nubank", limitCents: 500000, closingDay: 25, dueDay: 5 });
    const csv = "date,title,amount\n2026-10-02,Uber *Trip,23.9\n2026-10-03,Mercado Extra,120.35\n2026-10-05,Pagamento recebido,-1500\n2026-10-06,Estorno Uber,-23.9\n";
    const preview = await previewImport(u, { fileName: "nubank.csv", content: csv, cardId: card.id });
    expect(preview.signsInverted).toBe(true);
    expect(preview.rows.map((r) => [r.amountCents, r.suggestedKind])).toEqual([
      [-2390, "expense"],
      [-12035, "expense"],
      [150000, "card_payment_credit"],
      [2390, "refund"],
    ]);
    await commitImport(u, { fileName: "nubank.csv", content: csv, cardId: card.id }, []);
    const t = await totalsOf(u, "2026-10");
    // Despesa do mês = 23,90 + 120,35 − 23,90 (estorno); o pagamento da fatura não entra.
    expect(t.expenseCents).toBe(12035);
    expect(t.incomeCents).toBe(0);
    const [overview] = await listCardsOverview(u);
    expect(overview!.openInvoice!.totalCents).toBe(12035);
  });

  it("extrato da conta: pagamento de fatura e aplicação não contam como despesa", async () => {
    const u = await createUser("Conta Pagamentos");
    const cc = await createAccount(u, { name: "Nubank Conta", type: "checking", initialBalanceCents: 300000, initialBalanceDate: "2026-10-01" });
    const reserva = await createAccount(u, { name: "Caixinha", type: "savings", purpose: "reserve", initialBalanceCents: 0, initialBalanceDate: "2026-10-01" });
    const card = await createCard(u, { name: "Nubank", limitCents: 500000, closingDay: 25, dueDay: 5 });
    const csv = "Data,Valor,Identificador,Descrição\n05/10/2026,-1200.00,a1,Pagamento de fatura\n06/10/2026,-500.00,a2,Aplicação RDB\n07/10/2026,-80.00,a3,Compra no débito - Farmácia\n08/10/2026,4000.00,a4,Salário\n";
    const preview = await previewImport(u, { fileName: "conta.csv", content: csv, accountId: cc.id });
    expect(preview.rows.map((r) => r.suggestedKind)).toEqual(["card_payment", "transfer", "expense", "income"]);
    expect(preview.rows[0]!.suggestedCardId).toBe(card.id);
    expect(preview.rows[1]!.suggestedAccountId).toBe(reserva.id);
    await commitImport(u, { fileName: "conta.csv", content: csv, accountId: cc.id }, []);
    const t = await totalsOf(u, "2026-10");
    expect(t.expenseCents).toBe(8000);
    expect(t.incomeCents).toBe(400000);
    const balances = new Map((await listAccountsWithBalances(u)).map((a) => [a.id, a.balanceCents]));
    expect(balances.get(cc.id)).toBe(300000 - 120000 - 50000 - 8000 + 400000);
    expect(balances.get(reserva.id)).toBe(50000);
  });

  it("a pessoa pode trocar o tipo na revisão, e tipos incoerentes são recusados", async () => {
    const u = await createUser("Troca Tipo");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceDate: "2026-10-01" });
    const outra = await createAccount(u, { name: "Itaú", type: "checking", initialBalanceDate: "2026-10-01" });
    const csv = "Data;Descrição;Valor\n05/10/2026;PIX FULANO;-300,00\n";
    const req = { fileName: "c.csv", content: csv, accountId: cc.id };
    await expect(commitImport(u, req, [{ index: 0, action: "import", kind: "income" }])).rejects.toBeInstanceOf(ValidationError);
    await commitImport(u, req, [{ index: 0, action: "import", kind: "transfer", accountId: outra.id }]);
    const [tx] = await listTransactions(u, {});
    expect(tx).toMatchObject({ kind: "transfer", accountId: cc.id, toAccountId: outra.id, amountCents: 30000 });
    expect((await totalsOf(u, "2026-10")).expenseCents).toBe(0);
  });

  it("CSV sem identificador: compras iguais no mesmo dia entram, e reimportar não duplica", async () => {
    const u = await createUser("Reimporta CSV");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceDate: "2026-10-01" });
    const csv = "Data;Descrição;Valor\n03/10/2026;Uber;-15,90\n03/10/2026;Uber;-15,90\n04/10/2026;Padaria;-12,00\n";
    const req = { fileName: "c.csv", content: csv, accountId: cc.id };
    expect((await commitImport(u, req, [])).imported).toBe(3);
    const again = await previewImport(u, req);
    expect(again.summary.duplicates).toBe(3);
    expect((await commitImport(u, req, again.rows.map((r) => ({ index: r.index, action: "import" as const })))).imported).toBe(0);
    expect(await listTransactions(u, {})).toHaveLength(3);
  });

  it("parcelas da fatura com a data da compra original caem na fatura certa e não somem na fatura seguinte", async () => {
    const u = await createUser("Parcelas Fatura");
    const card = await createCard(u, { name: "Itaú", limitCents: 900000, closingDay: 25, dueDay: 5 });
    const outubro = "Data;Descrição;Valor\n15/08/2026;LOJA TECH 03/10;199,90\n10/10/2026;RESTAURANTE;80,00\n";
    await commitImport(u, { fileName: "out.csv", content: outubro, cardId: card.id }, []);
    let txs = await listTransactions(u, {});
    const parcela3 = txs.find((t) => t.description.startsWith("LOJA TECH"))!;
    expect(parcela3).toMatchObject({ date: "2026-10-15", kind: "expense", installmentNumber: 3, installmentCount: 10 });
    const [overview] = await listCardsOverview(u);
    expect(overview!.openInvoice!.totalCents).toBe(19990 + 8000);

    const novembro = "Data;Descrição;Valor\n15/08/2026;LOJA TECH 04/10;199,90\n02/11/2026;CINEMA;40,00\n";
    const preview = await previewImport(u, { fileName: "nov.csv", content: novembro, cardId: card.id });
    expect(preview.rows[0]).toMatchObject({ date: "2026-11-15", action: "import", originalDate: "2026-08-15" });
    await commitImport(u, { fileName: "nov.csv", content: novembro, cardId: card.id }, []);
    txs = await listTransactions(u, {});
    expect(txs.filter((t) => t.description.startsWith("LOJA TECH")).map((t) => t.date).sort()).toEqual(["2026-10-15", "2026-11-15"]);
  });

  it("pagamento lido na fatura sai da conta, quita a fatura anterior e não duplica com o extrato da conta", async () => {
    const u = await createUser("Pagamento Fatura");
    const cc = await createAccount(u, { name: "Nubank Conta", type: "checking", initialBalanceCents: 500000, initialBalanceDate: "2026-09-01" });
    const card = await createCard(u, { name: "Nubank", limitCents: 500000, closingDay: 25, dueDay: 5 });
    // Fatura de setembro (fecha 25/09, vence 05/10) e o pagamento dela na fatura de outubro.
    await commitImport(u, { fileName: "set.csv", content: "date,title,amount\n2026-09-10,Mercado,300\n2026-09-12,Farmácia,100\n", cardId: card.id }, []);
    const outubro = "date,title,amount\n2026-10-05,Pagamento recebido,-400\n2026-10-08,Padaria,25\n";
    const preview = await previewImport(u, { fileName: "out.csv", content: outubro, cardId: card.id });
    expect(preview.rows[0]).toMatchObject({ suggestedKind: "card_payment", suggestedAccountId: cc.id, amountCents: 40000 });
    await commitImport(u, { fileName: "out.csv", content: outubro, cardId: card.id }, []);
    const [overview] = await listCardsOverview(u);
    const setembro = overview!.invoices.find((i) => i.closingDate === "2026-09-25")!;
    expect(setembro).toMatchObject({ totalCents: 40000, outstandingCents: 0, status: "paid" });
    // Pagamento não é despesa: só as compras contam.
    expect((await totalsOf(u, "2026-10")).expenseCents).toBe(2500);
    expect((await listAccountsWithBalances(u)).find((a) => a.id === cc.id)!.balanceCents).toBe(500000 - 40000);
    // O mesmo pagamento no extrato da conta é conciliado, não duplicado.
    const conta = "Data,Valor,Identificador,Descrição\n05/10/2026,-400.00,p1,Pagamento de fatura\n";
    const contaPreview = await previewImport(u, { fileName: "conta.csv", content: conta, accountId: cc.id });
    expect(contaPreview.rows[0]!.action).toBe("match");
    await commitImport(u, { fileName: "conta.csv", content: conta, accountId: cc.id }, []);
    expect((await listTransactions(u, {})).filter((t) => t.kind === "card_payment")).toHaveLength(1);
    expect((await listAccountsWithBalances(u)).find((a) => a.id === cc.id)!.balanceCents).toBe(500000 - 40000);
  });

  it("desfazer importação apaga o que ela criou, desconcilia e restaura o saldo", async () => {
    const u = await createUser("Desfaz Importacao");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 100000, initialBalanceDate: "2026-10-01" });
    const manual = (await createTransaction(u, { kind: "expense", amountCents: 20000, date: "2026-10-10", description: "Mercado (manual)", accountId: cc.id }))[0]!;
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-200.00<FITID>D1<MEMO>MERCADO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261012<TRNAMT>3000.00<FITID>D2<MEMO>SALARIO</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>9999.99<DTASOF>20261015</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = await commitImport(u, { fileName: "d.ofx", content: ofx, accountId: cc.id }, [], { alignBalance: true });
    expect(r).toMatchObject({ imported: 1, matched: 1 });
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(999999);
    const undone = await undoImport(u, r.batchId);
    expect(undone).toEqual({ removed: 1, unreconciled: 1, balanceRestored: true });
    const txs = await listTransactions(u, {});
    expect(txs.map((t) => t.id)).toEqual([manual.id]);
    expect(txs[0]!.reconciledAt).toBeNull();
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(100000 - 20000);
    await expect(undoImport(u, r.batchId)).rejects.toBeInstanceOf(ValidationError);
    // Depois de desfeita, a importação pode ser refeita do zero.
    expect((await commitImport(u, { fileName: "d.ofx", content: ofx, accountId: cc.id }, [])).imported).toBe(1);
  });

  it("aluguel e salário importados realizam as recorrências previstas (a projeção não conta duas vezes)", async () => {
    const u = await createUser("Recorrencia Importada");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 100000, initialBalanceDate: "2026-10-01" });
    const aluguel = await createRecurrence(u, { kind: "expense", amountCents: 150000, description: "Aluguel", frequency: "monthly", startDate: "2026-01-05", accountId: cc.id });
    const luz = await createRecurrence(u, { kind: "expense", amountCents: 17500, description: "Conta de luz", frequency: "monthly", startDate: "2026-01-10", accountId: cc.id });
    const csv = "Data;Descrição;Valor\n06/10/2026;ALUGUEL OUTUBRO;-1.500,00\n15/10/2026;PADARIA;-12,00\n";
    const preview = await previewImport(u, { fileName: "c.csv", content: csv, accountId: cc.id });
    expect(preview.rows[0]!.recurrence).toMatchObject({ id: aluguel.id, occurrenceDate: "2026-10-05" });
    expect(preview.rows[1]!.recurrence).toBeNull();
    await commitImport(u, { fileName: "c.csv", content: csv, accountId: cc.id }, []);
    const pending = await pendingOccurrences(u, "2026-10-01", "2026-10-31");
    expect(pending.map((p) => p.recurrence.id)).toEqual([luz.id]);
    // Lançamento manual da luz, com valor um pouco diferente, também realiza a ocorrência.
    await createTransaction(u, { kind: "expense", amountCents: 18230, date: "2026-10-11", description: "Luz Cemig", accountId: cc.id });
    expect(await pendingOccurrences(u, "2026-10-01", "2026-10-31")).toHaveLength(0);
  });

  it("mesmo período em OFX e depois em CSV: concilia em vez de duplicar, e desfazer o CSV preserva o OFX", async () => {
    const u = await createUser("OFX e CSV");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceDate: "2026-10-01" });
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-45.90<FITID>X1<MEMO>PADARIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>2000.00<FITID>X2<MEMO>SALARIO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    await commitImport(u, { fileName: "out.ofx", content: ofx, accountId: cc.id }, []);
    const csv = "Data;Descrição;Valor\n03/10/2026;Compra no débito - Padaria Central;-45,90\n05/10/2026;Transferência recebida - Empresa;2.000,00\n";
    const preview = await previewImport(u, { fileName: "out.csv", content: csv, accountId: cc.id });
    expect(preview.rows.map((r) => r.action)).toEqual(["match", "match"]);
    const r = await commitImport(u, { fileName: "out.csv", content: csv, accountId: cc.id }, []);
    expect(r).toMatchObject({ imported: 0, matched: 2 });
    expect(await listTransactions(u, {})).toHaveLength(2);
    await undoImport(u, r.batchId);
    const txs = await listTransactions(u, {});
    expect(txs.map((t) => t.externalId).sort()).toEqual(["X1", "X2"]);
    // E o OFX continua sendo reconhecido como já importado.
    expect((await previewImport(u, { fileName: "out.ofx", content: ofx, accountId: cc.id })).summary.duplicates).toBe(2);
  });

  it("OFX com saldo: a conta passa a mostrar o saldo do banco", async () => {
    const u = await createUser("Saldo Extrato");
    const cc = await createAccount(u, { name: "Corrente", type: "checking", initialBalanceCents: 0 });
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-200.00<FITID>S1<MEMO>MERCADO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261012<TRNAMT>3000.00<FITID>S2<MEMO>SALARIO</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>4321.09<DTASOF>20261015</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const req = { fileName: "x.ofx", content: ofx, accountId: cc.id };
    const preview = await previewImport(u, req);
    expect(preview.statementBalance).toEqual({ balanceCents: 432109, date: "2026-10-15" });
    const r = await commitImport(u, req, [], { alignBalance: true });
    expect(r.balanceAligned).toEqual({ balanceCents: 432109, date: "2026-10-15" });
    expect((await listAccountsWithBalances(u))[0]!.balanceCents).toBe(432109);
    // O histórico continua lá para relatórios.
    expect((await totalsOf(u, "2026-10")).incomeCents).toBe(300000);
  });
});
