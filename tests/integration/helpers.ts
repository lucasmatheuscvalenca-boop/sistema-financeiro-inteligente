import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/client";
import { makeContext, type ServiceContext } from "@/server/services/context";
import { registerUser } from "@/server/services/users";

export const TODAY = "2026-10-21";

export async function createUser(name = "Pessoa Teste", today = TODAY): Promise<ServiceContext & { email: string; password: string }> {
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${randomUUID().slice(0, 8)}@exemplo.com`;
  const password = "senha-segura-123";
  const user = await registerUser(getDb(), { name, email, password });
  return { ...makeContext(getDb(), user.id, "America/Sao_Paulo", today), email, password };
}

export function at(ctx: ServiceContext, today: string): ServiceContext {
  return { ...ctx, today };
}
