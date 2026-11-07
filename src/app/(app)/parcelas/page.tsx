import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDateShort, formatMonthKey, formatMonthShort } from "@/domain/dates";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { getInstallmentCenter } from "@/server/services/installments";

export const metadata: Metadata = { title: "Parcelas" };

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Central de parcelas: o que das próximas faturas já está comprometido e quando cada parcelamento acaba. */
export default async function InstallmentsPage() {
  const { ctx } = await requireOnboarded();
  const c = await getInstallmentCenter(ctx);
  const max = Math.max(1, ...c.months.map((m) => m.installmentsCents + m.otherCents));
  const next = c.months[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Parcelas"
        description="Quanto das próximas faturas já está comprometido com compras parceladas e quando cada parcelamento termina. Parcelas que o banco ainda não mandou são estimadas pela última recebida."
        actions={
          <Link href="/cartoes" className="text-sm font-medium text-link hover:underline">
            Ver cartões
          </Link>
        }
      />

      {c.cards.length === 0 ? (
        <EmptyState title="Nenhum cartão cadastrado" description="Cadastre ou conecte um cartão de crédito para acompanhar as parcelas e o melhor dia de compra." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {c.cards.map((card) => {
              const soon = card.best.daysToClosing <= 3;
              return (
                <li key={card.id} className={`rounded-[var(--radius-card)] border bg-surface p-4 ${soon ? "border-warning" : "border-line"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{card.name}</p>
                    {soon ? <Badge tone="warning">{card.best.daysToClosing === 0 ? "Fecha hoje" : card.best.daysToClosing === 1 ? "Fecha amanhã" : `Fecha em ${card.best.daysToClosing} dias`}</Badge> : null}
                  </div>
                  <p className="mt-2 flex items-start gap-2 text-sm">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
                    <span>
                      Melhor dia de compra: <strong>dia {card.best.day}</strong>. Comprando a partir dele, você tem até {card.best.daysToPay} dias para pagar.
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Próximo fechamento em {formatDateShort(card.best.nextClosing)}
                    {soon ? `: compras a partir dessa data já entram na fatura seguinte.` : "."}
                  </p>
                </li>
              );
            })}
          </ul>

          <StatStrip columns={3}>
            <Stat label="Parcelas a pagar" value={<Money cents={c.remainingCents} tone="none" />} hint={plural(c.groups.length, "compra parcelada", "compras parceladas")} />
            <Stat label={next ? `Fatura de ${formatMonthShort(next.reference)}` : "Próxima fatura"} value={<Money cents={next ? next.installmentsCents + next.otherCents : 0} tone="none" />} hint="Já comprometido" />
            <Stat label="Última parcela" value={c.groups.length ? cap(formatMonthKey(c.groups.reduce((a, g) => (g.lastReference > a ? g.lastReference : a), c.groups[0]!.lastReference))) : "—"} />
          </StatStrip>

          <Section title="Próximas faturas" description="Parcelas e outras compras já lançadas em cada fatura. Novas compras ainda vão somar.">
            {c.months.length && max > 1 ? (
              <ul className="space-y-3">
                {c.months.map((m) => {
                  const total = m.installmentsCents + m.otherCents;
                  return (
                    <li key={m.reference} className="grid grid-cols-[4.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-sm">
                      <span className="text-muted first-letter:uppercase">{formatMonthShort(m.reference)}</span>
                      <span className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Parcelas ${(m.installmentsCents / 100).toFixed(2)} reais, outras compras ${(m.otherCents / 100).toFixed(2)} reais`}>
                        <span className="h-full bg-[var(--chart-1)]" style={{ width: `${(m.installmentsCents / max) * 100}%` }} />
                        {m.otherCents > 0 ? <span className="h-full border-l-2 border-surface bg-[var(--chart-3)]" style={{ width: `${(m.otherCents / max) * 100}%` }} /> : null}
                      </span>
                      <Money cents={total} tone="none" className="text-right font-medium" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma compra lançada nas próximas faturas.</p>
            )}
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[var(--chart-1)]" aria-hidden /> Parcelas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[var(--chart-3)]" aria-hidden /> Outras compras
              </span>
            </p>
          </Section>

          <Section title="Compras parceladas" description="Da que termina primeiro para a última.">
            {c.groups.length ? (
              <ul className="divide-y divide-line">
                {c.groups.map((g) => (
                  <li key={g.key} className="flex items-baseline gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{g.description}</span>
                      <span className="block text-xs text-muted">
                        {g.cardName} · {plural(g.remainingCount, "parcela restante", "parcelas restantes")} de {g.count} · termina em {formatMonthShort(g.lastReference)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money cents={g.amountCents} tone="none" className="block text-sm font-semibold" />
                      <span className="block text-xs text-muted">
                        falta <Money cents={g.remainingCents} tone="none" />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma compra parcelada em aberto.</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
