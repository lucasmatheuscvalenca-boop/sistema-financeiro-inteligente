import { addDays, addMonths, type ISODate } from "../dates";
import type { DecimalSeparator } from "../money";
import type { ImportedRow, InstallmentInfo } from "./types";

function plain(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Linhas de saldo que alguns bancos (Banco do Brasil, Itaú, Bradesco) colocam no meio do
 * extrato. Não são lançamentos: importá-las soma o saldo como se fosse receita ou despesa.
 */
export function isBalanceLine(description: string): boolean {
  const d = plain(description).trim();
  return /^s\s*a\s*l\s*d\s*o(\s|$|:)/.test(d) || /^saldo\s+(anterior|do\s+dia|final|inicial|atual|total|disponivel|em\s+conta|bloqueado|dia|da\s+conta)\b/.test(d) || /^(sdo|saldo)\s*(cta|c\/c|conta)\b/.test(d);
}

/** Pagamento de fatura de cartão visto pelo lado da conta ou do cartão. */
export function isCardPayment(description: string): boolean {
  const d = plain(description);
  return (
    /\b(pagamento|pagto|pgto|pag)\.?\s*(de\s+|da\s+|do\s+)?(fatura|cartao)/.test(d) ||
    /\bfatura\s+(do\s+|de\s+)?(cartao|nubank|itau|inter|c6|santander|bradesco|xp|picpay|mercado\s*pago)/.test(d) ||
    /\bdeb(ito)?\.?\s*(aut(omatico)?\.?\s*)?(de\s+)?fatura/.test(d) ||
    /\bpagamento\s+recebido\b/.test(d) ||
    /credit\s*card\s*payment|bill\s*payment/.test(d)
  );
}

/**
 * Movimentação entre contas da própria pessoa (aplicação, resgate, caixinha, transferência
 * entre contas). Contar como receita ou despesa infla os dois lados do mês.
 */
export function isOwnTransfer(description: string): boolean {
  const d = plain(description);
  return (
    /\b(aplicacao|aplic\.|resgate|rdb|cdb|lci|lca|tesouro\s+direto|poupanca|caixinha|cofrinho|porquinho|dinheiro\s+guardado|guardad[oa]\s+(na|no|em)|investimento\s+(em|automatico)|rend(imento)?\s+automatico)\b/.test(d) ||
    /\btransf(erencia)?\.?\s*(entre\s+contas|mesma\s+titularidade|para\s+conta\s+propria|entre\s+contas\s+proprias|interna)\b/.test(d) ||
    /\bmesma\s+titularidade\b/.test(d)
  );
}

/**
 * Parcela no texto: "Parcela 2/10", "Parc 2 de 10", "2/10" no fim (comum em faturas).
 * O padrão solto no fim só vale quando `trailing` é verdadeiro (faturas de cartão), porque em
 * extrato de conta "05/10" no fim costuma ser data.
 */
export function detectInstallment(text: string, trailing = true): InstallmentInfo | null {
  const d = plain(text);
  let m = /\bparc(?:ela)?s?\.?\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/.exec(d);
  if (!m && trailing) m = /(?:^|\s|-)(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(d);
  if (!m) return null;
  const number = Number(m[1]);
  const of = Number(m[2]);
  if (!(number >= 1 && of >= 2 && number <= of && of <= 72)) return null;
  return { number, of };
}

/** Separador decimal do arquivo inteiro, pela forma da maioria dos valores. */
export function detectDecimalSeparator(values: readonly string[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const v = raw.replace(/[R$\s()+-]|BRL/gi, "");
    if (/,\d{1,2}$/.test(v)) comma++;
    else if (/\.\d{1,2}$/.test(v)) dot++;
  }
  if (comma > dot) return ",";
  if (dot > comma) return ".";
  return "auto";
}

/**
 * Faturas em CSV costumam trazer compras positivas e pagamentos negativos (Nubank, C6, Inter);
 * o NEXO usa o contrário (compra = saída). Se a maioria das linhas que não são pagamento for
 * positiva, o arquivo inteiro está invertido.
 */
export function cardSignsInverted(rows: readonly ImportedRow[]): boolean {
  let positive = 0;
  let negative = 0;
  for (const r of rows) {
    if (isCardPayment(r.description)) continue;
    if (r.amountCents > 0) positive++;
    else if (r.amountCents < 0) negative++;
  }
  return positive > negative;
}

/**
 * Data de cada parcela no padrão do NEXO (data da compra + n−1 meses). Muitos bancos repetem a
 * data da compra original em todas as faturas; quando a linha está muito antes do restante do
 * arquivo, a data é a original e precisa ser deslocada para a parcela certa.
 */
export function installmentDate(row: ImportedRow, latestDateInFile: ISODate): ISODate {
  const inst = row.installment;
  if (!inst || inst.number <= 1) return row.date;
  if (row.date >= addDays(latestDateInFile, -40)) return row.date;
  return addMonths(row.date, inst.number - 1);
}

export interface PendingOccurrence {
  recurrenceId: string;
  date: ISODate;
  /** Valor previsto, positivo. */
  amountCents: number;
  kind: "income" | "expense" | "transfer";
  accountId: string | null;
  cardId: string | null;
  description: string;
  certainty: "scheduled" | "estimated";
}

export interface OccurrenceCandidate {
  index: number;
  date: ISODate;
  /** Valor com sinal (negativo = saída). */
  amountCents: number;
  kind: "income" | "expense";
  description: string;
  accountId: string | null;
  cardId: string | null;
}

function tokenSet(s: string): Set<string> {
  return new Set(
    plain(s)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

function similarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/**
 * Liga lançamentos importados às ocorrências de recorrências que eles realizam (aluguel, luz,
 * salário). Sem isso, a ocorrência continua "prevista" e a projeção conta a conta duas vezes.
 * Critério: mesmo tipo e mesma conta/cartão, até 7 dias de diferença e valor parecido (até 15%
 * ou R$ 5); estimativas (como comissão) aceitam qualquer valor, mas exigem descrição parecida.
 */
export function matchOccurrences(candidates: readonly OccurrenceCandidate[], occurrences: readonly PendingOccurrence[]): Map<number, PendingOccurrence> {
  const used = new Set<string>();
  const result = new Map<number, PendingOccurrence>();
  const scored: Array<{ index: number; occ: PendingOccurrence; score: number }> = [];
  for (const c of candidates) {
    const amount = Math.abs(c.amountCents);
    for (const o of occurrences) {
      if (o.kind !== c.kind) continue;
      if (c.cardId ? o.cardId !== c.cardId : o.accountId !== c.accountId) continue;
      const days = Math.abs((Date.parse(o.date) - Date.parse(c.date)) / 86_400_000);
      if (days > 7) continue;
      const sim = similarity(o.description, c.description);
      const close = Math.abs(amount - o.amountCents) <= Math.max(o.amountCents * 0.15, 500);
      if (!(close || (o.certainty === "estimated" && sim > 0))) continue;
      scored.push({ index: c.index, occ: o, score: (close ? 2 : 0) + sim - days * 0.1 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) {
    const key = `${s.occ.recurrenceId}|${s.occ.date}`;
    if (result.has(s.index) || used.has(key)) continue;
    used.add(key);
    result.set(s.index, s.occ);
  }
  return result;
}
