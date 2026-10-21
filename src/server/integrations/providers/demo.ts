import { addDays, todayInTimeZone, type ISODate } from "@/domain/dates";
import type { BankDataProvider, ProviderAccount, ProviderConnection, ProviderTransaction } from "../provider";
import { ProviderError } from "../provider";
import { randomToken } from "../../security/crypto";

/**
 * CONECTOR DE DEMONSTRAÇÃO — dados 100% fictícios de um "Banco Demonstração (fictício)".
 * Serve para testar fluxos de consentimento, sincronização, deduplicação e falhas sem
 * acessar nenhum banco real. Tudo que ele gera é gravado com origem "demo".
 */
export const DEMO_INSTITUTION = "Banco Demonstração (fictício)";

const MERCHANTS: Array<[string, number]> = [
  ["Supermercado Exemplo", -28750],
  ["Padaria Fictícia", -1890],
  ["Posto Combustível Demo", -21000],
  ["Farmácia Modelo", -6420],
  ["Restaurante Imaginário", -9800],
  ["Aplicativo de Transporte Demo", -3250],
  ["Streaming Exemplo", -3990],
  ["Conta de Energia Demo", -18900],
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class DemoProvider implements BankDataProvider {
  readonly id = "demo";
  readonly label = "Conector de demonstração";
  readonly isDemo = true;
  /** Referências que falharão na próxima chamada (para testar tratamento de falhas). */
  static failNext = new Map<string, "unavailable" | "consent_expired">();

  constructor(private readonly today: () => ISODate = () => todayInTimeZone()) {}

  isConfigured(): boolean {
    return true;
  }

  async connect(): Promise<ProviderConnection> {
    return {
      externalRef: `demo_${randomToken(9)}`,
      institutionName: DEMO_INSTITUTION,
      consent: {
        scopes: ["accounts:read", "balances:read", "transactions:read", "credit_cards:read"],
        purpose: "Demonstração: testar sincronização de contas e cartões com dados fictícios.",
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
        providerConsentId: null,
      },
    };
  }

  private maybeFail(ref: string) {
    const failure = DemoProvider.failNext.get(ref);
    if (failure) {
      DemoProvider.failNext.delete(ref);
      throw new ProviderError(
        failure === "consent_expired" ? "O consentimento expirou (simulação)." : "Instituição indisponível no momento (simulação).",
        failure,
      );
    }
  }

  async fetchAccounts(ref: string): Promise<ProviderAccount[]> {
    this.maybeFail(ref);
    const seed = hash(ref);
    return [
      { externalId: `${ref}_cc`, name: "Conta Corrente Demo", type: "checking", balanceCents: 350000 + (seed % 200000) },
      { externalId: `${ref}_card`, name: "Cartão Demo", type: "credit_card", balanceCents: 0, creditLimitCents: 500000, closingDay: 25, dueDay: 5 },
    ];
  }

  async fetchTransactions(ref: string, accountExternalId: string, since: ISODate): Promise<ProviderTransaction[]> {
    this.maybeFail(ref);
    const today = this.today();
    const seed = hash(ref);
    const out: ProviderTransaction[] = [];
    const isCard = accountExternalId.endsWith("_card");
    for (let d = 0; d < 60; d++) {
      const date = addDays(today, -d);
      if (date < since) break;
      const h = hash(`${ref}|${date}`);
      if (!isCard && date.endsWith("-05")) {
        out.push({ externalId: `${accountExternalId}_${date}_sal`, accountExternalId, date, description: "Salário Empresa Fictícia", amountCents: 650000 });
      }
      if (h % 3 === 0) {
        const [name, amount] = MERCHANTS[(h + seed) % MERCHANTS.length]!;
        const isCardTx = (h >> 3) % 2 === 0;
        if (isCardTx === isCard) {
          out.push({ externalId: `${accountExternalId}_${date}_${h % 997}`, accountExternalId, date, description: name, amountCents: amount });
        }
      }
    }
    return out;
  }

  async revoke(): Promise<void> {
    // Nada a fazer no fornecedor fictício.
  }
}
