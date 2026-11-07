import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { addDays, weekdayOf, type ISODate } from "@/domain/dates";
import { weeklySummaryEmail } from "@/domain/weekly-summary";
import { SITE_URL } from "@/lib/site";
import type { Database } from "../db/client";
import * as s from "../db/schema";
import { getMailer, type Mailer } from "../email/mailer";
import { sendPush } from "../notifications/push";
import { buildCashContext } from "./cashflow";
import { listCategories } from "./categories";
import { parse } from "./common";
import { makeContext, type ServiceContext } from "./context";
import { loadTransactions } from "./ledger";
import { refreshAlerts } from "./alerts";
import { getFinancialSnapshot } from "./snapshot";

// ─── Inscrição do aparelho e preferências ────────────────────────────────────

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Guarda o aparelho. O mesmo aparelho usado por outra conta passa a ser desta (vale o último login). */
export async function savePushSubscription(ctx: ServiceContext, input: unknown, userAgent: string | null): Promise<void> {
  const d = parse(subscriptionSchema, input);
  await ctx.db
    .insert(s.pushSubscriptions)
    .values({ userId: ctx.userId, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { userId: ctx.userId, p256dh: d.keys.p256dh, auth: d.keys.auth, failures: 0, userAgent: userAgent?.slice(0, 200) ?? null } });
}

export async function removePushSubscription(ctx: ServiceContext, endpoint: string): Promise<void> {
  await ctx.db.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.userId, ctx.userId), eq(s.pushSubscriptions.endpoint, endpoint)));
}

export interface NotificationSettings {
  notifyPush: boolean;
  notifyEmail: boolean;
  weeklySummary: boolean;
  devices: number;
}

export async function getNotificationSettings(ctx: ServiceContext): Promise<NotificationSettings> {
  const [[p], devices] = await Promise.all([
    ctx.db.select({ notifyPush: s.userPreferences.notifyPush, notifyEmail: s.userPreferences.notifyEmail, weeklySummary: s.userPreferences.weeklySummary }).from(s.userPreferences).where(eq(s.userPreferences.userId, ctx.userId)),
    ctx.db.select({ id: s.pushSubscriptions.id }).from(s.pushSubscriptions).where(eq(s.pushSubscriptions.userId, ctx.userId)),
  ]);
  return { notifyPush: p?.notifyPush ?? true, notifyEmail: p?.notifyEmail ?? true, weeklySummary: p?.weeklySummary ?? true, devices: devices.length };
}

const settingsSchema = z.object({ notifyPush: z.boolean(), notifyEmail: z.boolean(), weeklySummary: z.boolean() });

export async function updateNotificationSettings(ctx: ServiceContext, input: z.input<typeof settingsSchema>): Promise<void> {
  const d = parse(settingsSchema, input);
  await ctx.db.update(s.userPreferences).set(d).where(eq(s.userPreferences.userId, ctx.userId));
}

export async function sendTestPush(ctx: ServiceContext): Promise<number> {
  const r = await sendPush(ctx.db, ctx.userId, { title: "Meu Banqueiro", body: "Tudo certo: as notificações chegam neste aparelho.", url: "/configuracoes/notificacoes", tag: "teste" });
  return r.sent;
}

// ─── Envio pela rotina diária ────────────────────────────────────────────────

/**
 * Registra o envio antes de enviar (só um processo consegue): a rotina pode rodar de novo, ou ser
 * chamada duas vezes, sem repetir avisos nem resumos.
 */
async function claim(db: Database, userId: string, channel: "push" | "email", kind: string, ref: string): Promise<boolean> {
  const rows = await db.insert(s.notificationLog).values({ userId, channel, kind, ref }).onConflictDoNothing().returning({ id: s.notificationLog.id });
  return rows.length > 0;
}

const MAX_PUSH_PER_RUN = 3;

/** Avisos importantes e de atenção que ainda não foram enviados: notificação e, os importantes, e-mail. */
export async function dispatchAlerts(ctx: ServiceContext, opts: { mailer?: Mailer | null; email: string; name: string }): Promise<{ push: number; email: number }> {
  const settings = await getNotificationSettings(ctx);
  await refreshAlerts(ctx);
  const since = new Date(Date.now() - 2 * 86_400_000);
  const alerts = await ctx.db
    .select()
    .from(s.alerts)
    .where(and(eq(s.alerts.userId, ctx.userId), eq(s.alerts.status, "active"), inArray(s.alerts.severity, ["important", "attention"]), gte(s.alerts.createdAt, since)))
    .orderBy(desc(s.alerts.createdAt));
  const order = { important: 0, attention: 1, info: 2 } as Record<string, number>;
  alerts.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  let push = 0;
  let email = 0;
  const mailer = opts.mailer === undefined ? getMailer() : opts.mailer;
  for (const a of alerts) {
    if (settings.notifyPush && settings.devices > 0 && push < MAX_PUSH_PER_RUN && (await claim(ctx.db, ctx.userId, "push", "alert", a.fingerprint))) {
      const r = await sendPush(ctx.db, ctx.userId, { title: a.title, body: a.action, url: a.href ?? "/alertas", tag: a.fingerprint.slice(0, 60) });
      push += r.sent > 0 ? 1 : 0;
    }
    if (a.severity === "important" && settings.notifyEmail && mailer && (await claim(ctx.db, ctx.userId, "email", "alert", a.fingerprint))) {
      const first = opts.name.split(" ")[0] || "Olá";
      const text = [`${first}, um aviso importante do Meu Banqueiro:`, "", a.title, a.cause, a.impact, "", `O que fazer: ${a.action}`, "", `${SITE_URL}${a.href ?? "/alertas"}`, "", "Para não receber avisos por e-mail, desligue em Configurações › Notificações."].join("\n");
      try {
        await mailer.send({ to: opts.email, subject: `Aviso: ${a.title}`, text, html: `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.5">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>` });
        email++;
      } catch (e) {
        console.error("[notificações] e-mail de aviso falhou", { error: e instanceof Error ? e.message.slice(0, 120) : "desconhecido" });
      }
    }
  }
  return { push, email };
}

