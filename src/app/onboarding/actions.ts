"use server";

import { redirect } from "next/navigation";
import { runAction, cents, num, optStr } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { getAppContext } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { saveBriefingSection, type BriefingSection } from "@/server/services/briefing";
import { completeOnboarding, selectMascot, setOnboardingStep, type OnboardingStep } from "@/server/services/preferences";

export async function chooseMascotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(
    async ({ ctx }) => {
      await selectMascot(ctx, fd.get("mascotId"));
      const app = await getAppContext();
      if (!app.prefs.onboardingCompletedAt) await setOnboardingStep(ctx, "personal");
    },
    { requireOnboarding: false },
  );
  if (!state.ok) return state;
  const back = String(fd.get("voltar") ?? "");
  redirect(back === "configuracoes" ? "/configuracoes/mascote?trocado=1" : "/onboarding?etapa=personal&bemvindo=1");
}

/** Converte o formulário de uma etapa do briefing nas respostas estruturadas. */
function briefingFromForm(section: BriefingSection, fd: FormData): Record<string, unknown> {
  const opt = (k: string) => optStr(fd, k);
  const money = (k: string) => cents(fd, k, { required: false });
  const yesNo = (k: string) => (fd.get(k) === "sim" ? true : fd.get(k) === "nao" ? false : null);
  if (section === "personal") {
    return {
      preferredName: opt("preferredName"),
      birthYear: num(fd, "birthYear") ?? null,
      ageRange: opt("ageRange"),
      country: opt("country") ?? "BR",
      currency: opt("currency") ?? "BRL",
      employmentStatus: opt("employmentStatus"),
      incomeType: opt("incomeType"),
      household: opt("household"),
      dependents: num(fd, "dependents") ?? null,
      personalGoals: opt("personalGoals"),
      professionalGoals: opt("professionalGoals"),
    };
  }
  if (section === "financial") {
    return {
      incomeType: opt("incomeType"),
      monthlyNetIncomeCents: money("monthlyNetIncome"),
      fixedIncomeCents: money("fixedIncome"),
      fixedIncomeDay: num(fd, "fixedIncomeDay") ?? null,
      commissionAvgCents: money("commissionAvg"),
      commissionLowCents: money("commissionLow"),
      commissionHighCents: money("commissionHigh"),
      commissionDay: num(fd, "commissionDay") ?? null,
      incomeSources: opt("incomeSources"),
      incomeFrequency: opt("incomeFrequency"),
      essentialExpensesCents: money("essentialExpenses"),
      variableExpensesCents: money("variableExpenses"),
      hasDebts: yesNo("hasDebts"),
      debtsMonthlyCents: money("debtsMonthly"),
      debtsTotalCents: money("debtsTotal"),
      bankAccountsCount: num(fd, "bankAccountsCount") ?? null,
      creditCardsCount: num(fd, "creditCardsCount") ?? null,
      currentReserveCents: money("currentReserve"),
      investmentsCents: money("investments"),
      otherAssetsCents: money("otherAssets"),
      futureCommitments: opt("futureCommitments"),
    };
  }
  return {
    shortTermGoals: opt("shortTermGoals"),
    mediumTermGoals: opt("mediumTermGoals"),
    longTermGoals: opt("longTermGoals"),
    desiredLifestyle: opt("desiredLifestyle"),
    plannedTrips: opt("plannedTrips"),
    plannedPurchases: opt("plannedPurchases"),
    housing: opt("housing"),
    housingPlans: opt("housingPlans"),
    education: opt("education"),
    financialIndependence: yesNo("financialIndependence"),
    desiredRetirementAge: num(fd, "desiredRetirementAge") ?? null,
    desiredRetirementIncomeCents: money("desiredRetirementIncome"),
    priorities: fd.getAll("priorities").map(String),
    notes: opt("notes"),
  };
}

const NEXT: Record<BriefingSection, OnboardingStep> = { personal: "financial", financial: "life", life: "diagnosis" };

/** Salva a etapa. intent=next avança; intent=later conclui o cadastro parcial e vai ao painel. */
export async function saveBriefingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const section = String(fd.get("section")) as BriefingSection;
  const intent = String(fd.get("intent") ?? "next");
  const origin = String(fd.get("origem") ?? "onboarding");
  const state = await runAction(
    async ({ ctx }) => {
      if (!["personal", "financial", "life"].includes(section)) throw new AppError("Etapa inválida", "validation");
      await saveBriefingSection(ctx, section, briefingFromForm(section, fd), { complete: intent !== "draft" });
      if (origin === "onboarding") {
        if (intent === "later") await completeOnboarding(ctx);
        else await setOnboardingStep(ctx, NEXT[section]);
      }
    },
    { requireOnboarding: false },
  );
  if (!state.ok) return state;
  if (origin !== "onboarding") return { ...state, message: "Informações salvas." };
  if (intent === "later") redirect("/painel");
  redirect(`/onboarding?etapa=${NEXT[section]}`);
}

/** Rascunho salvo automaticamente enquanto o usuário preenche (não avança etapa). */
export async function autosaveBriefingAction(section: BriefingSection, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await saveBriefingSection(ctx, section, briefingFromForm(section, fd));
    },
    { requireOnboarding: false },
  );
}

export async function skipStepAction(fd: FormData): Promise<void> {
  const app = await getAppContext();
  const to = String(fd.get("to")) as OnboardingStep;
  await setOnboardingStep(app.ctx, to);
  redirect(`/onboarding?etapa=${to}`);
}

export async function finishOnboardingAction(): Promise<void> {
  const app = await getAppContext();
  await completeOnboarding(app.ctx);
  redirect("/painel?inicio=1");
}

