import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, Link2, Pencil, Plus, Scale, Upload, Wallet } from "lucide-react";
import { adjustBalanceAction, archiveAccountAction, saveAccountAction, saveCardAction } from "../_actions/finance";
import { AccountForm, AdjustBalanceForm, CardForm } from "@/components/finance/account-forms";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat } from "@/components/ui/misc";
import { formatMoney } from "@/domain/money";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { ACCOUNT_PURPOSE_LABEL, ACCOUNT_TYPE_LABEL, listAccountsWithBalances, type AccountPurpose, type AccountType } from "@/server/services/accounts";
import { listCardsOverview } from "@/server/services/cards";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage() {
  const { ctx } = await requireOnboarded();
  const [accounts, cards] = await Promise.all([listAccountsWithBalances(ctx), listCardsOverview(ctx)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const total = (p: AccountPurpose) => accounts.filter((a) => a.purpose === p).reduce((s, a) => s + a.balanceCents, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Central financeira"
        title="Contas"
        description="Saldos confirmados a partir dos lançamentos. A finalidade de cada conta define o que entra no saldo livre e na reserva."
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
          <Wallet className="size-5 text-link" /> Suas contas
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

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/cartoes" className="card-hover flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-xl bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-100">
            <CreditCard className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Cartões de crédito</span>
            <span className="text-xs text-muted">{cards.length ? `${cards.length} cartão(ões) · disponível ${formatMoney(cards.reduce((s, c) => s + c.limit.availableCents, 0))}` : "Faturas, limites e parcelas"}</span>
          </span>
          <ChevronRight className="size-4 text-muted" />
        </Link>
        <Link href="/conexoes" className="card-hover flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-xl bg-petrol-50 text-petrol-700 dark:bg-petrol-900/40 dark:text-petrol-200">
            <Link2 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Conexões bancárias</span>
            <span className="text-xs text-muted">Open Finance e banco de demonstração</span>
          </span>
          <ChevronRight className="size-4 text-muted" />
        </Link>
        <Link href="/importar" className="card-hover flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-xl bg-gold-50 text-gold-700 dark:bg-gold-700/30 dark:text-gold-200">
            <Upload className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Importar extrato</span>
            <span className="text-xs text-muted">CSV ou OFX com prévia e sem duplicar</span>
          </span>
          <ChevronRight className="size-4 text-muted" />
        </Link>
      </section>
    </div>
  );
}
