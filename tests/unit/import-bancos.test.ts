import { describe, expect, it } from "vitest";
import { parseFlexibleDate } from "@/domain/dates";
import { cardSignsInverted, detectDecimalSeparator, detectInstallment, installmentDate, isBalanceLine, isCardPayment, isOwnTransfer } from "@/domain/import/classify";
import { parseCsv } from "@/domain/import/csv";
import { dedupeRows, fingerprintKey } from "@/domain/import/dedupe";
import { parseOfx } from "@/domain/import/ofx";

const TODAY = "2026-10-21";

describe("extratos reais em CSV", () => {
  it("Nubank conta: ponto decimal, identificador e descrição", () => {
    const csv = "Data,Valor,Identificador,Descrição\n05/10/2026,-45.90,id-1,Compra no débito - PADARIA\n06/10/2026,1500.00,id-2,Transferência recebida pelo Pix - FULANO\n07/10/2026,-1234.5,id-3,Pagamento de fatura\n";
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows.map((x) => [x.date, x.amountCents, x.externalId])).toEqual([
      ["2026-10-05", -4590, "id-1"],
      ["2026-10-06", 150000, "id-2"],
      ["2026-10-07", -123450, "id-3"],
    ]);
  });

  it("Nubank cartão: compras positivas são reconhecidas como sinal invertido", () => {
    const csv = "date,title,amount\n2026-10-02,Uber *Trip,23.9\n2026-10-03,Mercado Extra,120.35\n2026-10-05,Pagamento recebido,-1500\n2026-10-06,Estorno Uber,-23.9\n";
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows.map((x) => x.amountCents)).toEqual([2390, 12035, -150000, -2390]);
    expect(r.rows[0]!.description).toBe("Uber *Trip");
    expect(cardSignsInverted(r.rows)).toBe(true);
  });

  it("C6 fatura: usa o valor em reais (não o em dólar) e a coluna de parcela", () => {
    const csv =
      "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n" +
      "03/10/2026;LUCAS;1234;Restaurante;BAR DO ZE;Única;0;0;87,50\n" +
      "15/08/2026;LUCAS;1234;Eletrônicos;LOJA TECH;3/10;0;0;199,90\n";
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows.map((x) => x.amountCents)).toEqual([8750, 19990]);
    expect(r.rows[0]!.installment).toBeNull();
    expect(r.rows[1]!.installment).toEqual({ number: 3, of: 10 });
  });

  it("Banco do Brasil: ignora linhas de saldo, usa a natureza e junta as duas descrições", () => {
    const csv =
      '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"\n' +
      '"30/09/2026","Saldo Anterior","","","1.000,00","Entrada"\n' +
      '"01/10/2026","Pix - Enviado","01/10 12:00 Fulano","123","50,00","Saída"\n' +
      '"02/10/2026","Pix - Recebido","02/10 09:00 Ciclano","124","200,00","Entrada"\n' +
      '"02/10/2026","S A L D O","","","1.150,00","Entrada"\n';
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows.map((x) => x.amountCents)).toEqual([-5000, 20000]);
    expect(r.rows[0]!.description).toBe("Pix - Enviado — 01/10 12:00 Fulano");
    expect(r.ignored).toHaveLength(2);
  });

  it("Itaú: saldo do dia não vira lançamento e a coluna de saldo é lida", () => {
    const csv = "data;lançamento;ag./origem;valor (R$);saldos (R$)\n01/10/2026;SALDO ANTERIOR;;;2.000,00\n02/10/2026;PIX TRANSF FULANO;;-300,00;1.700,00\n02/10/2026;SALDO DO DIA;;;1.700,00\n";
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ amountCents: -30000, balanceCents: 170000 });
  });

  it("Mercado Pago: acha o cabeçalho depois do resumo", () => {
    const csv = "INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE\n100,00;50,00;30,00;120,00\n\nRELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE\n05-10-2026;Pagamento com QR;111;-30,00;70,00\n06-10-2026;Dinheiro recebido;112;50,00;120,00\n";
    const r = parseCsv(csv, null, { today: TODAY });
    expect(r.rows.map((x) => [x.date, x.amountCents, x.externalId])).toEqual([
      ["2026-10-05", -3000, "111"],
      ["2026-10-06", 5000, "112"],
    ]);
  });

  it("separador decimal do arquivo inteiro: 1,500 num arquivo com ponto decimal é mil e quinhentos", () => {
    const csv = "Data;Descricao;Valor\n01/10/2026;A;1234.5\n02/10/2026;B;12.30\n03/10/2026;C;1,500\n";
    expect(parseCsv(csv, null, { today: TODAY }).rows.map((x) => x.amountCents)).toEqual([123450, 1230, 150000]);
    expect(detectDecimalSeparator(["-1.234,56", "45,90", "1.000"])).toBe(",");
  });

  it("datas com horário, por extenso, sem ano e em ordem americana", () => {
    expect(parseFlexibleDate("05/10/2026 14:32")).toBe("2026-10-05");
    expect(parseFlexibleDate("2026-10-05T14:32:00-03:00")).toBe("2026-10-05");
    expect(parseFlexibleDate("05 out 2026")).toBe("2026-10-05");
    expect(parseFlexibleDate("5 de outubro de 2026")).toBe("2026-10-05");
    expect(parseFlexibleDate("05 OUT", { referenceDate: TODAY })).toBe("2026-10-05");
    expect(parseFlexibleDate("28/12", { referenceDate: "2027-01-10" })).toBe("2026-12-28");
    const us = parseCsv("Date,Description,Amount\n10/25/2026,Coffee,-4.50\n10/02/2026,Salary,3000.00\n", null, { today: TODAY });
    expect(us.rows.map((x) => x.date)).toEqual(["2026-10-25", "2026-10-02"]);
  });
});

