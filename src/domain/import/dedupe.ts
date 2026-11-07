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
  /** Origem do lançamento (manual, import, connector, demo), quando conhecida. */
  source?: string | null;
}

export type DedupeDecision =
  | { row: ImportedRow; action: "import"; fingerprint: string }
  | { row: ImportedRow; action: "duplicate"; fingerprint: string; reason: "external_id" | "fingerprint" | "in_file"; existingId?: string }
  | { row: ImportedRow; action: "match"; fingerprint: string; existingId: string; score: number };

/**
 * Decide o que fazer com cada linha importada, em duas passadas:
 * 1. exatos, no arquivo inteiro: mesmo identificador do banco (FITID) já gravado, ou mesma
 *    impressão digital (contando ocorrências: duas compras idênticas no mesmo dia são legítimas)
 *    → duplicate;
 * 2. aproximados, só com o que sobrou: possível correspondência com um lançamento manual (mesmo
 *    valor, data ±3 dias) → match, sugerida para conciliação em vez de criar um lançamento novo.
 * O resto → import.
 *
 * Fazer os exatos antes impede que uma linha "roube" por aproximação o lançamento que era a
 * cópia exata de outra (ex.: o ônibus de R$ 4,40 de todo dia, num extrato em ordem decrescente).
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
  // `used` garante que ele só "absorve" uma linha do arquivo.
  const byKey = new Map<string, string[]>();
  const index = (key: string, id: string) => byKey.set(key, [...(byKey.get(key) ?? []), id]);
  for (const e of existing) {
    if (e.externalId) byExternal.set(e.externalId, e);
    index(fingerprintKey(e), e.id);
    if (e.fingerprint) index(e.fingerprint, e.id);
  }
  const used = new Set<string>();
  const take = (keys: string[]) => {
    for (const k of keys) {
      const id = byKey.get(k)?.find((x) => !used.has(x));
      if (id) return id;
    }
    return null;
  };

  // 1ª passada: só correspondências exatas. Primeiro o identificador do banco, que é definitivo...
  const seenExternal = new Set<string>();
  const decisions: Array<DedupeDecision | null> = rows.map(() => null);
  rows.forEach((row, i) => {
    if (!row.externalId) return;
    const fp = fingerprintKey(row);
    if (seenExternal.has(row.externalId)) {
      decisions[i] = { row, action: "duplicate", fingerprint: fp, reason: "in_file" };
      return;
    }
    seenExternal.add(row.externalId);
    const hit = byExternal.get(row.externalId);
    if (hit) {
      used.add(hit.id);
      decisions[i] = { row, action: "duplicate", fingerprint: fp, reason: "external_id", existingId: hit.id };
    }
  });
  // ...depois a impressão digital.
  rows.forEach((row, i) => {
    if (decisions[i]) return;
    const fp = fingerprintKey(row);
    const sameFp = take([fp, ...(options.storedFingerprints?.(row) ?? [])]);
    if (sameFp) {
      used.add(sameFp);
      decisions[i] = { row, action: "duplicate", fingerprint: fp, reason: "fingerprint", existingId: sameFp };
    }
  });

  // 2ª passada: aproximações, escolhidas pela melhor nota no arquivo inteiro (e não na ordem
  // das linhas), para que a mais próxima de cada lançamento fique com ele.
  const pairs: Array<{ i: number; id: string; score: number }> = [];
  rows.forEach((row, i) => {
    if (decisions[i]) return;
    for (const c of candidates(row, existing, used)) pairs.push({ i, ...c });
  });
  pairs.sort((a, b) => b.score - a.score || a.i - b.i);
  for (const p of pairs) {
    if (decisions[p.i] || used.has(p.id)) continue;
    used.add(p.id);
    const row = rows[p.i]!;
    decisions[p.i] = { row, action: "match", fingerprint: fingerprintKey(row), existingId: p.id, score: p.score };
  }
  return decisions.map((d, i) => d ?? { row: rows[i]!, action: "import", fingerprint: fingerprintKey(rows[i]!) });
}

/** O lançamento já veio de um extrato ou do banco (não foi digitado pela pessoa). */
function fromStatement(e: ExistingTx): boolean {
  return !!e.externalId || !!e.fingerprint || (!!e.source && e.source !== "manual");
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

/** Lançamentos que podem ser esta linha por aproximação, com a nota de cada um. */
function candidates(row: ImportedRow, existing: readonly ExistingTx[], used: Set<string>): Array<{ id: string; score: number }> {
  const out: Array<{ id: string; score: number }> = [];
  for (const e of existing) {
    if (used.has(e.id)) continue;
    if (e.amountCents !== row.amountCents) continue;
    const days = Math.abs(diffDays(e.date, row.date));
    if (days > 3) continue;
    // Aproximação é para conciliar o que a pessoa lançou à mão. Um lançamento que já veio de um
    // extrato ou do banco é outra linha de extrato: só casa quando é o mesmo período exportado em
    // outro formato (um lado com identificador do banco e o outro sem, como OFX e depois CSV), no
    // mesmo dia ou no seguinte. Fora disso, mesmo valor em outro dia é outro lançamento.
    if (fromStatement(e) && (!!e.externalId === !!row.externalId || days > 1)) continue;
    const score = 1 - days * 0.15 + descriptionSimilarity(e.description, row.description) * 0.5;
    out.push({ id: e.id, score: Math.round(score * 100) / 100 });
  }
  return out;
}
