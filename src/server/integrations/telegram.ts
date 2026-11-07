import { createHash } from "node:crypto";

/**
 * Cliente mínimo da API de bots do Telegram. O token vem só da variável TELEGRAM_BOT_TOKEN
 * (criada no @BotFather e guardada na Vercel); nunca é registrado em log nem devolvido.
 */

let http: typeof fetch = (...args) => fetch(...args);
let usernameCache: string | null = null;
let webhookChecked: string | null = null;

/** Testes trocam a chamada HTTP por uma falsa. */
export function setTelegramHttp(fn: typeof fetch | null): void {
  http = fn ?? ((...args) => fetch(...args));
  usernameCache = null;
  webhookChecked = null;
}

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** Segredo do webhook derivado do token: o Telegram manda no cabeçalho e a rota confere. */
export function webhookSecret(): string | null {
  const token = telegramToken();
  return token ? createHash("sha256").update(`meubanqueiro-webhook:${token}`).digest("hex").slice(0, 48) : null;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = telegramToken();
  if (!token) throw new Error("telegram_not_configured");
  const res = await http(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`telegram_${method}_${res.status}`);
  return data.result as T;
}

export async function botUsername(): Promise<string | null> {
  if (usernameCache) return usernameCache;
  try {
    const me = await tg<{ username?: string }>("getMe", {});
    usernameCache = me.username ?? null;
  } catch {
    usernameCache = null;
  }
  return usernameCache;
}

/** Aponta o bot para o endereço do app (uma vez por processo; só troca se estiver diferente). */
export async function ensureWebhook(url: string): Promise<boolean> {
  if (webhookChecked === url) return true;
  const secret = webhookSecret();
  if (!secret) return false;
  try {
    const info = await tg<{ url?: string }>("getWebhookInfo", {});
    if (info.url !== url) await tg("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
    webhookChecked = url;
    return true;
  } catch {
    return false;
  }
}
