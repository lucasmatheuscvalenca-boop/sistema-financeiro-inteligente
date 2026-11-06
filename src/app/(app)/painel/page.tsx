import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleAlert, Landmark, Upload } from "lucide-react";
import { Silk } from "@/components/app/silk";
import { MascotArt } from "@/components/mascots/mascot-art";
import { CategoryRows, SpendingDonut } from "@/components/spending/category-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Money } from "@/components/ui/misc";
import { formatDateShort, monthKey, weekdayName, type ISODate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { toneToState, voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { refreshAlerts } from "@/server/services/alerts";
import { getHome, type UpcomingItem } from "@/server/services/home";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Início" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS: Record<string, string> = { domingo: "Dom", "segunda-feira": "Seg", "terça-feira": "Ter", "quarta-feira": "Qua", "quinta-feira": "Qui", "sexta-feira": "Sex", sábado: "Sáb" };

function greetingFor(hour: number): string {
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

/** "Seg, 03/nov" (ou "Hoje, 06/nov"). */
function shortDay(date: ISODate, today: string): string {
  const [, m, d] = date.split("-");
  return `${date === today ? "Hoje" : WEEKDAYS[weekdayName(date)]}, ${d}/${MONTHS[Number(m) - 1]}`;
}

/** "Dados atualizados hoje, 08:42" — de quando são os dados, não a hora em que o app leu. */
function updatedLabel(banks: { connected: number; lastSyncAt: Date | null; bankUpdatedAt: Date | null }, lastDataUpdate: string | null, tz: string, today: string): string {
  const at = banks.connected > 0 ? (banks.bankUpdatedAt ?? banks.lastSyncAt) : null;
  if (at) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    const time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);
    return day === today ? `Dados atualizados hoje, ${time}` : `Dados atualizados em ${formatDateShort(day as ISODate)}, ${time}`;
  }
  if (lastDataUpdate) return lastDataUpdate === today ? "Lançamentos de hoje" : `Último lançamento em ${formatDateShort(lastDataUpdate as ISODate)}`;
  return "Sem lançamentos ainda";
}

function UpcomingRow({ item, today }: { item: UpcomingItem; today: string }) {
  const outflow = !(item.kind === "income" || item.kind === "transfer_in");
  const label = item.label.replace(/\s*\(vencido, não confirmado\)|\s*\(atrasado, não confirmado\)/, "");
  const note = item.kind === "invoice" ? "fatura" : item.kind === "goal_contribution" ? "aporte" : item.certainty === "estimated" ? "estimado" : null;
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-3 py-3">
      <span className="text-sm tabular-nums text-muted">{shortDay(item.date, today)}</span>
      <span className="min-w-0 truncate text-sm">
        {label}
        {note ? <span className="ml-1.5 text-xs text-muted">· {note}</span> : null}
      </span>
      <Money cents={Math.abs(item.amountCents)} signed={!outflow} tone={outflow ? "none" : "auto"} className="text-sm font-semibold" />
    </li>
  );
}

