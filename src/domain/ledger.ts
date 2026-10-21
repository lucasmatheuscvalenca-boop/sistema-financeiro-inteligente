import type { ISODate, MonthKey } from "./dates";
import { monthKey } from "./dates";
import { assertCents, type Cents } from "./money";

/**
 * Regras contábeis centrais:
 * - income/expense alteram o resultado do mês; transfer e card_payment NÃO.
 * - Uma compra no cartão (expense com cardId) conta como despesa na data da compra/parcela,
 *   mas não mexe no saldo de conta. O pagamento da fatura (card_payment) tira dinheiro da
 *   conta, mas não é despesa. Assim a mesma compra nunca é contada duas vezes.
 * - refund (estorno) reduz a despesa da categoria e devolve o valor para conta ou fatura.
 * - status "realized" já aconteceu; "scheduled" é compromisso/recebimento confirmado futuro;
 *   "estimated" é estimativa (ex.: comissão esperada) e nunca entra no saldo disponível.
 */
export type TxKind = "income" | "expense" | "refund" | "transfer" | "card_payment";
export type TxStatus = "realized" | "scheduled" | "estimated";

export interface LedgerTx {
  id: string;
  kind: TxKind;
  status: TxStatus;
  amountCents: Cents;
  date: ISODate;
  accountId?: string | null;
  toAccountId?: string | null;
  cardId?: string | null;
  invoiceId?: string | null;
  categoryId?: string | null;
  essential?: boolean | null;
}

export interface LedgerAccount {
  id: string;
  initialBalanceCents: Cents;
}

export class LedgerError extends Error {}

/** Valida a forma de uma transação de acordo com o tipo. */
export function validateLedgerTx(tx: Omit<LedgerTx, "id">): void {
  assertCents(tx.amountCents, "valor");
  if (tx.amountCents <= 0) throw new LedgerError("O valor precisa ser maior que zero");
  switch (tx.kind) {
    case "income":
      if (!tx.accountId) throw new LedgerError("Receitas precisam de uma conta de destino");
      if (tx.cardId) throw new LedgerError("Receita não pode ser lançada em cartão; use estorno");
      break;
    case "expense":
      if (!tx.accountId === !tx.cardId) throw new LedgerError("Despesa precisa de uma conta OU um cartão");
      break;
    case "refund":
      if (!tx.accountId === !tx.cardId) throw new LedgerError("Estorno precisa de uma conta OU um cartão");
      break;
    case "transfer":
      if (!tx.accountId || !tx.toAccountId) throw new LedgerError("Transferência precisa de conta de origem e destino");
      if (tx.accountId === tx.toAccountId) throw new LedgerError("Origem e destino precisam ser contas diferentes");
      if (tx.cardId) throw new LedgerError("Transferência não usa cartão");
      break;
    case "card_payment":
      if (!tx.accountId || !tx.cardId) throw new LedgerError("Pagamento de fatura precisa da conta pagadora e do cartão");
      break;
  }
}

/** Efeito de uma transação no saldo de cada conta (cartões não são contas). */
export function accountEffects(tx: LedgerTx): Array<{ accountId: string; deltaCents: Cents }> {
  switch (tx.kind) {
    case "income":
      return tx.accountId ? [{ accountId: tx.accountId, deltaCents: tx.amountCents }] : [];
    case "expense":
      return tx.accountId && !tx.cardId ? [{ accountId: tx.accountId, deltaCents: -tx.amountCents }] : [];
    case "refund":
      return tx.accountId && !tx.cardId ? [{ accountId: tx.accountId, deltaCents: tx.amountCents }] : [];
    case "transfer":
      return tx.accountId && tx.toAccountId
        ? [
            { accountId: tx.accountId, deltaCents: -tx.amountCents },
            { accountId: tx.toAccountId, deltaCents: tx.amountCents },
          ]
        : [];
    case "card_payment":
      return tx.accountId ? [{ accountId: tx.accountId, deltaCents: -tx.amountCents }] : [];
  }
}

