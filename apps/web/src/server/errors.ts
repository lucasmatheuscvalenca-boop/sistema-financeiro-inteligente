import "server-only";
import { pgErrorCode, pgErrorMessage } from "@myoffice/db";

/** Traduz erros do banco em mensagens para a pessoa, sem vazar detalhes internos. */
export function friendlyDbError(error: unknown): string {
  const code = pgErrorCode(error);
  switch (code) {
    case "42501":
      return "Você não tem permissão para fazer isso neste universo.";
    case "23505":
      return "Já existe um item com esse nome aqui.";
    case "23503":
      return "Um dos itens relacionados não pertence a este universo.";
    case "23514":
    case "22023":
      return "Os dados informados não são válidos.";
    case "54000":
      return pgErrorMessage(error)?.includes("business_limit")
        ? "Você atingiu o limite de empresas por conta."
        : "Limite atingido.";
    default:
      console.error("[myoffice] erro de banco não mapeado", code, error);
      return "Não foi possível concluir agora. Tente novamente.";
  }
}
