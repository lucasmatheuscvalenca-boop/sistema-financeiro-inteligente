"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { initialActionState } from "@/lib/action-state";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type State = "checking" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Liga as notificações neste aparelho: registra o service worker, pede permissão e inscreve no servidor. */
export function PushSetup({ publicKey, subscribe, unsubscribe, test }: { publicKey: string; subscribe: FormAction; unsubscribe: FormAction; test: () => Promise<{ ok: boolean; message?: string; error?: string }> }) {
  const [state, setState] = useState<State>("checking");
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-browser" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const fd = new FormData();
        fd.set("subscription", JSON.stringify(sub.toJSON()));
        const r = await subscribe(initialActionState, fd);
        if (!r.ok) throw new Error(r.error ?? "falha");
        setState("on");
        toast({ title: r.message ?? "Notificações ativadas neste aparelho.", tone: "positive" });
      } catch {
        toast({ title: "Não foi possível ativar as notificações neste aparelho.", tone: "negative" });
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const fd = new FormData();
        fd.set("endpoint", sub.endpoint);
        await unsubscribe(initialActionState, fd);
        await sub.unsubscribe();
      }
      setState("off");
    });

  const sendTest = () =>
    start(async () => {
      const r = await test();
      toast({ title: r.ok ? (r.message ?? "Enviada.") : (r.error ?? "Não foi possível enviar."), tone: r.ok ? "positive" : "negative" });
    });

  if (state === "checking") return <p className="text-sm text-muted">Verificando este aparelho…</p>;
  if (state === "ios-browser")
    return (
      <p className="text-sm text-muted">
        No iPhone e no iPad, as notificações só funcionam com o Meu Banqueiro na Tela de Início: no Safari, toque em Compartilhar › <strong className="text-ink">Adicionar à Tela de Início</strong>, abra o app por lá e volte aqui.
      </p>
    );
  if (state === "unsupported") return <p className="text-sm text-muted">Este navegador não recebe notificações. No celular, use o Chrome (Android) ou o app instalado na Tela de Início (iPhone).</p>;
  if (state === "denied") return <p className="text-sm text-muted">As notificações estão bloqueadas para o Meu Banqueiro neste navegador. Libere nas configurações do site (o cadeado ao lado do endereço) e recarregue a página.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <span role="status" className="mr-2 flex items-center gap-1.5 text-sm font-medium text-positive">
            <Bell className="size-4" /> Ativas neste aparelho
          </span>
          <button type="button" onClick={sendTest} disabled={pending} className={buttonClass("secondary", "sm")}>
            <Send className="size-3.5" /> Enviar teste
          </button>
          <button type="button" onClick={disable} disabled={pending} className={buttonClass("ghost", "sm")}>
            <BellOff className="size-3.5" /> Desligar neste aparelho
          </button>
        </>
      ) : (
        <button type="button" onClick={enable} disabled={pending} className={buttonClass("petrol")}>
          <Bell className="size-4" /> {pending ? "Ativando…" : "Ativar notificações neste aparelho"}
        </button>
      )}
    </div>
  );
}
