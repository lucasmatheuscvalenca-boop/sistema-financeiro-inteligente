import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { invoiceForPurchase, shiftInvoice } from "@/domain/credit-card";
import { addDays, type ISODate } from "@/domain/dates";
import { cardSignsInverted, detectInstallment, installmentDate, isCardPayment, isOwnTransfer, matchOccurrences } from "@/domain/import/classify";
import { parseCsv, type CsvMapping } from "@/domain/import/csv";
import { dedupeRows, fingerprintKey, normalizeDescription, type DedupeDecision, type ExistingTx } from "@/domain/import/dedupe";
import { looksLikeOfx, parseOfx } from "@/domain/import/ofx";
import type { ImportedRow, InstallmentInfo, ParseResult } from "@/domain/import/types";
import { parseMoney } from "@/domain/money";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import { sha256 } from "../security/crypto";
import type { ServiceContext } from "./context";
import { optionalUuid, parse } from "./common";
import { cycleOf, ensureInvoice } from "./cards";
import type { TxRow } from "./ledger";
import { pendingOccurrences } from "./recurrences";

const MAX_FILE_CHARS = 2_000_000;
const MAX_ROWS = 5000;

const targetSchema = z
  .object({ accountId: optionalUuid, cardId: optionalUuid })
  .refine((t) => !!t.accountId !== !!t.cardId, "Escolha uma conta OU um cartão de destino");

export interface ImportRequest {
  fileName: string;
  content: string;
  format?: "csv" | "ofx";
  accountId?: string | null;
  cardId?: string | null;
  mapping?: CsvMapping | null;
}

/**
 * Tipo de cada linha na importação. `card_payment_credit` é o pagamento visto na fatura: não é
 * gravado pelo lado do cartão, porque o pagamento entra pela conta que pagou.
 */
export type ImportKind = "income" | "expense" | "refund" | "transfer" | "card_payment" | "card_payment_credit";

export interface PreviewRow {
  index: number;
  /** Data que será gravada (na fatura, a da parcela). */
  date: string;
  /** Data como veio no arquivo, quando diferente. */
  originalDate?: string;
  description: string;
  /** Valor com sinal do ponto de vista do destino (negativo = saída da conta ou compra no cartão). */
  amountCents: number;
  externalId: string | null;
  action: DedupeDecision["action"];
  reason?: string;
  existingId?: string;
  existingDescription?: string;
  suggestedKind: ImportKind;
  /** Cartão pago, quando o tipo é pagamento de fatura. */
  suggestedCardId: string | null;
  /** Outra conta envolvida, quando o tipo é transferência. */
  suggestedAccountId: string | null;
  suggestedCategoryId: string | null;
  installment: InstallmentInfo | null;
  /** Ocorrência de recorrência que esta linha realiza (ex.: o aluguel de outubro). */
  recurrence: { id: string; occurrenceDate: string; description: string } | null;
}

/** Valor com sinal de uma transação existente, do ponto de vista da conta/cartão de destino. */
function signedFor(t: TxRow, target: { accountId?: string | null; cardId?: string | null }): number | null {
  if (target.cardId) {
    if (t.cardId !== target.cardId) return null;
    if (t.kind === "expense") return -t.amountCents;
    if (t.kind === "refund" || t.kind === "card_payment") return t.amountCents;
    return null;
  }
  const id = target.accountId;
  if (t.kind === "income" && t.accountId === id) return t.amountCents;
  if (t.kind === "expense" && t.accountId === id && !t.cardId) return -t.amountCents;
  if (t.kind === "refund" && t.accountId === id && !t.cardId) return t.amountCents;
  if (t.kind === "transfer" && t.accountId === id) return -t.amountCents;
  if (t.kind === "transfer" && t.toAccountId === id) return t.amountCents;
  if (t.kind === "card_payment" && t.accountId === id) return -t.amountCents;
  return null;
}

function parseFile(req: ImportRequest, today: ISODate): ParseResult & { mapping?: CsvMapping | null; preview?: string[][] } {
  if (req.content.length > MAX_FILE_CHARS) throw new ValidationError("Arquivo muito grande (limite de 2 MB)");
  const format = req.format ?? (looksLikeOfx(req.content) || /\.ofx$/i.test(req.fileName) ? "ofx" : "csv");
  const result = format === "ofx" ? parseOfx(req.content) : parseCsv(req.content, req.mapping, { today });
  if (result.rows.length > MAX_ROWS) throw new ValidationError(`O arquivo tem mais de ${MAX_ROWS} lançamentos. Divida em partes menores.`);
  return result;
}