/** Segunda-feira da semana de `date` (formato AAAA-MM-DD), para identificar a semana. */
export function weekKey(date: ISODate): ISODate {
  const w = weekdayOf(date); // 0 = domingo
  return addDays(date, w === 0 ? -6 : 1 - w);
}

/** Resumo da semana que passou (segunda a domingo), enviado às segundas. */
export async function sendWeeklySummary(ctx: ServiceContext, opts: { mailer?: Mailer | null; email: string; name: string; force?: boolean }): Promise<boolean> {
  const mailer = opts.mailer === undefined ? getMailer() : opts.mailer;
  if (!mailer) return false;
  if (!opts.force && weekdayOf(ctx.today) !== 1) return false;
  const settings = await getNotificationSettings(ctx);
  if (!settings.weeklySummary) return false;
  const weekStart = addDays(weekKey(ctx.today), -7);
  const weekEnd = addDays(weekStart, 6);
  if (!(await claim(ctx.db, ctx.userId, "email", "weekly_summary", weekStart))) return false;
  const [txs, categories, cash, snapshot] = await Promise.all([
    loadTransactions(ctx, { from: addDays(weekStart, -7), to: weekEnd }),
    listCategories(ctx, { kind: "expense", includeArchived: true }),
    buildCashContext(ctx, 7),
    getFinancialSnapshot(ctx),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const spent = (from: ISODate, to: ISODate) => txs.filter((t) => t.status === "realized" && t.date >= from && t.date <= to).reduce((sum, t) => sum + (t.kind === "expense" ? t.amountCents : t.kind === "refund" ? -t.amountCents : 0), 0);
  const cats = new Map<string, number>();
  for (const t of txs) {
    if (t.status !== "realized" || t.kind !== "expense" || t.date < weekStart || t.date > weekEnd) continue;
    const c = t.categoryId ? byId.get(t.categoryId) : undefined;
    const name = (c?.parentId ? byId.get(c.parentId)?.name : c?.name) ?? "Sem categoria";
    cats.set(name, (cats.get(name) ?? 0) + t.amountCents);
  }
  const message = weeklySummaryEmail({
    name: opts.name,
    weekStart,
    weekEnd,
    spentCents: spent(weekStart, weekEnd),
    previousSpentCents: spent(addDays(weekStart, -7), addDays(weekStart, -1)),
    topCategories: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, cents]) => ({ name, cents })),
    upcoming: cash.events.filter((e) => e.amountCents < 0 && e.date >= ctx.today && e.date <= addDays(ctx.today, 7)).slice(0, 6).map((e) => ({ date: e.date, label: e.label, amountCents: e.amountCents })),
    freeToSpendCents: snapshot.dataQuality.hasAccounts ? snapshot.totals.freeCents : null,
    goals: snapshot.goals.filter((g) => g.access === "owner" && g.goal.status === "active").slice(0, 4).map((g) => ({ name: g.goal.name, progressPct: g.diagnosis.progressPct })),
    appUrl: SITE_URL,
  });
  try {
    await mailer.send({ to: opts.email, ...message });
    return true;
  } catch (e) {
    // Libera para a próxima rodada tentar de novo.
    await ctx.db.delete(s.notificationLog).where(and(eq(s.notificationLog.userId, ctx.userId), eq(s.notificationLog.kind, "weekly_summary"), eq(s.notificationLog.ref, weekStart)));
    console.error("[notificações] resumo semanal falhou", { error: e instanceof Error ? e.message.slice(0, 120) : "desconhecido" });
    return false;
  }
}

export interface NotificationsRunResult {
  users: number;
  push: number;
  email: number;
  weekly: number;
}

/** Passo da rotina diária: avisos e resumo semanal de cada pessoa com o primeiro acesso concluído. */
export async function runNotifications(db: Database, opts: { mailer?: Mailer | null; today?: ISODate } = {}): Promise<NotificationsRunResult> {
  const people = await db
    .select({ id: s.users.id, email: s.users.email, name: s.users.name, timezone: s.userPreferences.timezone })
    .from(s.users)
    .innerJoin(s.userPreferences, eq(s.userPreferences.userId, s.users.id))
    .where(isNotNull(s.userPreferences.onboardingCompletedAt));
  const result: NotificationsRunResult = { users: people.length, push: 0, email: 0, weekly: 0 };
  for (const p of people) {
    const ctx = makeContext(db, p.id, p.timezone, opts.today);
    try {
      const r = await dispatchAlerts(ctx, { mailer: opts.mailer, email: p.email, name: p.name });
      result.push += r.push;
      result.email += r.email;
      if (await sendWeeklySummary(ctx, { mailer: opts.mailer, email: p.email, name: p.name })) result.weekly++;
    } catch (e) {
      console.error("[notificações] falha para uma pessoa", { error: e instanceof Error ? e.message.slice(0, 160) : "desconhecido" });
    }
  }
  return result;
}

/** Usado pelo teste e pela tela: data em que o próximo resumo sai. */
export function nextSummaryDate(today: ISODate): ISODate {
  const w = weekdayOf(today);
  return addDays(today, w === 1 ? 7 : (8 - w) % 7 || 7);
}
