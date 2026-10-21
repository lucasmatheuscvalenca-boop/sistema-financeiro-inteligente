"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Callout } from "./callout";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";
import { DialogContext } from "./dialog";
import { useToast, type ToastTone } from "./toast";

/** Ações podem pedir comemoração (ex.: meta atingida) devolvendo `data.celebrate`. */
function toastTone(state: ActionState): ToastTone {
  return (state.data as { celebrate?: boolean } | undefined)?.celebrate ? "celebration" : "positive";
}

const FormState = createContext<ActionState>(initialActionState);

export function useFormFieldError(name?: string): string | undefined {
  const state = useContext(FormState);
  return name ? state.fieldErrors?.[name] : undefined;
}

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
  onResult,
  id,
  keepOpen = false,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  onResult?: (state: ActionState) => void;
  id?: string;
  /** Dentro de um diálogo, o padrão é fechar ao salvar e confirmar com uma notificação. */
  keepOpen?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useContext(DialogContext);
  const toast = useToast();
  const closesDialog = !!dialog && !keepOpen;
  useEffect(() => {
    if (!state.at) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.ok && closesDialog) {
      dialog.close();
      toast({ title: state.message ?? "Alterações salvas.", tone: toastTone(state) });
    }
    onResult?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return (
    <FormState.Provider value={state}>
      <form ref={ref} action={formAction} className={cn("space-y-4", className)} id={id} noValidate>
        {children}
        {state.error ? (
          <Callout tone="negative" title="Não foi possível concluir">
            {state.error}
          </Callout>
        ) : null}
        {state.ok && state.message && showSuccess && !closesDialog ? <Callout tone="positive">{state.message}</Callout> : null}
      </form>
    </FormState.Provider>
  );
}

export function Field({ label, name, hint, children, className }: { label: ReactNode; name?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const error = useFormFieldError(name);
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-negative" id={name ? `${name}-error` : undefined}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  "block w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition focus:border-petrol-400 focus:outline-none focus:ring-2 focus:ring-petrol-200 dark:focus:ring-petrol-800 disabled:opacity-60";

export function Input({ className, name, id, ...props }: ComponentProps<"input">) {
  const error = useFormFieldError(name);
  return <input id={id ?? name} name={name} aria-invalid={!!error} className={cn(inputBase, "h-10", error && "border-negative", className)} {...props} />;
}

export function MoneyInput({ className, name, id, ...props }: ComponentProps<"input">) {
  const error = useFormFieldError(name);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">R$</span>
      <input
        id={id ?? name}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-invalid={!!error}
        className={cn(inputBase, "h-10 pl-9 tabular-nums", error && "border-negative", className)}
        {...props}
      />
    </div>
  );
}

export function Select({ className, name, id, children, ...props }: ComponentProps<"select">) {
  const error = useFormFieldError(name);
  return (
    <select id={id ?? name} name={name} aria-invalid={!!error} className={cn(inputBase, "h-10 pr-8", error && "border-negative", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, name, id, ...props }: ComponentProps<"textarea">) {
  const error = useFormFieldError(name);
  return <textarea id={id ?? name} name={name} aria-invalid={!!error} className={cn(inputBase, "min-h-20 py-2", error && "border-negative", className)} {...props} />;
}

export function Checkbox({ label, name, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" name={name} className="mt-0.5 size-4 rounded border-line accent-[var(--color-petrol-600)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel }: { children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? (pendingLabel ?? "Salvando…") : children}
    </button>
  );
}

/** Botão de formulário de ação única (excluir, confirmar). */
export function InlineAction({ action, children, variant = "ghost", size = "sm", confirm, hidden, className }: { action: FormAction; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; confirm?: string; hidden?: Record<string, string>; className?: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const toast = useToast();
  useEffect(() => {
    if (state.at && state.ok && state.message) toast({ title: state.message, tone: toastTone(state) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return (
    <form
      action={formAction}
      className={cn("inline", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size} pendingLabel="…">
        {children}
      </SubmitButton>
      {state.error ? <span className="ml-2 text-xs text-negative">{state.error}</span> : null}
    </form>
  );
}
