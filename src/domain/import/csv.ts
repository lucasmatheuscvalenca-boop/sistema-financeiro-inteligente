import { parseFlexibleDate } from "../dates";
import { parseMoney, type DecimalSeparator } from "../money";
import type { ParseResult } from "./types";

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
  /** Coluna única de valor com sinal. */
  amountColumn?: number | null;
  /** Ou colunas separadas de débito e crédito. */
  debitColumn?: number | null;
  creditColumn?: number | null;
  /** Coluna opcional com identificador único da transação. */
  idColumn?: number | null;
  hasHeader: boolean;
  decimalSeparator?: DecimalSeparator;
  /** Inverte o sinal (útil para faturas de cartão em que compras vêm positivas). */
  invertSign?: boolean;
}

const HEADER_HINTS = {
  date: ["data", "date", "dt", "data lançamento", "data lancamento", "data da transação"],
  description: ["descrição", "descricao", "histórico", "historico", "description", "lançamento", "lancamento", "memo", "estabelecimento", "título", "titulo"],
  amount: ["valor", "amount", "valor (r$)", "quantia", "montante"],
  debit: ["débito", "debito", "saída", "saida", "debit"],
  credit: ["crédito", "credito", "entrada", "credit"],
  id: ["id", "identificador", "fitid", "código", "codigo", "documento"],
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

/** Sugere o mapeamento de colunas pelo cabeçalho. */
export function suggestMapping(rows: string[][]): CsvMapping | null {
  const header = rows[0];
  if (!header) return null;
  const find = (hints: string[]) => {
    const normalized = hints.map(norm);
    const idx = header.findIndex((h) => normalized.includes(norm(h)));
    if (idx >= 0) return idx;
    return header.findIndex((h) => normalized.some((hint) => norm(h).startsWith(hint)));
  };
  const date = find(HEADER_HINTS.date);
  const description = find(HEADER_HINTS.description);
  const amount = find(HEADER_HINTS.amount);
  const debit = find(HEADER_HINTS.debit);
  const credit = find(HEADER_HINTS.credit);
  const id = find(HEADER_HINTS.id);
  if (date >= 0 && description >= 0 && (amount >= 0 || (debit >= 0 && credit >= 0))) {
    return {
      dateColumn: date,
      descriptionColumn: description,
      amountColumn: amount >= 0 ? amount : null,
      debitColumn: amount >= 0 ? null : debit,
      creditColumn: amount >= 0 ? null : credit,
      idColumn: id >= 0 ? id : null,
      hasHeader: true,
    };
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

export function parseCsv(text: string, mapping?: CsvMapping | null): ParseResult & { mapping: CsvMapping | null; preview: string[][] } {
  const rows = parseCsvText(text);
  const map = mapping ?? suggestMapping(rows);
  const result: ParseResult & { mapping: CsvMapping | null; preview: string[][] } = {
    rows: [],
    errors: [],
    meta: { format: "csv" },
    mapping: map,
    preview: rows.slice(0, 6),
  };
  if (!map) {
    result.errors.push({ line: 1, message: "Não consegui identificar as colunas de data, descrição e valor. Ajuste o mapeamento." });
    return result;
  }
  const dataRows = map.hasHeader ? rows.slice(1) : rows;
  const offset = map.hasHeader ? 2 : 1;
  const dec = map.decimalSeparator ?? "auto";
  dataRows.forEach((r, idx) => {
    const line = idx + offset;
    const date = parseFlexibleDate(r[map.dateColumn] ?? "");
    if (!date) {
      result.errors.push({ line, message: `Data inválida: "${r[map.dateColumn] ?? ""}"` });
      return;
    }
    const description = (r[map.descriptionColumn] ?? "").trim() || "Sem descrição";
    let amount: number;
    try {
      if (map.amountColumn != null) {
        amount = parseMoney(r[map.amountColumn] ?? "", dec);
      } else {
        const d = (r[map.debitColumn ?? -1] ?? "").trim();
        const c = (r[map.creditColumn ?? -1] ?? "").trim();
        const debit = d ? Math.abs(parseMoney(d, dec)) : 0;
        const credit = c ? Math.abs(parseMoney(c, dec)) : 0;
        amount = credit - debit;
      }
    } catch {
      result.errors.push({ line, message: "Valor inválido" });
      return;
    }
    if (amount === 0) {
      result.errors.push({ line, message: "Valor zero ignorado" });
      return;
    }
    if (map.invertSign) amount = -amount;
    result.rows.push({
      date,
      description,
      amountCents: amount,
      externalId: map.idColumn != null ? r[map.idColumn] || null : null,
      rawIndex: line,
    });
  });
  return result;
}
