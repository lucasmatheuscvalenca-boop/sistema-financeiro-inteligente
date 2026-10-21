"use server";

import { redirect } from "next/navigation";
import { bool, cents, num, optStr, runAction, str } from "@/app/actions-helpers";
import { parseMoney } from "@/domain/money";
import type { ActionState } from "@/lib/action-state";
import { saveEmergencySettings } from "@/server/services/emergency";
import { addContribution, createGoal, deleteContribution, deleteGoal, setGoalStatus, updateGoal, type GoalInput } from "@/server/services/goals";
import { archiveAsset, archiveDebt, upsertAsset, upsertDebt } from "@/server/services/net-worth";
import { saveRetirementPlan } from "@/server/services/retirement";
import { acceptShare, declineShare, inviteToGoal, revokeShare } from "@/server/services/sharing";

const PLAN = ["/painel", "/metas", "/reserva", "/patrimonio", "/aposentadoria", "/compartilhamento", "/fluxo-de-caixa", "/posso-gastar"];

function pct(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace("%", "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function goalFromForm(fd: FormData): GoalInput {
  const ret = pct(fd, "expectedReturn");
  return {
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    kind: (optStr(fd, "kind") ?? "other") as GoalInput["kind"],
    targetCents: cents(fd, "target")!,
    targetDate: optStr(fd, "targetDate"),
    priority: num(fd, "priority") ?? 3,
    plannedMonthlyCents: cents(fd, "plannedMonthly", { required: false }),
    contributionDay: num(fd, "contributionDay") ?? 5,
    expectedAnnualReturnBps: ret === null ? null : Math.round(ret * 100),
    holdingAccountId: optStr(fd, "holdingAccountId"),
    color: optStr(fd, "color"),
  };
}

export async function createGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const state = await runAction(
    async ({ ctx }) => {
      id = (await createGoal(ctx, goalFromForm(fd))).id;
    },
    { revalidate: PLAN },
  );
  if (!state.ok) return state;
  redirect(`/metas/${id}?nova=1`);
}

export async function updateGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await updateGoal(ctx, str(fd, "id"), goalFromForm(fd));
      return "Meta atualizada.";
    },
    { revalidate: PLAN },
  );
}

export async function goalStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => setGoalStatus(ctx, str(fd, "id"), str(fd, "status") as "active"), { revalidate: PLAN });
}

export async function deleteGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async ({ ctx }) => deleteGoal(ctx, str(fd, "id")), { revalidate: PLAN });
  if (!state.ok) return state;
  redirect("/metas");
}

export async function addContributionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await addContribution(ctx, str(fd, "goalId"), {
        kind: (optStr(fd, "kind") ?? "deposit") as "deposit",
        amountCents: cents(fd, "amount")!,
        date: str(fd, "date"),
        note: optStr(fd, "note"),
        sourceAccountId: optStr(fd, "sourceAccountId"),
      });
      return "Registrado.";
    },
    { revalidate: PLAN },
  );
}

export async function deleteContributionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => deleteContribution(ctx, str(fd, "id")), { revalidate: PLAN });
}

export async function saveEmergencyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await saveEmergencySettings(ctx, {
        targetMonths: num(fd, "targetMonths") ?? 6,
        monthlyEssentialOverrideCents: cents(fd, "essentialOverride", { required: false }),
        desiredMonthsToComplete: num(fd, "desiredMonthsToComplete") ?? 12,
        minimumMonths: num(fd, "minimumMonths") ?? 3,
      });
      return "Configuração da reserva salva.";
    },
    { revalidate: PLAN },
  );
}

export async function saveAssetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await upsertAsset(
        ctx,
        {
          name: str(fd, "name"),
          category: str(fd, "category") as "investment",
          valueCents: cents(fd, "value")!,
          provenance: str(fd, "provenance") as "informed",
          valuedAt: str(fd, "valuedAt"),
          liquid: bool(fd, "liquid"),
          notes: optStr(fd, "notes"),
        },
        optStr(fd, "id") ?? undefined,
      );
      return "Bem salvo.";
    },
    { revalidate: PLAN },
  );
}

export async function archiveAssetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => archiveAsset(ctx, str(fd, "id")), { revalidate: PLAN });
}

export async function saveDebtAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const rate = pct(fd, "interestRateMonthly");
      await upsertDebt(
        ctx,
        {
          name: str(fd, "name"),
          category: str(fd, "category") as "loan",
          outstandingCents: cents(fd, "outstanding")!,
          monthlyPaymentCents: cents(fd, "monthlyPayment", { required: false }),
          interestRateMonthlyBps: rate === null ? null : Math.round(rate * 100),
          remainingInstallments: num(fd, "remainingInstallments") ?? null,
          provenance: str(fd, "provenance") as "informed",
          valuedAt: str(fd, "valuedAt"),
          notes: optStr(fd, "notes"),
        },
        optStr(fd, "id") ?? undefined,
      );
      return "Dívida salva.";
    },
    { revalidate: PLAN },
  );
}

export async function archiveDebtAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => archiveDebt(ctx, str(fd, "id")), { revalidate: PLAN });
}

export async function saveRetirementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const p = (k: string, fallback: number) => (pct(fd, k) ?? fallback) / 100;
      const money = (k: string) => {
        const v = str(fd, k);
        return v ? parseMoney(v) : 0;
      };
      const ret = pct(fd, "annualNominalReturnRetirement");
      await saveRetirementPlan(ctx, {
        currentAge: num(fd, "currentAge") ?? 30,
        retirementAge: num(fd, "retirementAge") ?? 65,
        lifeExpectancy: num(fd, "lifeExpectancy") ?? 90,
        desiredMonthlyIncomeCents: money("desiredMonthlyIncome"),
        otherMonthlyIncomeCents: money("otherMonthlyIncome"),
        currentWealthCents: money("currentWealth"),
        monthlyContributionCents: money("monthlyContribution"),
        annualInflation: p("annualInflation", 4),
        annualNominalReturn: p("annualNominalReturn", 9),
        annualNominalReturnRetirement: ret === null ? null : ret / 100,
        safetyMarginPct: p("safetyMargin", 10),
        mode: str(fd, "mode") === "perpetuity" ? "perpetuity" : "consume",
      });
      return "Plano salvo e recalculado.";
    },
    { revalidate: PLAN },
  );
}

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const { token } = await inviteToGoal(ctx, { goalId: str(fd, "goalId"), email: str(fd, "email"), permission: str(fd, "permission") as "view" });
      return { message: "Convite criado. Envie o link abaixo para a pessoa convidada (ele expira em 14 dias).", data: { link: `/compartilhamento/convite/${token}` } };
    },
    { revalidate: PLAN },
  );
}

export async function acceptShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let goalId = "";
  const state = await runAction(
    async ({ ctx }) => {
      goalId = await acceptShare(ctx, { token: optStr(fd, "token") ?? undefined, shareId: optStr(fd, "shareId") ?? undefined });
    },
    { revalidate: PLAN },
  );
  if (!state.ok) return state;
  redirect(`/metas/${goalId}`);
}

export async function declineShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => declineShare(ctx, str(fd, "id")), { revalidate: PLAN });
}

export async function revokeShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => revokeShare(ctx, str(fd, "id")), { revalidate: PLAN });
}
