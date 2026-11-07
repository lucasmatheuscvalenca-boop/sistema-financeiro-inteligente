import { NextResponse, type NextRequest } from "next/server";
import { assertMonthKey } from "@/domain/dates";
import { getAppContext } from "@/server/auth/current";
import { transactionsCsv } from "@/server/services/reports";

export const dynamic = "force-dynamic";

/** Movimentações do mês em CSV (separador “;” e vírgula decimal, como o Excel em português). */
export async function GET(req: NextRequest) {
  const { ctx } = await getAppContext();
  let month: string;
  try {
    month = assertMonthKey(req.nextUrl.searchParams.get("mes") ?? ctx.today.slice(0, 7));
  } catch {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }
  return new NextResponse("﻿" + (await transactionsCsv(ctx, month)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meubanqueiro-movimentacoes-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
