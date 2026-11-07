import type { Metadata } from "next";
import Link from "next/link";
import { dismissAlertAction } from "../_actions/intelligence";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { listAlerts, refreshAlertsIfStale } from "@/server/services/alerts";

export const metadata: Metadata = { title: "Alertas" };

const SEV = { important: ["Importante", "negative", "alert"], attention: ["Atenção", "warning", "attention"], info: ["Informativo", "info", "guidance"] } as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ctx, mascotId, prefs } = await requireOnboarded();
  const sp = await searchParams;
  const view = sp.ver === "dispensados" ? "dismissed" : sp.ver === "resolvidos" ? "resolved" : "active";
  if (view === "active") await refreshAlertsIfStale(ctx);
  const alerts = await listAlerts(ctx, view);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Acompanhamento" title="Alertas e recomendações" description={`Cada alerta mostra a causa, o impacto e uma ação sugerida. No máximo ${prefs.maxAlertsPerDay} novos por dia (ajuste em Configurações).`} />
      <div className="flex gap-5 border-b border-line text-sm">
        {[
          ["", "Ativos"],
          ["dispensados", "Dispensados"],
          ["resolvidos", "Resolvidos"],
        ].map(([k, l]) => (
          <Link key={k} href={k ? `/alertas?ver=${k}` : "/alertas"} className={cn("-mb-px border-b-2 py-1.5 font-medium", (sp.ver ?? "") === k ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}>
            {l}
          </Link>
        ))}
      </div>
      {alerts.length === 0 ? (
        <EmptyState art={<MascotArt id={mascotId} state="celebration" size={96} />} title={view === "active" ? "Nenhum alerta ativo" : "Nada por aqui"} description={view === "active" ? voiceFor(mascotId).closing("positive") : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {alerts.map((a) => {
            const [label, tone, state] = SEV[a.severity as keyof typeof SEV] ?? SEV.info;
            return (
              <li key={a.id} className={cn("border-l-[3px] py-5 pl-4 sm:pl-5", tone === "negative" ? "border-l-negative" : tone === "warning" ? "border-l-gold-500" : "border-l-forest-300 dark:border-l-forest-600")}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <MascotArt id={mascotId} state={state} size={56} decorative />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{label}</Badge>
                      <h2 className="font-semibold">{a.title}</h2>
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Causa</dt>
                        <dd className="mt-0.5">{a.cause}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Impacto</dt>
                        <dd className="mt-0.5">{a.impact}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ação sugerida</dt>
                        <dd className="mt-0.5">{a.action}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={a.href} className="text-sm font-medium text-link hover:underline">
                        Resolver agora →
                      </Link>
                      {view === "active" ? (
                        <InlineAction action={dismissAlertAction} hidden={{ id: a.id }}>
                          Dispensar
                        </InlineAction>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
