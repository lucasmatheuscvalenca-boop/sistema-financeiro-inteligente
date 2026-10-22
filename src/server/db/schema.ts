import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Convenções:
 * - Valores monetários: bigint em centavos (modo number; seguro até ~90 trilhões de reais).
 * - Datas financeiras: `date` (sem fuso). Momentos: `timestamptz`.
 * - Toda tabela com dados de usuário tem `user_id` com ON DELETE CASCADE, para que a
 *   exclusão da conta apague os dados (direito de eliminação da LGPD).
 * - Nomes de colunas em snake_case (casing configurado no cliente e no drizzle-kit).
 */

const id = () => uuid().primaryKey().defaultRandom();
const cents = () => bigint({ mode: "number" });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const day = () => date({ mode: "string" });

// ─── Usuários, sessões e preferências ────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    name: text().notNull(),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token. O token em si só existe no cookie do usuário. */
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userAgent: text(),
    ipHash: text(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text().primaryKey(),
  attempts: integer().notNull().default(0),
  windowStart: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Catálogo fechado: exatamente seis linhas, semeadas na migração. */
export const mascots = pgTable(
  "mascots",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    title: text().notNull(),
    catchphrase: text().notNull(),
    sortOrder: integer().notNull(),
  },
  (t) => [check("mascots_official_ids", sql`${t.id} in ('lince','capivara','coruja','polvo','raposa','guardiao')`)],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Nulo até a escolha explícita no onboarding. Só aceita os seis ids oficiais (FK). */
    mascotId: text().references(() => mascots.id, { onDelete: "restrict" }),
    mascotSelectedAt: timestamp({ withTimezone: true }),
    theme: text().notNull().default("system"),
    currency: text().notNull().default("BRL"),
    locale: text().notNull().default("pt-BR"),
    timezone: text().notNull().default("America/Sao_Paulo"),
    /** Margem de segurança mantida no caixa. Nulo = automática (10% das despesas essenciais). */
    safetyMarginCents: cents(),
    reviewFrequency: text().notNull().default("weekly"),
    maxAlertsPerDay: integer().notNull().default(5),
    onboardingStep: text().notNull().default("welcome"),
    onboardingCompletedAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("prefs_theme", sql`${t.theme} in ('system','light','dark')`),
    check("prefs_review_frequency", sql`${t.reviewFrequency} in ('daily','weekly','monthly')`),
    check("prefs_max_alerts", sql`${t.maxAlertsPerDay} between 1 and 50`),
  ],
);

/** Histórico de escolhas de mascote (trocar não apaga nada). */
export const mascotSelections = pgTable(
  "mascot_selections",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mascotId: text()
      .notNull()
      .references(() => mascots.id, { onDelete: "restrict" }),
    selectedAt: createdAt(),
  },
  (t) => [index("mascot_selections_user_idx").on(t.userId)],
);

// ─── Perfil e briefing ───────────────────────────────────────────────────────

export const financialProfiles = pgTable("financial_profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  preferredName: text(),
  birthYear: integer(),
  ageRange: text(),
  country: text().notNull().default("BR"),
  currency: text().notNull().default("BRL"),
  employmentStatus: text(),
  incomeType: text(),
  incomeStability: text(),
  household: text(),
  dependents: integer(),
  hasDebts: boolean(),
  monthlyNetIncomeCents: cents(),
  incomeFrequency: text(),
  essentialExpensesCents: cents(),
  variableExpensesCents: cents(),
  desiredRetirementAge: integer(),
  desiredRetirementIncomeCents: cents(),
  updatedAt: updatedAt(),
});

/** Respostas brutas do briefing por etapa (salvas automaticamente). */
export const briefingSections = pgTable(
  "briefing_sections",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    section: text().notNull(),
    answers: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.section] }), check("briefing_section_key", sql`${t.section} in ('personal','financial','life')`)],
);

// ─── Contas, cartões, categorias ─────────────────────────────────────────────

