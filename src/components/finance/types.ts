export interface Option {
  id: string;
  name: string;
}

export interface CategoryOption extends Option {
  kind: "income" | "expense";
  label: string;
  essential: boolean;
}

export interface TransactionDefaults {
  id?: string;
  kind?: "income" | "expense" | "refund" | "transfer";
  amount?: string;
  date?: string;
  description?: string;
  notes?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  cardId?: string | null;
  status?: "realized" | "scheduled" | "estimated";
  incomeType?: string | null;
  expenseNature?: string | null;
  essential?: boolean | null;
}
