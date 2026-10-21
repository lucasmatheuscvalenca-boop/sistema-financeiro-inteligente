import type { ZodError } from "zod";

/** Erros de domínio/serviço com mensagens seguras para exibir ao usuário. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "validation" | "not_found" | "forbidden" | "conflict" | "unauthorized" | "rate_limited" | "unavailable",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, "validation", fieldErrors);
  }
}

/** Usado tanto para "não existe" quanto para "não é seu", para não revelar dados de outros usuários. */
export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado") {
    super(message, "not_found");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação") {
    super(message, "forbidden");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sessão expirada. Entre novamente.") {
    super(message, "unauthorized");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.") {
    super(message, "rate_limited");
  }
}


export function zodToValidation(error: ZodError): ValidationError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = error.issues[0]?.message ?? "Dados inválidos";
  return new ValidationError(first, fieldErrors);
}
