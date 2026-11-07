import "server-only";
import type { MemberRole, WorkspaceKind } from "@myoffice/core";
import { schema } from "@myoffice/db";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { AuthContext } from "../auth";
import { db } from "../db";

const { workspaces, workspaceMembers, categories, agents, accessGrants } = schema;

export interface WorkspaceSummary {
  id: string;
  kind: WorkspaceKind;
  name: string;
  description: string | null;
  role: MemberRole;
}

export interface WorkspaceOverview extends WorkspaceSummary {
  categoryCount: number;
  agentCount: number;
  /** Concessões ativas em que este universo compartilha dados com outro (somente leitura). */
  outgoingGrants: number;
  /** Concessões ativas que dão a este universo leitura de outro. */
  incomingGrants: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: workspaces.id,
  kind: workspaces.kind,
  name: workspaces.name,
  description: workspaces.description,
  role: workspaceMembers.role,
};

/** Universos dos quais a pessoa é membro (pessoal primeiro). A RLS garante o resto. */
export async function listMyWorkspaces(auth: AuthContext): Promise<WorkspaceSummary[]> {
  return db().asUser(auth.claims, (tx) =>
    tx
      .select(summaryColumns)
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, auth.userId), isNull(workspaces.archivedAt)))
      .orderBy(sql`case when ${workspaces.kind} = 'personal' then 0 else 1 end`, asc(workspaces.name)),
  );
}

/** Um universo, se a pessoa tiver acesso; null caso contrário (inclusive id malformado). */
export async function getWorkspace(auth: AuthContext, workspaceId: string): Promise<WorkspaceSummary | null> {
  if (!UUID_RE.test(workspaceId)) return null;
  const rows = await db().asUser(auth.claims, (tx) =>
    tx
      .select(summaryColumns)
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaces.id, workspaceId), eq(workspaceMembers.userId, auth.userId), isNull(workspaces.archivedAt))),
  );
  return rows[0] ?? null;
}

/** Visão consolidada para o dono (Início). Contagens reais, sob RLS. */
export async function listWorkspaceOverviews(auth: AuthContext): Promise<WorkspaceOverview[]> {
  return db().asUser(auth.claims, async (tx) => {
    const base = await tx
      .select(summaryColumns)
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, auth.userId), isNull(workspaces.archivedAt)))
      .orderBy(sql`case when ${workspaces.kind} = 'personal' then 0 else 1 end`, asc(workspaces.name));

    const catCounts = await tx
      .select({ ws: categories.workspaceId, n: count() })
      .from(categories)
      .where(isNull(categories.archivedAt))
      .groupBy(categories.workspaceId);
    const agentCounts = await tx
      .select({ ws: agents.workspaceId, n: count() })
      .from(agents)
      .where(isNull(agents.archivedAt))
      .groupBy(agents.workspaceId);
    const active = sql`${accessGrants.revokedAt} is null and (${accessGrants.expiresAt} is null or ${accessGrants.expiresAt} > now())`;
    const outgoing = await tx
      .select({ ws: accessGrants.sourceWorkspaceId, n: count() })
      .from(accessGrants)
      .where(active)
      .groupBy(accessGrants.sourceWorkspaceId);
    const incoming = await tx
      .select({ ws: accessGrants.granteeWorkspaceId, n: count() })
      .from(accessGrants)
      .where(active)
      .groupBy(accessGrants.granteeWorkspaceId);

    const byWs = (rows: { ws: string | null; n: number }[]) => new Map(rows.map((r) => [r.ws, Number(r.n)]));
    const cats = byWs(catCounts);
    const ags = byWs(agentCounts);
    const out = byWs(outgoing);
    const inc = byWs(incoming);
    return base.map((w) => ({
      ...w,
      categoryCount: cats.get(w.id) ?? 0,
      agentCount: ags.get(w.id) ?? 0,
      outgoingGrants: out.get(w.id) ?? 0,
      incomingGrants: inc.get(w.id) ?? 0,
    }));
  });
}

export async function countAgents(auth: AuthContext, workspaceId: string): Promise<number> {
  const [row] = await db().asUser(auth.claims, (tx) =>
    tx
      .select({ n: count() })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt))),
  );
  return Number(row?.n ?? 0);
}

/** Cria uma empresa (universo empresarial) pela função do banco, que valida, limita e audita. */
export async function createBusinessWorkspace(auth: AuthContext, name: string): Promise<string> {
  const rows = await db().asUser(auth.claims, (tx) =>
    tx.execute(sql`select app.create_business_workspace(${name}) as id`),
  );
  const id = (rows as unknown as { id: string }[])[0]?.id;
  if (!id) throw new Error("create_business_workspace não retornou id");
  return id;
}

/** Renomeia/descreve. A RLS só deixa donos/admins humanos; 0 linhas = sem permissão. */
export async function updateWorkspace(
  auth: AuthContext,
  input: { workspaceId: string; name: string; description: string | null },
): Promise<boolean> {
  const rows = await db().asUser(auth.claims, (tx) =>
    tx
      .update(workspaces)
      .set({ name: input.name, description: input.description })
      .where(eq(workspaces.id, input.workspaceId))
      .returning({ id: workspaces.id }),
  );
  return rows.length === 1;
}
