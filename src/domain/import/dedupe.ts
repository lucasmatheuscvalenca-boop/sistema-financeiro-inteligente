import { diffDays, type ISODate } from "../dates";
import type { Cents } from "../money";
import type { ImportedRow } from "./types";

export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave canônica usada para detectar duplicatas quando não há identificador do banco. */
export function fingerprintKey(row: { date: ISODate; amountCents: Cents; description: string }): string {
  return `${row.date}|${row.amountCents}|${normalizeDescription(row.description)}`;
}

export interface ExistingTx {
  id: string;
  date: ISODate;
  /** Valor com sinal (negativo = saída) na conta/cartão de destino da importação. */
  amountCents: Cents;
  description: string;
  externalId?: string | null;
  fingerprint?: string | null;
}

export type DedupeDecision =
  | { row: ImportedRow; action: "import"; fingerprint: string }
  | { row: ImportedRow; action: "duplicate"; fingerprint: string; reason: "external_id" | "fingerprint" | "in_file"; existingId?: string }
  | { row: ImportedRow; action: "match"; fingerprint: string; existingId: string; score: number };

/**
 * Decide o que fazer com cada linha importada:
 * - duplicate: mesmo FITID já importado, ou mesma impressão digital já existente
 *   (contando ocorrências: duas compras idênticas no mesmo dia são legítimas);
 * - match: possível correspondência com um lançamento manual (mesmo valor, data ±3 dias),
 *   sugerida para conciliação em vez de criar um lançamento novo;
 * - import: lançamento novo.
 */
export function dedupeRows(rows: readonly ImportedRow[], existing: readonly ExistingTx[]): DedupeDecision[] {
  const byExternal = new Map<string, ExistingTx>();
  const fingerprintCounts = new Map<string, string[]>();
  for (const e of existing) {
    if (e.externalId) byExternal.set(e.externalId, e);
    const fp = e.fingerprint ?? fingerprintKey(e);
    const list = fingerprintCounts.get(fp) ?? [];
    list.push(e.id);
    fingerprintCounts.set(fp, list);
  }
  const usedForMatch = new Set<string>();
  const seenExternal = new Set<string>();
  const decisions: DedupeDecision[] = [];
  for (const row of rows) {
    const fp = fingerprintKey(row);
    if (row.externalId) {
      if (seenExternal.has(row.externalId)) {
        decisions.push({ row, action: "duplicate", fingerprint: fp, reason: "in_file" });
        continue;
      }
      seenExternal.add(row.externalId);
      const hit = byExternal.get(row.externalId);
      if (hit) {
        decisions.push({ row, action: "duplicate", fingerprint: fp, reason: "external_id", existingId: hit.id });
        continue;
      }
    }
    const sameFp = fingerprintCounts.get(fp);
    if (sameFp && sameFp.length > 0) {
      const existingId = sameFp.shift()!;
      usedForMatch.add(existingId);
      decisions.push({ row, action: "duplicate", fingerprint: fp, reason: "fingerprint", existingId });
      continue;
    }
    const candidate = bestMatch(row, existing, usedForMatch);
    if (candidate) {
      usedForMatch.add(candidate.id);
      decisions.push({ row, action: "match", fingerprint: fp, existingId: candidate.id, score: candidate.score });
      continue;
    }
    decisions.push({ row, action: "import", fingerprint: fp });
  }
  return decisions;
}

function tokens(s: string): Set<string> {
  return new Set(normalizeDescription(s).split(" ").filter((t) => t.length > 2));
}

export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function bestMatch(row: ImportedRow, existing: readonly ExistingTx[], used: Set<string>): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const e of existing) {
    if (used.has(e.id) || e.externalId) continue;
    if (e.amountCents !== row.amountCents) continue;
    const days = Math.abs(diffDays(e.date, row.date));
    if (days > 3) continue;
    const score = 1 - days * 0.15 + descriptionSimilarity(e.description, row.description) * 0.5;
    if (!best || score > best.score) best = { id: e.id, score: Math.round(score * 100) / 100 };
  }
  return best;
}
