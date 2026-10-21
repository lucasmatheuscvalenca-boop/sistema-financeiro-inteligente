import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { isMascotId, MASCOT_IDS, type MascotId } from "@/mascots/catalog";
import * as s from "../db/schema";
import { NotFoundError, ValidationError, zodToValidation } from "../errors";
import { audit } from "../security/audit";
import type { ServiceContext } from "./context";

export async function getPreferences(ctx: ServiceContext) {
  const [prefs] = await ctx.db.select().from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId)).limit(1);
  if (!prefs) throw new NotFoundError("Preferências não encontradas");
  return { ...prefs, mascotId: prefs.mascotId as MascotId | null };
}

/**
 * Escolha (ou troca) explícita de mascote. Valida contra o catálogo oficial antes de
 * gravar (e o banco ainda garante pela chave estrangeira). Não toca em nenhum outro dado.
 */
export async function selectMascot(ctx: ServiceContext, mascotId: unknown): Promise<MascotId> {
  if (!isMascotId(mascotId)) {
    throw new ValidationError("Mascote inválido. Escolha um dos seis personagens oficiais.", { mascotId: `Use um de: ${MASCOT_IDS.join(", ")}` });
  }
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(s.userPreferences)
      .set({ mascotId, mascotSelectedAt: now })
      .where(eq(s.userPreferences.userId, ctx.userId))
      .returning({ userId: s.userPreferences.userId });
    if (updated.length === 0) throw new NotFoundError("Preferências não encontradas");
    await tx.insert(s.mascotSelections).values({ userId: ctx.userId, mascotId, selectedAt: now });
  });
  await audit(ctx.db, { userId: ctx.userId, action: "mascot.selected", metadata: { mascotId } });
  return mascotId;
}

export async function mascotHistory(ctx: ServiceContext) {
  return ctx.db
    .select({ mascotId: s.mascotSelections.mascotId, selectedAt: s.mascotSelections.selectedAt })
    .from(s.mascotSelections)
    .where(eq(s.mascotSelections.userId, ctx.userId))
    .orderBy(desc(s.mascotSelections.selectedAt));
}

const prefsSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  reviewFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  maxAlertsPerDay: z.coerce.number().int().min(1).max(50).optional(),
  safetyMarginCents: z.number().int().min(0).max(1_000_000_00).nullable().optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Fuso horário inválido")
    .optional(),
});

export async function updatePreferences(ctx: ServiceContext, input: z.input<typeof prefsSchema>) {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) throw zodToValidation(parsed.error);
  const values = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) return;
  await ctx.db.update(s.userPreferences).set(values).where(eq(s.userPreferences.userId, ctx.userId));
}

export const ONBOARDING_STEPS = ["welcome", "mascot", "personal", "financial", "life", "diagnosis"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export async function setOnboardingStep(ctx: ServiceContext, step: OnboardingStep): Promise<void> {
  if (!ONBOARDING_STEPS.includes(step)) throw new ValidationError("Etapa inválida");
  await ctx.db.update(s.userPreferences).set({ onboardingStep: step }).where(eq(s.userPreferences.userId, ctx.userId));
}

export async function completeOnboarding(ctx: ServiceContext): Promise<void> {
  const prefs = await getPreferences(ctx);
  if (!prefs.mascotId) throw new ValidationError("Escolha um mascote antes de concluir o cadastro.");
  await ctx.db
    .update(s.userPreferences)
    .set({ onboardingCompletedAt: prefs.onboardingCompletedAt ?? new Date(), onboardingStep: "diagnosis" })
    .where(eq(s.userPreferences.userId, ctx.userId));
}
