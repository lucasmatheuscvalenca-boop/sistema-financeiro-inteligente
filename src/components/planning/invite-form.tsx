"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm, Field, Input, Select, SubmitButton, type FormAction } from "@/components/ui/form";

export function InviteForm({ action, goals, defaultGoalId }: { action: FormAction; goals: Array<{ id: string; name: string }>; defaultGoalId?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <ActionForm
        action={action}
        resetOnSuccess
        keepOpen
        onResult={(s) => {
          const data = s.data as { link?: string } | undefined;
          setCopied(false);
          setLink(s.ok && data?.link ? `${window.location.origin}${data.link}` : null);
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Meta" name="goalId">
            <Select name="goalId" defaultValue={defaultGoalId ?? goals[0]?.id} required>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="E-mail da pessoa" name="email" hint="Ela precisa ter (ou criar) uma conta com este e-mail.">
            <Input name="email" type="email" autoComplete="off" required />
          </Field>
          <Field label="Permissão" name="permission">
            <Select name="permission" defaultValue="view">
              <option value="view">Só acompanhar</option>
              <option value="contribute">Acompanhar e registrar aportes</option>
            </Select>
          </Field>
        </div>
        <SubmitButton variant="petrol">Gerar convite</SubmitButton>
      </ActionForm>
      {link ? (
        <div className="rounded-2xl border border-petrol-200 bg-petrol-50 p-3 text-sm dark:border-petrol-800 dark:bg-petrol-900/30">
          <p className="font-medium">Link do convite</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link} aria-label="Link do convite" className="min-w-0 flex-1 rounded-xl border border-field-line bg-field px-3 py-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Copy className="size-4" /> {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Não enviamos e-mails automaticamente nesta versão: compartilhe o link por um canal de sua confiança.</p>
        </div>
      ) : null}
    </div>
  );
}
