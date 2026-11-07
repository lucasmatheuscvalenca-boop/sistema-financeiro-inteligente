/**
 * Célula de texto num CSV para Excel e Planilhas Google. Texto que começa com = + - @ (ou tabulação
 * e retorno) ganha um apóstrofo na frente: sem isso, uma descrição vinda do banco ou de um extrato
 * como "=HYPERLINK(...)" viraria fórmula ao abrir o arquivo. Aspas quando a célula precisa.
 */
export function csvTextCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Valor em reais com vírgula decimal ("-45,90"): número gerado aqui, vai como está para a planilha somar. */
export function csvMoneyCell(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
