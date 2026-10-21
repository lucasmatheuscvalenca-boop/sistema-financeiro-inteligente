/**
 * Contrato de um fornecedor de dados bancários (agregador de Open Finance).
 * Trocar de fornecedor = escrever outra implementação desta interface.
 * O app NUNCA recebe nem guarda senha bancária: a autenticação acontece no fluxo do
 * fornecedor, e aqui só circula o identificador da conexão (cifrado no banco).
 */
export interface ProviderConsent {
  scopes: string[];
  purpose: string;
  expiresAt: Date | null;
  providerConsentId: string | null;
}

export interface ProviderConnection {
  /** Identificador da conexão no fornecedor (ex.: itemId da Pluggy). */
  externalRef: string;
  institutionName: string;
  consent: ProviderConsent;
}

export interface ProviderAccount {
  externalId: string;
  name: string;
  type: "checking" | "savings" | "credit_card" | "investment";
  balanceCents: number;
  /** Para cartões: limite e dias do ciclo, quando o fornecedor informar. */
  creditLimitCents?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
}

export interface ProviderTransaction {
  externalId: string;
  accountExternalId: string;
  date: string;
  description: string;
  /** Com sinal, do ponto de vista da conta: negativo = saída (ou compra no cartão). */
  amountCents: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "consent_expired" | "unavailable" | "not_configured" | "unknown",
  ) {
    super(message);
  }
}

export interface BankDataProvider {
  readonly id: string;
  readonly label: string;
  /** Conector de demonstração: dados fictícios, sempre sinalizados na interface. */
  readonly isDemo: boolean;
  isConfigured(): boolean;
  /**
   * Conclui uma conexão. No conector real, `params.itemId` vem do widget do fornecedor
   * após o usuário autorizar no ambiente do banco.
   */
  connect(params: { userId: string; itemId?: string; institution?: string }): Promise<ProviderConnection>;
  fetchAccounts(externalRef: string): Promise<ProviderAccount[]>;
  fetchTransactions(externalRef: string, accountExternalId: string, since: string): Promise<ProviderTransaction[]>;
  revoke(externalRef: string): Promise<void>;
}
