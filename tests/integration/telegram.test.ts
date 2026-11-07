import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { setTelegramHttp, webhookSecret } from "@/server/integrations/telegram";
import { createAccount } from "@/server/services/accounts";
import { createLinkCode, getTelegramStatus, handleTelegramUpdate, unlinkTelegram } from "@/server/services/telegram";
import { listTransactions } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

type Call = { method: string; body: Record<string, unknown> };
let calls: Call[] = [];

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123:teste";
  calls = [];
  setTelegramHttp((async (input: string | URL | Request, init?: RequestInit) => {
    const method = String(input).split("/").pop()!;
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ method, body });
    const result = method === "getMe" ? { username: "MeuBanqueiroBot" } : method === "getWebhookInfo" ? { url: "" } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);
});
afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  setTelegramHttp(null);
});

const lastText = () => [...calls].reverse().find((c) => c.method === "sendMessage" || c.method === "editMessageText")?.body.text as string;

describe("gasto por mensagem no Telegram", () => {
  it("liga a conversa com o código, propõe o gasto e só grava no Confirmar", async () => {
    const u = await createUser("Bot Telegram");
    await createAccount(u, { name: "Conta", type: "checking" });
    const { code, deepLink } = await createLinkCode(u);
    expect(deepLink).toBe(`https://t.me/MeuBanqueiroBot?start=${code}`);
    expect(webhookSecret()).toMatch(/^[0-9a-f]{48}$/);

    const db = getDb();
    await handleTelegramUpdate(db, { message: { chat: { id: 4242 }, text: "gastei 30 na padaria" } });
    expect(lastText()).toMatch(/Conectar/); // conversa ainda não ligada

    await handleTelegramUpdate(db, { message: { chat: { id: 4242 }, text: `/start ${code}` } });
    expect(lastText()).toMatch(/Pronto, Bot!/);
    expect((await getTelegramStatus(u)).linked).toBe(true);
    // O código é de uso único.
    await handleTelegramUpdate(db, { message: { chat: { id: 9999 }, text: `/start ${code}` } });
    expect(lastText()).toMatch(/não vale mais/);

    await handleTelegramUpdate(db, { message: { chat: { id: 4242 }, text: "gastei 30 na padaria" } });
    const proposal = [...calls].reverse().find((c) => c.method === "sendMessage")!;
    expect(proposal.body.text).toMatch(/Despesa de R\$\s30,00: Padaria/);
    expect(await listTransactions(u, {})).toHaveLength(0);
    const buttons = (proposal.body.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard[0]!;
    const confirm = buttons[0]!.callback_data;

    await handleTelegramUpdate(db, { callback_query: { id: "cb1", data: confirm, message: { chat: { id: 4242 }, message_id: 7 } } });
    expect(lastText()).toMatch(/^Gravado ✓/);
    // Tocar de novo não duplica.
    await handleTelegramUpdate(db, { callback_query: { id: "cb2", data: confirm, message: { chat: { id: 4242 }, message_id: 7 } } });
    const txs = await listTransactions(u, {});
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ description: "Padaria", amountCents: 3_000 });

    // Outra conversa não consegue confirmar a proposta de alguém.
    await handleTelegramUpdate(db, { message: { chat: { id: 4242 }, text: "paguei 50 de luz" } });
    const second = [...calls].reverse().find((c) => c.method === "sendMessage")!;
    const cancel = (second.body.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard[0]![1]!.callback_data;
    await handleTelegramUpdate(db, { callback_query: { id: "cb3", data: cancel.replace("x:", "c:"), message: { chat: { id: 5555 }, message_id: 8 } } });
    expect(await listTransactions(u, {})).toHaveLength(1);
    await handleTelegramUpdate(db, { callback_query: { id: "cb4", data: cancel, message: { chat: { id: 4242 }, message_id: 8 } } });
    expect(lastText()).toMatch(/Cancelado/);
    expect(await listTransactions(u, {})).toHaveLength(1);

    await unlinkTelegram(u);
    expect((await getTelegramStatus(u)).linked).toBe(false);
  });
});
