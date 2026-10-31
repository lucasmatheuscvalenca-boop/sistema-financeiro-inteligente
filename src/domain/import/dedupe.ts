import { diffDays, type ISODate } from "../dates";
import type { Cents } from "../money";
import { detectInstallment } from "./classify";
import type { ImportedRow, InstallmentInfo } from "./types";

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

/**
 * Chave canônica usada para detectar duplicatas quando não há identificador do banco. A parcela
 * entra na chave porque a descrição normalizada perde "02/10": sem isso, a parcela 3 de uma
 * fatura seria tomada pela parcela 2 da fatura anterior.
 */
export function fingerprintKey(row: { date: ISODate; amountCents: Cents; description: string; installment?: InstallmentInfo | null }): string {
  const inst = row.installment ?? detectInstallment(row.description, true);
  return `${row.date}|${row.amountCents}|${normalizeDescription(row.description)}${inst ? `|p${inst.number}/${inst.of}` : ""}`;
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
export function dedupeRows(
  rows: readonly ImportedRow[],
  existing: readonly ExistingTx[],
  options: {
    /** Impressões digitais gravadas (hash) que esta linha teria; comparadas com `ExistingTx.fingerprint`. */
    storedFingerprints?: (row: ImportedRow) => string[];
  } = {},
): DedupeDecision[] {
  const byExternal = new Map<string, ExistingTx>();
  // Cada lançamento existente entra pela chave calculada e pela impressão gravada; o conjunto
  // `usedForMatch` garante que ele só "absorve" uma linha do arquivo.
  const byKey = new Map<string, string[]>();
  const index = (key: string, id: string) => byKey.set(key, [...(byKey.get(key) ?? []), id]);
  for (const e of existing) {
    if (e.externalId) byExternal.set(e.externalId, e);
    index(fingerprintKey(e), e.id);
    if (e.fingerprint) index(e.fingerprint, e.id);
  }
  const usedForMatch = new Set<string>();
  const take = (keys: string[]) => {
    for (const k of keys) {
      const id = byKey.get(k)?.find((x) => !usedForMatch.has(x));
      if (id) return id;
    }
    return null;
  };
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
        usedForMatch.add(hit.id);
        decisions.push({ row, action: "duplicate", fingerprint: fp, reason: "external_id", existingId: hit.id });
        continue;
      }
    }
    const sameFp = take([fp, ...(options.storedFingerprints?.(row) ?? [])]);
    if (sameFp) {
      usedForMatch.add(sameFp);
      decisions.push({ row, action: "duplicate", fingerprint: fp, reason: "fingerprint", existingId: sameFp });
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
    if (used.has(e.id)) continue;
    if (e.amountCents !== row.amountCents) continue;
    const days = Math.abs(diffDays(e.date, row.date));
    // Lançamento que já veio do banco (com identificador) só casa com linha sem identificador do
    // mesmo dia ou do seguinte: é o mesmo período exportado em outro formato (OFX e depois CSV).
    if (e.externalId && (row.externalId || days > 1)) continue;
    if (days > 3) continue;
    const score = 1 - days * 0.15 + descriptionSimilarity(e.description, row.description) * 0.5;
    if (!best || score > best.score) best = { id: e.id, score: Math.round(score * 100) / 100 };
  }
  return best;
}
