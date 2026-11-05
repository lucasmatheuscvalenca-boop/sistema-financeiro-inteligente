import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, CircleAlert, Landmark, Upload } from "lucide-react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { MascotArt } from "@/components/mascots/mascot-art";
import { CategoryRows, SpendingBar } from "@/components/spending/category-list";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Money } from "@/components/ui/misc";
import { formatDateShort, formatMonthKey, monthKey, weekdayName } from "@/domain/dates";
import { formatDateTime } from "@/lib/format";
import { toneToState, voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { refreshAlerts } from "@/server/services/alerts";
import { getHome, type UpcomingItem } from "@/server/services/home";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Início" };

function greetingFor(hour: number): string {
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function freshness(banks: { connected: number; lastSyncAt: Date | null; bankUpdatedAt: Date | null }, lastDataUpdate: string | null, tz: string, today: string): string {
  if (banks.connected > 0 && (banks.bankUpdatedAt || banks.lastSyncAt)) {
    // O que importa para a pessoa é de quando são os dados do banco, não a hora em que o NEXO leu.
    const at = banks.bankUpdatedAt ?? banks.lastSyncAt!;
    const hours = Math.floor((Date.now() - at.getTime()) / 3_600_000);
    const when = hours < 1 ? "de agora há pouco" : hours < 24 ? `de ${plural(hours, "hora", "horas")} atrás` : `de ${formatDateTime(at, tz)}`;
    return `dados do banco ${when}`;
  }
  if (lastDataUpdate) return lastDataUpdate === today ? "lançamentos de hoje" : `último lançamento em ${formatDateShort(lastDataUpdate)}`;
  return "sem lançamentos ainda";
}

function UpcomingRow({ item, today }: { item: UpcomingItem; today: string }) {
  const day = item.date === today ? "Hoje" : weekdayName(item.date).replace("-feira", "").replace(/^./, (c) => c.toUpperCase());
  const kindLabel = item.kind === "invoice" ? "fatura" : item.kind === "goal_contribution" ? "aporte" : item.certainty === "estimated" ? "estimado" : item.kind === "income" || item.kind === "transfer_in" ? "entrada" : "previsto";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <CategoryIcon kind={item.amountCents >= 0 ? "income" : item.kind === "invoice" ? "card_payment" : "expense"} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label.replace(/\s*\(vencido, não confirmado\)|\s*\(atrasado, não confirmado\)/, "")}</span>
        <span className="block text-xs text-muted">
          {day}, {formatDateShort(item.date)} · {kindLabel}
        </span>
      </span>
      <Money cents={item.amountCents} signed className="shrink-0 text-sm" />
    </li>
  );
}

export default async function HomePage() {
  const app = await requireOnboarded();
  const { ctx, mascotId } = app;
  await refreshAlerts(ctx);
  const home = await getHome(ctx);
  const { canSpend, spending, upcoming, tip } = home;
  const month = monthKey(ctx.today);
  const voice = voiceFor(mascotId);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: app.prefs.timezone }).format(new Date()));
  const firstName = app.user.name.split(" ")[0] ?? "";
  const monthName = formatMonthKey(month).split(" ")[0]!.replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-none">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
          {greetingFor(hour)}, {firstName}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>
            {monthName} · {freshness(home.banks, home.lastDataUpdate, app.prefs.timezone, ctx.today)}
          </span>
          {home.uncategorized ? (
            <Link href={`/movimentacoes?mes=${month}&categoria=sem`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              <CircleAlert className="size-3.5" /> {plural(home.uncategorized, "lançamento sem categoria", "lançamentos sem categoria")}
            </Link>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* O número: quanto dá para gastar até o próximo dinheiro entrar. */}
          {canSpend ? (
            <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-gradient-to-br from-hero via-hero to-surface-2 p-5 shadow-[var(--shadow-card)] sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-link">Pode gastar {canSpend.untilLabel}</p>
              <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight sm:text-5xl">
                <Money cents={canSpend.cents} tone="none" />
              </p>
              <p className="mt-3 max-w-[16rem] text-sm text-muted sm:max-w-xs">
                {canSpend.reason} Saldo livre: <Money cents={canSpend.freeCents} tone="none" className="font-medium text-ink" />.
              </p>
              <Link href="/posso-gastar" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
                Testar uma compra <ArrowRight className="size-4" />
              </Link>
              <MascotArt id={mascotId} state={toneToState(tip.tone)} size={132} priority animate decorative className="pointer-events-none absolute -bottom-3 -right-2 sm:-right-1 sm:bottom-0 sm:size-[150px]" />
            </section>
          ) : (
            <EmptyState
              art={<MascotArt id={mascotId} state="guidance" size={96} />}
              title="Vamos começar pelos seus bancos"
              description={voice.emptyState("contas")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/conexoes">
                    <Landmark className="size-4" /> Conectar banco
                  </ButtonLink>
                  <ButtonLink href="/importar" variant="secondary">
                    <Upload className="size-4" /> Importar extrato
                  </ButtonLink>
                </div>
              }
            />
          )}

          {/* Gastos do mês, como no app do banco. */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Gastos de {monthName.toLowerCase()}</h2>
              <Link href="/gastos" className="inline-flex items-center gap-0.5 text-sm font-medium text-link hover:underline">
                Ver tudo <ChevronRight className="size-4" />
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Money cents={spending.totalCents} tone="none" className="text-2xl font-bold tracking-tight" />
              {spending.deltaPct !== null ? (
                <Badge tone={spending.deltaPct <= 0 ? "positive" : "warning"}>
                  {spending.deltaPct <= 0 ? "−" : "+"}
                  {Math.abs(spending.deltaPct).toFixed(0)}% vs {spending.previousLabel}
                </Badge>
              ) : spending.totalCents === 0 ? (
                <span className="text-xs text-muted">nada gasto ainda</span>
              ) : null}
            </div>
            {spending.categories.length ? (
              <>
                <SpendingBar categories={spending.categories} className="mt-3" />
                <div className="mt-2">
                  <CategoryRows categories={spending.categories} month={month} limit={4} compact />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Quando houver lançamentos de despesa neste mês, eles aparecem aqui divididos por categoria.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Próximos 7 dias úteis</h2>
              <Link href="/agenda" className="inline-flex items-center gap-0.5 text-sm font-medium text-link hover:underline">
                Agenda <ChevronRight className="size-4" />
              </Link>
            </div>
            {upcoming.length ? (
              <ul className="mt-1 divide-y divide-line">
                {upcoming.slice(0, 4).map((u, i) => (
                  <UpcomingRow key={`${u.date}-${i}`} item={u} today={ctx.today} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Nada previsto até {formatDateShort(home.upcomingUntil)}. Contas recorrentes e faturas aparecem aqui quando cadastradas ou importadas.</p>
            )}
          </Card>

          {/* Uma dica, calculada: a mesma do mascote, sem o cartaz. */}
          <Link href={tip.href} className={cn("flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-hero/80 p-4 transition hover:border-petrol-400", "dark:bg-hero")}>
            <MascotArt id={mascotId} state={toneToState(tip.tone)} size={48} decorative className="shrink-0" />
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-semibold text-link">{voice.headline(tip.tone)}</span> {tip.message}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
}
