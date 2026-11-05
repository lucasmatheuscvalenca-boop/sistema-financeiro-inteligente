import { parseMoney } from "@/domain/money";
import type { BankDataProvider, ProviderAccount, ProviderConnection, ProviderTransaction } from "../provider";
import { ProviderError } from "../provider";

/**
 * Adaptador Pluggy no plano gratuito (Meu Pluggy, conector 200).
 *
 * O que vale aqui foi confirmado por quem usa a API com dados reais no plano pessoal:
 * - `POST /auth` → apiKey (2 h) no cabeçalho `X-API-KEY`; `POST /connect_token` → token do widget (30 min).
 * - `GET /items/{id}` e `GET /accounts?itemId=` funcionam; `GET /items` (listar) não existe no plano pessoal.
 * - Transações só em `GET /v2/transactions?accountId=&dateFrom=&dateTo=`, paginadas pelo `next`
 *   devolvido (uma query string pronta). `page`, `pageSize`, `from` e `to` são rejeitados.
 * - Sinal: na conta, valor negativo é saída. No cartão, valor positivo é compra e negativo é pagamento/estorno.
 * - Todo item vem com `connector.id === 200` ("MeuPluggy"); o banco de verdade aparece nas contas
 *   (`marketingName`, `name` ou o código COMPE em `bankData.transferNumber`).
 * - Consentimento vencido: o item fica `LOGIN_ERROR`/`OUTDATED`; a pessoa reconecta no Meu Pluggy.
 */
const BASE_URL = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai";

/** Conector do Meu Pluggy: único disponível no plano gratuito. */
export const MEU_PLUGGY_CONNECTOR_ID = 200;

type Fetch = typeof fetch;

/** Código COMPE (prefixo de `bankData.transferNumber`) → nome do banco. */
const COMPE: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "070": "BRB",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "380": "PicPay",
  "389": "Mercantil",
  "403": "Cora",
  "422": "Safra",
  "461": "Asaas",
  "623": "Pan",
  "655": "Neon",
  "735": "Neon",
  "748": "Sicredi",
  "756": "Sicoob",
};

interface PluggyAccount {
  id: string;
  name: string;
  marketingName?: string | null;
  type: string;
  subtype?: string;
  balance: number;
  bankData?: { transferNumber?: string | null } | null;
  creditData?: { creditLimit?: number | null; balanceCloseDate?: string | null; balanceDueDate?: string | null; brand?: string | null } | null;
}

interface PluggyTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string | null;
}

/** Deduz o nome do banco a partir das contas de um item (todo item do Meu Pluggy se chama "MeuPluggy"). */
export function institutionFromAccounts(accounts: PluggyAccount[]): string | null {
  for (const a of accounts) {
    const compe = a.bankData?.transferNumber?.match(/^(\d{3})\b/)?.[1];
    if (compe && COMPE[compe]) return COMPE[compe]!;
  }
  const named = accounts.find((a) => a.marketingName?.trim());
  return named?.marketingName?.trim() ?? null;
}

export class PluggyProvider implements BankDataProvider {
  readonly id = "pluggy";
  readonly label = "Open Finance (Meu Pluggy)";
  readonly isDemo = false;
  private apiKey: { value: string; expiresAt: number } | null = null;
  private accountKinds = new Map<string, "card" | "bank">();
  /** Intervalo entre consultas enquanto a Pluggy atualiza o item (testes usam 0). */
  pollIntervalMs = 2000;

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
    if (!res.ok) throw new ProviderError("A Pluggy não aceitou o Client ID e o Client Secret informados", "auth");
    const body = (await res.json()) as { apiKey?: string };
    if (!body.apiKey) throw new ProviderError("Resposta de autenticação inválida", "auth");
    // A chave vale 2 h; renovamos com folga.
    this.apiKey = { value: body.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
    return body.apiKey;
  }

