import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FlaskConical, KeyRound, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { connectProviderAction, deleteConnectionDataAction, deletePluggyCredentialsAction, pluggyConnectTokenAction, revokeConnectionAction, savePluggyCredentialsAction, syncConnectionAction } from "../_actions/account";
import { ConnectBank } from "@/components/finance/connect-bank";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, Field, InlineAction, Input, SubmitButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { formatDateTime } from "@/lib/format";
import { plural } from "@/domain/text";
import { requireOnboarded } from "@/server/auth/current";
import { availableProviders, getStoredCredentials } from "@/server/integrations/registry";
import { listConnections } from "@/server/services/connections";

export const metadata: Metadata = { title: "Conectar banco" };
/** Atualizar agora pede dados novos ao fornecedor e espera alguns segundos. */
export const maxDuration = 60;

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

const MEU_PLUGGY_URL = "https://meu.pluggy.ai";
const DASHBOARD_URL = "https://dashboard.pluggy.ai";

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** Formulário das chaves: usado na ativação e, depois, para trocar as chaves. */
function KeysForm({ submitLabel }: { submitLabel: string }) {
  return (
    <ActionForm action={savePluggyCredentialsAction} resetOnSuccess>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client ID" name="clientId">
          <Input name="clientId" autoComplete="off" spellCheck={false} required />
        </Field>
        <Field label="Client Secret" name="clientSecret" hint="Fica cifrado, só para você, e nunca aparece de novo.">
          <Input name="clientSecret" type="password" autoComplete="off" required />
        </Field>
      </div>
      <SubmitButton variant="petrol" pendingLabel="Conferindo na Pluggy…">
        <KeyRound className="size-4" /> {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function ConnectionsPage() {
  const { ctx, prefs } = await requireOnboarded();
  const [connections, providers, keys] = await Promise.all([listConnections(ctx), Promise.resolve(availableProviders()), getStoredCredentials(ctx.db, ctx.userId)]);
  const tz = prefs.timezone;
  const envConfigured = providers.find((p) => p.id === "pluggy")?.configured ?? false;
  const configured = !!keys || envConfigured;
  const demo = providers.find((p) => p.isDemo);
  const real = connections.filter((c) => !c.isDemo);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Open Finance" title="Conectar banco" description="De graça, pelo Meu Pluggy: seus bancos entram sozinhos, todo dia, já categorizados. Você autoriza no app do banco; o Meu Banqueiro nunca vê sua senha." />

      {configured ? (
        <div className="border-b border-line pb-6">
          <ConnectBank tokenAction={pluggyConnectTokenAction} connectAction={connectProviderAction} />
          <p className="mt-3 text-sm text-muted">
            Abre a janela do Meu Pluggy: entre com o login de lá e escolha o banco. Os bancos precisam estar conectados antes em{" "}
            <a href={MEU_PLUGGY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link underline">
              meu.pluggy.ai <ExternalLink className="size-3" />
            </a>{" "}
            (até 5 bancos seus). Repita para cada banco.
          </p>
          <p className="mt-3 text-xs text-muted">
            O Meu Pluggy busca os dados no banco uma vez por dia, então o saldo pode estar algumas horas atrás do app do banco. <b>Atualizar agora</b> pede dados novos e lê o que já chegou; ao abrir o Meu Banqueiro, conexões paradas há mais de 6 horas são atualizadas sozinhas.
          </p>
          <p className="mt-2 text-xs text-muted">Ao conectar, você autoriza o Meu Banqueiro a ler contas, saldos, cartões e movimentações dessa conexão para organizar suas finanças. Você desconecta quando quiser.</p>
          {keys ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-link">
                Suas chaves da Pluggy (Client ID terminado em {keys.clientIdHint}){keys.validatedAt ? ` · conferidas em ${formatDateTime(keys.validatedAt, tz)}` : ""}
              </summary>
              <div className="mt-3 space-y-3">
                <KeysForm submitLabel="Trocar chaves" />
                <InlineAction action={deletePluggyCredentialsAction} variant="secondary" confirm="Remover suas chaves da Pluggy? As conexões existentes param de atualizar até você ativar de novo.">
                  Remover chaves
                </InlineAction>
              </div>
            </details>
          ) : (
            <p className="mt-3 text-xs text-muted">Usando as chaves gerais deste Meu Banqueiro. Para usar as suas, cole-as abaixo.</p>
          )}
          {!keys ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-link">Usar minhas próprias chaves da Pluggy</summary>
              <div className="mt-3">
                <KeysForm submitLabel="Ativar com minhas chaves" />
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <Card>
          <CardHeader title="Ative o Open Finance (grátis, uma vez)" icon={<KeyRound className="size-4" />} description="A Pluggy oferece o Meu Pluggy sem custo e sem prazo para até 5 bancos seus. Leva uns cinco minutos e você só faz uma vez." />
          <CardBody className="space-y-4">
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>
                Crie sua conta no{" "}
                <a href={MEU_PLUGGY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link underline">
                  Meu Pluggy <ExternalLink className="size-3" />
                </a>{" "}
                e conecte seus bancos lá. A autorização acontece no app de cada banco.
              </li>
              <li>
                Crie uma conta no{" "}
                <a href={DASHBOARD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link underline">
                  painel da Pluggy <ExternalLink className="size-3" />
                </a>{" "}
                com o mesmo e-mail. Em <b>Aplicações</b>, crie uma aplicação; em <b>Conectores</b>, ative o <b>MeuPluggy</b>. O aviso de teste de 15 dias não afeta o uso pessoal.
              </li>
              <li>Na aplicação, copie o <b>Client ID</b> e o <b>Client Secret</b> e cole aqui. Eles ficam cifrados, só para você.</li>
            </ol>
            <KeysForm submitLabel="Ativar Open Finance" />
            <p className="text-xs text-muted">
              Cada pessoa usa a própria conta gratuita da Pluggy, como os termos dela pedem (um titular por conta). Sem vontade de criar conta? Importe o extrato do banco: leva um minuto e a conferência é feita na hora.
            </p>
            <ButtonLink href="/importar" variant="secondary" size="sm">
              <Upload className="size-4" /> Importar extrato
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      <Section title="Seus bancos" description={real.length ? `${plural(real.length, "conexão", "conexões")} · atualização automática todo dia de manhã` : "Nenhum banco conectado ainda."}>
          {connections.length === 0 ? (
            <EmptyState title="Nenhuma conexão" description="Seus dados continuam funcionando com lançamentos manuais e importação de extrato." />
          ) : (
            <ul className="divide-y divide-line">
              {connections.map((c) => {
                const [label, tone] = STATUS[c.status] ?? [c.status, "neutral"];
                const expiresIn = c.consent?.expiresAt && !c.consent.revokedAt ? daysUntil(c.consent.expiresAt) : null;
                const needsRenew = !c.isDemo && c.status !== "revoked" && (c.status === "expired" || (expiresIn !== null && expiresIn <= 15));
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
                      {c.bankUpdatedAt ? `Dados do banco de ${formatDateTime(c.bankUpdatedAt, tz)}` : null}
                      {c.bankUpdatedAt && c.lastSyncAt ? " · " : null}
                      {c.lastSyncAt ? `lido pelo Meu Banqueiro em ${formatDateTime(c.lastSyncAt, tz)}` : "Ainda não sincronizado"}
                      {c.lastError ? <span className="text-negative"> · {c.lastError}</span> : null}
                    </p>
                    {needsRenew ? (
                      <Callout tone="warning" className="mt-3">
                        Reconecte este banco no{" "}
                        <a href={MEU_PLUGGY_URL} target="_blank" rel="noreferrer" className="underline">
                          Meu Pluggy
                        </a>{" "}
                        e depois toque em Atualizar agora.
                      </Callout>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.status !== "revoked" ? (
                        <InlineAction action={syncConnectionAction} hidden={{ id: c.id }} variant="secondary">
                          <RefreshCw className="size-3.5" /> Atualizar agora
                        </InlineAction>
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
      </Section>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/importar" className="inline-flex items-center gap-1.5 text-link hover:underline">
          <Upload className="size-4" /> Importar um extrato (OFX ou CSV)
        </Link>
        <span className="text-muted">para bancos sem Open Finance ou meses antigos</span>
      </div>

      {demo ? (
        <details className="rounded-lg border border-dashed border-line p-4 text-sm">
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