describe("OFX de bancos brasileiros", () => {
  const ofx = (body: string, card = false) =>
    `OFXHEADER:100\n<OFX>${card ? "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>" : "<BANKMSGSRSV1><STMTTRNRS><STMTRS>"}<CURDEF>BRL<BANKTRANLIST>${body}</BANKTRANLIST></OFX>`;

  it("débito com valor positivo vira saída e valores com ponto e vírgula são lidos", () => {
    const r = parseOfx(ofx("<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>45.90<FITID>1<MEMO>PADARIA</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261004<TRNAMT>1.234,56<FITID>2<MEMO>SALARIO</STMTTRN><STMTTRN><TRNTYPE>XFER<DTPOSTED>20261005<TRNAMT>-100.00<FITID>3<MEMO>TRANSF</STMTTRN>"));
    expect(r.rows.map((x) => x.amountCents)).toEqual([-4590, 123456, -10000]);
    expect(r.rows[2]!.transferHint).toBe(true);
  });

  it("na fatura, PAYMENT positivo continua sendo o pagamento recebido", () => {
    const r = parseOfx(ofx("<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261005<TRNAMT>1500.00<FITID>9<MEMO>PAGAMENTO RECEBIDO</STMTTRN>", true));
    expect(r.rows[0]!.amountCents).toBe(150000);
  });
});

describe("classificação das linhas", () => {
  it("reconhece saldo, pagamento de fatura e transferência entre contas próprias", () => {
    expect(isBalanceLine("S A L D O")).toBe(true);
    expect(isBalanceLine("Saldo do dia")).toBe(true);
    expect(isBalanceLine("Saldão da Construção")).toBe(false);
    expect(isCardPayment("PAGAMENTO DE FATURA NUBANK")).toBe(true);
    expect(isCardPayment("Pgto fatura cartão")).toBe(true);
    expect(isCardPayment("DEB AUTOMATICO FATURA ITAU")).toBe(true);
    expect(isCardPayment("Pix enviado - Fulano")).toBe(false);
    expect(isOwnTransfer("Aplicação RDB")).toBe(true);
    expect(isOwnTransfer("Resgate CDB")).toBe(true);
    expect(isOwnTransfer("Dinheiro guardado na Caixinha")).toBe(true);
    expect(isOwnTransfer("Transferência entre contas")).toBe(true);
    expect(isOwnTransfer("Supermercado Extra")).toBe(false);
  });

  it("parcelas no texto e data da parcela quando o banco repete a data da compra", () => {
    expect(detectInstallment("LOJA TECH - Parcela 3/10")).toEqual({ number: 3, of: 10 });
    expect(detectInstallment("LOJA TECH 03/10")).toEqual({ number: 3, of: 10 });
    expect(detectInstallment("PIX 05/10", false)).toBeNull();
    expect(detectInstallment("LOJA 11/10")).toBeNull();
    const row = { date: "2026-08-15", description: "LOJA TECH", amountCents: -19990, rawIndex: 1, installment: { number: 3, of: 10 } };
    expect(installmentDate(row, "2026-10-20")).toBe("2026-10-15");
    // Se a linha já está no período da fatura, a data já é a da parcela.
    expect(installmentDate({ ...row, date: "2026-10-15" }, "2026-10-20")).toBe("2026-10-15");
  });
});

describe("duplicidade", () => {
  it("reconhece a impressão gravada (hash) e não confunde parcelas de faturas diferentes", () => {
    const row = { date: "2026-10-03", description: "Café", amountCents: -800, rawIndex: 1 };
    const hash = (r: { description: string }) => `hash:${r.description}`;
    const decisions = dedupeRows([row], [{ id: "e1", date: "2026-10-03", description: "Café editado", amountCents: -800, fingerprint: "hash:Café" }], { storedFingerprints: (r) => [hash(r)] });
    expect(decisions[0]).toMatchObject({ action: "duplicate", existingId: "e1" });

    const parcela3 = { date: "2026-10-15", description: "LOJA TECH 03/10", amountCents: -19990, rawIndex: 1 };
    const parcela2 = { id: "p2", date: "2026-10-15", description: "LOJA TECH 02/10", amountCents: -19990 };
    expect(fingerprintKey(parcela3)).not.toBe(fingerprintKey(parcela2));
    expect(dedupeRows([parcela3], [parcela2])[0]!.action).not.toBe("duplicate");
  });

  it("duas compras iguais no mesmo dia: as duas entram, e na reimportação as duas são reconhecidas", () => {
    const rows = [
      { date: "2026-10-03", description: "Uber", amountCents: -1590, rawIndex: 1 },
      { date: "2026-10-03", description: "Uber", amountCents: -1590, rawIndex: 2 },
    ];
    expect(dedupeRows(rows, []).map((d) => d.action)).toEqual(["import", "import"]);
    const existing = rows.map((r, i) => ({ id: `u${i}`, date: r.date, description: r.description, amountCents: r.amountCents }));
    expect(dedupeRows(rows, existing).map((d) => d.action)).toEqual(["duplicate", "duplicate"]);
  });
});
