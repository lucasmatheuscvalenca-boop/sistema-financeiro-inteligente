import { parseFlexibleDate, type ISODate } from "../dates";
import { parseMoney, type DecimalSeparator } from "../money";
import { detectDecimalSeparator, detectInstallment, isBalanceLine } from "./classify";
import type { InstallmentInfo, ParseResult } from "./types";

/** Lê CSV com aspas, separador detectado automaticamente (; , ou tab). */
export function parseCsvText(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ";";
  let bestScore = -1;
  for (const cand of [";", ",", "\t", "|"]) {
    const counts = sample.map((l) => splitOutsideQuotes(l, cand));
    if (counts.length === 0) continue;
    const first = counts[0]!;
    if (first < 1) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 10 + first;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

function splitOutsideQuotes(line: string, sep: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) n++;
  }
  return n;
}

export interface CsvMapping {
  dateColumn: number;
  descriptionColumn: number;
  /** Segunda coluna de descrição, somada à primeira ("Pix enviado — Fulano"). */
  extraDescriptionColumn?: number | null;
  /** Coluna única de valor com sinal. */
  amountColumn?: number | null;
  /** Ou colunas separadas de débito e crédito. */
  debitColumn?: number | null;
  creditColumn?: number | null;
  /** Coluna de natureza ("D"/"C", "Saída"/"Entrada") quando o valor vem sem sinal. */
  typeColumn?: number | null;
  /** Coluna de saldo após cada lançamento (usada para conferir o saldo da conta). */
  balanceColumn?: number | null;
  /** Coluna de parcela ("2/10", "Única"). */
  installmentColumn?: number | null;
  /** Coluna opcional com identificador único da transação. */
  idColumn?: number | null;
  hasHeader: boolean;
  /** Linha do cabeçalho (alguns bancos põem um resumo antes da tabela). */
  headerRow?: number;
  decimalSeparator?: DecimalSeparator;
  /** Inverte o sinal (útil para faturas de cartão em que compras vêm positivas). */
  invertSign?: boolean;
}