export const bankConnections = pgTable(
  "bank_connections",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    institutionName: text().notNull(),
    /** Identificador da conexão no fornecedor, cifrado (AES-256-GCM). Nunca guarda senha bancária. */
    externalRefEncrypted: text(),
    isDemo: boolean().notNull().default(false),
    status: text().notNull().default("pending"),
    lastSyncAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bank_connections_user_idx").on(t.userId),
    check("bank_connections_status", sql`${t.status} in ('pending','active','syncing','error','expired','revoked')`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text().notNull(),
    /** spending: disponível para gastos; reserve: reserva de emergência; goals: dinheiro de metas; investment: longo prazo. */
    purpose: text().notNull().default("spending"),
    institution: text(),
    initialBalanceCents: cents().notNull().default(0),
    initialBalanceDate: day(),
    currency: text().notNull().default("BRL"),
    color: text(),
    source: text().notNull().default("manual"),
    bankConnectionId: uuid().references(() => bankConnections.id, { onDelete: "set null" }),
    externalId: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    check("accounts_type", sql`${t.type} in ('checking','savings','cash','wallet','investment','other')`),
    check("accounts_purpose", sql`${t.purpose} in ('spending','reserve','goals','investment')`),
    check("accounts_source", sql`${t.source} in ('manual','connector','demo')`),
  ],
);

export const creditCards = pgTable(
  "credit_cards",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    brand: text(),
    limitCents: cents().notNull(),
    closingDay: integer().notNull(),
    dueDay: integer().notNull(),
    defaultPaymentAccountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    color: text(),
    source: text().notNull().default("manual"),
    bankConnectionId: uuid().references(() => bankConnections.id, { onDelete: "set null" }),
    externalId: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("credit_cards_user_idx").on(t.userId),
    check("credit_cards_days", sql`${t.closingDay} between 1 and 31 and ${t.dueDay} between 1 and 31`),
    check("credit_cards_limit", sql`${t.limitCents} >= 0`),
  ],
);

export const cardInvoices = pgTable(
  "card_invoices",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid()
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    closingDate: day().notNull(),
    dueDate: day().notNull(),
    reference: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("card_invoices_card_closing_unique").on(t.cardId, t.closingDate), index("card_invoices_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text().notNull(),
    parentId: uuid().references((): AnyPgColumn => categories.id, { onDelete: "cascade" }),
    essential: boolean().notNull().default(false),
    color: text(),
    icon: text(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("categories_user_idx").on(t.userId), check("categories_kind", sql`${t.kind} in ('income','expense')`)],
);

// ─── Movimentações ───────────────────────────────────────────────────────────

export const recurrences = pgTable(
  "recurrences",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    /** Certeza das ocorrências futuras: scheduled (confirmada) ou estimated (estimativa). */
    certainty: text().notNull().default("scheduled"),
    amountCents: cents().notNull(),
    description: text().notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    accountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    cardId: uuid().references(() => creditCards.id, { onDelete: "cascade" }),
    frequency: text().notNull(),
    interval: integer().notNull().default(1),
    dayOfMonth: integer(),
    startDate: day().notNull(),
    endDate: day(),
    count: integer(),
    incomeType: text(),
    expenseNature: text(),
    essential: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("recurrences_user_idx").on(t.userId),
    check("recurrences_kind", sql`${t.kind} in ('income','expense','transfer')`),
    check("recurrences_certainty", sql`${t.certainty} in ('scheduled','estimated')`),
    check("recurrences_frequency", sql`${t.frequency} in ('weekly','biweekly','monthly','yearly')`),
    check("recurrences_amount", sql`${t.amountCents} > 0`),
  ],
);

