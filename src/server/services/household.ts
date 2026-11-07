import { and, asc, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { addMonthsToKey, endOfMonth, startOfMonth, type MonthKey } from "@/domain/dates";
import { pixCopyPaste } from "@/domain/pix";
import { splitShared, type SplitMode, type SplitResult } from "@/domain/split";
import * as s from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import { decrypt, encrypt } from "../security/crypto";
import { centsPositive, existingId, parse } from "./common";
import type { ServiceContext } from "./context";

/**
 * Nosso lar: duas pessoas, cada uma com a própria conta. A outra pessoa só vê o que foi marcado
 * como "nosso" ou "seu" (e o que sai de uma conta conjunta); o resto continua privado. Toda
 * leitura confere antes que as duas pessoas estão no mesmo lar.
 */

export type Ownership = "ours" | "theirs";

export interface HouseholdView {
  id: string;
  splitMode: SplitMode;
  me: { id: string; name: string; incomeCents: number | null; pixKey: string | null; pixCity: string | null };
  partner: { id: string; name: string; email: string; incomeCents: number | null } | null;
  pendingInvite: { id: string; email: string } | null;
}

const normEmail = (e: string) => e.trim().toLowerCase();

async function membership(ctx: ServiceContext) {
  const [m] = await ctx.db.select().from(s.householdMembers).where(eq(s.householdMembers.userId, ctx.userId)).limit(1);
  return m ?? null;
}

export async function getHousehold(ctx: ServiceContext): Promise<HouseholdView | null> {
  const mine = await membership(ctx);
  if (!mine) return null;
  const [house] = await ctx.db.select().from(s.households).where(eq(s.households.id, mine.householdId));
  const members = await ctx.db
    .select({ userId: s.householdMembers.userId, incomeCents: s.householdMembers.incomeCents, name: s.users.name, email: s.users.email })
    .from(s.householdMembers)
    .innerJoin(s.users, eq(s.users.id, s.householdMembers.userId))
    .where(eq(s.householdMembers.householdId, mine.householdId));
  const me = members.find((m) => m.userId === ctx.userId)!;
  const other = members.find((m) => m.userId !== ctx.userId) ?? null;
  const [invite] = other
    ? []
    : await ctx.db
        .select({ id: s.householdInvites.id, email: s.householdInvites.inviteeEmail })
        .from(s.householdInvites)
        .where(and(eq(s.householdInvites.householdId, mine.householdId), eq(s.householdInvites.status, "pending")))
        .limit(1);
  let pixKey: string | null = null;
  try {
    pixKey = mine.pixKeyEncrypted ? decrypt(mine.pixKeyEncrypted) : null;
  } catch {
    pixKey = null;
  }
  return {
    id: mine.householdId,
    splitMode: (house?.splitMode ?? "equal") as SplitMode,
    me: { id: ctx.userId, name: me.name, incomeCents: mine.incomeCents, pixKey, pixCity: mine.pixCity },
    partner: other ? { id: other.userId, name: other.name, email: other.email, incomeCents: other.incomeCents } : null,
    pendingInvite: invite ?? null,
  };
}

/** Convites recebidos (pelo e-mail desta conta) ainda sem resposta. */
export async function receivedInvites(ctx: ServiceContext) {
  const [me] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, ctx.userId));
  if (!me) return [];
  return ctx.db
    .select({ id: s.householdInvites.id, inviterName: s.users.name, createdAt: s.householdInvites.createdAt })
    .from(s.householdInvites)
    .innerJoin(s.users, eq(s.users.id, s.householdInvites.inviterUserId))
    .where(and(eq(s.householdInvites.inviteeEmail, normEmail(me.email)), eq(s.householdInvites.status, "pending")));
}

const inviteSchema = z.object({ email: z.email("E-mail inválido").max(200) });

