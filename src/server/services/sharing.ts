import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { audit } from "../security/audit";
import { randomToken, sha256 } from "../security/crypto";
import type { ServiceContext } from "./context";
import { parse, uuidSchema } from "./common";

export type SharePermission = "view" | "contribute";
export type GoalAccess = "owner" | SharePermission;

const inviteSchema = z.object({
  goalId: uuidSchema,
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
  permission: z.enum(["view", "contribute"]),
});

const INVITE_TTL_DAYS = 14;

/**
 * Convida alguém para acompanhar UMA meta. O convite dá acesso apenas a essa meta e a
 * seus aportes; nenhum outro dado financeiro do dono fica visível.
 */
export async function inviteToGoal(ctx: ServiceContext, input: z.input<typeof inviteSchema>): Promise<{ shareId: string; token: string }> {
  const data = parse(inviteSchema, input);
  const [goal] = await ctx.db
    .select({ id: s.goals.id })
    .from(s.goals)
    .where(and(eq(s.goals.id, data.goalId), eq(s.goals.userId, ctx.userId)))
    .limit(1);
  if (!goal) throw new NotFoundError("Meta não encontrada");
  const [me] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, ctx.userId));
  if (me?.email.toLowerCase() === data.email) throw new ValidationError("Você não pode compartilhar com você mesmo");
  const existing = await ctx.db
    .select({ id: s.resourceShares.id })
    .from(s.resourceShares)
    .where(
      and(
        eq(s.resourceShares.resourceType, "goal"),
        eq(s.resourceShares.resourceId, data.goalId),
        eq(s.resourceShares.inviteeEmail, data.email),
        or(eq(s.resourceShares.status, "pending"), eq(s.resourceShares.status, "accepted")),
      ),
    );
  if (existing.length > 0) throw new ConflictError("Esta meta já está compartilhada com este e-mail");
  const token = randomToken(24);
  const [row] = await ctx.db
    .insert(s.resourceShares)
    .values({
      ownerUserId: ctx.userId,
      resourceType: "goal",
      resourceId: data.goalId,
      permission: data.permission,
      inviteeEmail: data.email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning({ id: s.resourceShares.id });
  await audit(ctx.db, { userId: ctx.userId, action: "share.invited", entityType: "goal", entityId: data.goalId, metadata: { permission: data.permission } });
  return { shareId: row!.id, token };
}

async function myEmail(ctx: ServiceContext): Promise<string> {
  const [me] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, ctx.userId));
  return me!.email.toLowerCase();
}

/** Aceita um convite. O e-mail da conta precisa ser o mesmo do convite. */
export async function acceptShare(ctx: ServiceContext, ref: { token?: string; shareId?: string }): Promise<string> {
  const email = await myEmail(ctx);
  const where = ref.token ? eq(s.resourceShares.tokenHash, sha256(ref.token)) : eq(s.resourceShares.id, parse(uuidSchema, ref.shareId));
  const [share] = await ctx.db.select().from(s.resourceShares).where(where).limit(1);
  if (!share || share.inviteeEmail !== email) throw new NotFoundError("Convite não encontrado");
  if (share.status !== "pending") throw new ValidationError("Este convite não está mais disponível");
  if (share.expiresAt.getTime() < Date.now()) {
    await ctx.db.update(s.resourceShares).set({ status: "expired" }).where(eq(s.resourceShares.id, share.id));
    throw new ValidationError("Este convite expirou. Peça um novo convite.");
  }
  await ctx.db
    .update(s.resourceShares)
    .set({ status: "accepted", granteeUserId: ctx.userId, acceptedAt: new Date() })
    .where(eq(s.resourceShares.id, share.id));
  await audit(ctx.db, { userId: ctx.userId, action: "share.accepted", entityType: share.resourceType, entityId: share.resourceId });
  return share.resourceId;
}

export async function declineShare(ctx: ServiceContext, shareId: string): Promise<void> {
  const email = await myEmail(ctx);
  const updated = await ctx.db
    .update(s.resourceShares)
    .set({ status: "declined" })
    .where(and(eq(s.resourceShares.id, parse(uuidSchema, shareId)), eq(s.resourceShares.inviteeEmail, email), eq(s.resourceShares.status, "pending")))
    .returning({ id: s.resourceShares.id });
  if (updated.length === 0) throw new NotFoundError("Convite não encontrado");
}

/**
 * Revogação: o dono pode revogar qualquer compartilhamento seu; quem recebeu pode sair.
 * O acesso termina imediatamente porque toda leitura confere o status do compartilhamento.
 */
