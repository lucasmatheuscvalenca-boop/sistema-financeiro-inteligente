import type { ISODate } from "../dates";
import type { Cents } from "../money";

/** Parcela informada no extrato ("Parcela 2/10", "02/10" ou coluna própria). */
export interface InstallmentInfo {
  number: number;
  of: number;
}

/** Linha normalizada vinda de arquivo ou conector. Valor com sinal: negativo = saída. */
export interface ImportedRow {
  date: ISODate;
  description: string;
  amountCents: Cents;
  /** Identificador do banco (FITID no OFX, id do fornecedor no conector). */
  externalId?: string | null;
  rawIndex: number;
  /** Saldo da conta depois desta linha, quando o extrato traz a coluna de saldo. */
  balanceCents?: Cents | null;
  installment?: InstallmentInfo | null;
  /** O próprio arquivo indica transferência (TRNTYPE XFER no OFX). */
  transferHint?: boolean;
}

export interface ParseResult {
  rows: ImportedRow[];
  errors: Array<{ line: number; message: string }>;
  /** Linhas que não são lançamentos (saldo do dia, valor zero), puladas de propósito. */
  ignored?: Array<{ line: number; message: string }>;
  meta: Record<string, string | undefined>;
}
