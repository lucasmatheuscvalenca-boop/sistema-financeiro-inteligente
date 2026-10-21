import type { Metadata } from "next";
import { Brain, Pencil } from "lucide-react";
import { addMemoryAction, clearMemoryAction, memoryDecisionAction } from "../../_actions/intelligence";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, InlineAction, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { listMemory, MEMORY_KIND_LABEL, MEMORY_KINDS, type MemoryRow } from "@/server/services/memory";

export const metadata: Metadata = { title: "Memória do assistente" };

function KindSelect({ value }: { value?: string }) {
  return (
    <Select name="kind" defaultValue={value ?? "preference"}>
      {MEMORY_KINDS.map((k) => (
        <option key={k} value={k}>
          {MEMORY_KIND_LABEL[k]}
        </option>
      ))}
    </Select>
  );
}

function Item({ m, tz }: { m: MemoryRow; tz: string }) {
  return (
    <li className="rounded-2xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="info">{MEMORY_KIND_LABEL[m.kind as keyof typeof MEMORY_KIND_LABEL] ?? m.kind}</Badge>
        <Badge tone={m.source === "declared" ? "positive" : "gold"}>{m.source === "declared" ? "Declarado por você" : "Inferido pelo sistema"}</Badge>
        <span className="text-muted">atualizado em {formatDateTime(m.updatedAt, tz)}</span>
      </div>
      <p className="mt-2 text-sm">{m.content}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {m.status === "pending_confirmation" ? (
          <>
            <InlineAction action={memoryDecisionAction} hidden={{ id: m.id, decision: "confirm" }} variant="petrol">
              Está correto
            </InlineAction>
            <InlineAction action={memoryDecisionAction} hidden={{ id: m.id, decision: "reject" }}>
              Não é verdade
            </InlineAction>
          </>
        ) : null}
        <Dialog trigger={<><Pencil className="size-3.5" /> Corrigir</>} title="Corrigir memória" variant="ghost" size="sm">
          <ActionForm action={memoryDecisionAction}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="decision" value="update" />
            <Field label="Tipo" name="kind">
              <KindSelect value={m.kind} />
            </Field>
            <Field label="Conteúdo" name="content">
              <Textarea name="content" defaultValue={m.content} rows={3} maxLength={500} required />
            </Field>
            <SubmitButton variant="petrol">Salvar correção</SubmitButton>
          </ActionForm>
        </Dialog>
        <InlineAction action={memoryDecisionAction} hidden={{ id: m.id, decision: "delete" }} confirm="Apagar este item da memória? O conteúdo também sai do histórico.">
          Apagar
        </InlineAction>
      </div>
    </li>
  );
}

export default async function MemoryPage() {
  const { ctx, prefs } = await requireOnboarded();
  const items = await listMemory(ctx);
  const pending = items.filter((m) => m.status === "pending_confirmation");
  const active = items.filter((m) => m.status === "active");
  const rejected = items.filter((m) => m.status === "rejected");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {pending.length ? (
          <Card>
            <CardHeader title="Aguardando sua confirmação" description="Coisas que o sistema percebeu, mas que só passam a ser usadas se você confirmar." />
            <CardBody>
              <ul className="space-y-3">
                {pending.map((m) => (
                  <Item key={m.id} m={m} tz={prefs.timezone} />
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="O que o assistente sabe sobre você" icon={<Brain className="size-4" />} description="Somente itens ativos entram no contexto das respostas. Você pode corrigir ou apagar qualquer um." />
          <CardBody>
            {active.length === 0 ? (
              <EmptyState title="Nada registrado ainda" description="Objetivos do briefing e o que você declarar aqui aparecem nesta lista." />
            ) : (
              <ul className="space-y-3">
                {active.map((m) => (
                  <Item key={m.id} m={m} tz={prefs.timezone} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        {rejected.length ? (
          <details className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">Inferências recusadas ({rejected.length})</summary>
            <p className="mt-1 text-xs text-muted">Não são usadas. Ficam registradas para o sistema não sugerir a mesma coisa de novo — apague se preferir.</p>
            <ul className="mt-3 space-y-3">
              {rejected.map((m) => (
                <Item key={m.id} m={m} tz={prefs.timezone} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Contar algo ao assistente" />
          <CardBody>
            <ActionForm action={addMemoryAction} resetOnSuccess>
              <Field label="Tipo" name="kind">
                <KindSelect />
              </Field>
              <Field label="O que devo lembrar?" name="content">
                <Textarea name="content" rows={3} maxLength={500} placeholder="ex.: Prefiro não usar o cartão de crédito para compras parceladas." required />
              </Field>
              <SubmitButton variant="petrol">Registrar</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        {items.length ? (
          <Card className="p-5">
            <p className="text-sm font-medium">Apagar toda a memória</p>
            <p className="mt-1 text-xs text-muted">Remove todos os itens e o histórico de alterações. Suas finanças não são afetadas.</p>
            <div className="mt-3">
              <InlineAction action={clearMemoryAction} variant="danger" confirm="Apagar toda a memória do assistente? Esta ação não pode ser desfeita.">
                Apagar tudo
              </InlineAction>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