/**
 * Ajustes que dependem do destino, feitos antes da deduplicação para que a reimportação
 * encontre exatamente o que foi gravado: na fatura, sinal invertido quando as compras vêm
 * positivas e data de cada parcela.
 */
function normalizeRows(rows: ImportedRow[], isCard: boolean): { rows: ImportedRow[]; originalDates: Map<ImportedRow, ISODate>; signsInverted: boolean } {
  const originalDates = new Map<ImportedRow, ISODate>();
  if (!isCard || rows.length === 0) return { rows, originalDates, signsInverted: false };
  const signsInverted = cardSignsInverted(rows);
  const latest = rows.map((r) => r.date).sort().at(-1)!;
  const out = rows.map((r) => {
    const row: ImportedRow = { ...r, amountCents: signsInverted ? -r.amountCents : r.amountCents, installment: r.installment ?? detectInstallment(r.description, true) };
    const date = installmentDate(row, latest);
    if (date !== row.date) {
      originalDates.set(row, row.date);
      row.date = date;
    }
    return row;
  });
  return { rows: out, originalDates, signsInverted };
}

function storedFingerprint(targetId: string, row: { date: ISODate; amountCents: number; description: string; installment?: InstallmentInfo | null }): string {
  return sha256(`${targetId}|${fingerprintKey(row)}`);
}

/** Formato antigo da impressão gravada, para reconhecer importações feitas antes desta versão. */
function legacyFingerprint(targetId: string, row: ImportedRow): string {
  return sha256(`${targetId}|${row.date}|${row.amountCents}|${normalizeDescription(row.description)}`);
}

async function existingFor(ctx: ServiceContext, target: { accountId?: string | null; cardId?: string | null }, rows: ImportedRow[]): Promise<{ existing: ExistingTx[]; txs: TxRow[] }> {
  if (rows.length === 0) return { existing: [], txs: [] };
  const dates = rows.map((r) => r.date).sort();
  const from = addDays(dates[0]!, -5);
  const to = addDays(dates[dates.length - 1]!, 5);
  const txs = await ctx.db
    .select()
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), gte(s.transactions.date, from), lte(s.transactions.date, to)));
  const existing: ExistingTx[] = [];
  for (const t of txs) {
    const signed = signedFor(t, target);
    if (signed === null) continue;
    existing.push({ id: t.id, date: t.date, amountCents: signed, description: t.description, externalId: t.externalId, fingerprint: t.fingerprint });
  }
  return { existing, txs };
}

async function categoryGuesser(ctx: ServiceContext) {
  const recent = await ctx.db
    .select({ description: s.transactions.description, categoryId: s.transactions.categoryId, kind: s.transactions.kind })
    .from(s.transactions)
    .where(and(eq(s.transactions.userId, ctx.userId), gte(s.transactions.date, addDays(ctx.today, -365))));
  const map = new Map<string, string>();
  for (const r of recent) {
    if (!r.categoryId) continue;
    const key = normalizeDescription(r.description).split(" ").slice(0, 3).join(" ");
    if (key) map.set(`${r.kind}|${key}`, r.categoryId);
  }
  return (kind: string, description: string) => map.get(`${kind}|${normalizeDescription(description).split(" ").slice(0, 3).join(" ")}`) ?? null;
}

type CardRef = { id: string; name: string };
type AccountRef = { id: string; name: string; type: string; purpose: string };

const INVESTMENT_WORDS = /aplica|resgate|rdb|cdb|lci|lca|tesouro|caixinha|cofrinho|porquinho|guardad|investimento|poupan|rendimento/i;
const REFUND_WORDS = /estorno|devolu[cç][aã]o|reembolso|chargeback|cancelamento\s+de\s+compra/i;

function words(s: string): string[] {
  return normalizeDescription(s)
    .split(" ")
    .filter((w) => w.length > 2 && !["cartao", "credito", "card", "conta", "corrente", "banco"].includes(w));
}

/** Cartão citado na descrição ("PAGAMENTO FATURA NUBANK"); com um cartão só, é ele. */
function guessCard(description: string, cards: CardRef[]): string | null {
  if (cards.length === 0) return null;
  const desc = new Set(words(description));
  const named = cards.find((c) => words(c.name).some((w) => desc.has(w)));
  return (named ?? cards[0]!).id;
}

