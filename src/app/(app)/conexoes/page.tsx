import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { connectProviderAction, deleteConnectionDataAction, pluggyConnectTokenAction, revokeConnectionAction, syncConnectionAction } from "../_actions/account";
import { ConnectBank } from "@/components/finance/connect-bank";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, InlineAction, SubmitButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { availableProviders } from "@/server/integrations/registry";
import { listConnections } from "@/server/services/connections";

export const metadata: Metadata = { title: "Conectar banco" };

const STATUS: Record<string, [string, "positive" | "warning" | "negative" | "neutral" | "info"]> = {
  active: ["Em dia", "positive"],
  syncing: ["Atualizando", "info"],
  pending: ["Pendente", "neutral"],
  error: ["Precisa de atenção", "negative"],
  expired: ["Autorização vencida", "warning"],
  revoked: ["Desconectada", "neutral"],
};

const SCOPE_LABEL: Record<string, string> = {
  "accounts:read": "Contas (nome e tipo)",
  "balances:read": "Saldos",
  "transactions:read": "Movimentações",
  "credit_cards:read": "Cartões, limites e faturas",
};

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function ConnectionsPage() {
  const { ctx, prefs } = await requireOnboarded();
  const [connections, providers] = await Promise.all([listConnections(ctx), Promise.resolve(availableProviders())]);
  const tz = prefs.timezone;
  const pluggy = providers.find((p) => p.id === "pluggy");
  const demo = providers.find((p) => p.isDemo);
  const real = connections.filter((c) => !c.isDemo);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Open Finance" title="Conectar banco" description="Escolha o banco, autorize no app dele e pronto: contas, cartões e lançamentos entram sozinhos, já categorizados, todo dia." />

      {pluggy?.configured ? (
        <Card className="p-5">
          <ConnectBank tokenAction={pluggyConnectTokenAction} connectAction={connectProviderAction} />
          <p className="mt-3 text-xs text-muted">
            Ao conectar, você autoriza o NEXO a ler contas, saldos, cartões e movimentações dessa conexão para organizar suas finanças. A autorização é feita no ambiente do banco; o NEXO nunca vê sua senha. Você desconecta quando quiser.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-link">Seu banco não aparece na lista?</summary>
            <p className="mt-2 text-muted">
              No plano gratuito, os bancos são conectados primeiro no <b>Meu Pluggy</b> (meu.pluggy.ai, até 5 bancos do mesmo titular). Depois, aqui, escolha “MeuPluggy” e entre com esse login: todos os bancos de lá entram de uma vez.
            </p>
          </details>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="font-semibold">O Open Finance ainda não foi ativado neste NEXO</p>
          <p className="mt-1 text-sm text-muted">Quem administra o app precisa cadastrar as chaves da Pluggy. Enquanto isso, importe o extrato do banco: leva um minuto e a conferência é feita na hora.</p>
          <ButtonLink href="/importar" className="mt-3">
            <Upload className="size-4" /> Importar extrato
          </ButtonLink>
        </Card>
      )}

      <Card>
        <CardHeader title="Seus bancos" icon={<ShieldCheck className="size-4" />} description={real.length ? `${plural(real.length, "conexão", "conexões")} · atualização automática todo dia de manhã` : "Nenhum banco conectado ainda."} />
        <CardBody>
          {connections.length === 0 ? (
            <EmptyState title="Nenhuma conexão" description="Seus dados continuam funcionando com lançamentos manuais e importação de extrato." />
          ) : (
            <ul className="divide-y divide-line">
              {connections.map((c) => {
                const [label, tone] = STATUS[c.status] ?? [c.status, "neutral"];
                const expiresIn = c.consent?.expiresAt && !c.consent.revokedAt ? daysUntil(c.consent.expiresAt) : null;
                const needsRenew = c.status === "expired" || c.status === "error" || (expiresIn !== null && expiresIn <= 15);
                return (
                  <li key={c.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.institutionName}</span>
                      {c.isDemo ? <DemoBadge /> : null}
                      <Badge tone={tone}>{label}</Badge>
                      {c.stale && c.status === "active" ? <Badge tone="warning">Sem atualizar há mais de 24 h</Badge> : null}
                      {expiresIn !== null && expiresIn <= 15 && c.status !== "revoked" ? <Badge tone="warning">Autorização vence em {plural(Math.max(0, expiresIn), "dia", "dias")}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {c.lastSyncAt ? `Atualizado em ${formatDateTime(c.lastSyncAt, tz)}` : "Ainda não sincronizado"}
                      {c.lastError ? <span className="text-negative"> · {c.lastError}</span> : null}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.status !== "revoked" ? (
                        <InlineAction action={syncConnectionAction} hidden={{ id: c.id }} variant="secondary">
                          <RefreshCw className="size-3.5" /> Atualizar agora
                        </InlineAction>
                      ) : null}
                      {!c.isDemo && c.status !== "revoked" && needsRenew && pluggy?.configured && c.providerItemId ? (
                        <ConnectBank tokenAction={pluggyConnectTokenAction} connectAction={connectProviderAction} updateItemId={c.providerItemId} connectionId={c.id} variant="petrol" size="sm">
                          Renovar autorização
                        </ConnectBank>
                      ) : null}
                      {c.status !== "revoked" ? (
                        <InlineAction action={revokeConnectionAction} hidden={{ id: c.id }} confirm="Desconectar este banco? A atualização automática para na hora; o que já entrou continua até você apagar.">
                          Desconectar
                        </InlineAction>
                      ) : null}
                      {c.status === "revoked" || c.isDemo ? (
                        <InlineAction action={deleteConnectionDataAction} hidden={{ id: c.id }} variant="danger" confirm="Apagar a conexão e TODAS as contas, cartões e movimentações que vieram dela? Não dá para desfazer.">
                          Apagar o que veio dela
                        </InlineAction>
                      ) : null}
                    </div>
                    <details className="mt-2 text-xs text-muted">
                      <summary className="cursor-pointer">Autorização e histórico</summary>
                      <p className="mt-1">
                        {c.consent ? (
                          <>
                            Concedida em {formatDateTime(c.consent.grantedAt, tz)}
                            {c.consent.revokedAt ? ` · revogada em ${formatDateTime(c.consent.revokedAt, tz)}` : c.consent.expiresAt ? ` · vence em ${formatDateTime(c.consent.expiresAt, tz)}` : ""} · {c.consent.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(", ")}
                          </>
                        ) : (
                          "Sem registro de autorização"
                        )}
                      </p>
                      {c.runs.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {c.runs.map((r) => (
                            <li key={r.id}>
                              {formatDateTime(r.startedAt, tz)} · {r.status === "success" ? "concluída" : r.status === "error" ? "falhou" : "em andamento"} · {plural(r.imported, "nova", "novas")}
                              {r.error ? ` · ${r.error}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/importar" className="inline-flex items-center gap-1.5 text-link hover:underline">
          <Upload className="size-4" /> Importar um extrato (OFX ou CSV)
        </Link>
        <span className="text-muted">para bancos sem Open Finance ou meses antigos</span>
      </div>

      {demo ? (
        <details className="rounded-2xl border border-dashed border-line p-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <FlaskConical className="size-4 text-muted" /> Testar com um banco de demonstração
          </summary>
          <p className="mt-2 text-muted">Cria um banco fictício com conta e cartão para você ver a sincronização funcionando. Nenhum dado real; dá para apagar depois.</p>
          <ActionForm action={connectProviderAction} className="mt-3 space-y-3">
            <input type="hidden" name="provider" value={demo.id} />
            <Checkbox name="consent" label="Autorizo o compartilhamento dos dados fictícios para esta finalidade" />
            <SubmitButton variant="secondary" size="sm" pendingLabel="Conectando…" className="whitespace-normal">
              Conectar banco de demonstração
            </SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}
