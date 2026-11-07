import { MAX_BUSINESS_WORKSPACES, ROLE_LABEL, canManage } from "@myoffice/core";
import type { Metadata } from "next";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { CreateBusinessForm, WorkspaceEditForm } from "@/components/forms/WorkspaceForms";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { UniverseBadge } from "@/components/ui/UniverseBadge";
import { requireAuth } from "@/server/auth";
import { env } from "@/server/env";
import { getProfile } from "@/server/dal/profile";
import { listMyWorkspaces } from "@/server/dal/workspaces";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const auth = await requireAuth();
  const [profile, workspaces] = await Promise.all([getProfile(auth), listMyWorkspaces(auth)]);
  const businessCount = workspaces.filter((w) => w.kind === "business").length;
  const allowlist = env().allowedEmails.length > 0;

  return (
    <PageBody>
      <PageHeader eyebrow={<Badge tone="signal">Visão do dono</Badge>} title="Configurações" description="Perfil, universos e empresas." />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="pixel-frame space-y-4 bg-navy-850 p-6">
          <h2 className="font-semibold">Perfil</h2>
          <ProfileForm displayName={profile?.displayName ?? ""} />
        </div>
        <div className="pixel-frame space-y-3 bg-navy-850 p-6 text-sm">
          <h2 className="font-semibold">Conta e acesso</h2>
          <p className="text-muted">
            E-mail: <span className="text-ink">{auth.email ?? "—"}</span>
          </p>
          <p className="text-muted">
            Lista de e-mails permitidos:{" "}
            {allowlist ? (
              <Badge tone="personal">ativa</Badge>
            ) : (
              <Badge tone="warn">desligada</Badge>
            )}
          </p>
          {!allowlist && (
            <p className="text-xs text-faint">
              Qualquer conta criada neste projeto Supabase consegue entrar. Defina MYOFFICE_ALLOWED_EMAILS ou desligue novos
              cadastros no Supabase (veja SECURITY.md).
            </p>
          )}
        </div>
      </section>

      <section id="universos" className="space-y-4">
        <h2 className="font-pixel text-sm uppercase tracking-wider text-faint">Universos</h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {workspaces.map((ws) => (
            <li key={ws.id} data-universe={ws.kind} className="pixel-frame space-y-3 bg-navy-850 p-5">
              <div className="flex items-center gap-2">
                <UniverseBadge kind={ws.kind} />
                <Badge>{ROLE_LABEL[ws.role]}</Badge>
              </div>
              {canManage(ws.role) ? (
                <WorkspaceEditForm workspaceId={ws.id} name={ws.name} description={ws.description} />
              ) : (
                <p className="font-semibold">{ws.name}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section id="empresas" className="pixel-frame space-y-4 bg-navy-850 p-6" data-universe="business">
        <div className="space-y-1">
          <h2 className="font-semibold">Adicionar empresa</h2>
          <p className="text-sm text-muted">
            Cada empresa é um universo empresarial próprio, isolado do pessoal e das outras empresas ({businessCount} de{" "}
            {MAX_BUSINESS_WORKSPACES}).
          </p>
        </div>
        <CreateBusinessForm />
      </section>
    </PageBody>
  );
}
