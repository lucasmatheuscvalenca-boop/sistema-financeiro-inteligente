"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "nexo_autosync_at";
const EVERY_MS = 30 * 60 * 1000;

/**
 * Ao abrir o app, pede ao servidor que atualize os bancos parados. Roda no máximo uma vez a cada
 * 30 minutos por navegador e não bloqueia nada: se entrou lançamento novo, a tela recarrega.
 */
export function AutoSync({ action }: { action: () => Promise<{ synced: number; imported: number }> }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < EVERY_MS) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Sem armazenamento (modo privado): tenta mesmo assim.
    }
    let cancelled = false;
    action()
      .then((r) => {
        if (!cancelled && r.imported > 0) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [action, router]);
  return null;
}
