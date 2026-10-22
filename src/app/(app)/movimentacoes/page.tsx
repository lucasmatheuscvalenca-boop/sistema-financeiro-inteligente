import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Trash2, Upload } from "lucide-react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { deleteTransactionAction, confirmTransactionAction, saveTransactionAction } from "../_actions/finance";
import { TransactionForm } from "@/components/finance/transaction-form";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { addMonthsToKey, assertMonthKey, formatDateBR, formatMonthKey, monthKey } from "@/domain/dates";
import { monthTotals } from "@/domain/ledger";
import { requireOnboarded } from "@/server/auth/current";
import { toLedgerTx } from "@/server/services/ledger";
import { formLookups } from "@/server/services/lookups";
import { listTransactions, type TransactionFilters } from "@/server/services/transactions";
import { cardLabel } from "@/domain/text";

export const metadata: Metadata = { title: "Transações" };

const KIND_LABEL: Record<string, string> = { income: "Receita", expense: "Despesa", refund: "Estorno", transfer: "Transferência", card_payment: "Pagamento de fatura" };
const STATUS_LABEL: Record<string, string> = { realized: "Realizada", scheduled: "Prevista", estimated: "Estimada" };
const FILTER_SELECT = "h-10 w-full min-w-0 truncate rounded-xl border border-field-line bg-field px-3 text-sm";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  let month = monthKey(ctx.today);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {}
  const filters: TransactionFilters = {
    month: sp.busca ? undefined : month,
    kind: (sp.tipo as TransactionFilters["kind"]) || undefined,
    status: (sp.status as TransactionFilters["status"]) || undefined,
    accountId: sp.conta || undefined,
    cardId: sp.cartao || undefined,
    categoryId: sp.categoria === "sem" ? "none" : sp.categoria || undefined,
    search: sp.busca || undefined,
    source: (sp.origem as TransactionFilters["source"]) || undefined,
  };
  const [rows, lookups] = await Promise.all([listTransactions(ctx, filters), formLookups(ctx)]);
  const totals = monthTotals(rows.map(toLedgerTx), month);
  const accName = new Map(lookups.raw.accounts.map((a) => [a.id, a.name]));
  const cardName = new Map(lookups.raw.cards.map((c) => [c.id, c.name]));
  const catLabel = new Map(lookups.categories.map((c) => [c.id, c.label]));
  // Ícone e cor: os da categoria ou, numa subcategoria sem ícone, os da categoria-mãe.
  const rawCats = new Map(lookups.raw.categories.map((c) => [c.id, c]));
  const catVisual = (id: string | null) => {
    const c = id ? rawCats.get(id) : undefined;
    const parent = c?.parentId ? rawCats.get(c.parentId) : undefined;
    return { icon: c?.icon ?? parent?.icon ?? null, color: c?.color ?? parent?.color ?? null };
  };
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && !["nova", "valor", "descricao", "cat"].includes(k)) as Array<[string, string]>);
    return `/movimentacoes?${p.toString()}`;
  };
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  // Atalhos externos (painel, assistente) podem abrir o formulário já preenchido.
  const prefill = sp.nova === "1" ? { kind: "expense" as const, amount: sp.valor, description: sp.descricao, categoryId: lookups.categories.find((c) => c.id === sp.cat)?.id ?? null } : undefined;
  const form = <TransactionForm action={saveTransactionAction} accounts={lookups.accounts} cards={lookups.cards} categories={lookups.categories} today={ctx.today} defaults={prefill} />;

  return (
    <div>
      <PageHeader
        eyebrow="Central financeira"
        title="Transações"
        description="Receitas, despesas, transferências e parcelamentos. Toda alteração fica no histórico."
        actions={
          <>
            <ButtonLink href="/importar" variant="secondary">
              <Upload className="size-4" /> Importar
            </ButtonLink>
            <Dialog trigger={<><Plus className="size-4" /> Nova transação</>} title="Nova transação" defaultOpen={sp.nova === "1"}>
              {form}
            </Dialog>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <form className="space-y-3" action="/movimentacoes">
          <input type="hidden" name="mes" value={month} />
          {/* Busca e botão numa linha; os filtros embaixo, em colunas iguais, para nada ficar cortado. */}
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar descrição em todos os meses</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input name="busca" defaultValue={sp.busca} placeholder="Buscar descrição (todos os meses)" className="h-10 w-full rounded-xl border border-field-line bg-field pl-9 pr-3 text-sm placeholder:text-muted/80 dark:placeholder:text-muted" />
            </label>
            <button className="h-10 shrink-0 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white dark:bg-petrol-400 dark:text-navy-950">Filtrar</button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <select name="tipo" defaultValue={sp.tipo ?? ""} className={FILTER_SELECT} aria-label="Tipo">
              <option value="">Tipo: todos</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={sp.status ?? ""} className={FILTER_SELECT} aria-label="Situação">
              <option value="">Situação: todas</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select name="conta" defaultValue={sp.conta ?? ""} className={FILTER_SELECT} aria-label="Conta">
              <option value="">Conta: todas</option>
              {lookups.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="categoria" defaultValue={sp.categoria ?? ""} className={FILTER_SELECT} aria-label="Categoria">
              <option value="">Categoria: todas</option>
              <option value="sem">Sem categoria</option>
              {lookups.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Card>

      {!sp.busca ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link aria-label="Mês anterior" href={qs({ mes: addMonthsToKey(month, -1) })} className="rounded-lg p-2 hover:bg-surface-2">
              <ChevronLeft className="size-5" />
            </Link>
            <span className="min-w-40 text-center font-semibold first-letter:uppercase">{formatMonthKey(month)}</span>
            <Link aria-label="Próximo mês" href={qs({ mes: addMonthsToKey(month, 1) })} className="rounded-lg p-2 hover:bg-surface-2">
              <ChevronRight className="size-5" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Receitas <Money cents={totals.realized.incomeCents + totals.scheduled.incomeCents} className="font-semibold" />
            </span>
            <span>
              Despesas <Money cents={-(totals.realized.expenseCents + totals.scheduled.expenseCents)} className="font-semibold" />
            </span>
            {totals.estimated.incomeCents ? (
              <span className="text-muted">
                Estimado <Money cents={totals.estimated.incomeCents} tone="none" />
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">
          Resultados para “{sp.busca}”. <Link href="/movimentacoes" className="underline">Limpar busca</Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma transação encontrada" description="Registre uma transação, importe um extrato OFX/CSV ou ajuste os filtros." action={<Dialog trigger={<><Plus className="size-4" /> Nova transação</>} title="Nova transação">{form}</Dialog>} />
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()].map(([date, list]) => (
            <Card key={date} className="overflow-hidden">
              <p className="border-b border-line bg-surface-2/60 px-4 py-2 text-xs font-semibold text-muted">{formatDateBR(date)}</p>
              <ul className="divide-y divide-line">
                {list.map((t) => {
                  const where =
                    t.kind === "transfer"
                      ? `${accName.get(t.accountId!) ?? "?"} → ${accName.get(t.toAccountId!) ?? "?"}`
                      : t.kind === "card_payment"
                        ? `${accName.get(t.accountId!) ?? ""} → ${cardName.get(t.cardId!) ?? ""}`
                        : t.cardId
                          ? cardLabel(cardName.get(t.cardId) ?? "")
                          : (accName.get(t.accountId ?? "") ?? "");
                  const signed = t.kind === "income" || t.kind === "refund" ? t.amountCents : t.kind === "expense" ? -t.amountCents : 0;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50">
                      <CategoryIcon kind={t.kind} {...catVisual(t.categoryId)} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/movimentacoes/${t.id}`} className="font-medium hover:underline">
                          {t.description}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>{KIND_LABEL[t.kind]}</span>·<span>{where}</span>
                          {t.categoryId ? <>· <span>{catLabel.get(t.categoryId)}</span></> : null}
                          {t.status !== "realized" ? <Badge tone={t.status === "estimated" ? "warning" : "info"}>{STATUS_LABEL[t.status]}</Badge> : null}
                          {t.source === "demo" ? <DemoBadge /> : t.source !== "manual" ? <Badge>{t.source === "import" ? "Importada" : "Conexão"}</Badge> : null}
                          {t.reconciledAt ? <Badge tone="positive">Conciliada</Badge> : null}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        {signed === 0 ? <Money cents={t.amountCents} tone="none" className="font-semibold text-muted" /> : <Money cents={signed} signed className="font-semibold" />}
                        {t.status !== "realized" && t.kind !== "card_payment" ? (
                          <InlineAction action={confirmTransactionAction} hidden={{ id: t.id }} variant="secondary">
                            Confirmar
                          </InlineAction>
                        ) : null}
                        <InlineAction action={deleteTransactionAction} hidden={{ id: t.id, scope: "single" }} confirm={t.installmentPlanId ? "Excluir somente esta parcela?" : "Excluir esta movimentação?"} className="text-muted">
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Excluir</span>
                        </InlineAction>
                      </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