/** Convida a outra pessoa pelo e-mail da conta dela no Meu Banqueiro. Cria o lar na primeira vez. */
export async function inviteToHousehold(ctx: ServiceContext, input: z.input<typeof inviteSchema>): Promise<void> {
  const email = normEmail(parse(inviteSchema, input).email);
  const [me] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, ctx.userId));
  if (normEmail(me!.email) === email) throw new ValidationError("Use o e-mail da outra pessoa.", { email: "Use o e-mail da outra pessoa" });
  await ctx.db.transaction(async (tx) => {
    let [mine] = await tx.select().from(s.householdMembers).where(eq(s.householdMembers.userId, ctx.userId)).limit(1);
    if (!mine) {
      const [house] = await tx.insert(s.households).values({}).returning({ id: s.households.id });
      [mine] = await tx.insert(s.householdMembers).values({ householdId: house!.id, userId: ctx.userId }).returning();
    }
    const members = await tx.select({ userId: s.householdMembers.userId }).from(s.householdMembers).where(eq(s.householdMembers.householdId, mine!.householdId));
    if (members.length >= 2) throw new ConflictError("O lar já tem duas pessoas.");
    await tx.update(s.householdInvites).set({ status: "revoked", respondedAt: new Date() }).where(and(eq(s.householdInvites.householdId, mine!.householdId), eq(s.householdInvites.status, "pending")));
    await tx.insert(s.householdInvites).values({ householdId: mine!.householdId, inviterUserId: ctx.userId, inviteeEmail: email });
  });
  await audit(ctx.db, { userId: ctx.userId, action: "household.invited" });
}

export async function respondInvite(ctx: ServiceContext, inviteId: string, accept: boolean): Promise<void> {
  existingId(inviteId, "Convite não encontrado");
  const [me] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, ctx.userId));
  await ctx.db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(s.householdInvites)
      .where(and(eq(s.householdInvites.id, inviteId), eq(s.householdInvites.inviteeEmail, normEmail(me!.email)), eq(s.householdInvites.status, "pending")))
      .limit(1);
    if (!invite) throw new NotFoundError("Convite não encontrado");
    if (!accept) {
      await tx.update(s.householdInvites).set({ status: "declined", respondedAt: new Date() }).where(eq(s.householdInvites.id, invite.id));
      return;
    }
    const members = await tx.select({ userId: s.householdMembers.userId }).from(s.householdMembers).where(eq(s.householdMembers.householdId, invite.householdId));
    if (members.length >= 2) throw new ConflictError("Este lar já tem duas pessoas.");
    // Quem já tinha um lar só seu (sem a outra pessoa) sai dele para entrar no novo.
    const [current] = await tx.select().from(s.householdMembers).where(eq(s.householdMembers.userId, ctx.userId)).limit(1);
    if (current) {
      const others = await tx.select({ userId: s.householdMembers.userId }).from(s.householdMembers).where(and(eq(s.householdMembers.householdId, current.householdId), ne(s.householdMembers.userId, ctx.userId)));
      if (others.length) throw new ConflictError("Você já está em um lar com outra pessoa. Saia dele antes de aceitar.");
      await tx.delete(s.households).where(eq(s.households.id, current.householdId));
    }
    await tx.insert(s.householdMembers).values({ householdId: invite.householdId, userId: ctx.userId });
    await tx.update(s.householdInvites).set({ status: "accepted", respondedAt: new Date() }).where(eq(s.householdInvites.id, invite.id));
  });
  await audit(ctx.db, { userId: ctx.userId, action: accept ? "household.joined" : "household.declined" });
}

export async function revokeInvite(ctx: ServiceContext): Promise<void> {
  const mine = await membership(ctx);
  if (!mine) return;
  await ctx.db.update(s.householdInvites).set({ status: "revoked", respondedAt: new Date() }).where(and(eq(s.householdInvites.householdId, mine.householdId), eq(s.householdInvites.status, "pending")));
}

/** Sair do lar: a outra pessoa deixa de ver o que é nosso. As marcações ficam guardadas (somem da vista dela). */
export async function leaveHousehold(ctx: ServiceContext): Promise<void> {
  const mine = await membership(ctx);
  if (!mine) return;
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.householdMembers).where(eq(s.householdMembers.userId, ctx.userId));
    const left = await tx.select({ userId: s.householdMembers.userId }).from(s.householdMembers).where(eq(s.householdMembers.householdId, mine.householdId));
    if (!left.length) await tx.delete(s.households).where(eq(s.households.id, mine.householdId));
  });
  await audit(ctx.db, { userId: ctx.userId, action: "household.left" });
}

const settingsSchema = z.object({
  splitMode: z.enum(["equal", "income"]).optional(),
  incomeCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  pixKey: z.string().trim().max(77).nullable().optional(),
  pixCity: z.string().trim().max(40).nullable().optional(),
});

