import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { formatMoney } from "@/domain/money";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { parseQuickEntry } from "../ai/quick-entry";
import { botUsername, tg, telegramToken } from "../integrations/telegram";
import { ValidationError } from "../errors";
import { makeContext, type ServiceContext } from "./context";
import { confirmQuickEntry, describeProposal, proposeQuickEntry } from "./quick-entry";
import { getFinancialSnapshot } from "./snapshot";

/**
 * Registrar gasto por mensagem no Telegram: a pessoa liga a conversa com um código de uso único e
 * depois escreve "gastei 80 no mercado". O bot responde com a proposta e só grava no "Confirmar".
 */

const CODE_TTL_MS = 15 * 60 * 1000;
const hash = (code: string) => createHash("sha256").update(`tg-link:${code.toUpperCase()}`).digest("hex");

export interface TelegramStatus {
  configured: boolean;
  linked: boolean;
  botUsername: string | null;
}

export async function getTelegramStatus(ctx: ServiceContext): Promise<TelegramStatus> {
  const configured = !!telegramToken();
  const [link] = await ctx.db.select({ chatId: s.telegramLinks.chatId }).from(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.userId));
  return { configured, linked: !!link, botUsername: configured ? await botUsername() : null };
}

/** Código de 8 letras para mandar ao bot (/start CÓDIGO). Vale 15 minutos e uma vez. */
export async function createLinkCode(ctx: ServiceContext): Promise<{ code: string; deepLink: string | null }> {
  if (!telegramToken()) throw new ValidationError("O bot do Telegram ainda não foi configurado.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  await ctx.db.delete(s.telegramLinkCodes).where(eq(s.telegramLinkCodes.userId, ctx.userId));
  await ctx.db.insert(s.telegramLinkCodes).values({ codeHash: hash(code), userId: ctx.userId, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  const username = await botUsername();
  return { code, deepLink: username ? `https://t.me/${username}?start=${code}` : null };
}

export async function unlinkTelegram(ctx: ServiceContext): Promise<void> {
  await ctx.db.delete(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.userId));
}

// ─── Mensagens recebidas ─────────────────────────────────────────────────────

interface TgUpdate {
  message?: { chat?: { id?: number | string }; text?: string };
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number | string }; message_id?: number } };
}

const HELP = [
  "Escreva o gasto como falaria:",
  "• gastei 80 no mercado",
  "• paguei 120 de luz ontem",
  "• recebi 500 de freela",
  "Eu mostro como vai ficar e só gravo quando você tocar em Confirmar.",
  "Outros comandos: /saldo (quanto ainda pode gastar) e /ajuda.",
].join("\n");

async function send(chatId: string, text: string, extra: Record<string, unknown> = {}) {
  await tg("sendMessage", { chat_id: chatId, text, ...extra });
}

async function contextForChat(db: Database, chatId: string): Promise<ServiceContext | null> {
  const [row] = await db
    .select({ userId: s.telegramLinks.userId, timezone: s.userPreferences.timezone })
    .from(s.telegramLinks)
    .innerJoin(s.userPreferences, eq(s.userPreferences.userId, s.telegramLinks.userId))
    .where(eq(s.telegramLinks.chatId, chatId));
  return row ? makeContext(db, row.userId, row.timezone) : null;
}