/** Conta do outro lado da transferência: a de investimento/reserva para aplicações e resgates. */
function guessCounterpart(description: string, accounts: AccountRef[]): string | null {
  if (accounts.length === 0) return null;
  const desc = new Set(words(description));
  const named = accounts.find((a) => words(a.name).some((w) => desc.has(w)));
  if (named) return named.id;
  if (INVESTMENT_WORDS.test(description)) {
    const saving = accounts.find((a) => a.purpose !== "spending" || a.type === "investment" || a.type === "savings");
    if (saving) return saving.id;
  }
  return accounts[0]!.id;
}

/** Conta que pagou a fatura: a citada na descrição ou com o nome do cartão; senão a primeira de gastos. */
function guessPayer(description: string, cardName: string, accounts: AccountRef[]): string | null {
  const spending = accounts.filter((a) => a.purpose === "spending");
  const pool = spending.length ? spending : accounts;
  if (pool.length === 0) return null;
  const hints = new Set([...words(description), ...words(cardName)]);
  return (pool.find((a) => words(a.name).some((w) => hints.has(w))) ?? pool[0]!).id;
}

function suggestKind(row: ImportedRow, card: CardRef | null, cards: CardRef[], others: AccountRef[]): { kind: ImportKind; cardId: string | null; accountId: string | null } {
  if (card) {
    if (isCardPayment(row.description) && row.amountCents > 0) {
      // Pagamento visto na fatura: registra saindo da conta que pagou (se for a mesma linha do
      // extrato da conta, a outra importação concilia em vez de duplicar).
      const payer = guessPayer(row.description, card.name, others);
      return payer ? { kind: "card_payment", cardId: card.id, accountId: payer } : { kind: "card_payment_credit", cardId: null, accountId: null };
    }
    return { kind: row.amountCents < 0 ? "expense" : "refund", cardId: null, accountId: null };
  }
  if (row.amountCents < 0 && isCardPayment(row.description) && cards.length) return { kind: "card_payment", cardId: guessCard(row.description, cards), accountId: null };
  if ((row.transferHint || isOwnTransfer(row.description)) && others.length) return { kind: "transfer", cardId: null, accountId: guessCounterpart(row.description, others) };
  if (row.amountCents > 0 && REFUND_WORDS.test(row.description)) return { kind: "refund", cardId: null, accountId: null };
  return { kind: row.amountCents < 0 ? "expense" : "income", cardId: null, accountId: null };
}

/** Recorrências realizadas pelas linhas novas de receita e despesa. */
async function occurrencesFor(
  ctx: ServiceContext,
  decisions: DedupeDecision[],
  kinds: Array<{ kind: ImportKind }>,
  target: { accountId: string | null; cardId: string | null },
) {
  const candidates = decisions.flatMap((d, index) => {
    const kind = kinds[index]!.kind;
    if (d.action !== "import" || (kind !== "income" && kind !== "expense")) return [];
    return [{ index, date: d.row.date, amountCents: d.row.amountCents, kind, description: d.row.description, accountId: target.accountId, cardId: target.cardId } as const];
  });
  if (candidates.length === 0) return new Map();
  const dates = candidates.map((c) => c.date).sort();
  const occurrences = (await pendingOccurrences(ctx, addDays(dates[0]!, -7), addDays(dates[dates.length - 1]!, 7))).map((o) => ({
    recurrenceId: o.recurrence.id,
    date: o.date,
    amountCents: o.amountCents,
    kind: o.recurrence.kind as "income" | "expense" | "transfer",
    accountId: o.recurrence.accountId,
    cardId: o.recurrence.cardId,
    description: o.recurrence.description,
    certainty: o.certainty,
  }));
  return matchOccurrences(candidates, occurrences);
}

async function checkTarget(ctx: ServiceContext, req: ImportRequest) {
  parse(targetSchema, { accountId: req.accountId, cardId: req.cardId });
  if (req.accountId) {
    const [a] = await ctx.db.select().from(s.accounts).where(and(eq(s.accounts.id, req.accountId), eq(s.accounts.userId, ctx.userId)));
    if (!a) throw new NotFoundError("Conta não encontrada");
    return { account: a, card: null };
  }
  const [c] = await ctx.db.select().from(s.creditCards).where(and(eq(s.creditCards.id, req.cardId!), eq(s.creditCards.userId, ctx.userId)));
  if (!c) throw new NotFoundError("Cartão não encontrado");
  return { account: null, card: c };
}

