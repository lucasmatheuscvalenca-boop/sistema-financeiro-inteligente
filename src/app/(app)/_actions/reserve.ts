"use server";

import { bool, cents, runAction, str } from "@/app/actions-helpers";
import { formatDateBR } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import type { ActionState } from "@/lib/action-state";
import { recordReserveUse } from "@/server/services/reserve-use";

/** "Usei a reserva": registra o uso e cria o plano para repor. */
export async function recordReserveUseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const r = await recordReserveUse(ctx, {
        fromAccountId: str(fd, "fromAccountId"),
        toAccountId: str(fd, "toAccountId"),
        amountCents: cents(fd, "amount")!,
        reason: str(fd, "reason"),
        months: Number(str(fd, "months") || 6),
        refillDay: Number(str(fd, "refillDay") || 5),
        date: str(fd, "date") || ctx.today,
        transferNow: !bool(fd, "paidFromReserve"),
      });
      return `Combinado: ${formatMoney(r.monthlyCents)} por mês voltam para a reserva a partir de ${formatDateBR(r.firstDate)}. Está na agenda.`;
    },
    { revalidate: ["/reserva", "/agenda", "/fluxo-de-caixa", "/painel", "/contas"] },
  );
}
