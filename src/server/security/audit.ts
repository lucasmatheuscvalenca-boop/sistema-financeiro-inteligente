import type { DbExecutor } from "../db/client";
import { auditLog } from "../db/schema";

/**
 * Registro de ações relevantes (login, troca de senha, exclusões, compartilhamentos,
 * conexões bancárias). Não registra valores financeiros nem conteúdo de mensagens.
 */
export async function audit(
  db: DbExecutor,
  entry: { userId: string | null; action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown>; ipHash?: string | null },
): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ipHash: entry.ipHash ?? null,
  });
}
