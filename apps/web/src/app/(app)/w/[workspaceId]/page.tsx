import { ROLE_LABEL, canManage } from "@myoffice/core";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryCard, CreateCategoryForm } from "@/components/forms/CategoryForms";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { UniverseBadge } from "@/components/ui/UniverseBadge";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/dal/categories";
import { getWorkspace, listWorkspaceOverviews } from "@/server/dal/workspaces";

export async function generateMetadata({ params }: PageProps<"/w/[workspaceId]">): Promise<Metadata> {
  const { workspaceId } = await params;
  const auth = await requireAuth();
  const ws = await getWorkspace(auth, workspaceId);
  return { title: ws?.name ?? "Universo" };
}

export default async function WorkspacePage({ params }: PageProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const auth = await requireAuth();
  const [workspace, categories, overviews] = await Promise.all([
    getWorkspace(auth, workspaceId),
    listCategories(auth, workspaceId),
    listWorkspaceOverviews(auth),
  ]);
  if (!workspace) notFound();
  const overview = overviews.find((o) => o.id === workspace.id);
  const manage = canManage(workspace.role);

  return (
    <PageBody>
      <PageHeader
        eyebrow={
          <>
            <UniverseBadge kind={workspace.kind} />
            <Badge>{ROLE_LABEL[workspace.role]}</Badge>
          </>
        }
        title={workspace.name}
        description={
          workspace.description ??
          (workspace.kind === "personal"
            ? "Seu ambiente privado. Nada daqui é visível para agentes de outros universos sem sua autorização."
            : "Ambiente profissional desta empresa, isolado do seu universo pessoal e das outras empresas.")
        }
      />

      <section aria-labelledby="categorias" className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="categorias" className="font-pixel text-sm uppercase tracking-wider text-faint">
            Categorias · {categories.length}
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="category-list">
          {categories.map((c) => (
            <CategoryCard key={c.id} workspaceId={workspace.id} category={c} canManage={manage} />
          ))}
        </ul>
        {manage && (
          <div className="pixel-frame bg-navy-850 p-4">
            <CreateCategoryForm workspaceId={workspace.id} />
          </div>
        )}
      </section>

      <section className="pixel-frame flex gap-4 bg-navy-850 p-5" aria-labelledby="isolamento">
        <ShieldCheck className="size-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <div className="space-y-1 text-sm">
          <h2 id="isolamento" className="font-semibold">Isolamento deste universo</h2>
          <p className="text-muted">
            Agentes deste universo leem apenas os dados daqui. Compartilhamentos ativos — saindo:{" "}
            <strong className="text-ink">{overview?.outgoingGrants ?? 0}</strong>, entrando:{" "}
            <strong className="text-ink">{overview?.incomingGrants ?? 0}</strong>. Toda concessão é registrada na auditoria e
            pode ser revogada; a gestão de concessões pela interface chega com as permissões (Fase 6).
          </p>
        </div>
      </section>
    </PageBody>
  );
}
