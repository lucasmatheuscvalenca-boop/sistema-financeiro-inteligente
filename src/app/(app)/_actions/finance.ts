"use server";

import { bool, cents, num, optStr, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { archiveAccount, createAccount, setActualBalance, updateAccount, type AccountPurpose, type AccountType } from "@/server/services/accounts";
import { copyBudgets, deleteBudget, upsertBudget } from "@/server/services/budgets";
import { archiveCard, createCard, payInvoice, updateCard } from "@/server/services/cards";
import { archiveCategory, createCategory } from "@/server/services/categories";
import { commitImport, previewImport, type ImportChoice } from "@/server/services/imports";
import { createIncomeRecurrences, createRecurrence, deleteRecurrence, materializeOccurrence, setRecurrenceActive } from "@/server/services/recurrences";
import { confirmTransaction, createTransaction, deleteTransaction, updateTransaction } from "@/server/services/transactions";
import type { CsvMapping } from "@/domain/import/csv";

const FIN = ["/painel", "/movimentacoes", "/contas", "/cartoes", "/relatorios", "/orcamento", "/fluxo-de-caixa", "/recorrencias", "/metas", "/reserva", "/patrimonio"];

// ─── Contas ──────────────────────────────────────────────────────────────────
export async function saveAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const id = optStr(fd, "id");
      const data = {
        name: str(fd, "name"),
        type: str(fd, "type") as AccountType,
        purpose: (optStr(fd, "purpose") ?? undefined) as AccountPurpose | undefined,
        institution: optStr(fd, "institution"),
        initialBalanceCents: cents(fd, "initialBalance", { required: false }) ?? 0,
        initialBalanceDate: optStr(fd, "initialBalanceDate") ?? undefined,
      };
      if (id) {
        await updateAccount(ctx, id, data);
        return "Conta atualizada.";
      }
      await createAccount(ctx, data);
      return "Conta criada.";
    },
    { revalidate: FIN },
  );
}

export async function archiveAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => archiveAccount(ctx, str(fd, "id")), { revalidate: FIN });
}

export async function adjustBalanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await setActualBalance(ctx, str(fd, "id"), cents(fd, "actual")!);
      return "Saldo ajustado sem criar lançamentos.";
    },
    { revalidate: FIN },
  );
}

// ─── Cartões e faturas ───────────────────────────────────────────────────────
export async function saveCardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const id = optStr(fd, "id");
      const data = {
        name: str(fd, "name"),
        brand: optStr(fd, "brand"),
        limitCents: cents(fd, "limit")!,
        closingDay: num(fd, "closingDay") ?? 0,
        dueDay: num(fd, "dueDay") ?? 0,
        defaultPaymentAccountId: optStr(fd, "defaultPaymentAccountId"),
      };
      if (id) {
        await updateCard(ctx, id, data);
        return "Cartão atualizado.";
      }
      await createCard(ctx, data);
      return "Cartão cadastrado.";
    },
    { revalidate: FIN },
  );
}

export async function archiveCardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => archiveCard(ctx, str(fd, "id")), { revalidate: FIN });
}

export async function payInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await payInvoice(ctx, { invoiceId: str(fd, "invoiceId"), accountId: str(fd, "accountId"), amountCents: cents(fd, "amount")!, date: str(fd, "date") });
      return "Pagamento registrado. Ele sai da conta, mas não conta como despesa (as compras já foram contadas).";
    },
    { revalidate: FIN },
  );
}

// ─── Movimentações ───────────────────────────────────────────────────────────
export async function saveTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const id = optStr(fd, "id");
      const method = str(fd, "method");
      const kind = str(fd, "kind") as "income" | "expense" | "refund" | "transfer";
      const statusRaw = optStr(fd, "status");
      const base = {
        amountCents: cents(fd, "amount")!,
        date: str(fd, "date"),
        description: str(fd, "description"),
        notes: optStr(fd, "notes"),
        categoryId: kind === "transfer" ? null : optStr(fd, "categoryId"),
        accountId: method === "card" ? null : optStr(fd, "accountId"),
        cardId: method === "card" ? optStr(fd, "cardId") : null,
        toAccountId: kind === "transfer" ? optStr(fd, "toAccountId") : null,
        status: (statusRaw ?? undefined) as "realized" | "scheduled" | "estimated" | undefined,
        incomeType: (optStr(fd, "incomeType") ?? undefined) as never,
        expenseNature: (optStr(fd, "expenseNature") ?? undefined) as never,
        essential: fd.has("essential") ? bool(fd, "essential") : undefined,
      };
      if (id) {
        await updateTransaction(ctx, id, base);
        return "Movimentação atualizada. A alteração ficou registrada no histórico.";
      }
      const created = await createTransaction(ctx, { ...base, kind, installments: num(fd, "installments") ?? 1 });
      return created.length > 1 ? `Parcelamento criado em ${created.length} parcelas.` : "Movimentação registrada.";
    },
    { revalidate: FIN },
  );
}

