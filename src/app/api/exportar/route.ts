import { NextResponse } from "next/server";
import { getAppContext } from "@/server/auth/current";
import { exportUserData } from "@/server/services/users";

export const dynamic = "force-dynamic";

/** Exportação dos dados do usuário autenticado (portabilidade). */
export async function GET() {
  const { ctx } = await getAppContext();
  const data = await exportUserData(ctx);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rumo-meus-dados-${ctx.today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