export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text().notNull(),
    totalCents: cents().notNull(),
    count: integer().notNull(),
    firstDate: day().notNull(),
    cardId: uuid().references(() => creditCards.id, { onDelete: "cascade" }),
    accountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("installment_plans_user_idx").on(t.userId),
    check("installment_plans_count", sql`${t.count} between 1 and 120`),
    check("installment_plans_total", sql`${t.totalCents} > 0`),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text().notNull(),
    format: text().notNull(),
    accountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    cardId: uuid().references(() => creditCards.id, { onDelete: "set null" }),
    totalRows: integer().notNull().default(0),
    imported: integer().notNull().default(0),
    duplicates: integer().notNull().default(0),
    matched: integer().notNull().default(0),
    errors: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("import_batches_user_idx").on(t.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    status: text().notNull(),
    amountCents: cents().notNull(),
    date: day().notNull(),
    description: text().notNull(),
    notes: text(),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    accountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    cardId: uuid().references(() => creditCards.id, { onDelete: "cascade" }),
    invoiceId: uuid().references(() => cardInvoices.id, { onDelete: "set null" }),
    installmentPlanId: uuid().references(() => installmentPlans.id, { onDelete: "cascade" }),
    installmentNumber: integer(),
    installmentCount: integer(),
    recurrenceId: uuid().references(() => recurrences.id, { onDelete: "set null" }),
    occurrenceDate: day(),
    incomeType: text(),
    expenseNature: text(),
    essential: boolean(),
    source: text().notNull().default("manual"),
    externalId: text(),
    fingerprint: text(),
    importBatchId: uuid().references(() => importBatches.id, { onDelete: "set null" }),
    bankConnectionId: uuid().references(() => bankConnections.id, { onDelete: "set null" }),
    reconciledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_card_invoice_idx").on(t.cardId, t.invoiceId),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_account_external_unique").on(t.accountId, t.externalId).where(sql`${t.externalId} is not null and ${t.cardId} is null`),
    uniqueIndex("transactions_card_external_unique").on(t.cardId, t.externalId).where(sql`${t.externalId} is not null and ${t.cardId} is not null`),
    uniqueIndex("transactions_recurrence_occurrence_unique").on(t.recurrenceId, t.occurrenceDate).where(sql`${t.recurrenceId} is not null`),
    check("transactions_kind", sql`${t.kind} in ('income','expense','refund','transfer','card_payment')`),
    check("transactions_status", sql`${t.status} in ('realized','scheduled','estimated')`),
    check("transactions_amount_positive", sql`${t.amountCents} > 0`),
    check("transactions_source", sql`${t.source} in ('manual','import','connector','demo')`),
    // Regras de forma também no banco (defesa em profundidade contra dupla contagem):
    check(
      "transactions_shape",
      sql`(
        (${t.kind} = 'income' and ${t.accountId} is not null and ${t.cardId} is null and ${t.toAccountId} is null) or
        (${t.kind} in ('expense','refund') and ${t.toAccountId} is null and ((${t.accountId} is null) <> (${t.cardId} is null))) or
        (${t.kind} = 'transfer' and ${t.accountId} is not null and ${t.toAccountId} is not null and ${t.accountId} <> ${t.toAccountId} and ${t.cardId} is null) or
        (${t.kind} = 'card_payment' and ${t.accountId} is not null and ${t.cardId} is not null and ${t.toAccountId} is null)
      )`,
    ),
  ],
);

