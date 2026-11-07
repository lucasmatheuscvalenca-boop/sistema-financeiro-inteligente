"use server";

import { cents, optStr, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { AppError } from "@/server/errors";
import { createRecurrence } from "@/server/services/recurrences";

const PATHS = ["/despesas-anuais", "/assinaturas", "/fluxo-de-caixa", "/agenda", "/painel"];

/**
 * Despesa anual (IPVA, IPTU, seguro, anuidade, Natal): vira uma recorrência anual estimada, que
 * aparece na agenda e no fluxo de caixa e entra no "separe R$ X por mês".
 */
export async function saveAnnualExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const date = str(fd, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("Informe a data do próximo pagamento", "validation", { date: "Informe a data" });
      const accountId = optStr(fd, "accountId");
      if (!accountId) throw new AppError("Escolha a conta de onde sai o pagamento", "validation", { accountId: "Escolha a conta" });
      await createRecurrence(ctx, {
        kind: "expense",
        certainty: "estimated",
        amountCents: cents(fd, "amount")!,
        description: str(fd, "name"),
        categoryId: optStr(fd, "categoryId"),
        accountId,
        frequency: "yearly",
        interval: 1,
        dayOfMonth: Number(date.slice(8, 10)),
        startDate: date,
      });
      return "Despesa anual cadastrada. Ela já aparece na agenda e no fluxo de caixa.";
    },
    { revalidate: PATHS },
  );
}