async function refsFor(ctx: ServiceContext, targetAccountId: string | null) {
  const cards = await ctx.db.select({ id: s.creditCards.id, name: s.creditCards.name, archivedAt: s.creditCards.archivedAt }).from(s.creditCards).where(eq(s.creditCards.userId, ctx.userId));
  const accounts = await ctx.db
    .select({ id: s.accounts.id, name: s.accounts.name, type: s.accounts.type, purpose: s.accounts.purpose, archivedAt: s.accounts.archivedAt })
    .from(s.accounts)
    .where(eq(s.accounts.userId, ctx.userId));
  return {
    cards: cards.filter((c) => !c.archivedAt).map(({ id, name }) => ({ id, name })),
    others: accounts.filter((a) => !a.archivedAt && a.id !== targetAccountId).map(({ id, name, type, purpose }) => ({ id, name, type, purpose })),
  };
}

/**
 * Saldo informado pelo próprio extrato no fim de um dia: o LEDGERBAL do OFX ou a coluna de
 * saldo do CSV (na linha mais recente, respeitando se o arquivo está em ordem crescente ou
 * decrescente).
 */
function statementBalance(parsed: ParseResult): { balanceCents: number; date: ISODate } | null {
  const rows = parsed.rows;
  if (parsed.meta.format === "ofx" && parsed.meta.ledgerBalance) {
    try {
      const raw = parsed.meta.ledgerBalance;
      const balanceCents = parseMoney(raw, raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".");
      const date = parsed.meta.ledgerBalanceDate ?? rows.map((r) => r.date).sort().at(-1);
      return date ? { balanceCents, date } : null;
    } catch {
      return null;
    }
  }
  const withBalance = rows.filter((r) => r.balanceCents != null);
  if (withBalance.length === 0) return null;
  const ascending = withBalance[0]!.date <= withBalance[withBalance.length - 1]!.date;
  const last = ascending ? withBalance[withBalance.length - 1]! : withBalance[0]!;
  const latestDate = withBalance.map((r) => r.date).sort().at(-1)!;
  if (last.date !== latestDate) return null;
  return { balanceCents: last.balanceCents!, date: last.date };
}

export async function previewImport(ctx: ServiceContext, req: ImportRequest) {
  const { account, card } = await checkTarget(ctx, req);
  const parsed = parseFile(req, ctx.today);
  const targetId = (req.accountId ?? req.cardId)!;
  const { rows: normalized, originalDates, signsInverted } = normalizeRows(parsed.rows, !!card);
  const { existing, txs } = await existingFor(ctx, req, normalized);
  const decisions = dedupeRows(normalized, existing, { storedFingerprints: (row) => [storedFingerprint(targetId, row), legacyFingerprint(targetId, row)] });
  const guess = await categoryGuesser(ctx);
  const { cards, others } = await refsFor(ctx, account?.id ?? null);
  const byId = new Map(txs.map((t) => [t.id, t]));
  const kinds = decisions.map((d) => suggestKind(d.row, card ? { id: card.id, name: card.name } : null, cards, others));
  const recurrenceMatches = await occurrencesFor(ctx, decisions, kinds, { accountId: account?.id ?? null, cardId: card?.id ?? null });
  const rows: PreviewRow[] = decisions.map((d, index) => {
    const { kind, cardId, accountId } = kinds[index]!;
    const categorized = kind === "income" || kind === "expense" || kind === "refund";
    const occ = recurrenceMatches.get(index);
    return {
      index,
      date: d.row.date,
      originalDate: originalDates.get(d.row),
      description: d.row.description,
      amountCents: d.row.amountCents,
      externalId: d.row.externalId ?? null,
      action: d.action,
      reason: d.action === "duplicate" ? d.reason : undefined,
      existingId: "existingId" in d ? d.existingId : undefined,
      existingDescription: "existingId" in d && d.existingId ? byId.get(d.existingId)?.description : undefined,
      suggestedKind: kind,
      suggestedCardId: cardId,
      suggestedAccountId: accountId,
      suggestedCategoryId: categorized ? guess(kind === "refund" ? "expense" : kind, d.row.description) : null,
      installment: d.row.installment ?? null,
      recurrence: occ ? { id: occ.recurrenceId, occurrenceDate: occ.date, description: occ.description } : null,
    };
  });
  return {
    target: account ? { type: "account" as const, id: account.id, name: account.name } : { type: "card" as const, id: card!.id, name: card!.name },
    rows,
    errors: parsed.errors,
    ignored: parsed.ignored ?? [],
    meta: parsed.meta,
    signsInverted,
    statementBalance: account ? statementBalance(parsed) : null,
    mapping: "mapping" in parsed ? parsed.mapping : undefined,
    preview: "preview" in parsed ? parsed.preview : undefined,
    summary: {
      total: rows.length,
      toImport: rows.filter((r) => r.action === "import").length,
      duplicates: rows.filter((r) => r.action === "duplicate").length,
      matches: rows.filter((r) => r.action === "match").length,
    },
  };
}

