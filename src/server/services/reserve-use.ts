import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { addMonthsToKey, dateWithClampedDay, monthKey, parts, type ISODate } from "@/domain/dates";
import { ValidationError } from "../errors";
import { centsPositive, isoDate, parse, uuidSchema } from "./common";
import type { ServiceContext } from "./context";
import { loadAccounts } from "./ledger";
import { createRecurrence } from "./recurrences";
import { createTransaction } from "./transactions";

export const RESERVE_USE_PREFIX = "Uso da reserva";
export const RESERVE_REFILL_PREFIX = "Repor a reserva";

const schema = z.object({
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema,
  amountCents: centsPositive,
  reason: z.string().trim().min(2, "Conte o motivo em poucas palavras").max(80),
  months: z.coerce.number().int().min(1).max(36),
  refillDay: z.coerce.number().int().min(1).max(28),
  date: isoDate,
  /** false quando a despesa foi paga direto da reserva: só cria o plano de reposição. */
  transferNow: z.boolean().default(true),
});

/** Primeira data de reposição: o dia escolhido, a partir do mês seguinte ao uso. */
export function firstRefillDate(useDate: ISODate, day: number): ISODate {
  const next = addMonthsToKey(monthKey(useDate), 1);
  const p = parts(`${next}-01`);
  return dateWithClampedDay(p.year, p.month, day);
}

/**
 * "Usei a reserva": registra a transferência da reserva para a conta de gastos (não é despesa:
 * o gasto em si é lançado à parte) e cria a reposição mensal, que aparece na agenda e no caixa.
 */
export async function recordReserveUse(ctx: ServiceContext, input: z.input<typeof schema>): Promise<{ monthlyCents: number; firstDate: ISODate }> {
  const data = parse(schema, input);
  const accounts = await loadAccounts(ctx);
  const from = accounts.find((a) => a.id === data.fromAccountId);
  const to = accounts.find((a) => a.id === data.toAccountId);
  if (!from || from.purpose !== "reserve") throw new ValidationError("Escolha a conta da reserva", { fromAccountId: "Escolha a conta da reserva" });
  if (!to || to.id === from.id) throw new ValidationError("Escolha a conta de gastos", { toAccountId: "Escolha outra conta" });
  if (data.transferNow) await createTransaction(ctx, { kind: "transfer", amountCents: data.amountCents, date: data.date, description: `${RESERVE_USE_PREFIX}: ${data.reason}`, notes: data.reason, accountId: from.id, toAccountId: to.id });
  const monthlyCents = Math.ceil(data.amountCents / data.months);
  const firstDate = firstRefillDate(data.date, data.refillDay);
  await createRecurrence(ctx, {
    kind: "transfer",
    amountCents: monthlyCents,
    description: `${RESERVE_REFILL_PREFIX} (${data.reason})`,
    accountId: to.id,
    toAccountId: from.id,
    frequency: "monthly",
    dayOfMonth: data.refillDay,
    startDate: firstDate,
    count: data.months,
  });
  return { monthlyCents, firstDate };
}

/** Usos registrados e as reposições em andamento, para a tela da reserva. */
export async function reserveUses(ctx: ServiceContext) {
  const [uses, refills] = await Promise.all([
    ctx.db
      .select({ id: s.transactions.id, date: s.transactions.date, amountCents: s.transactions.amountCents, notes: s.transactions.notes, description: s.transactions.description })
      .from(s.transactions)
      .where(and(eq(s.transactions.userId, ctx.userId), eq(s.transactions.kind, "transfer"), like(s.transactions.description, `${RESERVE_USE_PREFIX}:%`))),
    ctx.db
      .select()
      .from(s.recurrences)
      .where(and(eq(s.recurrences.userId, ctx.userId), eq(s.recurrences.active, true), like(s.recurrences.description, `${RESERVE_REFILL_PREFIX}%`))),
  ]);
  return {
    uses: uses.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((u) => ({ ...u, reason: u.notes ?? u.description.replace(`${RESERVE_USE_PREFIX}: `, "") })),
    refills: refills.map((r) => ({ id: r.id, description: r.description, amountCents: r.amountCents, startDate: r.startDate, count: r.count ?? 1, endMonth: addMonthsToKey(monthKey(r.startDate), (r.count ?? 1) - 1) })),
  };
}
