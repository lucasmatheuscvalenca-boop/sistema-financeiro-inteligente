import type { Metadata } from "next";
import { CreditCard, Pencil, Plus } from "lucide-react";
import { archiveCardAction, payInvoiceAction, saveCardAction } from "../_actions/finance";
import { CardForm, PayInvoiceForm } from "@/components/finance/account-forms";
import { Badge, DemoBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDateShort } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { listAccountsWithBalances } from "@/server/services/accounts";
import { listCardsOverview } from "@/server/services/cards";

export const metadata: Metadata = { title: "Cartões" };

const INVOICE_STATUS: Record<string, [string, BadgeTone]> = {
  open: ["Aberta", "info"],
  closed: ["Fechada", "warning"],
  partially_paid: ["Paga parcialmente", "warning"],
  paid: ["Paga", "positive"],
  overdue: ["Vencida", "negative"],
  future: ["Futura", "neutral"],
};

// O que pede ação vem primeiro (vencida, fechada, aberta), depois as futuras da mais próxima e, por fim, as pagas.
const INVOICE_ORDER: Record<string, number> = { overdue: 0, closed: 1, partially_paid: 1, open: 2, future: 3, paid: 4 };
function byRelevance<T extends { status: string; dueDate: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (INVOICE_ORDER[a.status] ?? 5) - (INVOICE_ORDER[b.status] ?? 5) || (a.status === "paid" ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate)));
}

/** Representação visual do cartão (sem números reais de cartão: nunca guardamos esses dados). */
function CardVisual({ name, brand, availableCents, limitCents, demo }: { name: string; brand: string | null; availableCents: number; limitCents: number; demo: boolean }) {
  return (
    <div className="relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 via-navy-900 to-petrol-900 p-5 text-white shadow-[var(--shadow-pop)]">
      <div className="absolute -right-10 -top-12 size-44 rounded-full bg-petrol-500/25 blur-2xl" aria-hidden />
      <div className="absolute -bottom-16 -left-10 size-48 rounded-full bg-gold-500/10 blur-2xl" aria-hidden />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-sm font-semibold tracking-wide">{name}</span>
          {demo ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">DEMO</span> : <CreditCard className="size-5 text-white/70" />}
        </div>
        <div className="h-7 w-10 rounded-md bg-gradient-to-br from-gold-300 to-gold-600 opacity-90" aria-hidden />
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">Disponível</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(availableCents)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-white/60">Limite {formatMoney(limitCents)}</p>
            {brand ? <p className="text-sm font-medium">{brand}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function CardsPage() {
  const { ctx } = await requireOnboarded();
  const [accounts, cards] = await Promise.all([listAccountsWithBalances(ctx), listCardsOverview(ctx)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const totalOpen = cards.reduce((s, c) => s + (c.openInvoice?.totalCents ?? 0), 0);
  const totalAvailable = cards.reduce((s, c) => s + c.limit.availableCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Central financeira"
        title="Cartões"
        description="A compra no cartão é a despesa (na data da compra ou da parcela). Pagar a fatura só quita a dívida — não conta duas vezes."
        actions={
          <Dialog trigger={<><Plus className="size-4" /> Novo cartão</>} title="Novo cartão">
            <CardForm action={saveCardAction} accounts={accountOptions} />
          </Dialog>
        }
      />
      {cards.length ? (
        <section className="grid grid-cols-2 gap-3 sm:max-w-xl">
          <Card className="p-4">
            <p className="text-xs text-muted">Faturas abertas</p>
            <p className="mt-1 text-lg font-bold">
              <Money cents={totalOpen} tone="none" />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">Limite disponível</p>
            <p className="mt-1 text-lg font-bold">
              <Money cents={totalAvailable} tone="none" />
            </p>
          </Card>
        </section>
      ) : null}
      {cards.length === 0 ? (
        <EmptyState title="Nenhum cartão cadastrado" description="Com o cartão cadastrado, compras e parcelas caem automaticamente na fatura certa e o limite comprometido fica visível." />
      ) : (
        <div className="space-y-5">
          {cards.map((c) => (
            <Card key={c.id}>
              <CardBody className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <CardVisual name={c.name} brand={c.brand} availableCents={c.limit.availableCents} limitCents={c.limitCents} demo={c.source === "demo"} />
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>Limite comprometido (inclui parcelas futuras)</span>
                      <span className="tabular-nums">{c.limit.usedPct.toFixed(0)}%</span>
                    </div>
                    <Progress value={c.limit.usedPct} tone={c.limit.usedPct > 90 ? "negative" : c.limit.usedPct > 70 ? "warning" : "petrol"} label="Uso do limite" />
                  </div>
                  <p className="text-sm text-muted">
                    Fecha dia {c.closingDay} · vence dia {c.dueDay}
                    {c.openInvoice ? (
                      <>
                        {" "}
                        · fatura aberta <Money cents={c.openInvoice.totalCents} tone="none" className="font-medium text-ink" /> (fecha {formatDateShort(c.openInvoice.ref.closingDate)})
                      </>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {c.source === "demo" ? <DemoBadge /> : null}
                    <Dialog trigger={<><Pencil className="size-3.5" /> Editar</>} title={`Editar ${c.name}`} variant="ghost" size="sm">
                      <CardForm action={saveCardAction} accounts={accountOptions} defaults={{ id: c.id, name: c.name, brand: c.brand, limit: centsToInput(c.limitCents), closingDay: c.closingDay, dueDay: c.dueDay, defaultPaymentAccountId: c.defaultPaymentAccountId }} />
                    </Dialog>
                    <InlineAction action={archiveCardAction} hidden={{ id: c.id }} confirm="Arquivar este cartão? As faturas continuam no histórico.">
                      Arquivar
                    </InlineAction>
                  </div>
                </div>
                <div className="scroll-hint min-w-0">
                  <h3 className="mb-2 text-sm font-semibold">Faturas</h3>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1.5 font-medium">Fatura</th>
                        <th className="py-1.5 font-medium">Vencimento</th>
                        <th className="py-1.5 text-right font-medium">Total</th>
                        <th className="py-1.5 text-right font-medium">Em aberto</th>
                        <th className="py-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {byRelevance(c.invoices).slice(0, 10).map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-2.5">
                            <span className="mr-2 tabular-nums">
                              {inv.reference.slice(5, 7)}/{inv.reference.slice(0, 4)}
                            </span>
                            <Badge tone={INVOICE_STATUS[inv.status]![1]}>{INVOICE_STATUS[inv.status]![0]}</Badge>
                          </td>
                          <td className="py-2.5 text-muted">{formatDateShort(inv.dueDate)}</td>
                          <td className="py-2.5 text-right tabular-nums">
                            <Money cents={inv.totalCents} tone="none" />
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            <Money cents={inv.outstandingCents} tone="none" />
                          </td>
                          <td className="py-2.5 text-right">
                            {inv.outstandingCents > 0 && inv.status !== "future" && accounts.length > 0 ? (
                              <Dialog trigger="Pagar" title={`Pagar fatura ${inv.reference.slice(5, 7)}/${inv.reference.slice(0, 4)}`} variant="secondary" size="sm">
                                <PayInvoiceForm action={payInvoiceAction} invoiceId={inv.id} accounts={accountOptions} amount={centsToInput(inv.outstandingCents)} date={inv.dueDate < ctx.today ? ctx.today : inv.dueDate} defaultAccountId={c.defaultPaymentAccountId} />
                              </Dialog>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {c.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-muted">
                            Nenhuma compra registrada neste cartão.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
