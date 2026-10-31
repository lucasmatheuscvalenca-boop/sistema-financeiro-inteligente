import { isISODate, makeDate } from "../dates";
import { parseMoney } from "../money";
import { detectInstallment } from "./classify";
import type { ImportedRow, ParseResult } from "./types";

/** Tipos OFX que sempre tiram dinheiro: alguns bancos mandam o valor positivo mesmo assim. */
const OUTFLOW_TYPES = new Set(["DEBIT", "PAYMENT", "FEE", "SRVCHG", "ATM", "POS", "CHECK", "DIRECTDEBIT", "CASH"]);

/**
 * Leitor tolerante de OFX 1.x (SGML, comum em bancos brasileiros) e 2.x (XML).
 * Extrai os blocos <STMTTRN> com TRNTYPE, DTPOSTED, TRNAMT, FITID, NAME e MEMO.
 */
function tagValue(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = re.exec(block);
  return m?.[1]?.trim() || undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function parseOfxDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const iso = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return isISODate(iso) ? iso : null;
}

export function looksLikeOfx(text: string): boolean {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

export function parseOfx(text: string): ParseResult {
  const result: ParseResult = { rows: [], errors: [], ignored: [], meta: { format: "ofx" } };
  if (!looksLikeOfx(text)) {
    result.errors.push({ line: 1, message: "O arquivo não parece ser um OFX válido." });
    return result;
  }
  result.meta.currency = tagValue(text, "CURDEF");
  result.meta.bankId = tagValue(text, "BANKID");
  result.meta.accountId = tagValue(text, "ACCTID");
  result.meta.statementType = /<CCSTMTRS>/i.test(text) ? "credit_card" : "bank";
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i.exec(text)?.[1];
  if (ledger) {
    result.meta.ledgerBalance = tagValue(ledger, "BALAMT");
    const asOf = tagValue(ledger, "DTASOF");
    result.meta.ledgerBalanceDate = asOf ? (parseOfxDate(asOf) ?? undefined) : undefined;
  }
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((raw, idx) => {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const line = idx + 1;
    const dt = tagValue(block, "DTPOSTED") ?? tagValue(block, "DTUSER");
    const date = dt ? parseOfxDate(dt) : null;
    if (!date) {
      result.errors.push({ line, message: "Transação sem data válida (DTPOSTED)" });
      return;
    }
    const amountRaw = tagValue(block, "TRNAMT");
    if (!amountRaw) {
      result.errors.push({ line, message: "Transação sem valor (TRNAMT)" });
      return;
    }
    let amount: number;
    try {
      // OFX usa ponto decimal; alguns bancos brasileiros usam vírgula ou os dois ("1.234,56").
      const lastComma = amountRaw.lastIndexOf(",");
      const lastDot = amountRaw.lastIndexOf(".");
      amount = parseMoney(amountRaw, lastComma > lastDot ? "," : ".");
    } catch {
      result.errors.push({ line, message: `Valor inválido: ${amountRaw}` });
      return;
    }
    if (amount === 0) {
      result.ignored!.push({ line, message: "Valor zero ignorado" });
      return;
    }
    const type = (tagValue(block, "TRNTYPE") ?? "").toUpperCase();
    // Em fatura, PAYMENT é o pagamento recebido pelo cartão (crédito), não uma saída.
    if (OUTFLOW_TYPES.has(type) && !(result.meta.statementType === "credit_card" && type === "PAYMENT") && amount > 0) amount = -amount;
    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");
    const description = decodeEntities([name, memo && memo !== name ? memo : undefined].filter(Boolean).join(" — ") || "Sem descrição");
    const row: ImportedRow = {
      date,
      description,
      amountCents: amount,
      externalId: tagValue(block, "FITID") ?? null,
      rawIndex: line,
      installment: detectInstallment(description, false),
      transferHint: type === "XFER",
    };
    result.rows.push(row);
  });
  return result;
}
