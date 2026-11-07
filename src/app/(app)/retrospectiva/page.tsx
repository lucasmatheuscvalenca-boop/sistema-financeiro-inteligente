import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Silk } from "@/components/app/silk";
import { BanqueiroMascot } from "@/components/mascots/banqueiro-mascot";
import { EmptyState, Money } from "@/components/ui/misc";
import { formatDateBR, formatMonthKey, formatMonthShort } from "@/domain/dates";
import { plural } from "@/domain/text";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { getYearInReview } from "@/server/services/retrospective";

export const metadata: Metadata = { title: "Retrospectiva do ano" };

const cap = (v: string) => v.replace(/^./, (c) => c.toUpperCase());

function Highlight({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl leading-tight [overflow-wrap:anywhere]">{value}</p>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </li>
  );
}

/** "Seu ano com o Banqueiro": destaques do ano, do jeito que dá vontade de mostrar. */
export default async function RetrospectivePage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const { ctx, user } = await requireOnboarded();
  const sp = await searchParams;
  const thisYear = Number(ctx.today.slice(0, 4));
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const year = years.includes(Number(sp.ano)) ? Number(sp.ano) : thisYear;
  const r = await getYearInReview(ctx, year);
  const firstName = user.name.split(" ")[0];
  const partial = year === thisYear;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-hero px-6 py-8 text-white sm:px-10">
        <Silk className="absolute inset-0 opacity-60" />
        <div className="relative grid grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div>
            <p className="text-sm text-white/75">{partial ? `Até ${formatDateBR(ctx.today)}` : "Retrospectiva"}</p>
            <h1 className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
              Seu {year} com o Banqueiro{firstName ? `, ${firstName}` : ""}
            </h1>
            {r.transactions ? (
              <p className="mt-3 max-w-xl text-white/85">
                {plural(r.transactions, "movimentação", "movimentações")} em {plural(r.activeDays, "dia", "dias")}.{" "}
                {r.savedCents > 0 ? (
                  <>
                    Você guardou <Money cents={r.savedCents} tone="none" className="font-semibold text-white" />
                    {r.savingsRatePct !== null ? ` (${r.savingsRatePct.toFixed(0)}% do que entrou)` : ""}.
                  </>
                ) : (
                  "Foi um ano de gastar mais do que entrou; o próximo pode ser diferente."
                )}
              </p>
            ) : null}
          </div>
          <BanqueiroMascot pose="comemorando" largura={200} altura={220} decorativo className="hidden justify-self-end sm:block" />
        </div>
      </section>

      <nav aria-label="Ano" className="flex flex-wrap gap-2 text-sm">
        {years.map((y) => (
          <Link key={y} href={`/retrospectiva?ano=${y}`} aria-current={y === year ? "page" : undefined} className={cn("rounded-full border px-3 py-1", y === year ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted hover:bg-surface-2")}>
            {y}
          </Link>
        ))}
      </nav>

      {r.transactions === 0 ? (
        <EmptyState title={`Nada registrado em ${year}`} description="A retrospectiva aparece quando houver movimentações no ano." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Highlight label="Entrou" value={<Money cents={r.incomeCents} tone="none" />} note={`em ${plural(r.monthsWithData, "mês", "meses")} com movimentação`} />
          <Highlight label="Saiu" value={<Money cents={r.expenseCents} tone="none" />} note="despesas, já descontados estornos" />
          {r.contributedCents > 0 ? <Highlight label="Guardado nas metas" value={<Money cents={r.contributedCents} tone="none" />} note={r.goalsCompleted.length ? `${plural(r.goalsCompleted.length, "meta concluída", "metas concluídas")}: ${r.goalsCompleted.join(", ")}` : "aportes do ano"} /> : null}
          {r.bestMonth && r.bestMonth.savedCents > 0 ? <Highlight label="Melhor mês" value={cap(formatMonthKey(r.bestMonth.month).split(" ")[0]!)} note={<>sobraram <Money cents={r.bestMonth.savedCents} tone="none" /></>} /> : null}
          {r.priciestMonth ? <Highlight label="Mês mais caro" value={cap(formatMonthKey(r.priciestMonth.month).split(" ")[0]!)} note={<><Money cents={r.priciestMonth.expenseCents} tone="none" /> em despesas</>} /> : null}
          {r.topCategory ? <Highlight label="Onde mais foi dinheiro" value={r.topCategory.name} note={<><Money cents={r.topCategory.cents} tone="none" /> · {r.topCategory.sharePct.toFixed(0)}% das despesas</>} /> : null}
          {r.favoritePlace ? <Highlight label="Lugar favorito" value={r.favoritePlace.name} note={<>{plural(r.favoritePlace.count, "visita", "visitas")} · <Money cents={r.favoritePlace.cents} tone="none" /></>} /> : null}
          {r.biggestPurchase ? <Highlight label="Maior gasto" value={<Money cents={r.biggestPurchase.cents} tone="none" />} note={`${r.biggestPurchase.description} · ${formatMonthShort(r.biggestPurchase.date.slice(0, 7))}`} /> : null}
          {r.netWorth ? (
            <Highlight
              label="Patrimônio"
              value={<Money cents={r.netWorth.endCents - r.netWorth.startCents} signed />}
              note={
                <>
                  de <Money cents={r.netWorth.startCents} tone="none" /> ({formatMonthShort(r.netWorth.startMonth)}) para <Money cents={r.netWorth.endCents} tone="none" /> ({formatMonthShort(r.netWorth.endMonth)})
                </>
              }
            />
          ) : null}
        </ul>
      )}
    </div>
  );
}
