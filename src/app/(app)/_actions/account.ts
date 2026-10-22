"use server";

import { redirect } from "next/navigation";
import { bool, optStr, cents, num, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { clearSessionCookie } from "@/server/auth/current";
import { revokeOtherSessions, revokeSession } from "@/server/auth/sessions";
import { NotFoundError } from "@/server/errors";
import { updateCategory } from "@/server/services/categories";
import { connectProvider, deleteConnectionData, revokeConnection, syncConnection } from "@/server/services/connections";
import { updatePreferences } from "@/server/services/preferences";
import { changePassword, deleteAccount, updateName } from "@/server/services/users";
import { plural } from "@/domain/text";

const FIN = ["/painel", "/movimentacoes", "/contas", "/orcamento", "/fluxo-de-caixa", "/conexoes", "/patrimonio"];

// ─── Conexões bancárias ──────────────────────────────────────────────────────
export async function connectProviderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const itemId = optStr(fd, "itemId") ?? undefined;
      const { sync } = await connectProvider(ctx, str(fd, "provider"), { itemId, consentAccepted: bool(fd, "consent") });
      return sync.ok
        ? `Conexão criada. ${plural(sync.imported, "movimentação importada", "movimentações importadas")}, ${plural(sync.duplicates, "duplicada ignorada", "duplicadas ignoradas")}.`
        : { ok: false, error: `Conexão criada, mas a primeira sincronização falhou: ${sync.error ?? "erro desconhecido"}` };
    },
    { revalidate: FIN },
  );
}

export async function syncConnectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const r = await syncConnection(ctx, str(fd, "id"));
      if (!r.ok) return { ok: false, error: r.error ?? "Falha na sincronização" };
      return `Sincronizado: ${r.imported} nova(s), ${r.duplicates} já existente(s), ${r.matched} conciliada(s).`;
    },
    { revalidate: FIN },
  );
}

export async function revokeConnectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => revokeConnection(ctx, str(fd, "id")), { revalidate: FIN });
}

export async function deleteConnectionDataAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => deleteConnectionData(ctx, str(fd, "id")), { revalidate: FIN });
}

// ─── Perfil e preferências ───────────────────────────────────────────────────
export async function updateNameAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await updateName(ctx, str(fd, "name"));
      return "Nome atualizado.";
    },
    { revalidate: ["/configuracoes", "/painel"] },
  );
}

export async function updatePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await updatePreferences(ctx, {
        reviewFrequency: str(fd, "reviewFrequency") as "weekly",
        maxAlertsPerDay: num(fd, "maxAlertsPerDay"),
        safetyMarginCents: cents(fd, "safetyMargin", { required: false }),
        timezone: str(fd, "timezone") || undefined,
      });
      return "Preferências salvas.";
    },
    { revalidate: ["/configuracoes", "/painel", "/posso-gastar", "/alertas", "/revisao"] },
  );
}

// ─── Segurança ───────────────────────────────────────────────────────────────
export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx, sessionId }) => {
    if (str(fd, "next") !== str(fd, "confirm")) return { ok: false, error: "A confirmação não confere", fieldErrors: { confirm: "A confirmação não confere" } };
    await changePassword(ctx, { current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? "") }, sessionId);
    return "Senha alterada. As outras sessões foram encerradas.";
  }, { revalidate: ["/configuracoes/privacidade"] });
}

export async function revokeSessionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx, sessionId }) => {
      const id = str(fd, "id");
      if (id === sessionId) return { ok: false, error: "Para encerrar a sessão atual, use “Sair”." };
      if (!(await revokeSession(ctx.db, ctx.userId, id))) throw new NotFoundError("Sessão não encontrada");
    },
    { revalidate: ["/configuracoes/privacidade"] },
  );
}

export async function revokeOtherSessionsAction(_: ActionState): Promise<ActionState> {
  return runAction(
    async ({ ctx, sessionId }) => {
      const n = await revokeOtherSessions(ctx.db, ctx.userId, sessionId);
      return `${plural(n, "sessão encerrada", "sessões encerradas")}.`;
    },
    { revalidate: ["/configuracoes/privacidade"] },
  );
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async ({ ctx }) => {
    if (str(fd, "confirmText").toUpperCase() !== "EXCLUIR") return { ok: false, error: "Digite EXCLUIR para confirmar", fieldErrors: { confirmText: "Digite EXCLUIR" } };
    await deleteAccount(ctx, String(fd.get("password") ?? ""));
  });
  if (!state.ok) return state;
  await clearSessionCookie();
  redirect("/?conta-excluida=1");
}

// ─── Categorias ──────────────────────────────────────────────────────────────
export async function updateCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await updateCategory(ctx, str(fd, "id"), { name: str(fd, "name"), essential: bool(fd, "essential") });
      return "Categoria atualizada.";
    },
    { revalidate: ["/configuracoes/categorias", "/movimentacoes", "/orcamento"] },
  );
}
