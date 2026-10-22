"use server";

import { optStr, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { askAssistant, deleteAllConversations, deleteConversation } from "@/server/ai/assistant";
import { chatActions } from "@/server/ai/chat-actions";
import { dismissAlert } from "@/server/services/alerts";
import { abandonChallenge, checkInChallenge, createChallenge, markAchievementsSeen, recordReview } from "@/server/services/gamification";
import { addDeclaredMemory, confirmMemory, deleteAllMemory, deleteMemory, rejectMemory, updateMemory, MEMORY_KINDS } from "@/server/services/memory";

export async function askAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const r = await askAssistant(ctx, { message: str(fd, "message"), conversationId: optStr(fd, "conversationId") });
      return { data: { conversationId: r.conversationId, text: r.answer.text, tone: r.answer.tone, mode: r.answer.mode, notice: r.answer.notice ?? null, tools: r.answer.tools.map((t) => t.tool), actions: chatActions(r.answer.tools), at: new Date().toISOString() } };
    },
    { revalidate: ["/assistente"] },
  );
}

export async function deleteConversationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => deleteConversation(ctx, str(fd, "id")), { revalidate: ["/assistente"] });
}

export async function deleteAllConversationsAction(_: ActionState): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await deleteAllConversations(ctx);
    return "Conversas apagadas.";
  }, { revalidate: ["/assistente", "/configuracoes/privacidade"] });
}

export async function dismissAlertAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => dismissAlert(ctx, str(fd, "id")), { revalidate: ["/alertas", "/painel"] });
}

export async function recordReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const checklist = Object.fromEntries(["saldos", "pendencias", "orcamento", "metas", "alertas"].map((k) => [k, fd.get(k) === "on"]));
      await recordReview(ctx, { period: (str(fd, "period") || "weekly") as "weekly", checklist, notes: optStr(fd, "notes") });
      return "Revisão registrada. Constância também é uma forma de riqueza.";
    },
    { revalidate: ["/revisao", "/conquistas", "/painel"] },
  );
}

export async function createChallengeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await createChallenge(ctx, { title: str(fd, "title"), description: optStr(fd, "description"), targetCheckIns: Number(str(fd, "targetCheckIns")) || 1, startDate: str(fd, "startDate"), endDate: str(fd, "endDate") });
      return "Desafio criado.";
    },
    { revalidate: ["/conquistas"] },
  );
}

export async function checkInChallengeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const r = await checkInChallenge(ctx, str(fd, "id"));
      return r.completed ? "Desafio concluído!" : "Check-in registrado.";
    },
    { revalidate: ["/conquistas"] },
  );
}

export async function abandonChallengeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => abandonChallenge(ctx, str(fd, "id")), { revalidate: ["/conquistas"] });
}

export async function markAchievementsSeenAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => markAchievementsSeen(ctx), { revalidate: ["/conquistas"] });
}

export async function addMemoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const kind = str(fd, "kind") as (typeof MEMORY_KINDS)[number];
      await addDeclaredMemory(ctx, { kind, content: str(fd, "content") });
      return "Registrado na sua memória.";
    },
    { revalidate: ["/configuracoes/memoria"] },
  );
}

export async function memoryDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const id = str(fd, "id");
      const decision = str(fd, "decision");
      if (decision === "confirm") await confirmMemory(ctx, id);
      else if (decision === "reject") await rejectMemory(ctx, id);
      else if (decision === "delete") await deleteMemory(ctx, id);
      else if (decision === "update") await updateMemory(ctx, id, { kind: str(fd, "kind") as "fact", content: str(fd, "content") });
    },
    { revalidate: ["/configuracoes/memoria"] },
  );
}

export async function clearMemoryAction(_: ActionState): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const n = await deleteAllMemory(ctx);
    return `${n} item(ns) apagado(s).`;
  }, { revalidate: ["/configuracoes/memoria"] });
}