export interface ImportChoice {
  index: number;
  /** import: cria; skip: ignora; reconcile: vincula ao lançamento existente sugerido. */
  action: "import" | "skip" | "reconcile";
  /** Tipo escolhido na revisão; sem ele, vale o sugerido. */
  kind?: ImportKind;
  /** Cartão pago (pagamento de fatura) ou outra conta (transferência). */
  cardId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
}

/** Tipos possíveis para uma linha, conforme o destino e o sinal. */
export function allowedKinds(isCard: boolean, amountCents: number): ImportKind[] {
  if (isCard) return amountCents < 0 ? ["expense"] : ["refund", "card_payment", "card_payment_credit"];
  return amountCents < 0 ? ["expense", "card_payment", "transfer"] : ["income", "refund", "transfer"];
}

/**
 * Efetiva a importação. A deduplicação é recalculada no servidor: o cliente só escolhe o
 * destino de cada linha, mas não consegue forçar a gravação de uma duplicata.
 */
export async function commitImport(ctx: ServiceContext, req: ImportRequest, choices: ImportChoice[], options: { alignBalance?: boolean } = {}) {
  const preview = await previewImport(ctx, req);
  const { account, card } = await checkTarget(ctx, req);
  const targetId = (req.accountId ?? req.cardId)!;
  const choiceByIndex = new Map(choices.map((c) => [c.index, c]));
  const owned = await ctx.db.select({ id: s.categories.id, kind: s.categories.kind }).from(s.categories).where(eq(s.categories.userId, ctx.userId));
  const kinds = new Map(owned.map((c) => [c.id, c.kind]));
  if (choices.some((c) => c.categoryId && !kinds.has(c.categoryId))) throw new NotFoundError("Categoria não encontrada");
  const { cards, others } = await refsFor(ctx, account?.id ?? null);
  const cardIds = new Set(cards.map((c) => c.id));
  const accountIds = new Set(others.map((a) => a.id));
  const cardRows = new Map((await ctx.db.select().from(s.creditCards).where(eq(s.creditCards.userId, ctx.userId))).map((c) => [c.id, c]));

  return ctx.db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.importBatches)
      .values({ userId: ctx.userId, fileName: req.fileName.slice(0, 200), format: req.format ?? (looksLikeOfx(req.content) ? "ofx" : "csv"), accountId: req.accountId ?? null, cardId: req.cardId ?? null, totalRows: preview.rows.length })
      .returning({ id: s.importBatches.id });
    let imported = 0;
    let duplicates = 0;
    let matched = 0;
    for (const row of preview.rows) {
      const choice = choiceByIndex.get(row.index);
      if (row.action === "duplicate") {
        duplicates++;
        continue;
      }
      const kind = choice?.kind ?? row.suggestedKind;
      if (!allowedKinds(!!card, row.amountCents).includes(kind)) throw new ValidationError(`Tipo inválido para a linha ${row.index + 1} (“${row.description}”).`);
      const action = choice?.action ?? (row.action === "match" ? "reconcile" : kind === "card_payment_credit" ? "skip" : "import");
      if (action === "skip") continue;
      const fingerprint = storedFingerprint(targetId, row);
      if (action === "reconcile" && row.existingId) {
        // Mantém identificador, impressão e importação de origem que o lançamento já tinha (ex.: veio
        // de um OFX): desfazer esta importação não pode apagar nem descaracterizar o que veio antes.
        await tx
          .update(s.transactions)
          .set({ externalId: sql`coalesce(${s.transactions.externalId}, ${row.externalId})`, fingerprint: sql`coalesce(${s.transactions.fingerprint}, ${fingerprint})`, status: "realized", reconciledAt: sql`coalesce(${s.transactions.reconciledAt}, now())`, importBatchId: sql`coalesce(${s.transactions.importBatchId}, ${batch!.id}::uuid)` })
          .where(and(eq(s.transactions.id, row.existingId), eq(s.transactions.userId, ctx.userId)));
        await tx.insert(s.transactionHistory).values({ transactionId: row.existingId, userId: ctx.userId, action: "update", actorUserId: ctx.userId, changes: { reconciledAt: { from: null, to: new Date().toISOString() } } });
        matched++;
        continue;
      }
      if (kind === "card_payment_credit") continue; // pagamento de fatura: registrado pelo lado da conta
      const status = row.date <= ctx.today ? "realized" : "scheduled";
      const amountCents = Math.abs(row.amountCents);
      const common = { userId: ctx.userId, status, amountCents, date: row.date, description: row.description.slice(0, 140), source: "import" as const, externalId: row.externalId, fingerprint, importBatchId: batch!.id };
      let values: typeof s.transactions.$inferInsert;
      if (kind === "transfer") {
        const other = choice?.accountId ?? row.suggestedAccountId;
        if (!other || !accountIds.has(other)) throw new ValidationError(`Escolha a outra conta da transferência “${row.description}”.`);
        // Saída da conta importada vai para a outra conta; entrada vem dela.
        values = { ...common, kind, accountId: row.amountCents < 0 ? account!.id : other, toAccountId: row.amountCents < 0 ? other : account!.id };
      } else if (kind === "card_payment" && card) {
        // Pagamento lido na fatura: sai da conta escolhida e quita a fatura fechada antes dele.
        const payer = choice?.accountId ?? row.suggestedAccountId;
        if (!payer || !accountIds.has(payer)) throw new ValidationError(`Escolha a conta que pagou a fatura em “${row.description}”.`);
        const invoiceId = await ensureInvoice(tx, ctx.userId, card.id, shiftInvoice(invoiceForPurchase(row.date, cycleOf(card)), -1, cycleOf(card)));
        values = { ...common, kind, accountId: payer, cardId: card.id, invoiceId };
      } else if (kind === "card_payment") {
        const paid = choice?.cardId ?? row.suggestedCardId;
        const paidCard = paid ? cardRows.get(paid) : undefined;
        if (!paid || !cardIds.has(paid) || !paidCard) throw new ValidationError(`Escolha o cartão pago em “${row.description}”.`);
        // O pagamento quita a fatura fechada antes dele.
        const invoiceId = await ensureInvoice(tx, ctx.userId, paidCard.id, shiftInvoice(invoiceForPurchase(row.date, cycleOf(paidCard)), -1, cycleOf(paidCard)));
        values = { ...common, kind, accountId: account!.id, cardId: paidCard.id, invoiceId };
      } else {
        let categoryId = choice?.categoryId ?? row.suggestedCategoryId ?? null;
        if (categoryId && kinds.get(categoryId) !== (kind === "income" ? "income" : "expense")) categoryId = null;
        let invoiceId: string | null = null;
        if (card) {
          // Parcela: mesma fatura que o NEXO usaria se a compra parcelada fosse lançada à mão.
          const original = row.originalDate ?? row.date;
          const first = invoiceForPurchase(original, cycleOf(card));
          const ref = row.installment && row.originalDate ? shiftInvoice(first, row.installment.number - 1, cycleOf(card)) : invoiceForPurchase(row.date, cycleOf(card));
          invoiceId = await ensureInvoice(tx, ctx.userId, card.id, ref);
        }
        // Realiza a recorrência prevista, para que ela não continue contando na projeção.
        const occ = row.recurrence && kind === row.suggestedKind ? row.recurrence : null;
        values = {
          ...common,
          kind,
          categoryId,
          recurrenceId: occ?.id ?? null,
          occurrenceDate: occ?.occurrenceDate ?? null,
          accountId: card ? null : account!.id,
          cardId: card ? card.id : null,
          invoiceId,
          installmentNumber: card && row.installment ? row.installment.number : null,
          installmentCount: card && row.installment ? row.installment.of : null,
        };
      }
      const [created] = await tx.insert(s.transactions).values(values).onConflictDoNothing().returning({ id: s.transactions.id });
      if (created) {
        imported++;
        await tx.insert(s.transactionHistory).values({ transactionId: created.id, userId: ctx.userId, action: "create", actorUserId: ctx.userId, changes: {} });
      } else duplicates++;
    }
    // Saldo do extrato: a conta passa a partir do saldo que o banco informou no fim daquele dia.
    let balanceAligned: { balanceCents: number; date: string } | null = null;
    if (account && options.alignBalance && preview.statementBalance) {
      const { balanceCents, date } = preview.statementBalance;
      // Guarda o saldo anterior para que "Desfazer importação" possa restaurá-lo.
      await tx
        .update(s.importBatches)
        .set({ previousInitialBalanceCents: account.initialBalanceCents, previousInitialBalanceDate: account.initialBalanceDate ?? ctx.today })
        .where(eq(s.importBatches.id, batch!.id));
      await tx
        .update(s.accounts)
        .set({ initialBalanceCents: balanceCents, initialBalanceDate: addDays(date, 1) })
        .where(and(eq(s.accounts.id, account.id), eq(s.accounts.userId, ctx.userId)));
      balanceAligned = { balanceCents, date };
    }
    await tx.update(s.importBatches).set({ imported, duplicates, matched, errors: preview.errors.length }).where(eq(s.importBatches.id, batch!.id));
    await audit(tx, { userId: ctx.userId, action: "import.committed", entityType: "import_batch", entityId: batch!.id, metadata: { imported, duplicates, matched, balanceAligned: !!balanceAligned } });
    return { batchId: batch!.id, imported, duplicates, matched, errors: preview.errors.length, balanceAligned };
  });
}

