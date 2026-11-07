import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { ISODate } from "@/domain/dates";
import type { LedgerAccount, LedgerTx, TxKind, TxStatus } from "@/domain/ledger";
import * as s from "../db/schema";
import type { ServiceContext } from "./context";

export type TxRow = typeof s.transactions.$inferSelect;

export function toLedgerTx(row: TxRow): LedgerTx {
  return {
    id: row.id,
    kind: row.kind as TxKind,
    status: row.status as TxStatus,
    amountCents: row.amountCents,
    date: row.date,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    cardId: row.cardId,
    invoiceId: row.invoiceId,
    categoryId: row.categoryId,
    essential: row.essential,
  };
}

/** Carrega movimentações do usuário (opcionalmente num intervalo de datas). */
export async function loadTransactions(ctx: ServiceContext, range: { from?: ISODate; to?: ISODate } = {}): Promise<TxRow[]> {
  return loadTransactionsFresh(ctx, range);
}

/**
 * Sempre lê do banco. Para fluxos que gravam e releem na mesma requisição (sincronização,
 * importação), em que uma leitura reaproveitada estaria desatualizada.
 */
export async function loadTransactionsFresh(ctx: ServiceContext, range: { from?: ISODate; to?: ISODate } = {}): Promise<TxRow[]> {
  const conds = [eq(s.transactions.userId, ctx.userId)];
  if (range.from) conds.push(gte(s.transactions.date, range.from));
  if (range.to) conds.push(lte(s.transactions.date, range.to));
  return ctx.db
    .select()
    .from(s.transactions)
    .where(and(...conds));
}

/**
 * Valor com sinal de um lançamento do ponto de vista de uma conta ou de um cartão (negativo =
 * saída da conta ou compra no cartão), ou null se ele não mexe nesse destino. Usado para comparar
 * com as linhas de um extrato ou do banco.
 */
export function signedAmountFor(t: Pick<TxRow, "kind" | "amountCents" | "accountId" | "toAccountId" | "cardId">, target: { accountId?: string | null; cardId?: string | null }): number | null {
  if (target.cardId) {
    if (t.cardId !== target.cardId) return null;
    if (t.kind === "expense") return -t.amountCents;
    if (t.kind === "refund" || t.kind === "card_payment") return t.amountCents;
    return null;
  }
  const id = target.accountId;
  if (!id) return null;
  if (t.kind === "income" && t.accountId === id) return t.amountCents;
  if (t.kind === "expense" && t.accountId === id && !t.cardId) return -t.amountCents;
  if (t.kind === "refund" && t.accountId === id && !t.cardId) return t.amountCents;
  if (t.kind === "transfer" && t.accountId === id) return -t.amountCents;
  if (t.kind === "transfer" && t.toAccountId === id) return t.amountCents;
  if (t.kind === "card_payment" && t.accountId === id) return -t.amountCents;
  return null;
}

export type AccountRow = typeof s.accounts.$inferSelect;

export async function loadAccounts(ctx: ServiceContext, opts: { includeArchived?: boolean } = {}): Promise<AccountRow[]> {
  const conds = [eq(s.accounts.userId, ctx.userId)];
  if (!opts.includeArchived) conds.push(isNull(s.accounts.archivedAt));
  return ctx.db
    .select()
    .from(s.accounts)
    .where(and(...conds))
    .orderBy(s.accounts.createdAt);
}

export function toLedgerAccount(a: AccountRow): LedgerAccount {
  return { id: a.id, initialBalanceCents: a.initialBalanceCents, initialBalanceDate: a.initialBalanceDate };
}
