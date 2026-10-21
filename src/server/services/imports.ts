import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { invoiceForPurchase } from "@/domain/credit-card";
import { addDays } from "@/domain/dates";
import { parseCsv, type CsvMapping } from "@/domain/import/csv";
import { dedupeRows, normalizeDescription, type DedupeDecision, type ExistingTx } from "@/domain/import/dedupe";
import { looksLikeOfx, parseOfx } from "@/domain/import/ofx";
import type { ImportedRow, ParseResult } from "@/domain/import/types";
import * as s from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import { sha256 } from "../security/crypto";
import type { ServiceContext } from "./context";
import { optionalUuid, parse } from "./common";
import { cycleOf, ensureInvoice } from "./cards";
import type { TxRow } from "./ledger";

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

export interface PreviewRow {
  index: number;
  date: string;
  description: string;
  amountCents: number;
  externalId: string | null;
  action: DedupeDecision["action"];
  reason?: string;
  existingId?: string;
  existingDescription?: string;
  suggestedKind: "income" | "expense" | "refund" | "card_payment_credit";
  suggestedCategoryId: string | null;
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

function parseFile(req: ImportRequest): ParseResult & { mapping?: CsvMapping | null; preview?: string[][] } {
  if (req.content.length > MAX_FILE_CHARS) throw new ValidationError("Arquivo muito grande (limite de 2 MB)");
  const format = req.format ?? (looksLikeOfx(req.content) || /\.ofx$/i.test(req.fileName) ? "ofx" : "csv");
  const result = format === "ofx" ? parseOfx(req.content) : parseCsv(req.content, req.mapping);
  if (result.rows.length > MAX_ROWS) throw new ValidationError(`O arquivo tem mais de ${MAX_ROWS} lançamentos. Divida em partes menores.`);
  return result;
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

function suggestKind(row: ImportedRow, isCard: boolean): PreviewRow["suggestedKind"] {
  if (isCard) {
    if (row.amountCents < 0) return "expense";
    return /pagamento|pgto|payment/i.test(row.description) ? "card_payment_credit" : "refund";
  }
  return row.amountCents < 0 ? "expense" : "income";
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

export async function previewImport(ctx: ServiceContext, req: ImportRequest) {
  const { account, card } = await checkTarget(ctx, req);
  const parsed = parseFile(req);
  const { existing, txs } = await existingFor(ctx, req, parsed.rows);
  const decisions = dedupeRows(parsed.rows, existing);
  const guess = await categoryGuesser(ctx);
  const byId = new Map(txs.map((t) => [t.id, t]));
  const rows: PreviewRow[] = decisions.map((d, index) => {
    const kind = suggestKind(d.row, !!card);
    return {
      index,
      date: d.row.date,
      description: d.row.description,
      amountCents: d.row.amountCents,
      externalId: d.row.externalId ?? null,
      action: d.action,
      reason: d.action === "duplicate" ? d.reason : undefined,
      existingId: "existingId" in d ? d.existingId : undefined,
      existingDescription: "existingId" in d && d.existingId ? byId.get(d.existingId)?.description : undefined,
      suggestedKind: kind,
      suggestedCategoryId: kind === "card_payment_credit" ? null : guess(kind === "refund" ? "expense" : kind, d.row.description),
    };
  });
  return {
    target: account ? { type: "account" as const, id: account.id, name: account.name } : { type: "card" as const, id: card!.id, name: card!.name },
    rows,
    errors: parsed.errors,
    meta: parsed.meta,
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
  categoryId?: string | null;
}

/**
 * Efetiva a importação. A deduplicação é recalculada no servidor: o cliente só escolhe o
 * destino de cada linha, mas não consegue forçar a gravação de uma duplicata.
 */
export async function commitImport(ctx: ServiceContext, req: ImportRequest, choices: ImportChoice[]) {
  const preview = await previewImport(ctx, req);
  const { card } = await checkTarget(ctx, req);
  const choiceByIndex = new Map(choices.map((c) => [c.index, c]));
  const categoryIds = [...new Set(choices.map((c) => c.categoryId).filter((v): v is string => !!v))];
  if (categoryIds.length) {
    const owned = await ctx.db.select({ id: s.categories.id, kind: s.categories.kind }).from(s.categories).where(eq(s.categories.userId, ctx.userId));
    const ok = new Set(owned.map((o) => o.id));
    if (categoryIds.some((id) => !ok.has(id))) throw new NotFoundError("Categoria não encontrada");
  }
  const kinds = new Map((await ctx.db.select({ id: s.categories.id, kind: s.categories.kind }).from(s.categories).where(eq(s.categories.userId, ctx.userId))).map((c) => [c.id, c.kind]));
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
      const action = choice?.action ?? (row.action === "match" ? "reconcile" : row.suggestedKind === "card_payment_credit" ? "skip" : "import");
      if (action === "skip") continue;
      const fingerprint = sha256(`${req.accountId ?? req.cardId}|${row.date}|${row.amountCents}|${normalizeDescription(row.description)}`);
      if (action === "reconcile" && row.existingId) {
        await tx
          .update(s.transactions)
          .set({ externalId: row.externalId, fingerprint, status: "realized", reconciledAt: new Date(), importBatchId: batch!.id })
          .where(and(eq(s.transactions.id, row.existingId), eq(s.transactions.userId, ctx.userId)));
        await tx.insert(s.transactionHistory).values({ transactionId: row.existingId, userId: ctx.userId, action: "update", actorUserId: ctx.userId, changes: { reconciledAt: { from: null, to: new Date().toISOString() } } });
        matched++;
        continue;
      }
      if (row.suggestedKind === "card_payment_credit") continue; // pagamento de fatura: registrado pelo lado da conta
      const kind = row.suggestedKind;
      let categoryId = choice?.categoryId ?? row.suggestedCategoryId ?? null;
      if (categoryId && kinds.get(categoryId) !== (kind === "income" ? "income" : "expense")) categoryId = null;
      const invoiceId = card ? await ensureInvoice(tx, ctx.userId, card.id, invoiceForPurchase(row.date, cycleOf(card))) : null;
      const status = row.date <= ctx.today ? "realized" : "scheduled";
      const [created] = await tx
        .insert(s.transactions)
        .values({
          userId: ctx.userId,
          kind,
          status,
          amountCents: Math.abs(row.amountCents),
          date: row.date,
          description: row.description.slice(0, 140),
          categoryId,
          accountId: card ? null : req.accountId!,
          cardId: card ? card.id : null,
          invoiceId,
          source: "import",
          externalId: row.externalId,
          fingerprint,
          importBatchId: batch!.id,
        })
        .onConflictDoNothing()
        .returning({ id: s.transactions.id });
      if (created) {
        imported++;
        await tx.insert(s.transactionHistory).values({ transactionId: created.id, userId: ctx.userId, action: "create", actorUserId: ctx.userId, changes: {} });
      } else duplicates++;
    }
    await tx.update(s.importBatches).set({ imported, duplicates, matched, errors: preview.errors.length }).where(eq(s.importBatches.id, batch!.id));
    await audit(tx, { userId: ctx.userId, action: "import.committed", entityType: "import_batch", entityId: batch!.id, metadata: { imported, duplicates, matched } });
    return { batchId: batch!.id, imported, duplicates, matched, errors: preview.errors.length };
  });
}

export async function listImportBatches(ctx: ServiceContext) {
  return ctx.db.select().from(s.importBatches).where(eq(s.importBatches.userId, ctx.userId)).orderBy(s.importBatches.createdAt);
}
