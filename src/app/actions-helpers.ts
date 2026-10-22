import "server-only";
import { revalidatePath } from "next/cache";
import { parseMoney } from "@/domain/money";
import { AppError } from "@/server/errors";
import type { ActionState } from "@/lib/action-state";
import { getAppContext, requireOnboarded, type AppContext } from "@/server/auth/current";

/**
 * Executa uma ação de servidor com o contexto do usuário autenticado e converte erros de
 * negócio em mensagens. Erros inesperados são registrados sem dados financeiros.
 */
export async function runAction(
  fn: (app: AppContext) => Promise<string | Partial<ActionState> | void>,
  opts: { revalidate?: string[]; requireOnboarding?: boolean } = {},
): Promise<ActionState> {
  try {
    const app = opts.requireOnboarding === false ? await getAppContext() : await requireOnboarded();
    const result = await fn(app);
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    const extra = typeof result === "string" ? { message: result } : (result ?? {});
    return { ok: true, at: Date.now(), ...extra };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    if (isRedirect(e)) throw e;
    console.error("[ação] erro inesperado", { name: e instanceof Error ? e.name : "desconhecido", message: e instanceof Error ? e.message.slice(0, 200) : "" });
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente.", at: Date.now() };
  }
}

function isRedirect(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Valor monetário digitado em formato brasileiro -> centavos. Lança erro amigável. */
export function cents(fd: FormData, key: string, opts: { required?: boolean } = { required: true }): number | null {
  const v = str(fd, key);
  if (!v) {
    if (opts.required) throw new AppError("Informe o valor", "validation", { [key]: "Informe o valor" });
    return null;
  }
  try {
    return parseMoney(v, "auto");
  } catch {
    throw new AppError("Valor inválido", "validation", { [key]: "Use o formato 1.234,56" });
  }
}
