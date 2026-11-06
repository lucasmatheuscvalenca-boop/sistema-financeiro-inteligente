import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryRows, SpendingDonut } from "@/components/spending/category-list";
import { Callout } from "@/components/ui/callout";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { addMonthsToKey, assertMonthKey, formatMonthKey, monthKey } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { getSpending, type SpendingOverview } from "@/server/services/spending";

export const metadata: Metadata = { title: "Gastos" };

function RecurringList({ title, description, items, empty }: { title: string; description: string; items: SpendingOverview["subscriptions"]; empty: string }) {
  const total = items.reduce((s, x) => s + x.amountCents, 0);
  return (
    <Section title={title} description={description}>
      {items.length ? (
        <>
          <p className="text-xs text-muted">
            {plural(items.length, "cobrança", "cobranças")} · <Money cents={total} tone="none" className="font-semibold text-ink" />/mês
          </p>
          <ul className="divide-y divide-line">
            {items.map((sub) => (
              <li key={sub.key} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{sub.name}</span>
                  <span className="block text-xs text-muted">
                    todo dia {sub.day} · {plural(sub.occurrences, "cobrança", "cobranças")}
                  </span>
                </span>
                <Money cents={sub.amountCents} tone="none" className="shrink-0 text-sm font-semibold" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </Section>
  );
}

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  let month = monthKey(ctx.today);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {}
  const sp2 = await getSpending(ctx, month);
  const title = formatMonthKey(month).replace(/^./, (c) => c.toUpperCase());
  const compactTotal = formatMoney(sp2.totalCents).replace(/,\d{2}$/, "");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Com o que você gastou"
        title="Gastos"
        description="Despesas realizadas por categoria. Transferências entre suas contas e pagamentos de fatura não contam: o dinheiro só mudou de lugar."
        actions={
          <div className="flex items-center gap-1 border-b border-ink/80 pb-1 dark:border-line">
            <Link aria-label="Mês anterior" href={`/gastos?mes=${addMonthsToKey(month, -1)}`} className="rounded-md p-1.5 hover:bg-surface-2">
              <ChevronLeft className="size-5" />
            </Link>
            <span className="min-w-36 text-center font-display text-base font-medium">{title}</span>
            <Link aria-label="Próximo mês" href={`/gastos?mes=${addMonthsToKey(month, 1)}`} className="rounded-md p-1.5 hover:bg-surface-2">
              <ChevronRight className="size-5" />
            </Link>
          </div>
        }
      />

      {sp2.uncategorizedCount ? (
        <Callout tone="warning" action={<Link href={`/movimentacoes?mes=${month}&tipo=expense&categoria=sem`} className="text-sm font-semibold underline">Classificar</Link>}>
          {plural(sp2.uncategorizedCount, "despesa ainda está sem categoria", "despesas ainda estão sem categoria")}. O Meu Banqueiro aprende com cada correção.
        </Callout>
      ) : null}

      {sp2.totalCents <= 0 && sp2.categories.length === 0 ? (
        <EmptyState title={`Nenhuma despesa em ${title.toLowerCase()}`} description="Conecte um banco ou importe um extrato e os gastos aparecem aqui divididos por categoria, sem você precisar classificar nada." />
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
          <div className="space-y-10">
            <Section title={`Total de ${formatMonthKey(month).split(" ")[0]}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Money cents={sp2.totalCents} tone="none" className="font-display text-[30px] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[34px]" />
                {sp2.deltaPct === null ? (
                  <span className="text-sm text-muted">sem base para comparar</span>
                ) : (
                  <span className={`text-sm font-medium tabular-nums ${sp2.totalCents <= sp2.previousCents ? "text-positive" : "text-negative"}`}>
                    {sp2.totalCents <= sp2.previousCents ? "−" : "+"}
                    {formatMoney(Math.abs(sp2.totalCents - sp2.previousCents))} vs {sp2.previousLabel}
                  </span>
                )}
              </div>
              {sp2.averageCents !== null ? (
                <p className="mt-1 text-sm text-muted">
                  Média dos últimos meses: <Money cents={sp2.averageCents} tone="none" className="font-medium text-ink" />
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap items-start gap-6">
                <SpendingDonut categories={sp2.categories} totalLabel={compactTotal} caption={`em ${formatMonthKey(month).split(" ")[0]}`} size={132} />
                <div className="min-w-[11rem] flex-1">
                  <CategoryRows categories={sp2.categories} month={month} />
                </div>
              </div>
            </Section>
          </div>

          <div className="space-y-10">
            <RecurringList title="Assinaturas" description="Streaming, aplicativos, academia: cobranças que se repetem todo mês com valor parecido." items={sp2.subscriptions} empty="Nenhuma assinatura encontrada nos últimos meses." />
            {sp2.fixedCharges.length ? <RecurringList title="Contas fixas que se repetem" description="Aluguel, luz, parcelas: o mesmo valor, todo mês, no mesmo lugar." items={sp2.fixedCharges} empty="" /> : null}
            <Section title="Onde você mais gastou" description="Soma por estabelecimento no mês.">
              {sp2.merchants.length ? (
                <ol className="divide-y divide-line">
                  {sp2.merchants.map((m, i) => (
                    <li key={m.key} className="flex items-baseline gap-3 py-2.5">
                      <span className="w-5 shrink-0 font-display text-sm text-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="block text-xs text-muted">{plural(m.count, "compra", "compras")}</span>
                      </span>
                      <Money cents={m.cents} tone="none" className="shrink-0 text-sm font-semibold" />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">Sem despesas neste mês.</p>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
