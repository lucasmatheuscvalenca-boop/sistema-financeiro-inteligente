import { NextResponse, type NextRequest } from "next/server";
import { assertMonthKey } from "@/domain/dates";
import { getAppContext } from "@/server/auth/current";
import { listCategories } from "@/server/services/categories";
import { formLookups } from "@/server/services/lookups";
import { listTransactions } from "@/server/services/transactions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { income: "Receita", expense: "Despesa", refund: "Estorno", transfer: "Transferência", card_payment: "Pagamento de fatura" };
const STATUS: Record<string, string> = { realized: "Realizado", scheduled: "Previsto", estimated: "Estimado" };

function cell(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Movimentações do mês em CSV (separador “;” e vírgula decimal, como o Excel em português). */
export async function GET(req: NextRequest) {
  const { ctx } = await getAppContext();
  let month: string;
  try {
    month = assertMonthKey(req.nextUrl.searchParams.get("mes") ?? ctx.today.slice(0, 7));
  } catch {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }
  const [rows, cats, look] = await Promise.all([listTransactions(ctx, { month, limit: 1000 }), listCategories(ctx, { includeArchived: true }), formLookups(ctx)]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const accName = new Map([...look.accounts.map((a) => [a.id, a.name] as const), ...look.cards.map((c) => [c.id, c.name] as const)]);
  const lines = [["Data", "Descrição", "Tipo", "Situação", "Categoria", "Conta/Cartão", "Valor (R$)"].join(";")];
  for (const t of rows) {
    const sign = t.kind === "income" || t.kind === "refund" ? 1 : t.kind === "expense" ? -1 : 0;
    const value = ((sign || 1) * t.amountCents) / 100;
    lines.push(
      [t.date.split("-").reverse().join("/"), t.description, KIND[t.kind] ?? t.kind, STATUS[t.status] ?? t.status, t.categoryId ? (catName.get(t.categoryId) ?? "") : "", accName.get(t.cardId ?? t.accountId ?? "") ?? "", value.toFixed(2).replace(".", ",")]
        .map(cell)
        .join(";"),
    );
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexo-movimentacoes-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
