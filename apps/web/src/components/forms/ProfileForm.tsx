"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { updateProfileAction } from "@/server/actions/profile";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState(updateProfileAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <Field label="Seu nome" name="displayName" defaultValue={displayName} required maxLength={80} />
      <Notice state={state} />
      <SubmitButton variant="secondary">Salvar nome</SubmitButton>
    </form>
  );
}
