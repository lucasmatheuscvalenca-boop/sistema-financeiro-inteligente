import type { ISODate } from "../dates";
import type { Cents } from "../money";

/** Linha normalizada vinda de arquivo ou conector. Valor com sinal: negativo = saída. */
export interface ImportedRow {
  date: ISODate;
  description: string;
  amountCents: Cents;
  /** Identificador do banco (FITID no OFX, id do fornecedor no conector). */
  externalId?: string | null;
  rawIndex: number;
}

export interface ParseResult {
  rows: ImportedRow[];
  errors: Array<{ line: number; message: string }>;
  meta: Record<string, string | undefined>;
}
