import { CURRENT_PHASE, NAV_MODULES, UNIVERSE_LABEL } from "@myoffice/core";
import { ArrowRight, Lock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { UniverseBadge } from "@/components/ui/UniverseBadge";
import { cn } from "@/lib/cn";
import { requireAuth } from "@/server/auth";
import { getProfile } from "@/server/dal/profile";
import { listWorkspaceOverviews } from "@/server/dal/workspaces";

export const metadata: Metadata = { title: "Início" };

export default async function HomePage() {
  const auth = await requireAuth();
  const [profile, overviews] = await Promise.all([getProfile(auth), listWorkspaceOverviews(auth)]);
  const hasBusiness = overviews.some((w) => w.kind === "business");

  return (
    <PageBody>
      <PageHeader
        eyebrow={<Badge tone="signal">Visão do dono</Badge>}
        title={`Olá, ${profile?.displayName ?? "você"}`}
        description="Esta visão consolidada é só sua. Ela não dá aos agentes acesso a todos os universos: cada agente lê apenas o próprio universo e o que você compartilhar explicitamente."
      />

      <section aria-labelledby="universos" className="space-y-4">
        <h2 id="universos" className="font-pixel text-sm uppercase tracking-wider text-faint">
          Seus universos
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {overviews.map((ws) => (
            <li key={ws.id} data-universe={ws.kind}>
              <Link
                href={`/w/${ws.id}`}
                className="pixel-frame-accent group flex h-full flex-col gap-4 bg-navy-850 p-5 transition hover:bg-navy-800"
                data-testid="universe-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <UniverseBadge kind={ws.kind} />
                  <ArrowRight className="size-4 text-muted transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{ws.name}</h3>
                  {ws.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{ws.description}</p>}
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-2 text-center">
                  <Stat label="Categorias" value={ws.categoryCount} />
                  <Stat label="Agentes" value={ws.agentCount} />
                  <Stat label="Compartilha" value={ws.outgoingGrants} title="Concessões de leitura ativas para outros universos" />
                </dl>
              </Link>
            </li>
          ))}
          {!hasBusiness && (
            <li data-universe="business">
              <Link
                href="/boas-vindas"
                className="flex h-full min-h-44 flex-col items-center justify-center gap-2 border-2 border-dashed border-business/50 p-5 text-center text-business hover:bg-navy-850"
              >
                <Plus className="size-6" aria-hidden="true" />
                <span className="font-semibold">Adicionar sua primeira empresa</span>
                <span className="text-xs text-muted">Universo empresarial isolado do pessoal</span>
              </Link>
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="isolamento" className="pixel-frame flex gap-4 bg-navy-850 p-5">
        <Lock className="size-6 shrink-0 text-signal" aria-hidden="true" />
        <div className="space-y-1 text-sm">
          <h2 id="isolamento" className="font-semibold">Como o isolamento funciona</h2>
          <p className="text-muted">
            {UNIVERSE_LABEL.personal} e {UNIVERSE_LABEL.business.toLowerCase()} são separados no próprio banco de dados (Row
            Level Security). Um agente de um universo não lê o outro, a menos que você registre uma concessão explícita — e
            qualquer concessão pode ser revogada.
          </p>
        </div>
      </section>

      <section aria-labelledby="roadmap" className="space-y-4">
        <h2 id="roadmap" className="font-pixel text-sm uppercase tracking-wider text-faint">
          O que já funciona
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_MODULES.map((m) => {
            const ready = m.phase <= CURRENT_PHASE;
            return (
              <li key={m.key} className={cn("flex items-center justify-between gap-3 border-2 border-navy-700 bg-navy-900 px-3 py-2 text-sm", ready && "border-personal/40")}>
                <span className={ready ? "text-ink" : "text-muted"}>{m.label}</span>
                {ready ? <Badge tone="personal">pronto</Badge> : <Badge>fase {m.phase}</Badge>}
              </li>
            );
          })}
        </ul>
      </section>
    </PageBody>
  );
}

function Stat({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div className="border-2 border-navy-700 bg-navy-900 px-2 py-2" title={title}>
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="font-pixel text-xl text-ink">{value}</dd>
    </div>
  );
}
