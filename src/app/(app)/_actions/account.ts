"use server";

import { redirect } from "next/navigation";
import { bool, optStr, cents, num, runAction, str } from "@/app/actions-helpers";
import type { ActionState } from "@/lib/action-state";
import { deleteCredentials, resolveProvider, saveCredentials } from "@/server/integrations/registry";
import { PluggyProvider } from "@/server/integrations/providers/pluggy";
import { ProviderError } from "@/server/integrations/provider";
import { clearSessionCookie } from "@/server/auth/current";
import { revokeOtherSessions, revokeSession } from "@/server/auth/sessions";
import { NotFoundError } from "@/server/errors";
import { updateCategory } from "@/server/services/categories";
import { connectProvider, deleteConnectionData, reactivateConnection, revokeConnection, syncConnection } from "@/server/services/connections";
import { updatePreferences } from "@/server/services/preferences";
import { changePassword, deleteAccount, resetUserData, updateName } from "@/server/services/users";
import { plural } from "@/domain/text";
import { formatDateTime } from "@/lib/format";

const FIN = ["/painel", "/movimentacoes", "/contas", "/orcamento", "/fluxo-de-caixa", "/conexoes", "/patrimonio"];

// ─── Conexões bancárias ──────────────────────────────────────────────────────
/** Token de 30 minutos para abrir a janela da Pluggy no navegador. Nunca expõe as chaves. */
export async function pluggyConnectTokenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async ({ ctx }) => {
    const provider = await resolveProvider(ctx.db, ctx.userId, "pluggy");
    if (!provider || !(provider instanceof PluggyProvider) || !provider.isConfigured()) {
      return { ok: false, error: "Ative o Open Finance primeiro: cole o Client ID e o Client Secret da sua conta gratuita da Pluggy." };
    }
    try {
      const accessToken = await provider.createConnectToken({ itemId: optStr(fd, "itemId") ?? undefined, clientUserId: ctx.userId });
      return { data: { accessToken } };
    } catch (e) {
      return { ok: false, error: e instanceof ProviderError ? e.message : "Não foi possível iniciar a conexão. Tente de novo." };
    }
  });
}

/** Ativa o Open Finance gratuito: confere as chaves na Pluggy e grava cifradas, só para esta pessoa. */
export async function savePluggyCredentialsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const clientId = str(fd, "clientId");
      const clientSecret = String(fd.get("clientSecret") ?? "").trim();
      if (clientId.length < 8 || clientSecret.length < 8) {
        const fieldErrors: Record<string, string> = {};
        if (clientId.length < 8) fieldErrors.clientId = "Incompleto";
        if (clientSecret.length < 8) fieldErrors.clientSecret = "Incompleto";
        return { ok: false, error: "Cole o Client ID e o Client Secret completos.", fieldErrors };
      }
      try {
        await saveCredentials(ctx.db, ctx.userId, { clientId, clientSecret });
      } catch (e) {
        return { ok: false, error: e instanceof ProviderError ? e.message : "A Pluggy não respondeu. Tente de novo em instantes." };
      }
      return "Open Finance ativado. Agora toque em Conectar meus bancos.";
    },
    { revalidate: ["/conexoes", "/contas"] },
  );
}

export async function deletePluggyCredentialsAction(_: ActionState): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      await deleteCredentials(ctx.db, ctx.userId);
      return "Chaves removidas. As conexões existentes param de atualizar até você ativar de novo.";
    },
    { revalidate: ["/conexoes", "/contas"] },
  );
}

export async function connectProviderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    async ({ ctx }) => {
      const itemId = optStr(fd, "itemId") ?? undefined;
      const existing = optStr(fd, "connectionId");
      // Renovar a autorização de uma conexão que já existe: só volta a sincronizar.
      if (existing) {
        await reactivateConnection(ctx, existing);
        const r = await syncConnection(ctx, existing);
        return r.ok ? `Autorização renovada. ${plural(r.imported, "movimentação nova", "movimentações novas")}.` : { ok: false, error: r.error ?? "A sincronização falhou" };
      }
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
      const r = await syncConnection(ctx, str(fd, "id"), { refresh: true });
      if (!r.ok) return { ok: false, error: r.error ?? "Falha na sincronização" };
      const when = r.bankUpdatedAt ? ` Dados do banco de ${formatDateTime(r.bankUpdatedAt, ctx.timezone)}.` : "";
      return `Sincronizado: ${plural(r.imported, "nova", "novas")}, ${plural(r.duplicates, "já existente", "já existentes")}, ${plural(r.matched, "conciliada", "conciliadas")}.${when}`;
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

/** Recomeçar do zero: apaga os dados financeiros e volta ao primeiro acesso, mantendo o login. */
export async function resetAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async ({ ctx }) => {
    if (str(fd, "confirmText").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== "RECOMECAR") {
      return { ok: false, error: "Digite RECOMEÇAR para confirmar", fieldErrors: { confirmText: "Digite RECOMEÇAR" } };
    }
    await resetUserData(ctx, String(fd.get("password") ?? ""));
  });
  if (!state.ok) return state;
  redirect("/onboarding");
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
