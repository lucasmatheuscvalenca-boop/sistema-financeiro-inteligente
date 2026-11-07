import { CURRENT_PHASE, findModule } from "@myoffice/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlannedModule } from "@/components/shell/PlannedModule";
import { UniverseBadge } from "@/components/ui/UniverseBadge";
import { requireAuth } from "@/server/auth";
import { countAgents, getWorkspace } from "@/server/dal/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[workspaceId]/[module]">): Promise<Metadata> {
  const { module } = await params;
  return { title: findModule(module)?.label ?? "Módulo" };
}

export default async function WorkspaceModulePage({ params }: PageProps<"/w/[workspaceId]/[module]">) {
  const { workspaceId, module } = await params;
  const mod = findModule(module);
  if (!mod || mod.scope !== "workspace" || mod.phase <= CURRENT_PHASE) notFound();

  const auth = await requireAuth();
  const workspace = await getWorkspace(auth, workspaceId);
  if (!workspace) notFound();

  let facts = null;
  if (mod.key === "agentes") {
    const n = await countAgents(auth, workspace.id);
    facts = (
      <p className="text-muted">
        Agentes cadastrados neste universo (dado real do banco): <strong className="text-ink" data-testid="agent-count">{n}</strong>.
        A tabela de agentes e o isolamento por universo já existem; o cadastro pela interface chega na Fase 3.
      </p>
    );
  }

  return <PlannedModule moduleKey={mod.key} eyebrow={<UniverseBadge kind={workspace.kind} />} facts={facts} />;
}
