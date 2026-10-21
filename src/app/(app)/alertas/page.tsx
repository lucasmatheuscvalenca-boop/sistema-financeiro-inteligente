import type { Metadata } from "next";
import Link from "next/link";
import { dismissAlertAction } from "../_actions/intelligence";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { voiceFor } from "@/mascots/voice";
import { cn } from "@/lib/cn";
import { requireOnboarded } from "@/server/auth/current";
import { listAlerts, refreshAlerts } from "@/server/services/alerts";

export const metadata: Metadata = { title: "Alertas" };

const SEV = { important: ["Importante", "negative", "alert"], attention: ["Atenção", "warning", "attention"], info: ["Informativo", "info", "guidance"] } as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ctx, mascotId, prefs } = await requireOnboarded();
  const sp = await searchParams;
  const view = sp.ver === "dispensados" ? "dismissed" : sp.ver === "resolvidos" ? "resolved" : "active";
  const alerts = view === "active" ? await refreshAlerts(ctx) : await listAlerts(ctx, view);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Acompanhamento" title="Alertas e recomendações" description={`Cada alerta mostra a causa, o impacto e uma ação sugerida. No máximo ${prefs.maxAlertsPerDay} novos por dia (ajuste em Configurações).`} />
      <div className="flex gap-2 text-sm">
        {[
          ["", "Ativos"],
          ["dispensados", "Dispensados"],
          ["resolvidos", "Resolvidos"],
        ].map(([k, l]) => (
          <Link key={k} href={k ? `/alertas?ver=${k}` : "/alertas"} className={cn("rounded-full border px-3 py-1", (sp.ver ?? "") === k ? "border-petrol-500 bg-petrol-50 text-petrol-800 dark:bg-petrol-900/40 dark:text-petrol-100" : "border-line text-muted")}>
            {l}
          </Link>
        ))}
      </div>
      {alerts.length === 0 ? (
        <EmptyState art={<MascotArt id={mascotId} state="celebration" size={96} />} title={view === "active" ? "Nenhum alerta ativo" : "Nada por aqui"} description={view === "active" ? voiceFor(mascotId).closing("positive") : undefined} />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => {
            const [label, tone, state] = SEV[a.severity as keyof typeof SEV] ?? SEV.info;
            return (
              <Card key={a.id} className="p-4 sm:p-5">
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
