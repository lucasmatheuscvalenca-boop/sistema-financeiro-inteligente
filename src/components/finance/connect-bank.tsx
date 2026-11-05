"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Landmark, LoaderCircle } from "lucide-react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { FormAction } from "@/components/ui/form";

/** Janela oficial da Pluggy (Pluggy Connect), carregada só quando a pessoa toca no botão. */
const WIDGET_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.10.0/pluggy-connect.js";
/** No plano gratuito só existe o conector do Meu Pluggy: a janela abre direto nele. */
const MEU_PLUGGY_CONNECTOR_ID = 200;

interface PluggyConnectInstance {
  init(): void;
}
interface PluggyConnectOptions {
  connectToken: string;
  includeSandbox?: boolean;
  connectorIds?: number[];
  selectedConnectorId?: number;
  updateItem?: string;
  onSuccess?: (data: { item: { id: string } }) => void;
  onError?: (error: { message?: string }) => void;
  onClose?: () => void;
}
declare global {
  interface Window {
    PluggyConnect?: new (options: PluggyConnectOptions) => PluggyConnectInstance;
  }
}

function loadWidget(): Promise<void> {
  if (window.PluggyConnect) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("widget")));
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("widget"));
    document.head.appendChild(s);
  });
}

/**
 * "Conectar meus bancos": pede um token ao servidor, abre a janela da Pluggy (a pessoa escolhe
 * o banco e autoriza lá), e, quando a conexão nasce, grava e sincroniza no Meu Banqueiro. Com
 * `updateItemId`, reabre a mesma conexão para renovar a autorização.
 */
export function ConnectBank({
  tokenAction,
  connectAction,
  updateItemId,
  connectionId,
  children,
  variant = "primary",
  size = "lg",
  className,
}: {
  tokenAction: FormAction;
  connectAction: FormAction;
  updateItemId?: string;
  connectionId?: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "opening" | "saving">("idle");
  const [result, setResult] = useState<ActionState>(initialActionState);

  const open = () =>
    startTransition(async () => {
      setResult(initialActionState);
      setPhase("opening");
      const fd = new FormData();
      if (updateItemId) fd.set("itemId", updateItemId);
      const t = await tokenAction(initialActionState, fd);
      const token = (t.data as { accessToken?: string } | undefined)?.accessToken;
      if (!t.ok || !token) {
        setResult({ ...initialActionState, error: t.error ?? "Não foi possível iniciar a conexão." });
        setPhase("idle");
        return;
      }
      try {
        await loadWidget();
      } catch {
        setResult({ ...initialActionState, error: "A janela de conexão não carregou. Verifique sua internet e tente de novo." });
        setPhase("idle");
        return;
      }
      const Widget = window.PluggyConnect!;
      await new Promise<void>((resolve) => {
        const widget = new Widget({
          connectToken: token,
          includeSandbox: false,
          connectorIds: [MEU_PLUGGY_CONNECTOR_ID],
          selectedConnectorId: MEU_PLUGGY_CONNECTOR_ID,
          updateItem: updateItemId,
          onSuccess: ({ item }) => {
            setPhase("saving");
            const f = new FormData();
            f.set("provider", "pluggy");
            f.set("itemId", item.id);
            f.set("consent", "on");
            if (connectionId) f.set("connectionId", connectionId);
            void connectAction(initialActionState, f).then((r) => {
              setResult(r);
              setPhase("idle");
              router.refresh();
              resolve();
            });
          },
          onError: (e) => {
            setResult({ ...initialActionState, error: e?.message ? `O banco não concluiu a conexão: ${e.message}` : "O banco não concluiu a conexão. Tente de novo." });
            setPhase("idle");
            resolve();
          },
          onClose: () => {
            setPhase((p) => (p === "saving" ? p : "idle"));
            resolve();
          },
        });
        widget.init();
      });
    });

  const busy = pending || phase !== "idle";
  return (
    <div className={className}>
      <button type="button" onClick={open} disabled={busy} className={buttonClass(variant, size, "w-full sm:w-auto")}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Landmark className="size-4" />}
        {phase === "saving" ? "Gravando e sincronizando…" : phase === "opening" ? "Abrindo a conexão…" : (children ?? "Conectar meus bancos")}
      </button>
      {result.error ? (
        <Callout tone="negative" className="mt-3">
          {result.error}
        </Callout>
      ) : result.ok && result.message ? (
        <Callout tone="positive" className="mt-3">
          {result.message}
        </Callout>
      ) : null}
    </div>
  );
}
