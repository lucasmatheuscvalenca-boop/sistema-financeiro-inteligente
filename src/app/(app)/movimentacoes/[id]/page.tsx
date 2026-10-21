import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deleteTransactionAction, saveTransactionAction } from "../../_actions/finance";
import { TransactionForm } from "@/components/finance/transaction-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { formLookups } from "@/server/services/lookups";
import { getTransaction, transactionHistory } from "@/server/services/transactions";

export const metadata: Metadata = { title: "Movimentação" };

const FIELD_LABEL: Record<string, string> = {
  amountCents: "Valor",
  date: "Data",
  description: "Descrição",
  status: "Situação",
  categoryId: "Categoria",
  accountId: "Conta",
  toAccountId: "Conta de destino",
  cardId: "Cartão",
  invoiceId: "Fatura",
  notes: "Observações",
  incomeType: "Tipo de receita",
  expenseNature: "Natureza",
  essential: "Essencial",
  reconciledAt: "Conciliação",
  kind: "Tipo",
};
const ACTION_LABEL: Record<string, string> = { create: "Criada", update: "Alterada", delete: "Excluída", confirm: "Confirmada" };

export default async function TransactionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOnboarded();
  const { id } = await params;
  let tx;
  try {
    tx = await getTransaction(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [history, lookups] = await Promise.all([transactionHistory(ctx, id), formLookups(ctx)]);
  const fmt = (field: string, v: unknown) => {
    if (v == null) return "—";
    if (field === "amountCents") return `R$ ${centsToInput(Number(v))}`;
    if (field === "categoryId") return lookups.categories.find((c) => c.id === v)?.label ?? "categoria";
    if (field === "accountId" || field === "toAccountId") return lookups.accounts.find((a) => a.id === v)?.name ?? "conta";
    if (field === "cardId") return lookups.cards.find((c) => c.id === v)?.name ?? "cartão";
    if (typeof v === "boolean") return v ? "sim" : "não";
    return String(v);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/movimentacoes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Movimentações
      </Link>
      <PageHeader title={tx.description} description={tx.installmentPlanId ? `Parcela ${tx.installmentNumber} de ${tx.installmentCount}` : undefined} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Editar" description={tx.kind === "card_payment" ? "Pagamentos de fatura permitem alterar valor, data, conta e situação." : undefined} />
          <CardBody>
            {tx.kind === "card_payment" ? (
              <p className="text-sm text-muted">Para corrigir um pagamento de fatura, exclua e registre novamente pela página do cartão.</p>
            ) : (
              <TransactionForm
                action={saveTransactionAction}
                accounts={lookups.accounts}
                cards={lookups.cards}
                categories={lookups.categories}
                today={ctx.today}
                defaults={{
                  id: tx.id,
                  kind: tx.kind as "income" | "expense" | "refund" | "transfer",
                  amount: centsToInput(tx.amountCents),
                  date: tx.date,
                  description: tx.description,
                  notes: tx.notes,
                  categoryId: tx.categoryId,
                  accountId: tx.accountId,
                  toAccountId: tx.toAccountId,
                  cardId: tx.cardId,
                  status: tx.status as "realized" | "scheduled" | "estimated",
                  incomeType: tx.incomeType,
                  expenseNature: tx.expenseNature,
                  essential: tx.essential,
                }}
              />
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <InlineAction action={deleteTransactionAction} hidden={{ id: tx.id, scope: "single" }} confirm="Excluir esta movimentação?" variant="secondary">
                Excluir {tx.installmentPlanId ? "esta parcela" : ""}
              </InlineAction>
              {tx.installmentPlanId ? (
                <InlineAction action={deleteTransactionAction} hidden={{ id: tx.id, scope: "plan" }} confirm="Excluir TODAS as parcelas deste parcelamento?" variant="danger">
                  Excluir parcelamento inteiro
                </InlineAction>
              ) : null}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Histórico de alterações" />
          <CardBody>
            <ol className="space-y-3 text-sm">
              {history.map((h) => (
                <li key={h.id} className="rounded-xl border border-line p-3">
                  <p className="font-medium">
                    {ACTION_LABEL[h.action] ?? h.action} <span className="font-normal text-muted">em {h.createdAt.toLocaleString("pt-BR")}</span>
                  </p>
                  {Object.keys(h.changes).length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {Object.entries(h.changes).map(([field, change]) => (
                        <li key={field}>
                          {FIELD_LABEL[field] ?? field}: {fmt(field, change.from)} → {fmt(field, change.to)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
