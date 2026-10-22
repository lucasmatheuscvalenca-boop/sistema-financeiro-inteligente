/** "1 mês", "2 meses": escolhe a forma pela quantidade, sem "mês(es)". */
export function plural(n: number, one: string, many: string): string {
  // Decide pelo número exibido: 1,04 aparece como "1" e pede o singular.
  const shown = Number(n.toFixed(1));
  return `${formatDecimal(n)} ${Math.abs(shown) === 1 ? one : many}`;
}

/** Número com vírgula decimal e sem zeros sobrando ("2,9", "4,5", "3"). */
export function formatDecimal(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

/** "Cartão Nubank", sem repetir quando o nome já começa com "Cartão". */
export function cardLabel(name: string): string {
  return /^cart[aã]o\b/i.test(name.trim()) ? name : `Cartão ${name}`.trim();
}
