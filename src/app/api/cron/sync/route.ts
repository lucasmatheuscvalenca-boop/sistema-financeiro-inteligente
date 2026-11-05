import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { syncAllConnections } from "@/server/services/connections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COOLDOWN_MS = 20 * 60 * 1000;

/**
 * Sincronização diária de todas as conexões bancárias (agendada em vercel.json).
 * Com CRON_SECRET configurado, exige `Authorization: Bearer <segredo>`. Sem ele, aceita só a
 * chamada da própria Vercel e, por segurança, no máximo uma rodada a cada 20 minutos: o pior
 * que alguém consegue é adiantar uma atualização que aconteceria de qualquer jeito.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else if (!(req.headers.get("user-agent") ?? "").startsWith("vercel-cron/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [last] = await db.select({ at: s.bankSyncRuns.startedAt }).from(s.bankSyncRuns).orderBy(desc(s.bankSyncRuns.startedAt)).limit(1);
  if (!secret && last && Date.now() - last.at.getTime() < COOLDOWN_MS) return NextResponse.json({ skipped: "cooldown" }, { status: 429 });
  const result = await syncAllConnections(db);
  return NextResponse.json(result);
}
