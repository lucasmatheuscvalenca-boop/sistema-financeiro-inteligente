import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { resetAccountAction, updateNameAction, updatePreferencesAction } from "../_actions/account";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { getMascot } from "@/mascots/catalog";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "Europe/Lisbon", "UTC"];

/** Aba "Geral" das configurações (perfil, preferências, recomeçar do zero). */
export async function GeneralSettings() {
  const { user, prefs, mascotId } = await requireOnboarded();
  const mascot = getMascot(mascotId);
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Perfil" />
          <CardBody>
            <ActionForm action={updateNameAction}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Como quer ser chamado(a)" name="name">
                  <Input name="name" defaultValue={user.name} required minLength={2} maxLength={80} />
                </Field>
                <Field label="E-mail" hint="Usado para entrar e para convites de compartilhamento.">
                  <Input value={user.email} readOnly disabled />
                </Field>
              </div>
              <SubmitButton variant="secondary">Salvar nome</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Preferências" description="Controlam o ritmo das revisões, o volume de alertas e a folga usada no “Posso gastar?”." />
          <CardBody>
            <ActionForm action={updatePreferencesAction}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Frequência de revisão" name="reviewFrequency">
                  <Select name="reviewFrequency" defaultValue={prefs.reviewFrequency}>
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </Select>
                </Field>
                <Field label="Máximo de novos alertas por dia" name="maxAlertsPerDay" hint="Alertas importantes aparecem primeiro.">
                  <Input name="maxAlertsPerDay" type="number" min={1} max={50} defaultValue={prefs.maxAlertsPerDay} />
                </Field>
                <Field label="Margem de segurança" name="safetyMargin" hint="Valor mínimo que você quer manter livre. Em branco: o sistema usa 10% das despesas essenciais do mês (mínimo de R$ 100).">
                  <MoneyInput name="safetyMargin" defaultValue={centsToInput(prefs.safetyMarginCents)} />
                </Field>
                <Field label="Fuso horário" name="timezone" hint="Define o que é “hoje” nos cálculos de datas.">
                  <Select name="timezone" defaultValue={prefs.timezone}>
                    {(TIMEZONES.includes(prefs.timezone) ? TIMEZONES : [prefs.timezone, ...TIMEZONES]).map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <SubmitButton variant="petrol">Salvar preferências</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card className="border-orange-200 dark:border-orange-900/60">
          <CardHeader title="Recomeçar do zero" icon={<RotateCcw className="size-4" />} description="Apaga tudo o que você registrou e volta ao primeiro acesso, como se tivesse acabado de criar a conta." />
          <CardBody>
            <Callout tone="warning">
              Somem: contas, cartões, lançamentos, importações, metas, reserva, aposentadoria, patrimônio, conexões bancárias, conversas e memória do assistente, briefing e mascote. Ficam: seu login, senha, e-mail e tema. O que outras pessoas compartilharam com você continua. Não dá para desfazer.
            </Callout>
            <ActionForm action={resetAccountAction} className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Senha" name="password">
                  <Input name="password" type="password" autoComplete="current-password" required />
                </Field>
                <Field label="Digite RECOMEÇAR para confirmar" name="confirmText">
                  <Input name="confirmText" autoComplete="off" required />
                </Field>
              </div>
              <SubmitButton variant="danger" pendingLabel="Apagando…">
                Apagar tudo e recomeçar
              </SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">
              Quer só sair da conta ou excluí-la de vez? Veja <Link href="/configuracoes/privacidade" className="text-link underline">Privacidade e segurança</Link>.
            </p>
          </CardBody>
        </Card>
      </div>
      <div className="h-fit border-l-[3px] border-l-gold-400 pl-4">
        <div className="flex items-center gap-3">
          <MascotArt id={mascotId} state="neutral" size={72} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Seu mascote</p>
            <p className="font-semibold">
              {mascot.name} — {mascot.title}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">{mascot.communicationFocus}</p>
        <Link href="/configuracoes/mascote" className="mt-3 inline-block text-sm font-medium text-link hover:underline">
          Trocar mascote →
        </Link>
        <p className="mt-4 text-xs text-muted">O tema claro/escuro fica no botão do topo da tela.</p>
      </div>
    </div>
  );
}
