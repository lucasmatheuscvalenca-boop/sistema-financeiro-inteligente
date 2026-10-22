import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { authRateLimits } from "../db/schema";
import { RateLimitError } from "../errors";

/**
 * Limitador simples em janela fixa, persistido no banco (funciona com várias instâncias).
 * Lança RateLimitError quando o limite é atingido.
 */
export async function consumeRateLimit(db: Database, key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await db
    .insert(authRateLimits)
    .values({ key, attempts: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        attempts: sql`case when ${authRateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${authRateLimits.attempts} + 1 end`,
        windowStart: sql`case when ${authRateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then now() else ${authRateLimits.windowStart} end`,
      },
    })
    .returning({ attempts: authRateLimits.attempts });
  if ((rows[0]?.attempts ?? 0) > limit) throw new RateLimitError();
}

export async function resetRateLimit(db: Database, key: string): Promise<void> {
  await db.delete(authRateLimits).where(sql`${authRateLimits.key} = ${key}`);
}
