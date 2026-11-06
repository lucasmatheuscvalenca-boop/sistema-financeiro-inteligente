import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, CircleAlert, Landmark, Upload } from "lucide-react";
import { Silk } from "@/components/app/silk";
import { MascotArt } from "@/components/mascots/mascot-art";
import { CategoryRows, SpendingDonut } from "@/components/spending/category-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Money } from "@/components/ui/misc";
import { formatDateShort, formatMonthKey, monthKey, weekdayName } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
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
    // O que importa para a pessoa é de quando são os dados do banco, não a hora em que o app leu.
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
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-3 py-3">
      <span className="text-sm tabular-nums text-muted">{formatDateShort(item.date)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.label.replace(/\s*\(vencido, não confirmado\)|\s*\(atrasado, não confirmado\)/, "")}</span>
        <span className="block text-xs text-muted">
          {day} · {kindLabel}
        </span>
      </span>
      <Money cents={item.amountCents} signed className="text-sm font-semibold" />
    </li>
  );
}

function SectionHead({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/80 pb-2 dark:border-line">
      <h2 className="text-[20px]">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-medium text-link hover:underline">
        {linkLabel} <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const app = await requireOnboarded();
  const { ctx, mascotId } = app;
  await refreshAlerts(ctx);
  const home = await getHome(ctx);
  const { canSpend, spending, upcoming, tip, monthReference } = home;
  const month = monthKey(ctx.today);
  const voice = voiceFor(mascotId);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: app.prefs.timezone }).format(new Date()));
  const firstName = app.user.name.split(" ")[0] ?? "";
  const monthName = formatMonthKey(month).split(" ")[0]!.replace(/^./, (c) => c.toUpperCase());
  const usedPct = monthReference && monthReference.cents > 0 ? Math.min(100, (spending.totalCents / monthReference.cents) * 100) : null;
  const mascotState = toneToState(tip.tone);

  return (
    <div className="space-y-9">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-link">Início</p>
        <h1 className="mt-1 text-[30px] sm:text-[36px]">
          {greetingFor(hour)}, {firstName}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            {monthName} · {freshness(home.banks, home.lastDataUpdate, app.prefs.timezone, ctx.today)}
          </span>
          {home.banks.connected > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", home.banks.stale ? "bg-warning" : "bg-leaf-600 dark:bg-leaf-400")} aria-hidden />
              Open Finance {home.banks.stale ? "sem atualizar" : "conectado"}
            </span>
          ) : null}
          {home.uncategorized ? (
            <Link href={`/movimentacoes?mes=${month}&categoria=sem`} className="inline-flex items-center gap-1 font-medium text-warning hover:underline">
              <CircleAlert className="size-3.5" /> {plural(home.uncategorized, "lançamento sem categoria", "lançamentos sem categoria")}
            </Link>
          ) : null}
        </p>
      </header>

      {/* O indicador principal: a única superfície em bloco da tela, verde profundo com a textura da marca. */}
      {canSpend ? (
        <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-hero text-hero-ink">
          <Silk />
          <span className="gold-rule absolute left-0 top-0 h-full w-[3px]" aria-hidden />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">Pode gastar {canSpend.untilLabel}</p>
              <p className="mt-2 font-display text-[44px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[56px]">
                <Money cents={canSpend.cents} tone="none" />
              </p>
              {usedPct !== null && monthReference ? (
                <div className="mt-6 max-w-md">
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)} aria-label="Gasto do mês em relação à referência">
                    <div className={cn("progress-grow h-full rounded-sm", usedPct >= 100 ? "bg-gold-300" : "bg-leaf-300")} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-hero-muted">
                    Já gastou <span className="font-medium text-hero-ink">{formatMoney(spending.totalCents)}</span> de {formatMoney(monthReference.cents)} {monthReference.label} ({Math.round(usedPct)}%).
                  </p>
                </div>
              ) : (
                <p className="mt-5 max-w-md text-sm text-hero-muted">{canSpend.reason}</p>
              )}
              <p className="mt-2 text-sm text-hero-muted">
                Saldo livre hoje: <span className="font-medium text-hero-ink">{formatMoney(canSpend.freeCents)}</span>.
              </p>
              <Link href="/posso-gastar" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300 hover:underline">
                Testar uma compra <ArrowRight className="size-4" />
              </Link>
            </div>
            {/* O consultor: uma dica contextual, ao lado do número, sem virar cartaz. */}
            <Link href={tip.href} className="group flex min-w-0 items-center gap-4 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <MascotArt id={mascotId} state={mascotState} size={96} priority decorative className="shrink-0" />
              <span className="min-w-0 text-sm leading-snug text-hero-muted">
                <span className="block font-display text-[17px] font-medium text-hero-ink">{voice.headline(tip.tone)}</span>
                <span className="mt-1 block">{tip.message}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-gold-300 group-hover:underline">
                  Ver <ChevronRight className="size-3.5" />
                </span>
              </span>
            </Link>
          </div>
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

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        {/* Gastos do mês: total, comparação, rosca e legenda, sobre a própria página. */}
        <section>
          <SectionHead title={`Gastos de ${monthName.toLowerCase()}`} href="/gastos" linkLabel="Ver tudo" />
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money cents={spending.totalCents} tone="none" className="font-display text-[30px] font-semibold tracking-[-0.01em]" />
            {spending.deltaPct !== null ? (
              <span className={cn("text-sm font-medium", spending.deltaPct <= 0 ? "text-positive" : "text-negative")}>
                {spending.deltaPct <= 0 ? "−" : "+"}
                {Math.abs(spending.deltaPct).toFixed(0)}% vs {spending.previousLabel}
              </span>
            ) : spending.totalCents === 0 ? (
              <span className="text-sm text-muted">nada gasto ainda</span>
            ) : null}
          </div>
          {spending.categories.length ? (
            <div className="mt-4 flex items-start gap-6">
              <SpendingDonut categories={spending.categories} totalLabel={formatMoney(spending.totalCents).replace(/,\d{2}$/, "")} caption={`em ${monthName.toLowerCase()}`} size={124} />
              <div className="min-w-0 flex-1">
                <CategoryRows categories={spending.categories} month={month} limit={5} compact />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Quando houver lançamentos de despesa neste mês, eles aparecem aqui divididos por categoria.</p>
          )}
        </section>

        {/* Próximos 7 dias úteis: data, descrição e valor, separados por filetes. */}
        <section>
          <SectionHead title="Próximos 7 dias úteis" href="/agenda" linkLabel="Agenda" />
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 5).map((u, i) => (
                <UpcomingRow key={`${u.date}-${i}`} item={u} today={ctx.today} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Nada previsto até {formatDateShort(home.upcomingUntil)}. Contas recorrentes e faturas aparecem aqui quando cadastradas ou importadas.</p>
          )}
        </section>
      </div>
    </div>
  );
}
