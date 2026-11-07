import { eq, sql } from "drizzle-orm";
import webpush from "web-push";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { SITE_URL } from "@/lib/site";
import { decrypt, encrypt } from "../security/crypto";

/**
 * Notificações no celular e no computador (Web Push). As chaves VAPID são geradas pelo próprio
 * app na primeira vez e guardadas cifradas no banco: nada a configurar na Vercel.
 */

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const VAPID_KEY = "vapid";
let cached: VapidKeys | null = null;

export async function vapidKeys(db: Database): Promise<VapidKeys> {
  if (cached) return cached;
  const read = async () => (await db.select().from(s.appSecrets).where(eq(s.appSecrets.key, VAPID_KEY)).limit(1))[0];
  let row = await read();
  if (!row) {
    const keys = webpush.generateVAPIDKeys();
    // Duas instâncias ao mesmo tempo: vale a que gravou primeiro.
    await db.insert(s.appSecrets).values({ key: VAPID_KEY, valueEncrypted: encrypt(JSON.stringify(keys)) }).onConflictDoNothing();
    row = await read();
  }
  cached = JSON.parse(decrypt(row!.valueEncrypted)) as VapidKeys;
  return cached;
}

type Sender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, keys: VapidKeys) => Promise<void>;

const realSender: Sender = async (subscription, payload, keys) => {
  await webpush.sendNotification(subscription, payload, {
    TTL: 24 * 3600,
    urgency: "normal",
    vapidDetails: { subject: `${SITE_URL}/`, publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
};

let sender: Sender = realSender;

/** Testes trocam o envio real por um falso. */
export function setPushSender(fn: Sender | null): void {
  sender = fn ?? realSender;
}

/**
 * Envia para todos os aparelhos da pessoa. Aparelho que o serviço de push diz que não existe mais
 * (404/410) é removido; outros erros contam falhas e, depois de 5, o aparelho sai da lista.
 */
export async function sendPush(db: Database, userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const subs = await db.select().from(s.pushSubscriptions).where(eq(s.pushSubscriptions.userId, userId));
  if (!subs.length) return { sent: 0, removed: 0 };
  const keys = await vapidKeys(db);
  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, keys);
      await db.update(s.pushSubscriptions).set({ lastSuccessAt: new Date(), failures: 0 }).where(eq(s.pushSubscriptions.id, sub.id));
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410 || sub.failures >= 4) {
        await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id, sub.id));
        removed++;
      } else {
        await db.update(s.pushSubscriptions).set({ failures: sql`${s.pushSubscriptions.failures} + 1` }).where(eq(s.pushSubscriptions.id, sub.id));
      }
    }
  }
  return { sent, removed };
}
