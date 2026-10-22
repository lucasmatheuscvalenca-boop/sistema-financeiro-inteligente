import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";
import { randomToken, sha256 } from "../security/crypto";

export const SESSION_TTL_DAYS = 30;
const RENEW_WHEN_LESS_THAN_DAYS = 15;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function createSession(
  db: Database,
  userId: string,
  meta: { userAgent?: string | null; ipHash?: string | null } = {},
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = randomToken(32);
  const sessionId = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ipHash: meta.ipHash ?? null,
  });
  return { token, expiresAt, sessionId };
}

/**
 * Valida o token do cookie. Sessões expiradas são apagadas. A validade é renovada
 * (janela deslizante) quando faltam menos de 15 dias.
 */
export async function validateSessionToken(
  db: Database,
  token: string | undefined | null,
): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date; renewed: boolean } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const sessionId = sha256(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  let expiresAt = row.expiresAt;
  let renewed = false;
  if (row.expiresAt.getTime() - now < RENEW_WHEN_LESS_THAN_DAYS * 86_400_000) {
    expiresAt = new Date(now + SESSION_TTL_DAYS * 86_400_000);
    renewed = true;
    await db.update(sessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
  } else if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
  }
  return { user: { id: row.id, email: row.email, name: row.name }, sessionId, expiresAt, renewed };
}

export async function revokeSessionByToken(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function revokeSession(db: Database, userId: string, sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return deleted.length > 0;
}

export async function revokeOtherSessions(db: Database, userId: string, keepSessionId: string | null): Promise<number> {
  const where = keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId);
  const deleted = await db.delete(sessions).where(where).returning({ id: sessions.id });
  return deleted.length;
}

export async function listSessions(db: Database, userId: string) {
  return db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, userAgent: sessions.userAgent })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
}

export async function purgeExpiredSessions(db: Database): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
