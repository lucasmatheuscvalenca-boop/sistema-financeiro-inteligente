/** Papéis de um usuário dentro de um workspace (espelha o enum member_role do banco). */
export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
  viewer: "Leitor",
};

/**
 * Regras de interface. A regra que vale é a do banco (RLS); estas funções só decidem o que mostrar.
 * Mantidas iguais a app.can_manage / app.can_write para a interface não oferecer o que o banco recusaria.
 */
export function canManage(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

export function canWrite(role: MemberRole): boolean {
  return role !== "viewer";
}
