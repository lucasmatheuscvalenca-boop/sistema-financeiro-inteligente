"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { initialActionState } from "@/lib/action-state";
import { QUEUE_EVENT, readQueue, removeFromQueue } from "@/lib/offline-queue";
import type { FormAction } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Registra o service worker (telas guardadas e notificações), avisa quando está sem internet e,
 * quando a conexão volta, envia os gastos anotados offline.
 */
export function OfflineSupport({ syncAction }: { syncAction: FormAction }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const toast = useToast();
  const sending = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const flush = async () => {
      const queue = readQueue();
      if (!navigator.onLine || !queue.length || sending.current) return;
      sending.current = true;
      try {
        const fd = new FormData();
        fd.set("entries", JSON.stringify(queue));
        const r = await syncAction(initialActionState, fd);
        const done = ((r.data as { done?: string[] } | undefined)?.done ?? []).filter(Boolean);
        if (done.length) {
          removeFromQueue(done);
          toast({ title: done.length === 1 ? "O gasto anotado sem internet foi registrado." : `${done.length} gastos anotados sem internet foram registrados.`, tone: "positive" });
        }
      } catch {
        // tenta de novo na próxima vez que a conexão voltar
      } finally {
        sending.current = false;
      }
    };
    flush();
    window.addEventListener("online", flush);
    window.addEventListener(QUEUE_EVENT, flush);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(QUEUE_EVENT, flush);
    };
  }, [syncAction, toast]);

  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-medium text-white">
      <WifiOff className="size-4" aria-hidden /> Sem internet: você está vendo a última versão salva.
      <Link href="/offline" className="underline">
        Anotar um gasto
      </Link>
    </div>
  );
}
