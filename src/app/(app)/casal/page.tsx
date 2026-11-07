import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, HeartHandshake } from "lucide-react";
import { householdSettingsAction, inviteAction, leaveHouseholdAction, respondInviteAction, revokeInviteAction, settleAction, undoSettlementAction } from "../_actions/household";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { EmptyState, Money, PageHeader, Stat, StatStrip } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { addMonthsToKey, assertMonthKey, formatDateShort, formatMonthKey, monthKey } from "@/domain/dates";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { getCoupleMonth, getHousehold, receivedInvites } from "@/server/services/household";

export const metadata: Metadata = { title: "Nosso lar" };

const cap = (v: string) => v.replace(/^./, (c) => c.toUpperCase());

/** Nosso lar: o que é do casal, quem pagou, a divisão e o acerto do mês. */
export default async function CouplePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  let month = monthKey(ctx.today);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {}
  const [household, invites] = await Promise.all([getHousehold(ctx), receivedInvites(ctx)]);
  const data = household?.partner ? await getCoupleMonth(ctx, month) : null;

  const invitesBlock = invites.length ? (
    <Section title="Convites para você">
      <ul className="space-y-3">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-accent bg-surface p-4">
            <span>
              <strong>{i.inviterName}</strong> convidou você para o Nosso lar.
              <span className="block text-sm text-muted">Só o que cada um marcar como nosso fica visível para os dois.</span>
            </span>
            <span className="flex gap-2">
              <InlineAction action={respondInviteAction} hidden={{ id: i.id, accept: "1" }} variant="petrol" size="md">
                Aceitar
              </InlineAction>
              <InlineAction action={respondInviteAction} hidden={{ id: i.id, accept: "0" }} variant="ghost" size="md">
                Recusar
              </InlineAction>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  ) : null;

  if (!household?.partner) {
    return (
      <div className="space-y-8">
        <PageHeader title="Nosso lar" description="Para casais: cada um continua com a própria conta e marca o que é nosso. Vocês veem juntos as despesas da casa, quem pagou, a divisão (meio a meio ou pela renda) e o acerto do mês, com Pix pronto." />
        {invitesBlock}
        {household?.pendingInvite ? (
          <Section title="Convite enviado">
            <p className="text-sm">
              Aguardando <strong>{household.pendingInvite.email}</strong> entrar no Meu Banqueiro e aceitar em Nosso lar.
            </p>
            <div className="mt-3">
              <InlineAction action={revokeInviteAction} variant="ghost">
                Cancelar convite
              </InlineAction>
            </div>
          </Section>
        ) : (
          <EmptyState
            title="Convide a outra pessoa"
            description="Use o e-mail com que ela entra no Meu Banqueiro. Nada do que é só de cada um fica visível: só o que for marcado como nosso."
            action={
              <Dialog trigger={<><HeartHandshake className="size-4" /> Convidar</>} title="Convidar para o Nosso lar">
                <ActionForm action={inviteAction} resetOnSuccess>
                  <Field label="E-mail da outra pessoa" name="email">
                    <Input name="email" type="email" autoComplete="email" required />
                  </Field>
                  <SubmitButton variant="petrol">Convidar</SubmitButton>
                </ActionForm>
              </Dialog>
            }
          />
        )}
      </div>
    );
  }

  const me = household.me;
  const partner = household.partner;
  const name = (id: string) => (id === me.id ? "Você" : partner.name.split(" ")[0]);
  const s = data!.split;
  const owe = s.settlement;
  const prev = data!.previousSharedCents;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nosso lar"
        description={`Você e ${partner.name}. Aqui aparece só o que cada um marcou como nosso (ou "paguei para a outra pessoa") e o que saiu de conta conjunta. Marque em Lançamentos, no seletor ao lado da categoria.`}
        actions={
          <Link href={`/casal/reuniao?mes=${month}`} className={buttonClass("secondary")}>
            Reunião do mês
          </Link>
        }
      />
      {invitesBlock}
      <div className="flex items-center gap-1">
        <Link aria-label="Mês anterior" href={`/casal?mes=${addMonthsToKey(month, -1)}`} className="rounded-lg p-2 hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="min-w-40 text-center font-semibold">{cap(formatMonthKey(month))}</span>
        <Link aria-label="Próximo mês" href={`/casal?mes=${addMonthsToKey(month, 1)}`} className="rounded-lg p-2 hover:bg-surface-2">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <StatStrip columns={3}>
        <Stat label="Despesas nossas" value={<Money cents={s.sharedCents} tone="none" />} hint={prev ? <>mês anterior: <Money cents={prev} tone="none" /></> : undefined} />
        {s.people.map((p) => (
          <Stat key={p.id} label={`${name(p.id)} pagou`} value={<Money cents={p.paidCents} tone="none" />} hint={`parte: ${Math.round(p.sharePct)}% · deveria ${(p.shouldPayCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`} />
        ))}
      </StatStrip>

      <Section title="Acerto do mês" description={household.splitMode === "income" && !data!.incomeMissing ? "Divisão proporcional à renda de cada um." : "Divisão meio a meio."}>
        {data!.incomeMissing ? <p className="mb-3 text-sm text-warning">Para dividir pela renda, cada um informa a sua renda em Ajustes. Enquanto isso, a conta é meio a meio.</p> : null}
        {owe ? (
          <div className="space-y-4">
            <p className="text-lg">
              <strong>{name(owe.fromId)}</strong> transfere <Money cents={owe.amountCents} tone="none" className="font-semibold" /> para <strong>{owe.toId === me.id ? "você" : partner.name.split(" ")[0]}</strong>.
            </p>
            {owe.fromId === me.id ? (
              data!.pix ? (
                <div className="rounded-lg bg-surface-2 p-4">
                  <p className="text-sm font-medium">Pix copia e cola</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">{data!.pix}</p>
                  <div className="mt-3">
                    <CopyButton text={data!.pix} label="Copiar o Pix" />
                  </div>
                  <p className="mt-2 text-xs text-muted">Cole no app do banco: o valor e o nome já vêm preenchidos. Confira antes de pagar.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">Quando {partner.name.split(" ")[0]} cadastrar a chave Pix em Ajustes, o código copia e cola aparece aqui.</p>
              )
            ) : (
              <p className="text-sm text-muted">{partner.name.split(" ")[0]} vê o código Pix com a sua chave {me.pixKey ? "" : "(cadastre em Ajustes)"}.</p>
            )}
            <Dialog trigger="Já transferimos" variant="secondary" title="Registrar o acerto" description="O valor sai da diferença do mês.">
              <ActionForm action={settleAction}>
                <input type="hidden" name="month" value={month} />
                <Field label="Valor transferido" name="amount">
                  <MoneyInput name="amount" defaultValue={centsToInput(owe.amountCents)} required />
                </Field>
                <SubmitButton variant="petrol">Registrar</SubmitButton>
              </ActionForm>
            </Dialog>
          </div>
        ) : (
          <p className="text-sm text-positive">{s.sharedCents || s.forOtherCents ? "Tudo acertado neste mês." : "Nenhuma despesa nossa neste mês ainda."}</p>
        )}
        {data!.settlements.length ? (
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {data!.settlements.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                Acerto de <Money cents={x.amountCents} tone="none" /> ({name(x.fromId)} → {name(x.toId)}) em {formatDateShort(x.createdAt.toISOString().slice(0, 10))}
                <InlineAction action={undoSettlementAction} hidden={{ id: x.id }} confirm="Desfazer este acerto?">
                  Desfazer
                </InlineAction>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Despesas nossas do mês" description="Quem pagou cada uma. As marcadas como da outra pessoa entram inteiras na conta dela.">
        {data!.items.length ? (
          <ul className="divide-y divide-line">
            {data!.items.map((i) => (
              <li key={i.id} className="flex items-baseline gap-3 py-2.5">
                <span className="w-12 shrink-0 text-sm tabular-nums text-muted">{formatDateShort(i.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.description}</span>
                  <span className="block text-xs text-muted">
                    {name(i.paidBy)} pagou{i.ownership === "theirs" ? ` · ${i.paidBy === me.id ? `de ${partner.name.split(" ")[0]}` : "sua"}` : ""}
                  </span>
                </span>
                {i.ownership === "theirs" ? <Badge tone="info">só de um</Badge> : null}
                <Money cents={i.amountCents} tone="none" className="shrink-0 text-sm font-semibold" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nenhuma despesa marcada como nossa. Em{" "}
            <Link href={`/movimentacoes?mes=${month}&tipo=expense`} className="text-link hover:underline">
              Lançamentos
            </Link>
            , escolha &quot;Nossa&quot; ao lado da categoria; ou marque uma conta como conjunta em Bancos e cartões.
          </p>
        )}
      </Section>

      <Section title="Ajustes">
        <ActionForm action={householdSettingsAction}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Como dividir" name="splitMode">
              <Select name="splitMode" defaultValue={household.splitMode}>
                <option value="equal">Meio a meio</option>
                <option value="income">Proporcional à renda</option>
              </Select>
            </Field>
            <Field label="Sua renda mensal (para a divisão proporcional)" name="income" hint={`${partner.name.split(" ")[0]} ${partner.incomeCents ? "já informou a renda" : "ainda não informou"}.`}>
              <MoneyInput name="income" defaultValue={centsToInput(me.incomeCents)} />
            </Field>
            <Field label="Sua chave Pix (para receber o acerto)" name="pixKey" hint="E-mail, celular, CPF ou chave aleatória. Só aparece no código para a outra pessoa pagar.">
              <Input name="pixKey" defaultValue={me.pixKey ?? ""} maxLength={77} />
            </Field>
            <Field label="Sua cidade (exigida pelo código Pix)" name="pixCity">
              <Input name="pixCity" defaultValue={me.pixCity ?? ""} maxLength={40} />
            </Field>
          </div>
          <SubmitButton variant="petrol">Salvar ajustes</SubmitButton>
        </ActionForm>
        <div className="mt-6 border-t border-line pt-4">
          <InlineAction action={leaveHouseholdAction} confirm={`Sair do Nosso lar? ${partner.name.split(" ")[0]} deixa de ver o que é nosso.`}>
            Sair do lar
          </InlineAction>
        </div>
      </Section>
    </div>
  );
}
