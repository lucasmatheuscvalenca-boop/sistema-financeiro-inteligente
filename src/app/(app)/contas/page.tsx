import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, Link2, Pencil, Plus, Scale, Upload } from "lucide-react";
import { adjustBalanceAction, archiveAccountAction, saveAccountAction, saveCardAction } from "../_actions/finance";
import { AccountForm, AdjustBalanceForm, CardForm } from "@/components/finance/account-forms";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatMoney } from "@/domain/money";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { ACCOUNT_PURPOSE_LABEL, ACCOUNT_TYPE_LABEL, listAccountsWithBalances, type AccountPurpose, type AccountType } from "@/server/services/accounts";
import { listCardsOverview } from "@/server/services/cards";
import { plural } from "@/domain/text";

export const metadata: Metadata = { title: "Bancos e cartões" };

export default async function AccountsPage() {
  const { ctx } = await requireOnboarded();
  const [accounts, cards] = await Promise.all([listAccountsWithBalances(ctx), listCardsOverview(ctx)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const total = (p: AccountPurpose) => accounts.filter((a) => a.purpose === p).reduce((s, a) => s + a.balanceCents, 0);
  const newAccount = (
    <Dialog trigger={<><Plus className="size-4" /> Conta manual</>} title="Nova conta" variant="secondary" size="sm">
      <AccountForm action={saveAccountAction} today={ctx.today} />
    </Dialog>
  );

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Seu dinheiro"
        title="Bancos e cartões"
        description="Conecte um banco e tudo entra sozinho, todo dia. Ou importe o extrato. Contas e cartões manuais continuam valendo."
        actions={
          <>
            <ButtonLink href="/conexoes">
              <Link2 className="size-4" /> Conectar banco
            </ButtonLink>
            <ButtonLink href="/importar" variant="secondary">
              <Upload className="size-4" /> Importar extrato
            </ButtonLink>
          </>
        }
      />

      {/* Totais por finalidade: uma linha de números, separados por filetes. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-ink/80 py-5 dark:border-line lg:grid-cols-4 lg:gap-y-0">
        {(["spending", "reserve", "goals", "investment"] as AccountPurpose[]).map((p, i) => (
          <div key={p} className={i > 0 ? "min-w-0 lg:border-l lg:border-line lg:pl-6" : "min-w-0"}>
            <dt className="text-xs font-medium text-muted">{ACCOUNT_PURPOSE_LABEL[p]}</dt>
            <dd className="mt-1 font-display text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
              <Money cents={total(p)} />
            </dd>
          </div>
        ))}
      </dl>

      <Section
        title="Suas contas"
        action={
          <div className="flex flex-wrap gap-2">
            {newAccount}
            <Dialog trigger={<><CreditCard className="size-4" /> Cartão manual</>} title="Novo cartão" variant="secondary" size="sm">
              <CardForm action={saveCardAction} accounts={accountOptions} />
            </Dialog>
          </div>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState title="Nenhuma conta cadastrada" description="Comece pela conta onde você recebe e paga as contas do dia a dia." action={<Dialog trigger={<><Plus className="size-4" /> Nova conta</>} title="Nova conta"><AccountForm action={saveAccountAction} today={ctx.today} /></Dialog>} />
        ) : (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{a.name}</span>
                    {a.source === "demo" ? <DemoBadge /> : a.source === "connector" ? <Badge tone="info">Conectada</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {ACCOUNT_TYPE_LABEL[a.type as AccountType]} · {ACCOUNT_PURPOSE_LABEL[a.purpose as AccountPurpose]}
                    {a.institution ? ` · ${a.institution}` : ""}
                    {a.projectedMonthEndCents !== a.balanceCents ? (
                      <>
                        {" "}· previsto no fim do mês <Money cents={a.projectedMonthEndCents} tone="none" />
                      </>
                    ) : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
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
                </div>
                <p className="font-display text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-right sm:text-2xl">
                  <Money cents={a.balanceCents} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Também aqui">
        <ul className="divide-y divide-line">
          {[
            { href: "/cartoes", icon: CreditCard, title: "Cartões de crédito", text: cards.length ? `${plural(cards.length, "cartão", "cartões")} · disponível ${formatMoney(cards.reduce((s, c) => s + c.limit.availableCents, 0))}` : "Faturas, limites e parcelas" },
            { href: "/conexoes", icon: Link2, title: "Conexões bancárias", text: "Open Finance e banco de demonstração" },
            { href: "/importar", icon: Upload, title: "Importar extrato", text: "CSV ou OFX com conferência automática e sem duplicar" },
          ].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex items-center gap-3 py-3 transition hover:bg-surface-2/40">
                <item.icon className="size-5 shrink-0 text-link" strokeWidth={1.7} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="text-xs text-muted">{item.text}</span>
                </span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