export async function revokeShare(ctx: ServiceContext, shareId: string): Promise<void> {
  const id = parse(uuidSchema, shareId);
  const updated = await ctx.db
    .update(s.resourceShares)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(
      and(
        eq(s.resourceShares.id, id),
        or(eq(s.resourceShares.ownerUserId, ctx.userId), eq(s.resourceShares.granteeUserId, ctx.userId)),
        or(eq(s.resourceShares.status, "pending"), eq(s.resourceShares.status, "accepted")),
      ),
    )
    .returning({ id: s.resourceShares.id, resourceId: s.resourceShares.resourceId });
  if (updated.length === 0) throw new NotFoundError("Compartilhamento não encontrado");
  await audit(ctx.db, { userId: ctx.userId, action: "share.revoked", entityType: "goal", entityId: updated[0]!.resourceId });
}

export async function listOutgoingShares(ctx: ServiceContext) {
  return ctx.db
    .select({
      id: s.resourceShares.id,
      resourceId: s.resourceShares.resourceId,
      goalName: s.goals.name,
      permission: s.resourceShares.permission,
      inviteeEmail: s.resourceShares.inviteeEmail,
      status: s.resourceShares.status,
      createdAt: s.resourceShares.createdAt,
      expiresAt: s.resourceShares.expiresAt,
    })
    .from(s.resourceShares)
    .innerJoin(s.goals, eq(s.goals.id, s.resourceShares.resourceId))
    .where(and(eq(s.resourceShares.ownerUserId, ctx.userId), eq(s.resourceShares.resourceType, "goal")))
    .orderBy(desc(s.resourceShares.createdAt));
}

/** Convites pendentes e compartilhamentos aceitos para o usuário atual. */
export async function listIncomingShares(ctx: ServiceContext) {
  const email = await myEmail(ctx);
  return ctx.db
    .select({
      id: s.resourceShares.id,
      resourceId: s.resourceShares.resourceId,
      goalName: s.goals.name,
      ownerName: s.users.name,
      permission: s.resourceShares.permission,
      status: s.resourceShares.status,
      expiresAt: s.resourceShares.expiresAt,
    })
    .from(s.resourceShares)
    .innerJoin(s.goals, eq(s.goals.id, s.resourceShares.resourceId))
    .innerJoin(s.users, eq(s.users.id, s.resourceShares.ownerUserId))
    .where(
      and(
        eq(s.resourceShares.resourceType, "goal"),
        or(
          and(eq(s.resourceShares.granteeUserId, ctx.userId), eq(s.resourceShares.status, "accepted")),
          and(sql`lower(${s.resourceShares.inviteeEmail}) = ${email}`, eq(s.resourceShares.status, "pending"), isNull(s.resourceShares.granteeUserId)),
        ),
      ),
    )
    .orderBy(desc(s.resourceShares.createdAt));
}

/** Nível de acesso do usuário a uma meta. "Não existe" e "sem acesso" geram o mesmo erro. */
export async function goalAccess(ctx: ServiceContext, goalId: string): Promise<{ goal: typeof s.goals.$inferSelect; access: GoalAccess }> {
  const id = parse(uuidSchema, goalId);
  const [goal] = await ctx.db.select().from(s.goals).where(eq(s.goals.id, id)).limit(1);
  if (!goal) throw new NotFoundError("Meta não encontrada");
  if (goal.userId === ctx.userId) return { goal, access: "owner" };
  const [share] = await ctx.db
    .select({ permission: s.resourceShares.permission })
    .from(s.resourceShares)
    .where(
      and(
        eq(s.resourceShares.resourceType, "goal"),
        eq(s.resourceShares.resourceId, id),
        eq(s.resourceShares.granteeUserId, ctx.userId),
        eq(s.resourceShares.status, "accepted"),
        isNull(s.resourceShares.revokedAt),
      ),
    )
    .limit(1);
  if (!share) throw new NotFoundError("Meta não encontrada");
  return { goal, access: share.permission as SharePermission };
}

export async function sharedGoalIds(ctx: ServiceContext): Promise<Array<{ goalId: string; permission: SharePermission }>> {
  const rows = await ctx.db
    .select({ goalId: s.resourceShares.resourceId, permission: s.resourceShares.permission })
    .from(s.resourceShares)
    .where(and(eq(s.resourceShares.granteeUserId, ctx.userId), eq(s.resourceShares.status, "accepted"), eq(s.resourceShares.resourceType, "goal")));
  return rows.map((r) => ({ goalId: r.goalId, permission: r.permission as SharePermission }));
}