export async function listImportBatches(ctx: ServiceContext) {
  return ctx.db.select().from(s.importBatches).where(eq(s.importBatches.userId, ctx.userId)).orderBy(s.importBatches.createdAt);
}

/**
 * Desfaz uma importação: apaga os lançamentos que ela criou, devolve os que ela só conciliou
 * ao estado de lançamento manual e, se ela acertou o saldo da conta, restaura o saldo anterior.
 */
export async function undoImport(ctx: ServiceContext, batchId: string): Promise<{ removed: number; unreconciled: number; balanceRestored: boolean }> {
  const [batch] = await ctx.db
    .select()
    .from(s.importBatches)
    .where(and(eq(s.importBatches.id, batchId), eq(s.importBatches.userId, ctx.userId)))
    .limit(1);
  if (!batch) throw new NotFoundError("Importação não encontrada");
  if (batch.undoneAt) throw new ValidationError("Esta importação já foi desfeita.");
  return ctx.db.transaction(async (tx) => {
    const created = await tx
      .select({ id: s.transactions.id })
      .from(s.transactions)
      .where(and(eq(s.transactions.importBatchId, batch.id), eq(s.transactions.userId, ctx.userId), eq(s.transactions.source, "import")));
    for (const t of created) {
      await tx.insert(s.transactionHistory).values({ transactionId: t.id, userId: ctx.userId, action: "delete", actorUserId: ctx.userId, changes: { importBatchId: { from: batch.id, to: null } } });
    }
    if (created.length) {
      await tx.delete(s.transactions).where(and(eq(s.transactions.importBatchId, batch.id), eq(s.transactions.userId, ctx.userId), eq(s.transactions.source, "import")));
    }
    const unreconciled = await tx
      .update(s.transactions)
      .set({ reconciledAt: null, externalId: null, fingerprint: null, importBatchId: null })
      .where(and(eq(s.transactions.importBatchId, batch.id), eq(s.transactions.userId, ctx.userId)))
      .returning({ id: s.transactions.id });
    let balanceRestored = false;
    if (batch.accountId && batch.previousInitialBalanceCents != null && batch.previousInitialBalanceDate) {
      await tx
        .update(s.accounts)
        .set({ initialBalanceCents: batch.previousInitialBalanceCents, initialBalanceDate: batch.previousInitialBalanceDate })
        .where(and(eq(s.accounts.id, batch.accountId), eq(s.accounts.userId, ctx.userId)));
      balanceRestored = true;
    }
    await tx.update(s.importBatches).set({ undoneAt: new Date() }).where(eq(s.importBatches.id, batch.id));
    await audit(tx, { userId: ctx.userId, action: "import.undone", entityType: "import_batch", entityId: batch.id, metadata: { removed: created.length, unreconciled: unreconciled.length } });
    return { removed: created.length, unreconciled: unreconciled.length, balanceRestored };
  });
}
