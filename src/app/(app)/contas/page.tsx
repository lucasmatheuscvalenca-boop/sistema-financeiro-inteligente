import type { Metadata } from "next";
import { CreditCard, Pencil, Plus, Scale, Wallet } from "lucide-react";
import { adjustBalanceAction, archiveAccountAction, archiveCardAction, payInvoiceAction, saveAccountAction, saveCardAction } from "../_actions/finance";
import { AccountForm, AdjustBalanceForm, CardForm, PayInvoiceForm } from "@/components/finance/account-forms";
import { Badge, DemoBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDateShort } from "@/domain/dates";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { ACCOUNT_PURPOSE_LABEL, ACCOUNT_TYPE_LABEL, listAccountsWithBalances, type AccountPurpose, type AccountType } from "@/server/services/accounts";
import { listCardsOverview } from "@/server/services/cards";

export const metadata: Metadata = { title: "Contas e cartões" };

const INVOICE_STATUS: Record<string, [string, BadgeTone]> = {
  open: ["Aberta", "info"],
  closed: ["Fechada", "warning"],
  partially_paid: ["Paga parcialmente", "warning"],
  paid: ["Paga", "positive"],
  overdue: ["Vencida", "negative"],
  future: ["Futura", "neutral"],
};

export default async function AccountsPage() {
  const { ctx } = await requireOnboarded();
  const [accounts, cards] = await Promise.all([listAccountsWithBalances(ctx), listCardsOverview(ctx)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const total = (p: AccountPurpose) => accounts.filter((a) => a.purpose === p).reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Central financeira"
        title="Contas e cartões"
        description="Saldos confirmados a partir dos lançamentos, limites e faturas."
        actions={
          <>
            <Dialog trigger={<><Plus className="size-4" /> Nova conta</>} title="Nova conta" variant="secondary">
              <AccountForm action={saveAccountAction} today={ctx.today} />
            </Dialog>
            <Dialog trigger={<><CreditCard className="size-4" /> Novo cartão</>} title="Novo cartão">
              <CardForm action={saveCardAction} accounts={accountOptions} />
            </Dialog>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["spending", "reserve", "goals", "investment"] as AccountPurpose[]).map((p) => (
          <Card key={p} className="p-4">
            <Stat label={ACCOUNT_PURPOSE_LABEL[p]} value={<Money cents={total(p)} />} />
          </Card>
        ))}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-5 text-petrol-600" /> Contas
        </h2>
        {accounts.length === 0 ? (
          <EmptyState title="Nenhuma conta cadastrada" description="Comece pela conta onde você recebe e paga as contas do dia a dia." action={<Dialog trigger={<><Plus className="size-4" /> Nova conta</>} title="Nova conta"><AccountForm action={saveAccountAction} today={ctx.today} /></Dialog>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      {a.name} {a.source === "demo" ? <DemoBadge /> : a.source === "connector" ? <Badge tone="info">Conectada</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {ACCOUNT_TYPE_LABEL[a.type as AccountType]} · {ACCOUNT_PURPOSE_LABEL[a.purpose as AccountPurpose]}
                      {a.institution ? ` · ${a.institution}` : ""}
                    </p>
                  </div>
                  <Badge tone="neutral">Confirmado</Badge>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  <Money cents={a.balanceCents} />
                </p>
                {a.projectedMonthEndCents !== a.balanceCents ? (
                  <p className="text-xs text-muted">
                    Previsto no fim do mês: <Money cents={a.projectedMonthEndCents} tone="none" />
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  <Dialog trigger={<><Pencil className="size-3.5" /> Editar</>} title={`Editar ${a.name}`} variant="ghost" size="sm">
                    <AccountForm
                      action={saveAccountAction}
                      today={ctx.today}
                      defaults={{ id: a.id, name: a.name, type: a.type, purpose: a.purpose, institution: a.institution, initialBalance: centsToInput(a.initialBalanceCents), initialBalanceDate: a.initialBalanceDate }}
                    />
                  </Dialog>
                  <Dialog trigger={<><Scale className="size-3.5" /> Ajustar saldo</>} title="Ajustar saldo" variant="ghost" size="sm">
                    <AdjustBalanceForm action={adjustBalanceAction} id={a.id} current={centsToInput(a.balanceCents)} />
                  </Dialog>
                  <InlineAction action={archiveAccountAction} hidden={{ id: a.id }} confirm="Arquivar esta conta? O histórico continua disponível.">
                    Arquivar
                  </InlineAction>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="size-5 text-petrol-600" /> Cartões de crédito
        </h2>
        {cards.length === 0 ? (
          <EmptyState title="Nenhum cartão cadastrado" description="Com o cartão cadastrado, compras e parcelas caem automaticamente na fatura certa." />
        ) : (
          <div className="space-y-4">
            {cards.map((c) => (
              <Card key={c.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {c.name} {c.source === "demo" ? <DemoBadge /> : null}
                    </span>
                  }
                  description={`Fecha dia ${c.closingDay} · vence dia ${c.dueDay}${c.brand ? ` · ${c.brand}` : ""}`}
                  action={
                    <div className="flex gap-1">
                      <Dialog trigger={<><Pencil className="size-3.5" /> Editar</>} title={`Editar ${c.name}`} variant="ghost" size="sm">
                        <CardForm action={saveCardAction} accounts={accountOptions} defaults={{ id: c.id, name: c.name, brand: c.brand, limit: centsToInput(c.limitCents), closingDay: c.closingDay, dueDay: c.dueDay, defaultPaymentAccountId: c.defaultPaymentAccountId }} />
                      </Dialog>
                      <InlineAction action={archiveCardAction} hidden={{ id: c.id }} confirm="Arquivar este cartão?">
                        Arquivar
                      </InlineAction>
                    </div>
                  }
                />
                <CardBody className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
                  <div className="space-y-3">
                    <Stat label="Limite disponível" value={<Money cents={c.limit.availableCents} />} hint={<>de <Money cents={c.limitCents} tone="none" /> · comprometido <Money cents={c.limit.committedCents} tone="none" /> (inclui parcelas futuras)</>} />
                    <Progress value={c.limit.usedPct} tone={c.limit.usedPct > 90 ? "negative" : c.limit.usedPct > 70 ? "warning" : "navy"} label="Uso do limite" />
                    {c.openInvoice ? (
                      <p className="text-sm text-muted">
                        Fatura aberta: <Money cents={c.openInvoice.totalCents} tone="none" className="font-medium text-ink" /> · fecha em {formatDateShort(c.openInvoice.ref.closingDate)}, vence em {formatDateShort(c.openInvoice.ref.dueDate)}
                      </p>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
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
                        {c.invoices.slice(0, 8).map((inv) => (
                          <tr key={inv.id}>
                            <td className="py-2">
                              <span className="mr-2">{inv.reference.slice(5, 7)}/{inv.reference.slice(0, 4)}</span>
                              <Badge tone={INVOICE_STATUS[inv.status]![1]}>{INVOICE_STATUS[inv.status]![0]}</Badge>
                            </td>
                            <td className="py-2 text-muted">{formatDateShort(inv.dueDate)}</td>
                            <td className="py-2 text-right tabular-nums">
                              <Money cents={inv.totalCents} tone="none" />
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              <Money cents={inv.outstandingCents} tone="none" />
                            </td>
                            <td className="py-2 text-right">
                              {inv.outstandingCents > 0 && accounts.length > 0 ? (
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
      </section>
    </div>
  );
}