const HEADER_HINTS = {
  date: ["data", "date", "dt", "data lançamento", "data lancamento", "data da transação", "data de compra", "release_date", "data movimento"],
  description: ["descrição", "descricao", "histórico", "historico", "description", "lançamento", "lancamento", "memo", "estabelecimento", "título", "titulo", "title", "transaction_type", "detalhes"],
  amount: ["valor", "amount", "valor (r$)", "quantia", "montante", "transaction_net_amount", "valor em r$", "valor (em r$)", "valor r$"],
  debit: ["débito", "debito", "saída", "saida", "debit", "débitos", "debitos", "saídas", "saidas"],
  credit: ["crédito", "credito", "entrada", "credit", "créditos", "creditos", "entradas"],
  id: ["id", "identificador", "fitid", "código", "codigo", "documento", "reference_id"],
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

const FOREIGN_OR_BALANCE = /us\$|usd|dolar|cotacao|saldo|balance|iof|original/;
const DEBIT_WORDS = /^(d|deb|debito|saida|despesa|retirada|-)$/;
const CREDIT_WORDS = /^(c|cred|credito|entrada|receita|deposito|\+)$/;

function headerMapping(header: string[], body: string[][]): CsvMapping | null {
  const h = header.map(norm);
  const exactOrPrefix = (hints: string[], exclude?: RegExp) => {
    const normalized = hints.map(norm);
    const ok = (i: number) => !exclude || !exclude.test(h[i]!);
    const exact = h.findIndex((x, i) => normalized.includes(x) && ok(i));
    if (exact >= 0) return exact;
    return h.findIndex((x, i) => normalized.some((hint) => x.startsWith(hint)) && ok(i));
  };
  const date = exactOrPrefix(HEADER_HINTS.date);
  // Descrição: a primeira coluna reconhecida; uma segunda (ex.: "Detalhes") complementa.
  const descHints = HEADER_HINTS.description.map(norm);
  const descCols = h.map((x, i) => (descHints.includes(x) ? i : -1)).filter((i) => i >= 0 && i !== date);
  const description = descCols[0] ?? exactOrPrefix(HEADER_HINTS.description);
  // Valor: entre várias colunas "Valor", prefere a em reais e nunca a de dólar, cotação ou saldo.
  const amountHints = HEADER_HINTS.amount.map(norm);
  const amountCols = h.map((x, i) => (amountHints.some((hint) => x === hint || x.startsWith(hint)) && !FOREIGN_OR_BALANCE.test(x) ? i : -1)).filter((i) => i >= 0);
  const amount = amountCols.find((i) => /r\$|brl|real|reais/.test(h[i]!)) ?? amountCols[0] ?? -1;
  const debit = exactOrPrefix(HEADER_HINTS.debit, FOREIGN_OR_BALANCE);
  const credit = exactOrPrefix(HEADER_HINTS.credit, FOREIGN_OR_BALANCE);
  const id = exactOrPrefix(HEADER_HINTS.id);
  const balance = h.findIndex((x) => /^saldo|^partial_balance|^balance/.test(x));
  const installment = h.findIndex((x) => /^parcela|^installment/.test(x));
  // Natureza só vale se os valores da coluna forem mesmo D/C ou Entrada/Saída.
  const type = h.findIndex((x, i) => {
    if (!/^(tipo|natureza|d\/c|c\/d|dc|cd|credito\/debito|debito\/credito|entrada\/saida)/.test(x) || i === date || i === amount) return false;
    const values = body.map((r) => norm(r[i] ?? "")).filter(Boolean);
    return values.length > 0 && values.filter((v) => DEBIT_WORDS.test(v) || CREDIT_WORDS.test(v)).length >= values.length * 0.6;
  });
  if (date < 0 || description < 0 || !(amount >= 0 || (debit >= 0 && credit >= 0))) return null;
  return {
    dateColumn: date,
    descriptionColumn: description,
    extraDescriptionColumn: descCols[1] ?? null,
    amountColumn: amount >= 0 ? amount : null,
    debitColumn: amount >= 0 ? null : debit,
    creditColumn: amount >= 0 ? null : credit,
    typeColumn: type >= 0 ? type : null,
    balanceColumn: balance >= 0 ? balance : null,
    installmentColumn: installment >= 0 ? installment : null,
    idColumn: id >= 0 ? id : null,
    hasHeader: true,
  };
}

/** Sugere o mapeamento de colunas pelo cabeçalho (procurado nas primeiras linhas). */
export function suggestMapping(rows: string[][]): CsvMapping | null {
  if (!rows[0]) return null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = headerMapping(rows[i]!, rows.slice(i + 1, i + 41));
    if (m) return { ...m, headerRow: i };
  }
  // Sem cabeçalho reconhecível: tenta inferir pela primeira linha de dados (data, descrição, valor).
  const first = rows[0]!;
  const dateIdx = first.findIndex((c) => parseFlexibleDate(c) !== null);
  if (dateIdx < 0) return null;
  const amountIdx = first.findIndex((c, i) => i !== dateIdx && /^[-+(]?\s*(R\$)?\s*[\d.,]+\)?-?$/.test(c) && /\d/.test(c));
  const descIdx = first.findIndex((c, i) => i !== dateIdx && i !== amountIdx && c.length > 0);
  if (amountIdx < 0 || descIdx < 0) return null;
  return { dateColumn: dateIdx, descriptionColumn: descIdx, amountColumn: amountIdx, hasHeader: false };
}

/** Ordem dia/mês do arquivo: se algum "primeiro número" passa de 12, é dia; se só o segundo passa, é mês/dia. */
function detectDateOrder(values: readonly string[]): "dmy" | "mdy" {
  let firstOver = false;
  let secondOver = false;
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver = true;
    if (Number(m[2]) > 12) secondOver = true;
  }
  return !firstOver && secondOver ? "mdy" : "dmy";
}

