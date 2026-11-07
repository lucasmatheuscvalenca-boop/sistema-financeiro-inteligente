/** Tipos de universo. Cada workspace pertence a exatamente um tipo. */
export const WORKSPACE_KINDS = ["personal", "business"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const UNIVERSE_LABEL: Record<WorkspaceKind, string> = {
  personal: "Pessoal",
  business: "Empresarial",
};

/** Limite de empresas por usuário — o mesmo valor é aplicado no banco (app.create_business_workspace). */
export const MAX_BUSINESS_WORKSPACES = 20;

/** Nome sugerido para a primeira empresa na tela de boas-vindas. */
export const FIRST_BUSINESS_SUGGESTION = "Explosion Digital";

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return typeof value === "string" && (WORKSPACE_KINDS as readonly string[]).includes(value);
}
