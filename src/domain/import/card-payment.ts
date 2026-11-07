import { normalizeDescription } from "./dedupe";

/** Palavras que identificam um cartão ou uma conta pelo nome (sem as genéricas, como "cartão" e "conta"). */
export function nameWords(s: string): string[] {
  return normalizeDescription(s)
    .split(" ")
    .filter((w) => w.length > 2 && !["cartao", "credito", "card", "conta", "corrente", "banco"].includes(w));
}

export interface PayableCard {
  id: string;
  name: string;
  /** Total da fatura fechada que um pagamento nesta data quitaria, quando conhecido. */
  closedInvoiceCents?: number | null;
}

/**
 * Cartão pago por um pagamento de fatura. Primeiro o citado na descrição ("PAGAMENTO FATURA
 * NUBANK"); entre os possíveis, o que tem a fatura fechada no mesmo valor do pagamento. Sem
 * nenhuma pista, o primeiro da lista (quem chama põe antes os mais prováveis, como os do mesmo banco).
 */
export function guessCard(description: string, amountCents: number, cards: readonly PayableCard[]): string | null {
  if (cards.length === 0) return null;
  const desc = new Set(nameWords(description));
  const named = cards.filter((c) => nameWords(c.name).some((w) => desc.has(w)));
  const pool = named.length ? named : cards;
  const amount = Math.abs(amountCents);
  const sameValue = pool.find((c) => !!c.closedInvoiceCents && c.closedInvoiceCents === amount);
  return (sameValue ?? pool[0]!).id;
}

/**
 * Descrição com cara de transferência entre contas (Pix, TED, DOC, "transferência", aplicação,
 * resgate). Usada como confirmação ao juntar as duas pontas de uma transferência entre bancos.
 */
export function looksLikeTransfer(description: string): boolean {
  const d = normalizeDescription(description);
  return /\b(pix|ted|doc|transf|transferencia|transferido|transferida|aplicacao|resgate|mesma titularidade)\b/.test(d);
}
