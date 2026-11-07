import type { ReactNode } from "react";
import { Shell } from "@/components/shell/Shell";
import { requireAuth } from "@/server/auth";
import { getProfile } from "@/server/dal/profile";
import { listMyWorkspaces } from "@/server/dal/workspaces";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuth();
  const [profile, workspaces] = await Promise.all([getProfile(auth), listMyWorkspaces(auth)]);

  if (workspaces.length === 0) {
    // O cadastro sempre cria o universo pessoal; sem ele, algo está errado na instalação do banco.
    throw new Error("Nenhum universo encontrado para esta conta. As migrations do banco foram aplicadas?");
  }

  return (
    <Shell
      workspaces={workspaces.map(({ id, kind, name, role }) => ({ id, kind, name, role }))}
      userName={profile?.displayName ?? auth.email ?? "Você"}
      userEmail={auth.email}
    >
      {children}
    </Shell>
  );
}