export async function updateHouseholdSettings(ctx: ServiceContext, input: z.input<typeof settingsSchema>): Promise<void> {
  const d = parse(settingsSchema, input);
  const mine = await membership(ctx);
  if (!mine) throw new NotFoundError("Você ainda não está em um lar.");
  if (d.splitMode) await ctx.db.update(s.households).set({ splitMode: d.splitMode }).where(eq(s.households.id, mine.householdId));
  const patch: Partial<typeof s.householdMembers.$inferInsert> = {};
  if (d.incomeCents !== undefined) patch.incomeCents = d.incomeCents;
  if (d.pixKey !== undefined) patch.pixKeyEncrypted = d.pixKey ? encrypt(d.pixKey) : null;
  if (d.pixCity !== undefined) patch.pixCity = d.pixCity || null;
  if (Object.keys(patch).length) await ctx.db.update(s.householdMembers).set(patch).where(eq(s.householdMembers.userId, ctx.userId));
}

// ─── Marcar o que é nosso ────────────────────────────────────────────────────

const ownershipSchema = z.enum(["mine", "ours", "theirs"]);

export async function setTransactionOwnership(ctx: ServiceContext, transactionId: string, value: z.input<typeof ownershipSchema>): Promise<void> {
  existingId(transactionId, "Movimentação não encontrada");
  const v = parse(ownershipSchema, value);
  const rows = await ctx.db
    .update(s.transactions)
    .set({ ownership: v === "mine" ? null : v })
    .where(and(eq(s.transactions.id, transactionId), eq(s.transactions.userId, ctx.userId)))
    .returning({ id: s.transactions.id });
  if (!rows.length) throw new NotFoundError("Movimentação não encontrada");
}

export async function setAccountShared(ctx: ServiceContext, accountId: string, shared: boolean): Promise<void> {
  existingId(accountId, "Conta não encontrada");
  const rows = await ctx.db.update(s.accounts).set({ shared }).where(and(eq(s.accounts.id, accountId), eq(s.accounts.userId, ctx.userId))).returning({ id: s.accounts.id });
  if (!rows.length) throw new NotFoundError("Conta não encontrada");
}

// ─── O mês do casal ──────────────────────────────────────────────────────────

export interface SharedItem {
  id: string;
  paidBy: string;
  date: string;
  description: string;
  amountCents: number;
  ownership: Ownership;
  mine: boolean;
}

export interface CoupleMonth {
  month: MonthKey;
  household: HouseholdView;
  items: SharedItem[];
  split: SplitResult;
  previousSharedCents: number;
  settlements: Array<{ id: string; fromId: string; toId: string; amountCents: number; createdAt: Date }>;
  /** Código Pix para quem deve pagar (quando quem recebe cadastrou a chave). */
  pix: string | null;
  incomeMissing: boolean;
}

/**
 * Despesas nossas e "seu" das duas pessoas no mês: só lançamentos marcados (ou de conta conjunta e
 * sem marcação de "só minha"). Nada além disso da outra pessoa é lido.
 */
async function sharedExpenses(ctx: ServiceContext, userIds: string[], from: string, to: string) {
  const shared = await ctx.db.select({ id: s.accounts.id }).from(s.accounts).where(and(inArray(s.accounts.userId, userIds), eq(s.accounts.shared, true)));
  const sharedIds = shared.map((a) => a.id);
  const conds = [inArray(s.transactions.ownership, ["ours", "theirs"])];
  if (sharedIds.length) conds.push(inArray(s.transactions.accountId, sharedIds));
  return ctx.db
    .select({ id: s.transactions.id, userId: s.transactions.userId, date: s.transactions.date, description: s.transactions.description, amountCents: s.transactions.amountCents, ownership: s.transactions.ownership })
    .from(s.transactions)
    .where(and(inArray(s.transactions.userId, userIds), eq(s.transactions.kind, "expense"), eq(s.transactions.status, "realized"), gte(s.transactions.date, from), lte(s.transactions.date, to), or(...conds)))
    .orderBy(asc(s.transactions.date));
}

