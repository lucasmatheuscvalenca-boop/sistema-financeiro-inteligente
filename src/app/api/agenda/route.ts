import { NextResponse } from "next/server";
import { addDays } from "@/domain/dates";
import { buildIcs } from "@/domain/ics";
import { formatMoney } from "@/domain/money";
import { getAppContext } from "@/server/auth/current";
import { buildCashContext } from "@/server/services/cashflow";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { income: "Receber", expense: "Pagar", invoice: "Pagar fatura", goal_contribution: "Guardar na meta", transfer_out: "Transferir", transfer_in: "Receber transferência" };

/** Agenda dos próximos 90 dias em .ics, para abrir no Google Agenda ou no calendário do iPhone. */
export async function GET() {
  const { ctx } = await getAppContext();
  const cash = await buildCashContext(ctx, 90);
  const until = addDays(ctx.today, 90);
  const events = cash.events
    .filter((e) => e.date >= ctx.today && e.date <= until)
    .map((e) => ({
      date: e.date,
      title: `${KIND[e.kind] ?? (e.amountCents >= 0 ? "Receber" : "Pagar")}: ${e.label} · ${formatMoney(Math.abs(e.amountCents))}`,
      description: [e.certainty === "estimated" ? "Valor estimado." : null, "Do Meu Banqueiro. O valor pode mudar até a data."].filter(Boolean).join(" "),
    }));
  const ics = buildIcs(events, { now: new Date(), calendarName: "Meu Banqueiro", domain: "meubanqueiro.com" });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meu-banqueiro-agenda.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
