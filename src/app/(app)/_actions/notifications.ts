"use server";

import { headers } from "next/headers";
import { bool, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { removePushSubscription, savePushSubscription, sendTestPush, updateNotificationSettings } from "@/server/services/notifications";
import { createLinkCode, unlinkTelegram } from "@/server/services/telegram";

const PATHS = ["/configuracoes/notificacoes"];

export async function subscribePushAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      let sub: unknown;
      try {
        sub = JSON.parse(str(fd, "subscription"));
      } catch {
        return { ok: false, error: "Não foi possível ativar neste aparelho. Tente de novo." };
      }
      await savePushSubscription(ctx, sub, (await headers()).get("user-agent"));
      return "Notificações ativadas neste aparelho.";
    },
    { revalidate: PATHS },
  );
}

export async function unsubscribePushAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => removePushSubscription(ctx, str(fd, "endpoint")), { revalidate: PATHS });
}

export async function testPushAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const sent = await sendTestPush(ctx);
    return sent ? "Notificação de teste enviada. Ela chega em alguns segundos." : { ok: false, error: "Nenhum aparelho recebeu. Ative as notificações neste aparelho primeiro." };
  });
}

export async function saveNotificationSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await updateNotificationSettings(ctx, { notifyPush: bool(fd, "notifyPush"), notifyEmail: bool(fd, "notifyEmail"), weeklySummary: bool(fd, "weeklySummary") });
      return "Preferências salvas.";
    },
    { revalidate: PATHS },
  );
}

export async function linkTelegramAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => ({ data: await createLinkCode(ctx) }));
}

export async function unlinkTelegramAction(): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    await unlinkTelegram(ctx);
    return "Telegram desconectado.";
  }, { revalidate: PATHS });
}