/** Canto dourado do indicador principal: um fio de luz acompanhando a curva superior direita. */
function GoldCorner() {
  return (
    <svg aria-hidden className="pointer-events-none absolute right-0 top-0 h-32 w-32" viewBox="0 0 128 128" fill="none">
      <defs>
        <linearGradient id="gold-corner" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8C77A" stopOpacity="0" />
          <stop offset="0.45" stopColor="#E8C77A" />
          <stop offset="1" stopColor="#D4AF57" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 1.5 H104 C116.7 1.5 126.5 11.3 126.5 24 V120" stroke="url(#gold-corner)" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
  const usedPct = monthReference && monthReference.cents > 0 ? Math.min(100, (spending.totalCents / monthReference.cents) * 100) : null;
  const mascotState = toneToState(tip.tone);

  return (
    <div className="space-y-8">
      {/* Cabeçalho: título, saudação e, à direita, de quando são os dados e o Open Finance. */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[32px] leading-none sm:text-[36px]">Início</h1>
          <p className="mt-2 text-sm text-muted sm:text-[15px]">
            {greetingFor(hour)}, {firstName}. Aqui está a sua visão financeira.
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:justify-end md:pt-2">
          <span>{updatedLabel(home.banks, home.lastDataUpdate, app.prefs.timezone, ctx.today)}</span>
          {home.banks.connected > 0 ? (
            <>
              <span aria-hidden className="hidden h-3.5 w-px bg-line md:block" />
              <Link href="/conexoes" className="inline-flex items-center gap-1.5 hover:text-ink">
                <Landmark className="size-3.5" strokeWidth={1.8} />
                Open Finance · {plural(home.banks.connected, "banco", "bancos")}
                {home.banks.stale ? <span className="font-medium text-warning">· sem atualizar</span> : null}
              </Link>
            </>
          ) : null}
          {home.uncategorized ? (
            <Link href={`/movimentacoes?mes=${month}&categoria=sem`} className="inline-flex items-center gap-1 font-medium text-warning hover:underline">
              <CircleAlert className="size-3.5" /> {plural(home.uncategorized, "lançamento sem categoria", "lançamentos sem categoria")}
            </Link>
          ) : null}
        </p>
      </header>

      {canSpend ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-center lg:gap-8">
          {/* O indicador principal: a única superfície em bloco da tela, verde profundo com a textura da marca. */}
          <section className="relative overflow-hidden rounded-2xl bg-hero text-hero-ink">
            <Silk />
            <GoldCorner />
            <div className="relative p-6 sm:p-8">
              <p className="text-[15px] font-medium text-hero-ink/90">Pode gastar {canSpend.untilLabel}</p>
              <p className="mt-2 font-display text-[44px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[56px]">
                <Money cents={canSpend.cents} tone="none" />
              </p>
              {usedPct !== null && monthReference ? (
                <div className="mt-6">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)} aria-label="Gasto do mês em relação ao orçamento">
                    <div className={cn("progress-grow h-full rounded-full", usedPct >= 100 ? "bg-gold-300" : "bg-leaf-500")} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="mt-3 text-sm text-hero-muted">
                    Já usei <span className="font-semibold text-hero-ink">{formatMoney(spending.totalCents)}</span> de <span className="font-semibold text-hero-ink">{formatMoney(monthReference.cents)}</span> {monthReference.label === "do orçamento do mês" ? "do seu orçamento mensal" : monthReference.label}.
                  </p>
                </div>
              ) : (
                <p className="mt-5 max-w-md text-sm text-hero-muted">{canSpend.reason}</p>
              )}
              <p className="mt-1.5 text-sm text-hero-muted">
                Saldo livre hoje: <span className="font-semibold text-hero-ink">{formatMoney(canSpend.freeCents)}</span>.
              </p>
              <Link href="/posso-gastar" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300 hover:underline">
                Testar uma compra <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          {/* Dica do Banqueiro: ao lado do indicador, sobre a própria página, sem caixa. */}
          <Link href={tip.href} className="group flex items-center gap-4 lg:gap-5">
            <MascotArt id={mascotId} state={mascotState} size={88} decorative className="shrink-0 lg:hidden" />
            <MascotArt id={mascotId} state={mascotState} size={132} priority decorative className="hidden shrink-0 lg:inline-flex" />
            <span className="min-w-0">
              <span className="block font-display text-[18px] font-semibold leading-tight sm:text-[20px]">Dica do seu Banqueiro</span>
              <span className="mt-1.5 block text-sm leading-relaxed text-muted sm:text-[15px]">{tip.message}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-link group-hover:underline">
                {voice.headline(tip.tone)} <ArrowRight className="size-3.5" />
              </span>
            </span>
          </Link>
        </div>
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

      <div className="grid grid-cols-1 gap-10 border-t border-ink/80 pt-6 dark:border-line lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-0">
        {/* Gastos do mês: total, comparação, rosca e legenda, sobre a própria página. */}
        <section className="min-w-0 lg:pr-10">
          <h2 className="text-[22px]">Gastos do mês</h2>
          <p className="mt-1 text-sm text-muted">
            <Money cents={spending.totalCents} tone="none" className="font-semibold text-ink" />
            {spending.deltaPct !== null ? (
              <>
                {" "}·{" "}
                <span className={cn("font-medium", spending.deltaPct <= 0 ? "text-positive" : "text-negative")}>
                  {spending.deltaPct <= 0 ? "−" : "+"}
                  {Math.abs(spending.deltaPct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>{" "}
                em relação ao mês anterior ({formatMoney(spending.previousCents)})
              </>
            ) : spending.totalCents === 0 ? (
              " · nada gasto ainda"
            ) : null}
          </p>
          {spending.categories.length ? (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-6">
                <SpendingDonut categories={spending.categories} totalLabel={formatMoney(spending.totalCents)} caption="Total" size={136} />
                <div className="min-w-[11rem] flex-1">
                  <CategoryRows categories={spending.categories} month={month} limit={6} compact />
                </div>
              </div>
              <Link href="/gastos" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                Ver todos os gastos <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Quando houver lançamentos de despesa neste mês, eles aparecem aqui divididos por categoria.</p>
          )}
        </section>

        {/* Próximos 7 dias úteis: data, descrição e valor, separados por filetes. */}
        <section className="min-w-0 lg:border-l lg:border-line lg:pl-10">
          <h2 className="text-[22px]">Próximos 7 dias úteis</h2>
          {upcoming.length ? (
            <>
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {upcoming.slice(0, 6).map((u, i) => (
                  <UpcomingRow key={`${u.date}-${i}`} item={u} today={ctx.today} />
                ))}
              </ul>
              <Link href="/agenda" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                Ver todos os compromissos <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Nada previsto até {formatDateShort(home.upcomingUntil)}. Contas recorrentes e faturas aparecem aqui quando cadastradas ou importadas.</p>
          )}
        </section>
      </div>
    </div>
  );
}
