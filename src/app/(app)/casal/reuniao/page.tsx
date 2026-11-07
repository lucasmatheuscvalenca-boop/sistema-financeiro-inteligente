import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { saveMeetingAction } from "../../_actions/household";
import { ActionForm, Field, SubmitButton, Textarea } from "@/components/ui/form";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { addMonthsToKey, assertMonthKey, formatMonthKey, monthKey } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { getCoupleMonth, getMeeting } from "@/server/services/household";

export const metadata: Metadata = { title: "Reunião do mês" };

const cap = (v: string) => v.replace(/^./, (c) => c.toUpperCase());

function Step({ n, minutes, title, children }: { n: number; minutes: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
      <span className="grid size-9 place-items-center rounded-full bg-surface-2 font-display text-lg">{n}</span>
      <div>
        <p className="font-medium">
          {title} <span className="text-xs font-normal text-muted">· {minutes} min</span>
        </p>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

/** Reunião mensal do casal: roteiro de 15 minutos com os números do mês e os combinados anotados. */
export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ctx } = await requireOnboarded();
  const sp = await searchParams;
  // Por padrão, a reunião olha o mês que acabou.
  let month = addMonthsToKey(monthKey(ctx.today), -1);
  try {
    if (sp.mes) month = assertMonthKey(sp.mes);
  } catch {}
  const [data, meeting, lastMeeting] = await Promise.all([getCoupleMonth(ctx, month), getMeeting(ctx, month), getMeeting(ctx, addMonthsToKey(month, -1))]);
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reunião do mês" description="Roteiro de 15 minutos para o casal olhar o mês junto e anotar os combinados." />
        <EmptyState title="Primeiro, o Nosso lar" description="A reunião usa as despesas que vocês marcam como nossas." action={<Link href="/casal" className="text-sm font-medium text-link hover:underline">Ir para Nosso lar</Link>} />
      </div>
    );
  }
  const partner = data.household.partner!;
  const first = partner.name.split(" ")[0];
  const diff = data.split.sharedCents - data.previousSharedCents;
  const top = [...data.items].filter((i) => i.ownership === "ours").sort((a, b) => b.amountCents - a.amountCents).slice(0, 3);
  const owe = data.split.settlement;

  return (
    <div className="space-y-8">
      <PageHeader title={`Reunião de ${formatMonthKey(month)}`} description={`Você e ${first}, 15 minutos: olhar o mês, acertar a diferença, rever os combinados e decidir o próximo mês. Só entram as despesas marcadas como nossas.`} actions={<Link href={`/casal?mes=${month}`} className="text-sm font-medium text-link hover:underline">Ver o mês</Link>} />
      <div className="flex gap-3 text-sm">
        <Link href={`/casal/reuniao?mes=${addMonthsToKey(month, -1)}`} className="text-link hover:underline">
          ‹ {cap(formatMonthKey(addMonthsToKey(month, -1)))}
        </Link>
        <Link href={`/casal/reuniao?mes=${addMonthsToKey(month, 1)}`} className="text-link hover:underline">
          {cap(formatMonthKey(addMonthsToKey(month, 1)))} ›
        </Link>
      </div>
      <Section title="Roteiro">
        <ol className="space-y-5">
          <Step n={1} minutes={3} title="Como foi o mês">
            Despesas nossas: <Money cents={data.split.sharedCents} tone="none" className="font-semibold text-ink" />
            {data.previousSharedCents ? (
              <>
                {" "}
                ({diff >= 0 ? "+" : "−"}
                <Money cents={Math.abs(diff)} tone="none" /> em relação ao mês anterior)
              </>
            ) : null}
            .{top.length ? <> As maiores: {top.map((t, i) => <span key={t.id}>{i ? ", " : ""}{t.description} (<Money cents={t.amountCents} tone="none" />)</span>)}.</> : null} Algo surpreendeu? Algo dá para cortar?
          </Step>
          <Step n={2} minutes={2} title="Acerto">
            {owe ? (
              <>
                Falta {owe.fromId === ctx.userId ? "você transferir" : `${first} transferir`} <Money cents={owe.amountCents} tone="none" className="font-semibold text-ink" />.{" "}
                <Link href={`/casal?mes=${month}`} className="text-link hover:underline">
                  Abrir o acerto com Pix
                </Link>
              </>
            ) : (
              "Nada a acertar: as contas do mês estão em dia."
            )}
          </Step>
          <Step n={3} minutes={3} title="Combinados do mês passado">
            {lastMeeting?.decisions.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
                {lastMeeting.decisions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              "Nenhum combinado anotado no mês anterior."
            )}{" "}
            Cumpriram? O que ajudou ou atrapalhou?
          </Step>
          <Step n={4} minutes={4} title="O próximo mês">
            Vem alguma despesa grande (viagem, presente, conserto, IPVA)? Alguma conta para trocar de data? Como estão as metas de vocês?{" "}
            <Link href="/compartilhamento" className="text-link hover:underline">
              Metas compartilhadas
            </Link>
          </Step>
          <Step n={5} minutes={3} title="Combinados">
            Até três, curtos e verificáveis (ex.: &quot;delivery no máximo 2 vezes por semana&quot;).
          </Step>
        </ol>
      </Section>
      <Section title="Combinados deste mês" description={meeting ? "Guardados. Os dois podem editar." : "Um por linha. Aparecem na reunião do mês que vem."}>
        <ActionForm action={saveMeetingAction}>
          <input type="hidden" name="month" value={month} />
          <Field label="Combinados" name="decisions">
            <Textarea name="decisions" rows={4} defaultValue={meeting?.decisions.join("\n") ?? ""} placeholder={"Delivery no máximo 2 vezes por semana\nGuardar R$ 500 para a viagem"} />
          </Field>
          <Field label="Anotações (opcional)" name="notes">
            <Textarea name="notes" rows={2} defaultValue={meeting?.notes ?? ""} />
          </Field>
          <SubmitButton variant="petrol">Guardar combinados</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
