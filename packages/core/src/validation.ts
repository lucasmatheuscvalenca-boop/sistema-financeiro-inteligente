import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(min, `${label} precisa ter pelo menos ${min} caractere${min > 1 ? "s" : ""}.`)
        .max(max, `${label} pode ter no máximo ${max} caracteres.`),
    );

export const workspaceNameSchema = trimmed(1, 80, "Nome");
export const displayNameSchema = trimmed(1, 80, "Nome");
export const categoryNameSchema = trimmed(1, 60, "Nome da categoria");

export const optionalDescription = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim())
    .pipe(z.string().max(max, `Descrição pode ter no máximo ${max} caracteres.`))
    .transform((s) => (s === "" ? null : s));

export const uuidSchema = z.uuid("Identificador inválido.");

export const createCategorySchema = z.object({
  workspaceId: uuidSchema,
  name: categoryNameSchema,
  description: optionalDescription(300),
});

export const renameCategorySchema = z.object({
  workspaceId: uuidSchema,
  categoryId: uuidSchema,
  name: categoryNameSchema,
});

export const updateWorkspaceSchema = z.object({
  workspaceId: uuidSchema,
  name: workspaceNameSchema,
  description: optionalDescription(500),
});

export const createBusinessSchema = z.object({ name: workspaceNameSchema });

export const emailSchema = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido.").max(254));

export const passwordSchema = z
  .string({ error: "Informe a senha." })
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(72),
});

/** Primeira mensagem de erro de um resultado do Zod, para exibir no formulário. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/** Lista de e-mails permitidos (MYOFFICE_ALLOWED_EMAILS). Vazia = qualquer conta do projeto Supabase. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isEmailAllowed(email: string | undefined | null, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}
