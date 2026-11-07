/**
 * Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central): chave, valor, nome e cidade
 * de quem recebe. Quem paga cola no app do banco e confere antes de pagar.
 */

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nome e cidade em maiúsculas, sem acento, no tamanho máximo do padrão. */
function plain(v: string, max: number): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export interface PixInput {
  key: string;
  name: string;
  city: string;
  /** Em centavos; sem valor, quem paga digita. */
  amountCents?: number | null;
  description?: string | null;
  /** Identificador (até 25 letras e números); "***" quando não houver. */
  txid?: string | null;
}

export function pixCopyPaste(input: PixInput): string {
  const key = input.key.trim();
  if (!key) throw new Error("Informe a chave Pix");
  const description = input.description ? plain(input.description, 40) : "";
  const account = field("00", "br.gov.bcb.pix") + field("01", key) + (description ? field("02", description) : "");
  const txid = (input.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const amount = input.amountCents && input.amountCents > 0 ? field("54", (input.amountCents / 100).toFixed(2)) : "";
  const body =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    amount +
    field("58", "BR") +
    field("59", plain(input.name, 25) || "RECEBEDOR") +
    field("60", plain(input.city, 15) || "BRASIL") +
    field("62", field("05", txid)) +
    "6304";
  return body + crc16(body);
}
