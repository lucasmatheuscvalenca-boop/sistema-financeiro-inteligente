import { eq } from "drizzle-orm";
import { z } from "zod";
import { addMonthsToKey, endOfMonth, monthKey, type MonthKey } from "@/domain/dates";
import { evaluateReserve, recommendedReserveMonths, type EmploymentStatus, type IncomeStability, type ReserveEvaluation } from "@/domain/emergency";
import { accountBalances } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import * as s from "../db/schema";
import type { ServiceContext } from "./context";
import { parse } from "./common";
import { loadAccounts, loadTransactions, toLedgerAccount, toLedgerTx } from "./ledger";
import { estimateMonthlyBasis } from "./planning";

export interface EmergencyOverview {
  configured: boolean;
  settings: { targetMonths: number; monthlyEssentialOverrideCents: number | null; desiredMonthsToComplete: number; minimumMonths: number };
  recommendation: { months: number; reasons: string[] };
  essentialSource: "override" | "average" | "profile" | "none";
  evaluation: ReserveEvaluation;
  reserveAccounts: Array<{ id: string; name: string; balanceCents: Cents }>;
  history: Array<{ month: MonthKey; balanceCents: Cents }>;
  capacityCents: Cents;
}

export async function getEmergencyOverview(ctx: ServiceContext): Promise<EmergencyOverview> {
  const [[settings], [profile], accounts, txRows, basis] = await Promise.all([
    ctx.db.select().from(s.emergencyFundSettings).where(eq(s.emergencyFundSettings.userId, ctx.userId)).limit(1),
    ctx.db.select().from(s.financialProfiles).where(eq(s.financialProfiles.userId, ctx.userId)).limit(1),
    loadAccounts(ctx),
    loadTransactions(ctx),
    estimateMonthlyBasis(ctx),
  ]);
  const recommendation = recommendedReserveMonths({
    employment: (profile?.employmentStatus as EmploymentStatus) ?? null,
    incomeStability: (profile?.incomeStability as IncomeStability) ?? null,
    dependents: profile?.dependents ?? 0,
    hasDebts: profile?.hasDebts ?? false,
  });
  // Só contas marcadas como reserva entram: dinheiro de gastos, metas ou investimentos de longo prazo não conta.
  const reserve = accounts.filter((a) => a.purpose === "reserve");
  const txs = txRows.map(toLedgerTx);
  const ledgerAccounts = reserve.map(toLedgerAccount);
  const balances = accountBalances(ledgerAccounts, txs, { asOf: ctx.today });
  const current = reserve.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0);
  const targetMonths = settings?.targetMonths ?? recommendation.months;
  let essential = 0;
  let essentialSource: EmergencyOverview["essentialSource"] = "none";
  if (settings?.monthlyEssentialOverrideCents) {
    essential = settings.monthlyEssentialOverrideCents;
    essentialSource = "override";
  } else if (basis.essentialCents > 0) {
    essential = basis.essentialCents;
    essentialSource = basis.essentialSource === "average" ? "average" : "profile";
  }
  const evaluation = evaluateReserve({
    currentCents: current,
    monthlyEssentialCents: essential,
    targetMonths,
    today: ctx.today,
    monthlyCapacityCents: basis.capacityCents > 0 ? basis.capacityCents : undefined,
    desiredMonthsToComplete: settings?.desiredMonthsToComplete ?? 12,
    minimumMonths: settings?.minimumMonths ?? 3,
  });
  const history: EmergencyOverview["history"] = [];
  const thisMonth = monthKey(ctx.today);
  for (let i = 11; i >= 0; i--) {
    const m = addMonthsToKey(thisMonth, -i);
    const asOf = i === 0 ? ctx.today : endOfMonth(m);
    const b = accountBalances(ledgerAccounts, txs, { asOf });
    history.push({ month: m, balanceCents: reserve.reduce((sum, a) => sum + (b.get(a.id) ?? 0), 0) });
  }
  return {
    configured: !!settings,
    settings: {
      targetMonths,
      monthlyEssentialOverrideCents: settings?.monthlyEssentialOverrideCents ?? null,
      desiredMonthsToComplete: settings?.desiredMonthsToComplete ?? 12,
      minimumMonths: settings?.minimumMonths ?? 3,
    },
    recommendation,
    essentialSource,
    evaluation,
    reserveAccounts: reserve.map((a) => ({ id: a.id, name: a.name, balanceCents: balances.get(a.id) ?? 0 })),
    history,
    capacityCents: basis.capacityCents,
  };
}

const settingsSchema = z.object({
  targetMonths: z.coerce.number().int().min(1, "Mínimo de 1 mês").max(36, "Máximo de 36 meses"),
  monthlyEssentialOverrideCents: z.number().int().min(0).max(100_000_000_00).nullish(),
  desiredMonthsToComplete: z.coerce.number().int().min(1).max(120).default(12),
  minimumMonths: z.coerce.number().int().min(1).max(12).default(3),
});

export async function saveEmergencySettings(ctx: ServiceContext, input: z.input<typeof settingsSchema>): Promise<void> {
  const data = parse(settingsSchema, input);
  await ctx.db
    .insert(s.emergencyFundSettings)
    .values({ ...data, userId: ctx.userId, monthlyEssentialOverrideCents: data.monthlyEssentialOverrideCents ?? null })
    .onConflictDoUpdate({
      target: s.emergencyFundSettings.userId,
      set: { ...data, monthlyEssentialOverrideCents: data.monthlyEssentialOverrideCents ?? null },
    });
}
