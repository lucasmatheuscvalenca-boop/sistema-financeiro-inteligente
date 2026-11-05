import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, Repeat } from "lucide-react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { CategoryRows, SpendingDonut } from "@/components/spending/category-list";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { addMonthsToKey, assertMonthKey, formatMonthKey, monthKey } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { getSpending, type SpendingOverview } from "@/server/services/spending";

export const metadata: Metadata = { title: "Gastos" };

function RecurringCard({ title, description, items, empty, color }: { title: string; description: string; items: SpendingOverview["subscriptions"]; empty: string; color: string }) {
  const total = items.reduce((s, x) => s + x.amountCents, 0);
  return (
    <Card>
      <CardHeader title={title} icon={<Repeat className="size-4" />} description={description} />
      <CardBody className="pt-2">
        {items.length ? (
          <>
            <p className="mb-1 text-xs text-muted">
              {plural(items.length, "cobrança", "cobranças")} · <Money cents={total} tone="none" className="font-semibold text-ink" />/mês
            </p>
            <ul className="divide-y divide-line">
              {items.map((sub) => (
                <li key={sub.key} className="flex items-center gap-3 py-2.5">
                  <CategoryIcon kind="expense" icon="repeat" color={color} className="size-9" />
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
      </CardBody>
    </Card>
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
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-none">
      <PageHeader
        eyebrow="Com o que você gastou"
        title="Gastos"
        description="Despesas realizadas por categoria. Transferências entre suas contas e pagamentos de fatura não contam: o dinheiro só mudou de lugar."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface px-1">
            <Link aria-label="Mês anterior" href={`/gastos?mes=${addMonthsToKey(month, -1)}`} className="rounded-full p-2 hover:bg-surface-2">
              <ChevronLeft className="size-5" />
            </Link>
            <span className="min-w-36 text-center text-sm font-semibold">{title}</span>
            <Link aria-label="Próximo mês" href={`/gastos?mes=${addMonthsToKey(month, 1)}`} className="rounded-full p-2 hover:bg-surface-2">
              <ChevronRight className="size-5" />
            </Link>
          </div>
        }
      />

      {sp2.uncategorizedCount ? (
        <Link href={`/movimentacoes?mes=${month}&tipo=expense&categoria=sem`} className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">
            {plural(sp2.uncategorizedCount, "despesa ainda está sem categoria", "despesas ainda estão sem categoria")}. Toque para classificar; o NEXO aprende com você.
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </Link>
      ) : null}

      {sp2.totalCents <= 0 && sp2.categories.length === 0 ? (
        <EmptyState title={`Nenhuma despesa em ${title.toLowerCase()}`} description="Conecte um banco ou importe um extrato e os gastos aparecem aqui divididos por categoria, sem você precisar classificar nada." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-5">
                <SpendingDonut categories={sp2.categories} totalLabel={compactTotal} caption={`em ${formatMonthKey(month).split(" ")[0]}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-xs text-muted">Comparado a {sp2.previousLabel}</p>
                    {sp2.deltaPct === null ? (
                      <p className="text-sm text-muted">sem base para comparar</p>
                    ) : (
                      <p className={`text-lg font-bold tabular-nums ${sp2.totalCents <= sp2.previousCents ? "text-positive" : "text-negative"}`}>
                        {sp2.totalCents <= sp2.previousCents ? "−" : "+"}
                        {formatMoney(Math.abs(sp2.totalCents - sp2.previousCents))}
                      </p>
                    )}
                  </div>
                  {sp2.averageCents !== null ? (
                    <p className="text-xs text-muted">
                      Média dos últimos meses: <Money cents={sp2.averageCents} tone="none" className="font-medium text-ink" />
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
            <Card className="px-5 py-2">
              <CategoryRows categories={sp2.categories} month={month} />
            </Card>
          </div>

          <div className="space-y-4">
            <RecurringCard title="Assinaturas" description="Streaming, aplicativos, academia: cobranças que se repetem todo mês com valor parecido." items={sp2.subscriptions} empty="Nenhuma assinatura encontrada nos últimos meses." color="#5B4A7A" />
            {sp2.fixedCharges.length ? <RecurringCard title="Contas fixas que se repetem" description="Aluguel, luz, parcelas: o mesmo valor, todo mês, no mesmo lugar." items={sp2.fixedCharges} empty="" color="#2B6CB0" /> : null}

            <Card>
              <CardHeader title="Onde você mais gastou" description="Soma por estabelecimento no mês." />
              <CardBody className="pt-2">
                {sp2.merchants.length ? (
                  <ul className="divide-y divide-line">
                    {sp2.merchants.map((m, i) => (
                      <li key={m.key} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{m.name}</span>
                          <span className="block text-xs text-muted">{plural(m.count, "compra", "compras")}</span>
                        </span>
                        <Money cents={m.cents} tone="none" className="shrink-0 text-sm font-semibold" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Sem despesas neste mês.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
