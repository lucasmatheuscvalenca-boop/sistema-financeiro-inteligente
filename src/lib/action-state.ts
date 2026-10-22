export interface ActionState {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
  /** Muda a cada envio, para componentes reagirem ao resultado. */
  at?: number;
}

export const initialActionState: ActionState = { ok: false };
