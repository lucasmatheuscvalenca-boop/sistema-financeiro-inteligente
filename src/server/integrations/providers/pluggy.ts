import { parseMoney } from "@/domain/money";
import type { BankDataProvider, ProviderAccount, ProviderConnection, ProviderTransaction } from "../provider";
import { ProviderError } from "../provider";

/**
 * Adaptador Pluggy (agregador autorizado pelo Banco Central, segundo a própria empresa).
 *
 * ATENÇÃO: implementado a partir da documentação pública. Os endpoints de autenticação
 * (POST /auth -> apiKey de 2 h; POST /connect_token -> token de 30 min para o widget)
 * foram confirmados na documentação. Os endpoints /items, /accounts e /transactions seguem
 * a estrutura pública conhecida, mas NÃO foram validados com credenciais reais.
 * Fica desativado enquanto PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não forem configurados.
 */
const BASE_URL = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai";

type Fetch = typeof fetch;

export class PluggyProvider implements BankDataProvider {
  readonly id = "pluggy";
  readonly label = "Pluggy (Open Finance)";
  readonly isDemo = false;
  private apiKey: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId = process.env.PLUGGY_CLIENT_ID,
    private readonly clientSecret = process.env.PLUGGY_CLIENT_SECRET,
    private readonly http: Fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  private async key(): Promise<string> {
    if (!this.isConfigured()) throw new ProviderError("Integração Pluggy não configurada", "not_configured");
    if (this.apiKey && this.apiKey.expiresAt > Date.now()) return this.apiKey.value;
    const res = await this.http(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
    });
    if (!res.ok) throw new ProviderError("Falha na autenticação com a Pluggy", "auth");
    const body = (await res.json()) as { apiKey?: string };
    if (!body.apiKey) throw new ProviderError("Resposta de autenticação inválida", "auth");
    // A chave vale 2 h; renovamos com folga.
    this.apiKey = { value: body.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
    return body.apiKey;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.http(`${BASE_URL}${path}`, { headers: { "X-API-KEY": await this.key() } });
    if (res.status === 401 || res.status === 403) throw new ProviderError("Acesso negado pelo fornecedor", "auth");
    if (!res.ok) throw new ProviderError(`Fornecedor indisponível (${res.status})`, "unavailable");
    return (await res.json()) as T;
  }

  /** Token de curta duração para abrir o widget Pluggy Connect no navegador. */
  async createConnectToken(itemId?: string): Promise<string> {
    const res = await this.http(`${BASE_URL}/connect_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": await this.key() },
      body: JSON.stringify(itemId ? { itemId } : {}),
    });
    if (!res.ok) throw new ProviderError("Não foi possível iniciar a conexão", "unavailable");
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) throw new ProviderError("Resposta inválida do fornecedor", "unknown");
    return body.accessToken;
  }

  async connect(params: { itemId?: string }): Promise<ProviderConnection> {
    if (!params.itemId) throw new ProviderError("A conexão precisa ser concluída no widget do fornecedor", "unknown");
    const item = await this.get<{ id: string; connector?: { name?: string }; status?: string; consentExpiresAt?: string | null }>(`/items/${encodeURIComponent(params.itemId)}`);
    return {
      externalRef: item.id,
      institutionName: item.connector?.name ?? "Instituição conectada",
      consent: {
        scopes: ["accounts", "transactions", "credit_cards"],
        purpose: "Organizar e analisar suas finanças pessoais no Rumo.",
        expiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
        providerConsentId: null,
      },
    };
  }

  async fetchAccounts(itemId: string): Promise<ProviderAccount[]> {
    const body = await this.get<{
      results: Array<{
        id: string;
        name: string;
        type: string;
        subtype?: string;
        balance: number;
        creditData?: { creditLimit?: number | null; balanceCloseDate?: string | null; balanceDueDate?: string | null } | null;
      }>;
    }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    return body.results.map((a) => {
      const isCredit = a.type === "CREDIT" || a.subtype === "CREDIT_CARD";
      const day = (iso?: string | null) => (iso ? Number(iso.slice(8, 10)) || null : null);
      return {
        externalId: a.id,
        name: a.name,
        type: isCredit ? "credit_card" : a.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking",
        balanceCents: parseMoney(a.balance ?? 0),
        creditLimitCents: a.creditData?.creditLimit != null ? parseMoney(a.creditData.creditLimit) : null,
        closingDay: day(a.creditData?.balanceCloseDate),
        dueDay: day(a.creditData?.balanceDueDate),
      };
    });
  }

  async fetchTransactions(_itemId: string, accountId: string, since: string): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    for (let page = 1; page <= 20; page++) {
      const body = await this.get<{ results: Array<{ id: string; date: string; description: string; amount: number; type?: "DEBIT" | "CREDIT" }>; totalPages?: number }>(
        `/transactions?accountId=${encodeURIComponent(accountId)}&from=${since}&pageSize=500&page=${page}`,
      );
      for (const t of body.results) {
        const abs = Math.abs(parseMoney(t.amount));
        const negative = t.type ? t.type === "DEBIT" : t.amount < 0;
        out.push({ externalId: t.id, accountExternalId: accountId, date: t.date.slice(0, 10), description: t.description, amountCents: negative ? -abs : abs });
      }
      if (!body.totalPages || page >= body.totalPages) break;
    }
    return out;
  }

  async revoke(itemId: string): Promise<void> {
    const res = await this.http(`${BASE_URL}/items/${encodeURIComponent(itemId)}`, { method: "DELETE", headers: { "X-API-KEY": await this.key() } });
    if (!res.ok && res.status !== 404) throw new ProviderError("Não foi possível revogar no fornecedor", "unavailable");
  }
}