export async function getCoupleMonth(ctx: ServiceContext, month: MonthKey): Promise<CoupleMonth | null> {
  const household = await getHousehold(ctx);
  if (!household?.partner) return null;
  const ids = [household.me.id, household.partner.id];
  const [rows, prevRows, settlements] = await Promise.all([
    sharedExpenses(ctx, ids, startOfMonth(month), endOfMonth(month)),
    sharedExpenses(ctx, ids, startOfMonth(addMonthsToKey(month, -1)), endOfMonth(addMonthsToKey(month, -1))),
    ctx.db.select().from(s.householdSettlements).where(and(eq(s.householdSettlements.householdId, household.id), eq(s.householdSettlements.month, month))),
  ]);
  const items: SharedItem[] = rows.map((r) => ({ id: r.id, paidBy: r.userId, date: r.date, description: r.description, amountCents: r.amountCents, ownership: (r.ownership ?? "ours") as Ownership, mine: r.userId === ctx.userId }));
  const incomeMissing = household.splitMode === "income" && (!household.me.incomeCents || !household.partner.incomeCents);
  const mode: SplitMode = incomeMissing ? "equal" : household.splitMode;
  const split = splitShared(
    [
      { id: household.me.id, name: household.me.name, incomeCents: household.me.incomeCents ?? 0 },
      { id: household.partner.id, name: household.partner.name, incomeCents: household.partner.incomeCents ?? 0 },
    ],
    items.map((i) => ({ paidBy: i.paidBy, amountCents: i.amountCents, forOther: i.ownership === "theirs" })),
    mode,
    settlements.map((x) => ({ fromId: x.fromUserId, toId: x.toUserId, amountCents: x.amountCents })),
  );
  // Pix: só para quem deve, com a chave de quem recebe.
  let pix: string | null = null;
  if (split.settlement && split.settlement.fromId === ctx.userId) {
    const [creditor] = await ctx.db.select().from(s.householdMembers).where(eq(s.householdMembers.userId, split.settlement.toId));
    if (creditor?.pixKeyEncrypted) {
      try {
        pix = pixCopyPaste({ key: decrypt(creditor.pixKeyEncrypted), name: household.partner.name, city: creditor.pixCity || "BRASIL", amountCents: split.settlement.amountCents, description: `Nosso lar ${month}` });
      } catch {
        pix = null;
      }
    }
  }
  return {
    month,
    household,
    items,
    split,
    previousSharedCents: prevRows.filter((r) => r.ownership !== "theirs").reduce((t, r) => t + r.amountCents, 0),
    settlements: settlements.map((x) => ({ id: x.id, fromId: x.fromUserId, toId: x.toUserId, amountCents: x.amountCents, createdAt: x.createdAt })),
    pix,
    incomeMissing,
  };
}

const settleSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), amountCents: centsPositive });

/** "Já transferi": registra o acerto de quem deve para quem recebe, no valor informado. */
export async function recordSettlement(ctx: ServiceContext, input: z.input<typeof settleSchema>): Promise<void> {
  const d = parse(settleSchema, input);
  const m = await getCoupleMonth(ctx, d.month);
  if (!m) throw new NotFoundError("Você ainda não está em um lar com outra pessoa.");
  if (!m.split.settlement) throw new ValidationError("Não há diferença a acertar neste mês.");
  if (d.amountCents > m.split.settlement.amountCents) throw new ValidationError("O valor passa do que falta acertar.");
  await ctx.db.insert(s.householdSettlements).values({ householdId: m.household.id, month: d.month, fromUserId: m.split.settlement.fromId, toUserId: m.split.settlement.toId, amountCents: d.amountCents, createdBy: ctx.userId });
}

export async function undoSettlement(ctx: ServiceContext, settlementId: string): Promise<void> {
  existingId(settlementId, "Acerto não encontrado");
  const mine = await membership(ctx);
  if (!mine) throw new NotFoundError("Acerto não encontrado");
  const rows = await ctx.db.delete(s.householdSettlements).where(and(eq(s.householdSettlements.id, settlementId), eq(s.householdSettlements.householdId, mine.householdId))).returning({ id: s.householdSettlements.id });
  if (!rows.length) throw new NotFoundError("Acerto não encontrado");
}

// ─── Reunião mensal ──────────────────────────────────────────────────────────

export async function getMeeting(ctx: ServiceContext, month: MonthKey) {
  const mine = await membership(ctx);
  if (!mine) return null;
  const [row] = await ctx.db.select().from(s.householdMeetings).where(and(eq(s.householdMeetings.householdId, mine.householdId), eq(s.householdMeetings.month, month)));
  return row ?? null;
}

const meetingSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  decisions: z.array(z.string().trim().min(1).max(200)).max(10),
  notes: z.string().trim().max(2000).nullable(),
});

export async function saveMeeting(ctx: ServiceContext, input: z.input<typeof meetingSchema>): Promise<void> {
  const d = parse(meetingSchema, input);
  const mine = await membership(ctx);
  if (!mine) throw new NotFoundError("Você ainda não está em um lar.");
  await ctx.db
    .insert(s.householdMeetings)
    .values({ householdId: mine.householdId, month: d.month, decisions: d.decisions, notes: d.notes, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: [s.householdMeetings.householdId, s.householdMeetings.month], set: { decisions: d.decisions, notes: d.notes, updatedBy: ctx.userId, updatedAt: new Date() } });
}
