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
  const conds = [eq(s.transactions.userId, ctx.userId)];
  if (range.from) conds.push(gte(s.transactions.date, range.from));
  if (range.to) conds.push(lte(s.transactions.date, range.to));
  return ctx.db
    .select()
    .from(s.transactions)
    .where(and(...conds));
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
