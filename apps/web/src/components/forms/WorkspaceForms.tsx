"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { createBusinessAction, updateWorkspaceAction } from "@/server/actions/workspaces";
import { Field, TextArea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function CreateBusinessForm({ suggestion, submitLabel = "Criar empresa" }: { suggestion?: string; submitLabel?: string }) {
  const [state, action] = useActionState(createBusinessAction, initialActionState);
  return (
    <form action={action} className="space-y-4" data-universe="business">
      <Field label="Nome da empresa" name="name" defaultValue={suggestion} required maxLength={80} />
      <Notice state={state} />
      <SubmitButton pendingLabel="Criando universo…">{submitLabel}</SubmitButton>
    </form>
  );
}

export function WorkspaceEditForm({
  workspaceId,
  name,
  description,
}: {
  workspaceId: string;
  name: string;
  description: string | null;
}) {
  const [state, action] = useActionState(updateWorkspaceAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Field label="Nome" name="name" defaultValue={name} required maxLength={80} />
      <TextArea label="Descrição" name="description" defaultValue={description ?? ""} maxLength={500} />
      <Notice state={state} />
      <SubmitButton variant="secondary">Salvar</SubmitButton>
    </form>
  );
}
