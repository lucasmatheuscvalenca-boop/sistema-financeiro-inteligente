import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { diffDays } from "@/domain/dates";
import { planRetirement, RetirementError, validateRetirementInput, type RetirementInput, type RetirementPlanResult } from "@/domain/retirement";
import * as s from "../db/schema";
import { ValidationError } from "../errors";
import type { ServiceContext } from "./context";
import { parse } from "./common";
import { getNetWorth } from "./net-worth";

const inputSchema = z.object({
  currentAge: z.coerce.number().min(14).max(100),
  retirementAge: z.coerce.number().min(15).max(100),
  lifeExpectancy: z.coerce.number().min(16).max(120),
  desiredMonthlyIncomeCents: z.number().int().positive("Informe a renda desejada"),
  otherMonthlyIncomeCents: z.number().int().min(0).default(0),
  currentWealthCents: z.number().int().min(0),
  monthlyContributionCents: z.number().int().min(0),
  annualInflation: z.coerce.number().min(-0.2).max(1),
  annualNominalReturn: z.coerce.number().min(-0.2).max(1),
  annualNominalReturnRetirement: z.coerce.number().min(-0.2).max(1).nullish(),
  safetyMarginPct: z.coerce.number().min(0).max(1).default(0.1),
  mode: z.enum(["consume", "perpetuity"]).default("consume"),
});

export interface RetirementOverview {
  saved: boolean;
  updatedAt: Date | null;
  input: RetirementInput;
  result: RetirementPlanResult | null;
  error: string | null;
  needsReview: boolean;
  missing: string[];
}

/** Monta as premissas: salvas pelo usuário ou sugeridas a partir do perfil (sempre marcadas como sugestão). */
export async function getRetirementOverview(ctx: ServiceContext): Promise<RetirementOverview> {
  const [[plan], [profile]] = await Promise.all([
    ctx.db.select().from(s.retirementPlans).where(eq(s.retirementPlans.userId, ctx.userId)).limit(1),
    ctx.db.select().from(s.financialProfiles).where(eq(s.financialProfiles.userId, ctx.userId)).limit(1),
  ]);
  const missing: string[] = [];
  let input: RetirementInput;
  if (plan) {
    input = parse(inputSchema, plan.inputs);
  } else {
    const year = Number(ctx.today.slice(0, 4));
    const currentAge = profile?.birthYear ? year - profile.birthYear : 30;
    if (!profile?.birthYear) missing.push("Idade (informe o ano de nascimento no briefing).");
    if (!profile?.desiredRetirementIncomeCents) missing.push("Renda desejada na aposentadoria.");
    const nw = await getNetWorth(ctx, { saveSnapshot: false });
    const investments = nw.items.filter((i) => i.side === "asset" && (i.category === "investment" || i.category === "retirement")).reduce((sum, i) => sum + i.valueCents, 0);
    input = {
      currentAge,
      retirementAge: Math.max(currentAge + 1, profile?.desiredRetirementAge ?? 65),
      lifeExpectancy: 90,
      desiredMonthlyIncomeCents: profile?.desiredRetirementIncomeCents ?? 500000,
      otherMonthlyIncomeCents: 0,
      currentWealthCents: investments,
      monthlyContributionCents: 0,
      annualInflation: 0.04,
      annualNominalReturn: 0.09,
      annualNominalReturnRetirement: null,
      safetyMarginPct: 0.1,
      mode: "consume",
    };
  }
  let result: RetirementPlanResult | null = null;
  let error: string | null = null;
  try {
    result = planRetirement(input);
  } catch (e) {
    error = e instanceof RetirementError ? e.message : "Não foi possível calcular o plano";
  }
  return {
    saved: !!plan,
    updatedAt: plan?.updatedAt ?? null,
    input,
    result,
    error,
    needsReview: !!plan && diffDays(plan.updatedAt.toISOString().slice(0, 10), ctx.today) > 365,
    missing,
  };
}

export async function saveRetirementPlan(ctx: ServiceContext, raw: z.input<typeof inputSchema>): Promise<RetirementPlanResult> {
  const input = parse(inputSchema, raw);
  const errors = validateRetirementInput(input);
  if (errors.length > 0) throw new ValidationError(errors[0]!);
  const result = planRetirement(input);
  await ctx.db
    .insert(s.retirementPlans)
    .values({ userId: ctx.userId, inputs: input as unknown as Record<string, unknown> })
    .onConflictDoUpdate({ target: s.retirementPlans.userId, set: { inputs: input as unknown as Record<string, unknown>, updatedAt: new Date() } });
  await ctx.db.insert(s.projectionSnapshots).values({
    userId: ctx.userId,
    kind: "retirement",
    params: input as unknown as Record<string, unknown>,
    summary: {
      requiredCapitalRealCents: result.requiredCapitalRealCents,
      projectedWealthRealCents: result.projectedWealthRealCents,
      requiredMonthlyContributionRealCents: result.requiredMonthlyContributionRealCents,
      onTrack: result.onTrack,
    },
  });
  return result;
}

export async function retirementRevisions(ctx: ServiceContext) {
  return ctx.db
    .select()
    .from(s.projectionSnapshots)
    .where(and(eq(s.projectionSnapshots.userId, ctx.userId), eq(s.projectionSnapshots.kind, "retirement")))
    .orderBy(desc(s.projectionSnapshots.createdAt))
    .limit(20);
}
