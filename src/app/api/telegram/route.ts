import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { webhookSecret } from "@/server/integrations/telegram";
import { handleTelegramUpdate } from "@/server/services/telegram";

export const dynamic = "force-dynamic";

/**
 * Webhook do bot do Telegram. Fora do proxy de login: a autenticação é o cabeçalho secreto que o
 * Telegram manda (definido ao registrar o webhook, derivado do token). Responde 200 mesmo quando a
 * mensagem não é entendida, para o Telegram não repetir o envio.
 */
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    await handleTelegramUpdate(getDb(), update as Parameters<typeof handleTelegramUpdate>[1]);
  } catch (e) {
    console.error("[telegram] falha ao tratar a mensagem", { error: e instanceof Error ? e.message.slice(0, 120) : "desconhecido" });
  }
  return NextResponse.json({ ok: true });
}
