import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { formatDateBR } from "@/domain/dates";
import { formatMoney, parseMoney } from "@/domain/money";
import type { QuickEntry } from "../ai/quick-entry";
import { ValidationError } from "../errors";
import { audit } from "../security/audit";
import { makeCategorizer } from "./categorize";
import { centsPositive, isoDate, optionalUuid, parse } from "./common";
import type { ServiceContext } from "./context";
import { loadAccounts } from "./ledger";
import { createTransaction } from "./transactions";

export interface QuickEntryProposal extends QuickEntry {
  /** Identifica a proposta: gravar duas vezes a mesma não duplica o lançamento. */
  proposalId: string;
  accountId: string | null;
  accountName: string | null;
  cardId: string | null;
  cardName: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

/** Completa a leitura do texto com a conta (ou cartão) e a categoria que o app usaria. */
export async function proposeQuickEntry(ctx: ServiceContext, entry: QuickEntry): Promise<QuickEntryProposal> {
  const [accounts, cards, categorizer, categories] = await Promise.all([
    loadAccounts(ctx),
    ctx.db.select({ id: s.creditCards.id, name: s.creditCards.name }).from(s.creditCards).where(and(eq(s.creditCards.userId, ctx.userId), isNull(s.creditCards.archivedAt))),
    makeCategorizer(ctx.db, ctx.userId),
    ctx.db.select({ id: s.categories.id, name: s.categories.name }).from(s.categories).where(eq(s.categories.userId, ctx.userId)),
  ]);
  const account = accounts.find((a) => a.purpose === "spending") ?? accounts[0] ?? null;
  const card = entry.card ? (cards[0] ?? null) : null;
  const categoryId = categorizer.suggest(entry.description, entry.kind);
  return {
    ...entry,
    proposalId: randomUUID(),
    accountId: card ? null : (account?.id ?? null),
    accountName: card ? null : (account?.name ?? null),
    cardId: card?.id ?? null,
    cardName: card?.name ?? null,
    categoryId,
    categoryName: categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? null) : null,
  };
}

export function describeProposal(p: QuickEntryProposal): string {
  const what = p.kind === "expense" ? "Despesa" : "Receita";
  const where = p.cardName ? `no cartão ${p.cardName}` : p.accountName ? `na conta ${p.accountName}` : "sem conta definida";
  return `${what} de ${formatMoney(p.amountCents)}: ${p.description}${p.categoryName ? ` (${p.categoryName})` : ""}, ${formatDateBR(p.date)}, ${where}.`;
}

const RECORDED = "assistant.quick_entry_recorded";

/** Propostas (das mostradas) que já viraram lançamento. */
export async function recordedProposals(ctx: ServiceContext, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await ctx.db
    .select({ id: s.auditLog.entityId })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.userId, ctx.userId), eq(s.auditLog.action, RECORDED), inArray(s.auditLog.entityId, [...ids])));
  return new Set(rows.map((r) => r.id!));
}

const confirmSchema = z.object({
  proposalId: z.uuid(),
  kind: z.enum(["expense", "income"]),
  amountCents: centsPositive,
  description: z.string().trim().min(1).max(140),
  date: isoDate,
  accountId: optionalUuid,
  cardId: optionalUuid,
  categoryId: optionalUuid,
});

/** Grava a proposta depois que a pessoa toca em "Confirmar". As regras de sempre valem (conta, cartão, categoria). */
export async function confirmQuickEntry(ctx: ServiceContext, input: z.input<typeof confirmSchema>): Promise<string> {
  const d = parse(confirmSchema, input);
  if (!d.accountId && !d.cardId) throw new ValidationError("Cadastre uma conta antes de registrar pelo assistente.");
  if ((await recordedProposals(ctx, [d.proposalId])).size) throw new ValidationError("Este lançamento já foi gravado.");
  const [row] = await createTransaction(ctx, { kind: d.kind, amountCents: d.amountCents, date: d.date, description: d.description, accountId: d.cardId ? null : d.accountId, cardId: d.cardId ?? null, categoryId: d.categoryId ?? null });
  await audit(ctx.db, { userId: ctx.userId, action: RECORDED, entityType: "transaction", entityId: d.proposalId, metadata: { transactionId: row!.id } });
  return row!.id;
}

/**
 * Gastos anotados sem internet: cada um vira uma despesa na conta de gastos, com a categoria que o
 * app reconhece. O id gerado no aparelho impede gravar duas vezes (reenvio depois de cair a rede).
 * Devolve os ids resolvidos (gravados, já gravados antes ou ilegíveis), que saem da fila.
 */
export async function registerOfflineEntries(ctx: ServiceContext, input: unknown): Promise<string[]> {
  const list = Array.isArray(input) ? (input as Array<{ id?: unknown; amount?: unknown; description?: unknown; date?: unknown }>).slice(0, 50) : [];
  const done: string[] = [];
  for (const e of list) {
    const id = typeof e?.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id) ? e.id : null;
    if (!id) continue;
    let amountCents = 0;
    try {
      amountCents = parseMoney(String(e.amount ?? ""), "auto");
    } catch {
      amountCents = 0;
    }
    if (amountCents <= 0) {
      done.push(id); // valor ilegível: sai da fila para não travar as outras
      continue;
    }
    if ((await recordedProposals(ctx, [id])).size) {
      done.push(id);
      continue;
    }
    const date = typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date <= ctx.today ? e.date : ctx.today;
    const description = String(e.description ?? "").trim().slice(0, 140) || "Gasto anotado sem internet";
    const proposal = await proposeQuickEntry(ctx, { kind: "expense", amountCents, description, date, card: false });
    if (!proposal.accountId) break; // sem conta: fica na fila até existir uma
    await confirmQuickEntry(ctx, { ...proposal, proposalId: id });
    done.push(id);
  }
  return done;
}