/** Histórico de alterações das movimentações (sem FK para sobreviver à exclusão do lançamento). */
export const transactionHistory = pgTable(
  "transaction_history",
  {
    id: id(),
    transactionId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text().notNull(),
    changes: jsonb().$type<Record<string, { from: unknown; to: unknown }>>().notNull().default({}),
    actorUserId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [index("transaction_history_tx_idx").on(t.transactionId), index("transaction_history_user_idx").on(t.userId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text().notNull(),
    limitCents: cents().notNull(),
    alertThresholdPct: integer().notNull().default(80),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("budgets_user_category_month_unique").on(t.userId, t.categoryId, t.month),
    check("budgets_month_format", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("budgets_limit", sql`${t.limitCents} >= 0`),
    check("budgets_threshold", sql`${t.alertThresholdPct} between 1 and 100`),
  ],
);

// ─── Metas, reserva, patrimônio, aposentadoria ───────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    kind: text().notNull().default("other"),
    targetCents: cents().notNull(),
    targetDate: day(),
    priority: integer().notNull().default(3),
    plannedMonthlyCents: cents(),
    contributionDay: integer().notNull().default(5),
    /** Rendimento anual hipotético em pontos-base (1250 = 12,5% a.a.). */
    expectedAnnualReturnBps: integer(),
    /** Conta onde o dinheiro da meta fica guardado. Nula = fica nas contas de gasto. */
    holdingAccountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    status: text().notNull().default("active"),
    color: text(),
    icon: text(),
    imageUrl: text(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    check("goals_status", sql`${t.status} in ('active','paused','completed','archived')`),
    check("goals_kind", sql`${t.kind} in ('travel','vehicle','home','wedding','education','independence','retirement','other')`),
    check("goals_target", sql`${t.targetCents} > 0`),
    check("goals_priority", sql`${t.priority} between 1 and 5`),
    check("goals_contribution_day", sql`${t.contributionDay} between 1 and 31`),
  ],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: id(),
    goalId: uuid()
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** Dono da meta. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Quem registrou o aporte (pode ser alguém com quem a meta foi compartilhada). */
    contributorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: text().notNull().default("deposit"),
    amountCents: cents().notNull(),
    date: day().notNull(),
    note: text(),
    sourceAccountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    transactionId: uuid().references(() => transactions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("goal_contributions_goal_idx").on(t.goalId),
    check("goal_contributions_kind", sql`${t.kind} in ('deposit','withdrawal','yield')`),
    check("goal_contributions_amount", sql`${t.amountCents} > 0`),
  ],
);

export const emergencyFundSettings = pgTable(
  "emergency_fund_settings",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    targetMonths: integer().notNull(),
    monthlyEssentialOverrideCents: cents(),
    desiredMonthsToComplete: integer().notNull().default(12),
    minimumMonths: integer().notNull().default(3),
    updatedAt: updatedAt(),
  },
  (t) => [check("emergency_target_months", sql`${t.targetMonths} between 1 and 36`)],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    category: text().notNull(),
    valueCents: cents().notNull(),
    provenance: text().notNull().default("informed"),
    valuedAt: day().notNull(),
    liquid: boolean().notNull().default(false),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assets_user_idx").on(t.userId),
    check("assets_category", sql`${t.category} in ('investment','real_estate','vehicle','retirement','receivable','other')`),
    check("assets_provenance", sql`${t.provenance} in ('confirmed','informed','estimated')`),
    check("assets_value", sql`${t.valueCents} >= 0`),
  ],
);

export const assetValuations = pgTable(
  "asset_valuations",
  {
    id: id(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    valueCents: cents().notNull(),
    provenance: text().notNull(),
    valuedAt: day().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("asset_valuations_asset_idx").on(t.assetId)],
);

export const debts = pgTable(
  "debts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    category: text().notNull(),
    outstandingCents: cents().notNull(),
    monthlyPaymentCents: cents(),
    interestRateMonthlyBps: integer(),
    remainingInstallments: integer(),
    provenance: text().notNull().default("informed"),
    valuedAt: day().notNull(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("debts_user_idx").on(t.userId),
    check("debts_category", sql`${t.category} in ('loan','financing','mortgage','other')`),
    check("debts_provenance", sql`${t.provenance} in ('confirmed','informed','estimated')`),
    check("debts_outstanding", sql`${t.outstandingCents} >= 0`),
  ],
);

export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: text().notNull(),
    assetsCents: cents().notNull(),
    liabilitiesCents: cents().notNull(),
    netWorthCents: cents().notNull(),
    breakdown: jsonb().$type<Record<string, number>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("net_worth_snapshots_user_month_unique").on(t.userId, t.month)],
);

export const retirementPlans = pgTable("retirement_plans", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  inputs: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Histórico de projeções calculadas (revisões do plano). */
export const projectionSnapshots = pgTable(
  "projection_snapshots",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    params: jsonb().$type<Record<string, unknown>>().notNull(),
    summary: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("projection_snapshots_user_idx").on(t.userId, t.kind)],
);

// ─── IA, memória, alertas, gamificação ───────────────────────────────────────

export const memoryItems = pgTable(
  "memory_items",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    content: text().notNull(),
    /** declared: informado pelo usuário; inferred: deduzido pelo sistema (exige confirmação). */
    source: text().notNull(),
    status: text().notNull().default("active"),
    confirmedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("memory_items_user_idx").on(t.userId),
    check("memory_items_kind", sql`${t.kind} in ('preference','goal','decision','pattern','fact')`),
    check("memory_items_source", sql`${t.source} in ('declared','inferred')`),
    check("memory_items_status", sql`${t.status} in ('active','pending_confirmation','rejected','archived')`),
  ],
);

