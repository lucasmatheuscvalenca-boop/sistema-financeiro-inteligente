import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbExecutor } from "../db/client";
import * as s from "../db/schema";
import { ConflictError, UnauthorizedError, ValidationError, zodToValidation } from "../errors";
import { revokeOtherSessions } from "../auth/sessions";
import { audit } from "../security/audit";
import { getDummyHash, hashPassword, sha256, verifyPassword } from "../security/crypto";
import { consumeRateLimit, resetRateLimit } from "../security/rate-limit";
import type { ServiceContext } from "./context";
import { DEFAULT_CATEGORIES } from "./default-categories";

export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres")
  .max(200, "Senha muito longa")
  .refine((p) => /[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p), "Use letras e números na senha");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(80, "Nome muito longo"),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")).pipe(z.string().max(254)),
  password: passwordSchema,
});

export type RegisterInput = z.input<typeof registerSchema>;

export async function seedDefaultCategories(db: DbExecutor, userId: string): Promise<void> {
  let order = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const [parent] = await db
      .insert(s.categories)
      .values({ userId, name: cat.name, kind: cat.kind, essential: cat.essential ?? false, color: cat.color, icon: cat.icon, sortOrder: order++ })
      .returning({ id: s.categories.id });
    if (cat.children?.length && parent) {
      await db.insert(s.categories).values(
        cat.children.map((name) => ({
          userId,
          name,
          kind: cat.kind,
          parentId: parent.id,
          essential: cat.essential ?? false,
          color: cat.color,
          icon: cat.icon,
          sortOrder: order++,
        })),
      );
    }
  }
}

export async function registerUser(db: Database, input: RegisterInput, meta: { ipHash?: string | null } = {}): Promise<{ id: string; email: string; name: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw zodToValidation(parsed.error);
  const { name, email, password } = parsed.data;
  if (meta.ipHash) await consumeRateLimit(db, `register-ip:${meta.ipHash}`, 10, 3600);
  const existing = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  if (existing.length > 0) throw new ConflictError("Já existe uma conta com este e-mail.");
  const passwordHash = await hashPassword(password);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx.insert(s.users).values({ name, email, passwordHash }).returning({ id: s.users.id, email: s.users.email, name: s.users.name });
    if (!created) throw new Error("Falha ao criar usuário");
    await tx.insert(s.userPreferences).values({ userId: created.id });
    await tx.insert(s.financialProfiles).values({ userId: created.id, preferredName: name.split(" ")[0] });
    await seedDefaultCategories(tx, created.id);
    return created;
  });
  await audit(db, { userId: user.id, action: "user.registered", ipHash: meta.ipHash });
  return user;
}

export async function authenticate(
  db: Database,
  input: { email: string; password: string },
  meta: { ipHash?: string | null } = {},
): Promise<{ id: string; email: string; name: string }> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!email || !password) throw new ValidationError("Informe e-mail e senha");
  await consumeRateLimit(db, `login:${sha256(email)}`, 10, 900);
  if (meta.ipHash) await consumeRateLimit(db, `login-ip:${meta.ipHash}`, 50, 900);
  const [user] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, await getDummyHash()).then(() => false);
  if (!user || !ok) {
    if (user) await audit(db, { userId: user.id, action: "auth.login_failed", ipHash: meta.ipHash });
    throw new UnauthorizedError("E-mail ou senha incorretos.");
  }
  await resetRateLimit(db, `login:${sha256(email)}`);
  await db.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  await audit(db, { userId: user.id, action: "auth.login", ipHash: meta.ipHash });
  return { id: user.id, email: user.email, name: user.name };
}

export async function changePassword(ctx: ServiceContext, input: { current: string; next: string }, currentSessionId: string | null): Promise<void> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, ctx.userId)).limit(1);
  if (!user || !(await verifyPassword(input.current, user.passwordHash))) throw new ValidationError("Senha atual incorreta", { current: "Senha atual incorreta" });
  const parsed = passwordSchema.safeParse(input.next);
  if (!parsed.success) throw zodToValidation(parsed.error);
  await ctx.db.update(s.users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(s.users.id, ctx.userId));
  await revokeOtherSessions(ctx.db, ctx.userId, currentSessionId);
  await audit(ctx.db, { userId: ctx.userId, action: "auth.password_changed" });
}

export async function updateName(ctx: ServiceContext, name: string): Promise<void> {
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  if (!parsed.success) throw new ValidationError("Nome inválido", { name: "Informe entre 2 e 80 caracteres" });
  await ctx.db.update(s.users).set({ name: parsed.data }).where(eq(s.users.id, ctx.userId));
}

/**
 * Exclui a conta e TODOS os dados (cascata). Exige a senha. O registro de auditoria
 * do usuário é apagado e fica só um evento anônimo de exclusão.
 */
export async function deleteAccount(ctx: ServiceContext, password: string): Promise<void> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, ctx.userId)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new ValidationError("Senha incorreta", { password: "Senha incorreta" });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.auditLog).where(eq(s.auditLog.userId, ctx.userId));
    await tx.delete(s.resourceShares).where(eq(s.resourceShares.ownerUserId, ctx.userId));
    await tx.delete(s.users).where(eq(s.users.id, ctx.userId));
  });
  await audit(ctx.db, { userId: null, action: "user.deleted" });
}

/** Exportação completa dos dados do usuário (portabilidade/acesso — LGPD). */
export async function exportUserData(ctx: ServiceContext): Promise<Record<string, unknown>> {
  const by = <T extends { userId: unknown }>(table: T) => eq(table.userId as never, ctx.userId);
  const db = ctx.db;
  const [user] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, createdAt: s.users.createdAt })
    .from(s.users)
    .where(eq(s.users.id, ctx.userId));
  const result: Record<string, unknown> = { exportedAt: new Date().toISOString(), user };
  const tables = {
    preferences: s.userPreferences,
    financialProfile: s.financialProfiles,
    briefing: s.briefingSections,
    mascotHistory: s.mascotSelections,
    accounts: s.accounts,
    creditCards: s.creditCards,
    invoices: s.cardInvoices,
    categories: s.categories,
    recurrences: s.recurrences,
    installmentPlans: s.installmentPlans,
    transactions: s.transactions,
    transactionHistory: s.transactionHistory,
    budgets: s.budgets,
    goals: s.goals,
    goalContributions: s.goalContributions,
    emergencyFund: s.emergencyFundSettings,
    assets: s.assets,
    assetValuations: s.assetValuations,
    debts: s.debts,
    netWorthSnapshots: s.netWorthSnapshots,
    retirementPlan: s.retirementPlans,
    projections: s.projectionSnapshots,
    memory: s.memoryItems,
    memoryHistory: s.memoryItemHistory,
    aiConversations: s.aiConversations,
    aiMessages: s.aiMessages,
    alerts: s.alerts,
    achievements: s.userAchievements,
    reviews: s.financialReviews,
    challenges: s.savingsChallenges,
    challengeCheckIns: s.challengeCheckIns,
    bankConnections: s.bankConnections,
    bankConsents: s.bankConsents,
    bankSyncRuns: s.bankSyncRuns,
    importBatches: s.importBatches,
  } as const;
  for (const [key, table] of Object.entries(tables)) {
    const rows = await db.select().from(table as typeof s.accounts).where(by(table as typeof s.accounts));
    // Nunca exporta referências cifradas de conexões.
    result[key] = key === "bankConnections" ? rows.map((r) => ({ ...r, externalRefEncrypted: undefined })) : rows;
  }
  await audit(db, { userId: ctx.userId, action: "user.data_exported" });
  return result;
}
