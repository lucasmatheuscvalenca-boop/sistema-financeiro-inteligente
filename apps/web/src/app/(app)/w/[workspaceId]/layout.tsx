import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getWorkspace } from "@/server/dal/workspaces";

/** Valida o acesso ao universo uma vez para todas as páginas dele (a RLS valida de novo em cada consulta). */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const auth = await requireAuth();
  const workspace = await getWorkspace(auth, workspaceId);
  if (!workspace) notFound();
  return (
    <div data-universe={workspace.kind} data-testid="workspace-scope" data-workspace-kind={workspace.kind}>
      {children}
    </div>
  );
}