export const memoryItemHistory = pgTable(
  "memory_item_history",
  {
    id: id(),
    memoryItemId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text().notNull(),
    before: jsonb().$type<Record<string, unknown> | null>(),
    after: jsonb().$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
  },
  (t) => [index("memory_item_history_user_idx").on(t.userId)],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    /** Mascote ativo quando a mensagem foi gerada. */
    mascotId: text().references(() => mascots.id, { onDelete: "set null" }),
    mode: text(),
    toolCalls: jsonb().$type<Array<{ name: string; input: unknown }>>(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId), check("ai_messages_role", sql`${t.role} in ('user','assistant')`)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    severity: text().notNull(),
    title: text().notNull(),
    cause: text().notNull(),
    impact: text().notNull(),
    action: text().notNull(),
    href: text().notNull(),
    fingerprint: text().notNull(),
    status: text().notNull().default("active"),
    data: jsonb().$type<Record<string, unknown>>(),
    readAt: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alerts_user_fingerprint_unique").on(t.userId, t.fingerprint),
    index("alerts_user_status_idx").on(t.userId, t.status),
    check("alerts_severity", sql`${t.severity} in ('info','attention','important')`),
    check("alerts_status", sql`${t.status} in ('active','dismissed','resolved')`),
  ],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text().notNull(),
    unlockedAt: createdAt(),
    seenAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.code] })],
);

export const financialReviews = pgTable(
  "financial_reviews",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: text().notNull(),
    reviewDate: day().notNull(),
    checklist: jsonb().$type<Record<string, boolean>>().notNull().default({}),
    notes: text(),
    createdAt: createdAt(),
  },
  (t) => [index("financial_reviews_user_idx").on(t.userId, t.reviewDate), check("financial_reviews_period", sql`${t.period} in ('daily','weekly','monthly')`)],
);

export const savingsChallenges = pgTable(
  "savings_challenges",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    targetCheckIns: integer().notNull(),
    startDate: day().notNull(),
    endDate: day().notNull(),
    status: text().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    index("savings_challenges_user_idx").on(t.userId),
    check("savings_challenges_status", sql`${t.status} in ('active','completed','abandoned')`),
    check("savings_challenges_target", sql`${t.targetCheckIns} between 1 and 366`),
  ],
);

export const challengeCheckIns = pgTable(
  "challenge_check_ins",
  {
    id: id(),
    challengeId: uuid()
      .notNull()
      .references(() => savingsChallenges.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: day().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("challenge_check_ins_unique").on(t.challengeId, t.date)],
);

// ─── Integrações bancárias ───────────────────────────────────────────────────

export const bankConsents = pgTable(
  "bank_consents",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid()
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    scopes: jsonb().$type<string[]>().notNull(),
    purpose: text().notNull(),
    providerConsentId: text(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("bank_consents_connection_idx").on(t.connectionId)],
);

export const bankSyncRuns = pgTable(
  "bank_sync_runs",
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text().notNull().default("running"),
    imported: integer().notNull().default(0),
    duplicates: integer().notNull().default(0),
    error: text(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("bank_sync_runs_connection_idx").on(t.connectionId), check("bank_sync_runs_status", sql`${t.status} in ('running','success','error')`)],
);

// ─── Compartilhamento ────────────────────────────────────────────────────────

/**
 * Compartilhamento por recurso (hoje: metas). Conceder acesso a uma meta não dá acesso
 * a nenhum outro dado do dono. Revogar tem efeito imediato.
 */
export const resourceShares = pgTable(
  "resource_shares",
  {
    id: id(),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceType: text().notNull(),
    resourceId: uuid().notNull(),
    permission: text().notNull(),
    inviteeEmail: text().notNull(),
    granteeUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    status: text().notNull().default("pending"),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("resource_shares_owner_idx").on(t.ownerUserId),
    index("resource_shares_grantee_idx").on(t.granteeUserId),
    uniqueIndex("resource_shares_token_unique").on(t.tokenHash),
    check("resource_shares_type", sql`${t.resourceType} in ('goal')`),
    check("resource_shares_permission", sql`${t.permission} in ('view','contribute')`),
    check("resource_shares_status", sql`${t.status} in ('pending','accepted','declined','revoked','expired')`),
  ],
);

// ─── Auditoria ───────────────────────────────────────────────────────────────

/** Registro de ações relevantes. Não guarda valores financeiros nem dados pessoais desnecessários. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid(),
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt)],
);
