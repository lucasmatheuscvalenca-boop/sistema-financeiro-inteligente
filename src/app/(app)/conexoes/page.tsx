import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { connectProviderAction, deleteConnectionDataAction, revokeConnectionAction, syncConnectionAction } from "../_actions/account";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, InlineAction, SubmitButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { availableProviders } from "@/server/integrations/registry";
import { listConnections } from "@/server/services/connections";

export const metadata: Metadata = { title: "Conexões bancárias" };

const STATUS: Record<string, [string, "positive" | "warning" | "negative" | "neutral" | "info"]> = {
  active: ["Ativa", "positive"],
  syncing: ["Sincronizando", "info"],
  pending: ["Pendente", "neutral"],
  error: ["Com erro", "negative"],
  expired: ["Consentimento expirado", "warning"],
  revoked: ["Revogada", "neutral"],
};

const SCOPE_LABEL: Record<string, string> = {
  "accounts:read": "Contas (nome e tipo)",
  "balances:read": "Saldos",
  "transactions:read": "Movimentações",
  "credit_cards:read": "Cartões, limites e faturas",
};

export default async function ConnectionsPage() {
  const { ctx, prefs } = await requireOnboarded();
  const [connections, providers] = await Promise.all([listConnections(ctx), Promise.resolve(availableProviders())]);
  const tz = prefs.timezone;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conta"
        title="Conexões bancárias"
        description="Integração em etapas: lançamento manual, importação de extrato (CSV/OFX), conector de demonstração e, quando houver credenciais, um agregador de Open Finance."
      />
      <Callout tone="info" title="Nunca pedimos sua senha bancária">
        A autorização acontece no ambiente do banco ou do agregador. Aqui guardamos apenas o identificador da conexão (cifrado), o consentimento e o histórico de sincronizações. Você pode revogar quando quiser.
      </Callout>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-petrol-500" /> Manual
          </p>
          <p className="mt-1 text-sm text-muted">Sempre disponível. Lançamentos e saldos informados por você.</p>
          <Link href="/movimentacoes" className="mt-3 inline-block text-sm font-medium text-link hover:underline">
            Lançar movimentação →
          </Link>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <RefreshCw className="size-4 text-petrol-500" /> Extrato CSV ou OFX
          </p>
          <p className="mt-1 text-sm text-muted">Pré-visualização, detecção de duplicidade e conciliação com previstos antes de gravar.</p>
          <Link href="/importar" className="mt-3 inline-block text-sm font-medium text-link hover:underline">
            Importar extrato →
          </Link>
        </Card>
        {providers.map((p) => (
          <Card key={p.id} className="p-5">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Link2 className="size-4 text-petrol-500" /> {p.label} {p.isDemo ? <DemoBadge /> : null}
            </p>
            {p.isDemo ? (
              <>
                <p className="mt-1 text-sm text-muted">Gera um banco fictício com conta corrente e cartão de crédito para você testar sincronização, deduplicação e revogação. Nenhum dado real.</p>
                <ActionForm action={connectProviderAction} className="mt-3 space-y-3">
                  <input type="hidden" name="provider" value={p.id} />
                  <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                    <p className="font-medium text-ink">O que será compartilhado</p>
                    <ul className="mt-1 list-disc pl-4">
                      {Object.values(SCOPE_LABEL).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <p className="mt-1">Finalidade: testar a sincronização com dados fictícios. Validade: 12 meses ou até você revogar.</p>
                  </div>
                  <Checkbox name="consent" label="Autorizo o compartilhamento dos dados acima para esta finalidade" />
                  <SubmitButton variant="petrol" size="sm" pendingLabel="Conectando…" className="whitespace-normal">
                    Conectar banco de demonstração
                  </SubmitButton>
                </ActionForm>
              </>
            ) : p.configured ? (
              <p className="mt-1 text-sm text-muted">Credenciais detectadas. O fluxo do widget do fornecedor ainda precisa ser validado em ambiente de testes antes de ser liberado aqui — veja docs/02-open-finance.md.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Adaptador implementado, mas sem credenciais. Para ativar, configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (contrato com o agregador) e conclua a validação descrita na documentação.</p>
                <Badge className="mt-3">Não configurado</Badge>
              </>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Suas conexões" icon={<ShieldCheck className="size-4" />} description="Status, consentimento, última sincronização e histórico." />
        <CardBody>
          {connections.length === 0 ? (
            <EmptyState title="Nenhuma conexão" description="Seus dados continuam funcionando normalmente com lançamentos manuais e importação." />
          ) : (
            <ul className="space-y-4">
              {connections.map((c) => {
                const [label, tone] = STATUS[c.status] ?? [c.status, "neutral"];
                return (
                  <li key={c.id} className="rounded-2xl border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.institutionName}</span>
                      {c.isDemo ? <DemoBadge /> : null}
                      <Badge tone={tone}>{label}</Badge>
                      {c.stale && c.status === "active" ? <Badge tone="warning">Desatualizada (&gt; 24 h)</Badge> : null}
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-muted">Última sincronização</dt>
                        <dd>{formatDateTime(c.lastSyncAt, tz)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Consentimento</dt>
                        <dd>
                          {c.consent ? (
                            <>
                              concedido em {formatDateTime(c.consent.grantedAt, tz)}
                              {c.consent.revokedAt ? ` · revogado em ${formatDateTime(c.consent.revokedAt, tz)}` : c.consent.expiresAt ? ` · expira em ${formatDateTime(c.consent.expiresAt, tz)}` : ""}
                            </>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Escopos</dt>
                        <dd>{c.consent ? c.consent.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(", ") : "—"}</dd>
                      </div>
                    </dl>
                    {c.lastError ? <p className="mt-2 text-sm text-negative">Último erro: {c.lastError}</p> : null}
                    {c.runs.length ? (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-muted">Histórico de sincronizações</summary>
                        <ul className="mt-2 space-y-1">
                          {c.runs.map((r) => (
                            <li key={r.id} className="flex flex-wrap gap-x-3 text-xs">
                              <span>{formatDateTime(r.startedAt, tz)}</span>
                              <span className={r.status === "success" ? "text-positive" : r.status === "error" ? "text-negative" : "text-muted"}>{r.status === "success" ? "concluída" : r.status === "error" ? "falhou" : "em andamento"}</span>
                              <span className="text-muted">
                                {r.imported} importada(s) · {r.duplicates} duplicada(s)
                              </span>
                              {r.error ? <span className="text-negative">{r.error}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.status !== "revoked" ? (
                        <>
                          <InlineAction action={syncConnectionAction} hidden={{ id: c.id }} variant="secondary">
                            Sincronizar agora
                          </InlineAction>
                          <InlineAction action={revokeConnectionAction} hidden={{ id: c.id }} confirm="Revogar o consentimento? A sincronização para imediatamente; os dados já importados continuam até você apagá-los.">
                            Revogar consentimento
                          </InlineAction>
                        </>
                      ) : null}
                      {c.status === "revoked" || c.isDemo ? (
                        <InlineAction action={deleteConnectionDataAction} hidden={{ id: c.id }} variant="danger" confirm="Apagar a conexão e TODAS as contas, cartões e movimentações importadas por ela? Esta ação não pode ser desfeita.">
                          Apagar dados importados
                        </InlineAction>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