export async function handleTelegramUpdate(db: Database, update: TgUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(db, update.callback_query);
  const chatId = update.message?.chat?.id != null ? String(update.message.chat.id) : null;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId || !text) return;

  const start = /^\/start(?:\s+([A-Za-z0-9]{8}))?$/.exec(text);
  if (start?.[1]) {
    const [code] = await db
      .delete(s.telegramLinkCodes)
      .where(and(eq(s.telegramLinkCodes.codeHash, hash(start[1])), gt(s.telegramLinkCodes.expiresAt, new Date())))
      .returning({ userId: s.telegramLinkCodes.userId });
    if (!code) return send(chatId, "Esse código não vale mais. Gere outro no Meu Banqueiro, em Configurações › Notificações › Telegram.");
    // A conversa passa a ser desta conta (se estava ligada a outra, deixa de estar).
    await db.delete(s.telegramLinks).where(eq(s.telegramLinks.chatId, chatId));
    await db.insert(s.telegramLinks).values({ userId: code.userId, chatId }).onConflictDoUpdate({ target: s.telegramLinks.userId, set: { chatId, linkedAt: new Date() } });
    const [user] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, code.userId));
    return send(chatId, `Pronto, ${user?.name.split(" ")[0] ?? "tudo certo"}! Conversa ligada ao Meu Banqueiro.\n\n${HELP}`);
  }

  const ctx = await contextForChat(db, chatId);
  if (!ctx) return send(chatId, "Para registrar gastos por aqui, abra o Meu Banqueiro › Configurações › Notificações › Telegram e toque em Conectar.");
  if (/^\/(start|ajuda|help)\b/i.test(text)) return send(chatId, HELP);
  if (/^\/saldo\b/i.test(text) || /quanto (ainda )?posso gastar/i.test(text)) {
    const snap = await getFinancialSnapshot(ctx);
    return send(chatId, snap.dataQuality.hasAccounts ? `Livre para gastar agora: ${formatMoney(snap.totals.freeCents)}.` : "Cadastre uma conta no Meu Banqueiro para eu calcular.");
  }
  const entry = parseQuickEntry(text, ctx.today);
  if (!entry) return send(chatId, `Não entendi como um gasto.\n\n${HELP}`);
  const proposal = await proposeQuickEntry(ctx, entry);
  if (!proposal.accountId && !proposal.cardId) return send(chatId, "Cadastre uma conta no Meu Banqueiro antes de registrar por aqui.");
  await db.insert(s.botProposals).values({ id: proposal.proposalId, userId: ctx.userId, payload: proposal as unknown as Record<string, unknown> });
  await send(chatId, `${describeProposal(proposal)}\n\nConfere?`, {
    reply_markup: { inline_keyboard: [[{ text: "Confirmar", callback_data: `c:${proposal.proposalId}` }, { text: "Cancelar", callback_data: `x:${proposal.proposalId}` }]] },
  });
}

async function handleCallback(db: Database, cb: NonNullable<TgUpdate["callback_query"]>): Promise<void> {
  const chatId = cb.message?.chat?.id != null ? String(cb.message.chat.id) : null;
  const m = /^([cx]):([0-9a-f-]{36})$/.exec(cb.data ?? "");
  const answer = (text: string) => (cb.id ? tg("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => undefined) : undefined);
  if (!chatId || !m) return void (await answer("Não reconheci este botão."));
  const ctx = await contextForChat(db, chatId);
  if (!ctx) return void (await answer("Conversa não ligada a uma conta."));
  const [row] = await db.delete(s.botProposals).where(and(eq(s.botProposals.id, m[2]!), eq(s.botProposals.userId, ctx.userId))).returning();
  const edit = (text: string) => (cb.message?.message_id ? tg("editMessageText", { chat_id: chatId, message_id: cb.message.message_id, text }).catch(() => undefined) : undefined);
  if (!row) {
    await answer("Já resolvido.");
    return;
  }
  if (m[1] === "x") {
    await answer("Cancelado.");
    await edit("Cancelado. Nada foi gravado.");
    return;
  }
  try {
    await confirmQuickEntry(ctx, row.payload as never);
    await answer("Gravado.");
    await edit(`Gravado ✓\n${describeProposal(row.payload as never)}`);
  } catch (e) {
    await answer(e instanceof ValidationError ? e.message : "Não consegui gravar agora.");
  }
}

/** Limpeza da rotina: propostas não confirmadas há mais de 2 dias e códigos vencidos. */
export async function purgeTelegram(db: Database, now = new Date()): Promise<number> {
  const old = new Date(now.getTime() - 2 * 86_400_000);
  const [a, b] = await Promise.all([
    db.delete(s.botProposals).where(lt(s.botProposals.createdAt, old)).returning({ id: s.botProposals.id }),
    db.delete(s.telegramLinkCodes).where(lt(s.telegramLinkCodes.expiresAt, now)).returning({ h: s.telegramLinkCodes.codeHash }),
  ]);
  return a.length + b.length;
}