export async function deleteTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const n = await deleteTransaction(ctx, str(fd, "id"), str(fd, "scope") === "plan" ? "plan" : "single");
      return n > 1 ? `${n} parcelas excluídas.` : "Movimentação excluída.";
    },
    { revalidate: FIN },
  );
}

export async function confirmTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const amount = cents(fd, "amount", { required: false });
      await confirmTransaction(ctx, str(fd, "id"), { amountCents: amount ?? undefined, date: optStr(fd, "date") ?? undefined });
      return "Confirmado.";
    },
    { revalidate: FIN },
  );
}

// ─── Categorias ──────────────────────────────────────────────────────────────
export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await createCategory(ctx, { name: str(fd, "name"), kind: str(fd, "kind") as "income" | "expense", parentId: optStr(fd, "parentId"), essential: bool(fd, "essential") });
      return "Categoria criada.";
    },
    { revalidate: ["/movimentacoes", "/orcamento", "/configuracoes/categorias"] },
  );
}

export async function archiveCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => archiveCategory(ctx, str(fd, "id")), { revalidate: ["/configuracoes/categorias"] });
}

// ─── Recorrências ────────────────────────────────────────────────────────────
export async function saveRecurrenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const method = str(fd, "method");
      const kind = str(fd, "kind") as "income" | "expense" | "transfer";
      await createRecurrence(ctx, {
        kind,
        certainty: (str(fd, "certainty") || "scheduled") as "scheduled" | "estimated",
        amountCents: cents(fd, "amount")!,
        description: str(fd, "description"),
        categoryId: kind === "transfer" ? null : optStr(fd, "categoryId"),
        accountId: method === "card" ? null : optStr(fd, "accountId"),
        cardId: method === "card" ? optStr(fd, "cardId") : null,
        toAccountId: kind === "transfer" ? optStr(fd, "toAccountId") : null,
        frequency: str(fd, "frequency") as "monthly",
        interval: num(fd, "interval") ?? 1,
        startDate: str(fd, "startDate"),
        endDate: optStr(fd, "endDate"),
        count: num(fd, "count") ?? null,
        incomeType: (optStr(fd, "incomeType") ?? undefined) as never,
        expenseNature: (optStr(fd, "expenseNature") ?? undefined) as never,
      });
      return "Recorrência criada. As próximas ocorrências já aparecem no fluxo de caixa.";
    },
    { revalidate: FIN },
  );
}

export async function toggleRecurrenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => setRecurrenceActive(ctx, str(fd, "id"), str(fd, "active") === "true"), { revalidate: FIN });
}

export async function deleteRecurrenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => deleteRecurrence(ctx, str(fd, "id")), { revalidate: FIN });
}

export async function createIncomeRecurrencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const created = await createIncomeRecurrences(ctx, str(fd, "accountId"));
      return created > 1 ? "Salário e comissão cadastrados como recorrências." : "Renda cadastrada como recorrência.";
    },
    { revalidate: FIN },
  );
}

export async function materializeOccurrenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const amount = cents(fd, "amount", { required: false });
      await materializeOccurrence(ctx, str(fd, "recurrenceId"), str(fd, "occurrenceDate"), {
        amountCents: amount ?? undefined,
        date: optStr(fd, "date") ?? undefined,
      });
      return "Ocorrência registrada.";
    },
    { revalidate: FIN },
  );
}

// ─── Orçamento ───────────────────────────────────────────────────────────────
export async function saveBudgetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await upsertBudget(ctx, { categoryId: str(fd, "categoryId"), month: str(fd, "month"), limitCents: cents(fd, "limit")!, alertThresholdPct: num(fd, "alertThresholdPct") ?? 80 });
      return "Orçamento salvo.";
    },
    { revalidate: FIN },
  );
}

export async function deleteBudgetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => deleteBudget(ctx, str(fd, "id")), { revalidate: FIN });
}

export async function copyBudgetsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const n = await copyBudgets(ctx, str(fd, "from"), str(fd, "to"));
      return n ? `${n} limite(s) copiado(s).` : "Nada para copiar.";
    },
    { revalidate: FIN },
  );
}

// ─── Importação ──────────────────────────────────────────────────────────────
function importRequest(fd: FormData) {
  const mappingRaw = optStr(fd, "mapping");
  return {
    fileName: str(fd, "fileName") || "extrato",
    content: String(fd.get("content") ?? ""),
    accountId: optStr(fd, "accountId"),
    cardId: optStr(fd, "cardId"),
    mapping: mappingRaw ? (JSON.parse(mappingRaw) as CsvMapping) : null,
  };
}

export async function previewImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => ({ data: await previewImport(ctx, importRequest(fd)) }));
}

export async function commitImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const choices = JSON.parse(String(fd.get("choices") ?? "[]")) as ImportChoice[];
      const r = await commitImport(ctx, importRequest(fd), choices);
      return { message: `Importação concluída: ${r.imported} novo(s), ${r.matched} conciliado(s), ${r.duplicates} duplicado(s) ignorado(s).`, data: r };
    },
    { revalidate: FIN },
  );
}
