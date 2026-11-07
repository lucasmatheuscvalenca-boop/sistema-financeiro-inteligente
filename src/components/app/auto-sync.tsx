"use client";

import { startTransition, useEffect } from "react";

const KEY = "mb_autosync_at";
const EVERY_MS = 30 * 60 * 1000;

/**
 * Ao abrir o app, pede ao servidor que atualize os bancos parados. Roda no máximo uma vez a cada
 * 30 minutos por navegador e não bloqueia nada. Se entrou lançamento novo, a própria ação revalida
 * (revalidatePath) e a resposta já traz a tela atualizada: não há uma segunda recarga aqui.
 */
export function AutoSync({ action }: { action: () => Promise<{ synced: number; imported: number }> }) {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < EVERY_MS) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Sem armazenamento (modo privado): tenta mesmo assim.
    }
    // Numa transição, como a documentação do Next recomenda para ações chamadas no useEffect: a
    // interface atualizada que volta com a resposta entra sem travar a tela.
    startTransition(async () => {
      try {
        await action();
      } catch {
        // Silencioso: o erro fica registrado na conexão.
      }
    });
  }, [action]);
  return null;
}