function parseInstallmentCell(value: string): InstallmentInfo | null {
  const m = /(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/.exec(value);
  if (!m) return null;
  const number = Number(m[1]);
  const of = Number(m[2]);
  return number >= 1 && of >= 2 && number <= of ? { number, of } : null;
}

export function parseCsv(text: string, mapping?: CsvMapping | null, options: { today?: ISODate } = {}): ParseResult & { mapping: CsvMapping | null; preview: string[][] } {
  const rows = parseCsvText(text);
  const map = mapping ?? suggestMapping(rows);
  const result: ParseResult & { mapping: CsvMapping | null; preview: string[][] } = {
    rows: [],
    errors: [],
    ignored: [],
    meta: { format: "csv" },
    mapping: map,
    preview: rows.slice(0, 6),
  };
  if (!map) {
    result.errors.push({ line: 1, message: "Não consegui identificar as colunas de data, descrição e valor. Ajuste o mapeamento." });
    return result;
  }
  const headerRow = map.hasHeader ? (map.headerRow ?? 0) : -1;
  const dataRows = rows.slice(headerRow + 1);
  const offset = headerRow + 2;
  const valueCells = dataRows.flatMap((r) => [map.amountColumn, map.debitColumn, map.creditColumn].filter((c): c is number => c != null).map((c) => r[c] ?? "")).filter(Boolean);
  const dec = map.decimalSeparator ?? detectDecimalSeparator(valueCells);
  const order = detectDateOrder(dataRows.map((r) => r[map.dateColumn] ?? ""));
  const money = (cell: string) => parseMoney(cell, dec);
  dataRows.forEach((r, idx) => {
    const line = idx + offset;
    const base = (r[map.descriptionColumn] ?? "").trim();
    const extra = map.extraDescriptionColumn != null ? (r[map.extraDescriptionColumn] ?? "").trim() : "";
    const description = [base, extra && extra !== base ? extra : ""].filter(Boolean).join(" — ") || "Sem descrição";
    if (isBalanceLine(base)) {
      result.ignored!.push({ line, message: `Linha de saldo ignorada: "${base}"` });
      return;
    }
    const date = parseFlexibleDate(r[map.dateColumn] ?? "", { order, referenceDate: options.today });
    if (!date) {
      result.errors.push({ line, message: `Data inválida: "${r[map.dateColumn] ?? ""}"` });
      return;
    }
    let amount: number;
    try {
      if (map.amountColumn != null) {
        amount = money(r[map.amountColumn] ?? "");
      } else {
        const d = (r[map.debitColumn ?? -1] ?? "").trim();
        const c = (r[map.creditColumn ?? -1] ?? "").trim();
        const debit = d ? Math.abs(money(d)) : 0;
        const credit = c ? Math.abs(money(c)) : 0;
        amount = credit - debit;
      }
    } catch {
      result.errors.push({ line, message: "Valor inválido" });
      return;
    }
    if (amount === 0) {
      result.ignored!.push({ line, message: "Valor zero ignorado" });
      return;
    }
    // Valor sem sinal com coluna de natureza: o sinal vem da natureza.
    if (map.typeColumn != null) {
      const t = norm(r[map.typeColumn] ?? "");
      if (DEBIT_WORDS.test(t)) amount = -Math.abs(amount);
      else if (CREDIT_WORDS.test(t)) amount = Math.abs(amount);
    }
    if (map.invertSign) amount = -amount;
    let balanceCents: number | null = null;
    if (map.balanceColumn != null && (r[map.balanceColumn] ?? "").trim()) {
      try {
        balanceCents = money(r[map.balanceColumn]!);
      } catch {
        balanceCents = null;
      }
    }
    const installment = (map.installmentColumn != null ? parseInstallmentCell(r[map.installmentColumn] ?? "") : null) ?? detectInstallment(description, false);
    result.rows.push({
      date,
      description,
      amountCents: amount,
      externalId: map.idColumn != null ? r[map.idColumn] || null : null,
      rawIndex: line,
      balanceCents,
      installment,
    });
  });
  return result;
}
