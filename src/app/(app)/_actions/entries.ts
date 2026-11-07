"use server";

import { runAction, str } from "@/app/actions-helpers";
import { parseMoney } from "@/domain/money";
import type { ActionState } from "@/lib/action-state";
import { AppError } from "@/server/errors";
import { recordSpendDecision, setTransactionTags, splitTransaction } from "@/server/services/entry-tools";

export async function tagsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const tags = await setTransactionTags(ctx, str(fd, "id"), str(fd, "tags"));
    return tags.length ? "Etiquetas salvas." : "Etiquetas removidas.";
  }, { revalidate: ["/movimentacoes"] });
}

export async function splitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const amounts = fd.getAll("partAmount").map(String);
    const categories = fd.getAll("partCategory").map(String);
    const parts = amounts
      .map((a, i) => ({ raw: a.trim(), categoryId: categories[i] || null }))
      .filter((p) => p.raw)
      .map((p) => {
        try {
          return { amountCents: parseMoney(p.raw, "auto"), categoryId: p.categoryId };
        } catch {
          throw new AppError("Valor inválido em uma das partes. Use o formato 1.234,56.", "validation");
        }
      });
    await splitTransaction(ctx, str(fd, "id"), { parts });
    return `Dividido em ${parts.length} partes.`;
  }, { revalidate: ["/movimentacoes", "/gastos", "/orcamento", "/painel"] });
}

export async function spendDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const decision = str(fd, "decision") as "bought" | "waited" | "gave_up";
    await recordSpendDecision(ctx, {
      amountCents: Number(str(fd, "amountCents")),
      description: str(fd, "description") || "Compra avaliada",
      level: str(fd, "level") as "green",
      maxSafeCents: str(fd, "maxSafeCents") ? Number(str(fd, "maxSafeCents")) : null,
      decision,
    });
    return decision === "gave_up" ? "Anotado. Esse dinheiro continua com você." : decision === "waited" ? "Anotado: fica para depois." : "Anotado. Registre a despesa quando comprar.";
  }, { revalidate: ["/posso-gastar"] });
}
