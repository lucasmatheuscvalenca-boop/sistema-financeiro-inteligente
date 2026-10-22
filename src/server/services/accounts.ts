import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { endOfMonth } from "@/domain/dates";
import { accountBalances } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import { NotFoundError } from "../errors";
import { audit } from "../security/audit";
import type { ServiceContext } from "./context";
import { centsAny, isoDate, parse } from "./common";
import { loadAccounts, loadTransactions, toLedgerAccount, toLedgerTx, type AccountRow } from "./ledger";

export const ACCOUNT_TYPES = ["checking", "savings", "cash", "wallet", "investment", "other"] as const;
export const ACCOUNT_PURPOSES = ["spending", "reserve", "goals", "investment"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  wallet: "Carteira digital",
  investment: "Investimento",
  other: "Outra",
};

export const ACCOUNT_PURPOSE_LABEL: Record<AccountPurpose, string> = {
  spending: "Disponível para gastos",
  reserve: "Reserva de emergência",
  goals: "Dinheiro de metas",
  investment: "Investimento de longo prazo",
};

export function defaultPurpose(type: AccountType): AccountPurpose {
  if (type === "investment") return "investment";
  if (type === "savings") return "reserve";
  return "spending";
}

export interface AccountWithBalance extends AccountRow {
  balanceCents: Cents;
  /** Saldo considerando também lançamentos previstos até o fim do mês. */
  projectedMonthEndCents: Cents;
}

export async function listAccountsWithBalances(ctx: ServiceContext, opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const accounts = await loadAccounts(ctx, opts);
  if (accounts.length === 0) return [];
  const txs = (await loadTransactions(ctx)).map(toLedgerTx);
  const ledgerAccounts = accounts.map(toLedgerAccount);
  const realized = accountBalances(ledgerAccounts, txs, { asOf: ctx.today });
  const monthEnd = endOfMonth(ctx.today);
  const projected = accountBalances(ledgerAccounts, txs, { asOf: monthEnd, statuses: ["realized", "scheduled"] });
  return accounts.map((a) => ({ ...a, balanceCents: realized.get(a.id) ?? 0, projectedMonthEndCents: projected.get(a.id) ?? 0 }));
}

const accountSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da conta").max(60, "Nome muito longo"),
  type: z.enum(ACCOUNT_TYPES),
  purpose: z.enum(ACCOUNT_PURPOSES).optional(),
  institution: z.string().trim().max(80).nullish(),
  initialBalanceCents: centsAny.default(0),
  initialBalanceDate: isoDate.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
});

export async function getAccount(ctx: ServiceContext, id: string): Promise<AccountRow> {
  const [row] = await ctx.db
    .select()
    .from(s.accounts)
    .where(and(eq(s.accounts.id, id), eq(s.accounts.userId, ctx.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Conta não encontrada");
  return row;
}

export async function createAccount(ctx: ServiceContext, input: z.input<typeof accountSchema>): Promise<AccountRow> {
  const data = parse(accountSchema, input);
  const [row] = await ctx.db
    .insert(s.accounts)
    .values({
      userId: ctx.userId,
      name: data.name,
      type: data.type,
      purpose: data.purpose ?? defaultPurpose(data.type),
      institution: data.institution ?? null,
      initialBalanceCents: data.initialBalanceCents,
      initialBalanceDate: data.initialBalanceDate ?? ctx.today,
      color: data.color ?? null,
    })
    .returning();
  await audit(ctx.db, { userId: ctx.userId, action: "account.created", entityType: "account", entityId: row!.id });
  return row!;
}

export async function updateAccount(ctx: ServiceContext, id: string, input: Partial<z.input<typeof accountSchema>>): Promise<void> {
  await getAccount(ctx, id);
  const data = parse(accountSchema.partial(), input);
  await ctx.db
    .update(s.accounts)
    .set(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)))
    .where(and(eq(s.accounts.id, id), eq(s.accounts.userId, ctx.userId)));
}

export async function archiveAccount(ctx: ServiceContext, id: string): Promise<void> {
  await getAccount(ctx, id);
  await ctx.db
    .update(s.accounts)
    .set({ archivedAt: new Date() })
    .where(and(eq(s.accounts.id, id), eq(s.accounts.userId, ctx.userId)));
  await audit(ctx.db, { userId: ctx.userId, action: "account.archived", entityType: "account", entityId: id });
}

/**
 * "Ajustar saldo": o usuário informa o saldo real hoje e o sistema recalcula o saldo
 * inicial para que o saldo calculado coincida, sem criar lançamentos fictícios.
 */
export async function setActualBalance(ctx: ServiceContext, id: string, actualCents: Cents): Promise<{ previousCents: Cents; adjustedInitialCents: Cents }> {
  parse(centsAny, actualCents);
  const account = await getAccount(ctx, id);
  const txs = (await loadTransactions(ctx)).map(toLedgerTx);
  const current = accountBalances([toLedgerAccount(account)], txs, { asOf: ctx.today }).get(account.id) ?? 0;
  const adjusted = account.initialBalanceCents + (actualCents - current);
  await ctx.db
    .update(s.accounts)
    .set({ initialBalanceCents: adjusted })
    .where(and(eq(s.accounts.id, id), eq(s.accounts.userId, ctx.userId)));
  await audit(ctx.db, { userId: ctx.userId, action: "account.balance_adjusted", entityType: "account", entityId: id });
  return { previousCents: current, adjustedInitialCents: adjusted };
}