export function accountBalances(
  accounts: readonly LedgerAccount[],
  txs: readonly LedgerTx[],
  options: { asOf?: ISODate; statuses?: readonly TxStatus[] } = {},
): Map<string, Cents> {
  const statuses = options.statuses ?? ["realized"];
  const balances = new Map<string, Cents>(accounts.map((a) => [a.id, a.initialBalanceCents]));
  for (const tx of txs) {
    if (!statuses.includes(tx.status)) continue;
    if (options.asOf && tx.date > options.asOf) continue;
    for (const { accountId, deltaCents } of accountEffects(tx)) {
      if (balances.has(accountId)) balances.set(accountId, balances.get(accountId)! + deltaCents);
    }
  }
  return balances;
}

/** Sinal da transação no resultado (receitas - despesas). Transferências e pagamentos de fatura = 0. */
export function resultSign(kind: TxKind): -1 | 0 | 1 {
  switch (kind) {
    case "income":
      return 1;
    case "expense":
      return -1;
    case "refund":
      return 1;
    default:
      return 0;
  }
}

export interface PeriodTotals {
  incomeCents: Cents;
  /** Despesas líquidas de estornos. */
  expenseCents: Cents;
  netCents: Cents;
}

export interface MonthTotals {
  month: MonthKey;
  realized: PeriodTotals;
  scheduled: PeriodTotals;
  estimated: PeriodTotals;
}

function emptyTotals(): PeriodTotals {
  return { incomeCents: 0, expenseCents: 0, netCents: 0 };
}

export function addToTotals(totals: PeriodTotals, tx: LedgerTx): void {
  if (tx.kind === "income") totals.incomeCents += tx.amountCents;
  else if (tx.kind === "expense") totals.expenseCents += tx.amountCents;
  else if (tx.kind === "refund") totals.expenseCents -= tx.amountCents;
  totals.netCents = totals.incomeCents - totals.expenseCents;
}

export function monthTotals(txs: readonly LedgerTx[], month: MonthKey): MonthTotals {
  const result: MonthTotals = { month, realized: emptyTotals(), scheduled: emptyTotals(), estimated: emptyTotals() };
  for (const tx of txs) {
    if (monthKey(tx.date) !== month) continue;
    addToTotals(result[tx.status], tx);
  }
  return result;
}

/** Despesa líquida por categoria (despesas - estornos) para um conjunto de transações. */
export function expensesByCategory(txs: readonly LedgerTx[], statuses: readonly TxStatus[] = ["realized"]): Map<string, Cents> {
  const map = new Map<string, Cents>();
  for (const tx of txs) {
    if (!statuses.includes(tx.status)) continue;
    if (tx.kind !== "expense" && tx.kind !== "refund") continue;
    const key = tx.categoryId ?? "__sem_categoria__";
    const delta = tx.kind === "expense" ? tx.amountCents : -tx.amountCents;
    map.set(key, (map.get(key) ?? 0) + delta);
  }
  return map;
}

export interface InvoiceTotals {
  chargesCents: Cents;
  refundsCents: Cents;
  paymentsCents: Cents;
  /** Total devido = compras - estornos. */
  totalCents: Cents;
  outstandingCents: Cents;
}

/** Totais de uma fatura a partir das transações vinculadas a ela. */
export function invoiceTotals(txs: readonly LedgerTx[]): InvoiceTotals {
  let charges = 0;
  let refunds = 0;
  let payments = 0;
  for (const tx of txs) {
    if (tx.status === "estimated") continue;
    if (tx.kind === "expense" && tx.cardId) charges += tx.amountCents;
    else if (tx.kind === "refund" && tx.cardId) refunds += tx.amountCents;
    else if (tx.kind === "card_payment" && tx.status === "realized") payments += tx.amountCents;
  }
  const total = charges - refunds;
  return {
    chargesCents: charges,
    refundsCents: refunds,
    paymentsCents: payments,
    totalCents: total,
    outstandingCents: Math.max(0, total - payments),
  };
}