  /** Confere as chaves na Pluggy sem gravar nada. */
  async validateCredentials(): Promise<void> {
    this.apiKey = null;
    await this.key();
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.http(`${BASE_URL}${path}`, { headers: { "X-API-KEY": await this.key() } });
    if (res.status === 401 || res.status === 403) throw new ProviderError("Acesso negado pelo fornecedor", "auth");
    if (!res.ok) {
      // A Pluggy explica recusas no corpo ("property X should not exist"); mostrar ajuda a diagnosticar.
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string | string[] };
        detail = Array.isArray(body.message) ? body.message.join("; ") : (body.message ?? "");
      } catch {
        detail = "";
      }
      const where = path.split("?")[0];
      throw new ProviderError(res.status < 500 ? `A Pluggy recusou a consulta ${where} (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}` : `Fornecedor indisponível (${res.status})`, "unavailable");
    }
    return (await res.json()) as T;
  }

  /** Token de curta duração para abrir o widget Pluggy Connect no navegador. */
  async createConnectToken(opts: { itemId?: string; clientUserId?: string } = {}): Promise<string> {
    const res = await this.http(`${BASE_URL}/connect_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": await this.key() },
      body: JSON.stringify({ ...(opts.itemId ? { itemId: opts.itemId } : {}), ...(opts.clientUserId ? { clientUserId: opts.clientUserId } : {}) }),
    });
    if (!res.ok) throw new ProviderError("Não foi possível iniciar a conexão", "unavailable");
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) throw new ProviderError("Resposta inválida do fornecedor", "unknown");
    return body.accessToken;
  }

  private async item(itemId: string) {
    const item = await this.get<{ id: string; connector?: { id?: number; name?: string }; status?: string; executionStatus?: string; consentExpiresAt?: string | null; lastUpdatedAt?: string | null }>(`/items/${encodeURIComponent(itemId)}`);
    if (item.status === "LOGIN_ERROR" || item.status === "OUTDATED" || item.executionStatus === "USER_AUTHORIZATION_PENDING") {
      throw new ProviderError("A autorização deste banco venceu. Reconecte o banco no Meu Pluggy e toque em Atualizar agora.", "consent_expired");
    }
    return item;
  }

  /**
   * Pede à Pluggy uma atualização do item (`PATCH /items/{id}`) e espera alguns segundos pela
   * conclusão. No Meu Pluggy os dados do banco chegam uma vez por dia; se o pedido for recusado,
   * seguimos com o que já existe. Sempre devolve de quando são os dados (`lastUpdatedAt`).
   */
  async refresh(itemId: string, opts: { request: boolean }): Promise<{ requested: boolean; bankUpdatedAt: Date | null }> {
    let requested = false;
    if (opts.request) {
      const res = await this.http(`${BASE_URL}/items/${encodeURIComponent(itemId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-API-KEY": await this.key() }, body: "{}" });
      requested = res.ok;
      if (requested) {
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, this.pollIntervalMs));
          const it = await this.item(itemId);
          const busy = it.status === "UPDATING" || it.executionStatus === "CREATED" || /_IN_PROGRESS$/.test(it.executionStatus ?? "");
          if (!busy) break;
        }
      }
    }
    const item = await this.item(itemId);
    return { requested, bankUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null };
  }

  async connect(params: { itemId?: string }): Promise<ProviderConnection> {
    if (!params.itemId) throw new ProviderError("A conexão precisa ser concluída na janela do Open Finance", "unknown");
    const item = await this.item(params.itemId);
    let institutionName = item.connector?.name ?? "Banco conectado";
    if (!item.connector?.id || item.connector.id === MEU_PLUGGY_CONNECTOR_ID) {
      const accounts = await this.get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(params.itemId)}`);
      institutionName = institutionFromAccounts(accounts.results ?? []) ?? "Banco (Meu Pluggy)";
    }
    return {
      externalRef: item.id,
      institutionName,
      consent: {
        scopes: ["accounts", "transactions", "credit_cards"],
        purpose: "Organizar e analisar suas finanças pessoais no NEXO.",
        expiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
        providerConsentId: null,
      },
    };
  }

  async fetchAccounts(itemId: string): Promise<ProviderAccount[]> {
    await this.item(itemId);
    const body = await this.get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    return (body.results ?? []).map((a) => {
      const isCredit = a.type === "CREDIT" || a.subtype === "CREDIT_CARD";
      this.accountKinds.set(a.id, isCredit ? "card" : "bank");
      const day = (iso?: string | null) => (iso ? Number(iso.slice(8, 10)) || null : null);
      // Nome legível: "Nubank · conta corrente", "Nubank · cartão gold" (o nome bruto costuma ser a razão social).
      const brand = a.marketingName?.trim() || "";
      const raw = (a.name ?? "").trim();
      const short = raw && raw.length <= 20 && raw.toLowerCase() !== brand.toLowerCase() ? raw : "";
      const kind = isCredit ? `cartão${short ? ` ${short}` : ""}` : a.subtype === "SAVINGS_ACCOUNT" ? "poupança" : "conta corrente";
      return {
        externalId: a.id,
        name: brand ? `${brand} · ${kind}` : raw || kind,
        type: isCredit ? "credit_card" : a.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking",
        balanceCents: parseMoney(a.balance ?? 0),
        creditLimitCents: a.creditData?.creditLimit != null ? parseMoney(a.creditData.creditLimit) : null,
        closingDay: day(a.creditData?.balanceCloseDate),
        dueDay: day(a.creditData?.balanceDueDate),
      };
    });
  }

  /**
   * Monta a consulta de uma página. O `next` da Pluggy já vem como query string completa
   * (ex.: `?accountId=…&after=…`): os parâmetros são mesclados, nunca repetidos, e `dateFrom`
   * continua indo em todas as páginas.
   */
  static transactionsPath(accountId: string, since: string, next: string | null): string {
    const params = new URLSearchParams(next ? next.replace(/^[^?]*\?/, "") : "");
    if (!params.has("accountId")) params.set("accountId", accountId);
    if (!params.has("dateFrom")) params.set("dateFrom", since);
    return `/v2/transactions?${params.toString()}`;
  }

  async fetchTransactions(_itemId: string, accountId: string, since: string): Promise<ProviderTransaction[]> {
    const isCard = this.accountKinds.get(accountId) === "card";
    const out: ProviderTransaction[] = [];
    let next: string | null = null;
    for (let page = 0; page < 100; page++) {
      const body: { results: PluggyTransaction[]; next?: string | null } = await this.get(PluggyProvider.transactionsPath(accountId, since, next));
      for (const t of body.results ?? []) {
        const abs = Math.abs(parseMoney(t.amount));
        // Conta: negativo é saída. Cartão: positivo é compra (saída), negativo é pagamento ou estorno.
        const outflow = isCard ? t.amount > 0 : t.amount < 0;
        out.push({ externalId: t.id, accountExternalId: accountId, date: t.date.slice(0, 10), description: t.description, amountCents: outflow ? -abs : abs, category: t.category ?? null });
      }
      next = body.next ?? null;
      if (!next) break;
    }
    return out;
  }

  async revoke(itemId: string): Promise<void> {
    const res = await this.http(`${BASE_URL}/items/${encodeURIComponent(itemId)}`, { method: "DELETE", headers: { "X-API-KEY": await this.key() } });
    if (!res.ok && res.status !== 404) throw new ProviderError("Não foi possível revogar no fornecedor", "unavailable");
  }
}
