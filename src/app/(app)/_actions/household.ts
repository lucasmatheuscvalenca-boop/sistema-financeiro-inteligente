"use server";

import { bool, cents, optStr, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import {
  inviteToHousehold,
  leaveHousehold,
  recordSettlement,
  respondInvite,
  revokeInvite,
  saveMeeting,
  setAccountShared,
  setTransactionOwnership,
  undoSettlement,
  updateHouseholdSettings,
} from "@/server/services/household";

const LAR = ["/casal", "/casal/reuniao"];

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await inviteToHousehold(ctx, { email: str(fd, "email") });
    return "Convite feito. Quando a outra pessoa entrar no Meu Banqueiro com esse e-mail, o convite aparece em Nosso lar.";
  }, { revalidate: LAR });
}

export async function respondInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const accept = str(fd, "accept") === "1";
    await respondInvite(ctx, str(fd, "id"), accept);
    return accept ? "Pronto: agora vocês dividem o que é nosso." : "Convite recusado.";
  }, { revalidate: LAR });
}

export async function revokeInviteAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => revokeInvite(ctx), { revalidate: LAR });
}

export async function leaveHouseholdAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await leaveHousehold(ctx);
    return "Você saiu do lar. O que era nosso volta a ser visto só por cada um.";
  }, { revalidate: LAR });
}

export async function householdSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await updateHouseholdSettings(ctx, {
      splitMode: str(fd, "splitMode") === "income" ? "income" : "equal",
      incomeCents: cents(fd, "income", { required: false }),
      pixKey: optStr(fd, "pixKey"),
      pixCity: optStr(fd, "pixCity"),
    });
    return "Ajustes salvos.";
  }, { revalidate: LAR });
}

export async function settleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await recordSettlement(ctx, { month: str(fd, "month"), amountCents: cents(fd, "amount")! });
    return "Acerto registrado.";
  }, { revalidate: LAR });
}

export async function undoSettlementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => undoSettlement(ctx, str(fd, "id")), { revalidate: LAR });
}

export async function saveMeetingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const decisions = str(fd, "decisions")
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 10);
    await saveMeeting(ctx, { month: str(fd, "month"), decisions, notes: optStr(fd, "notes") });
    return "Combinados guardados. Eles aparecem na reunião do mês que vem.";
  }, { revalidate: LAR });
}

export async function ownershipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => setTransactionOwnership(ctx, str(fd, "id"), str(fd, "ownership") as "mine"), {
    revalidate: ["/movimentacoes", "/casal"],
  });
}

export async function sharedAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => setAccountShared(ctx, str(fd, "id"), bool(fd, "shared")), { revalidate: ["/contas", "/casal"] });
}
