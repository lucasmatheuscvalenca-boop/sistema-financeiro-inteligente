/**
 * Gastos anotados sem internet: ficam no próprio aparelho (localStorage) até a conexão voltar, e
 * cada um tem um id para não ser gravado duas vezes. Só roda no navegador.
 */
export interface OfflineEntry {
  id: string;
  amount: string;
  description: string;
  date: string;
}

const KEY = "mb_fila_offline";
export const QUEUE_EVENT = "mb-fila-offline";

export function readQueue(): OfflineEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as OfflineEntry[]).filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

function write(list: OfflineEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    // armazenamento indisponível (aba anônima): nada a fazer
  }
}

export function addToQueue(e: Omit<OfflineEntry, "id">): OfflineEntry {
  const entry = { ...e, id: crypto.randomUUID() };
  write([...readQueue(), entry]);
  return entry;
}

export function removeFromQueue(ids: readonly string[]) {
  write(readQueue().filter((e) => !ids.includes(e.id)));
}

/** Ao sair da conta: apaga as telas guardadas no aparelho (os gastos ainda não enviados ficam). */
export async function clearOfflinePages() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "limpar" });
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("mb-paginas-")).map((k) => caches.delete(k)));
  } catch {
    // sem service worker ou sem Cache Storage
  }
}
