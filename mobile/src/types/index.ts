export type AccountType = 'bank' | 'cash' | 'credit_card' | 'digital_wallet';
export type TxType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: string;
  currentBalance: string;
  color: string;
  icon: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parentId: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  children?: Category[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  /** Solo en GET /api/tags */
  transactionCount?: number;
}

export interface TransactionTag {
  id: number;
  transactionId: number;
  tagId: number;
}

export interface Transaction {
  id: number;
  type: TxType;
  amount: string;
  description: string | null;
  date: string;
  time: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  notes: string | null;
  createdAt: string;
  // Campos enriquecidos por el join del backend
  accountName?: string | null;
  accountColor?: string | null;
  accountIcon?: string | null;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  tags?: Pick<Tag, 'id' | 'name' | 'color' | 'icon'>[];
}

export interface Template {
  id: number;
  name: string;
  type: CategoryType;
  amount: string | null;
  description: string | null;
  accountId: number | null;
  categoryId: number | null;
  isActive: boolean;
  useCount: number;
  createdAt: string;
  accountName?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StatsSummary {
  income: number;
  expense: number;
  balance: number;
}

export interface CategoryStat {
  categoryId: number | null;
  name: string;
  color: string;
  icon: string;
  total: number;
  percentage: number;
}

export interface TimelinePoint {
  date: string;
  income: number;
  expense: number;
}

export interface BalancePoint {
  date: string;
  balance: number;
}

export interface TransactionFilters {
  account_id?: number;
  category_id?: number;
  tag_id?: number;
  type?: TxType;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TransactionInput {
  type: TxType;
  amount: number;
  description?: string | null;
  date: string;
  time: string;
  accountId: number;
  toAccountId?: number | null;
  categoryId?: number | null;
  notes?: string | null;
  tagIds?: number[];
}

export interface TagInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  currency?: string;
  initialBalance?: number;
  color?: string;
  icon?: string;
}

export interface CategoryInput {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parentId?: number | null;
  sortOrder?: number;
}

export interface TemplateInput {
  name: string;
  type: CategoryType;
  amount?: number | null;
  description?: string | null;
  accountId?: number | null;
  categoryId?: number | null;
}

export type StatsPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

// ───────────────────────── Metas de ahorro ─────────────────────────
export type ContributionType = 'deposit' | 'withdrawal';

export interface SavingsGoal {
  id: number;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string | null;
  color: string;
  icon: string;
  isCompleted: boolean;
  completedAt: string | null;
  accountId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  accountName?: string | null;
  /** Solo en GET /api/savings/:id */
  contributions?: SavingsContribution[];
}

export interface SavingsContribution {
  id: number;
  goalId: number;
  amount: string;
  type: ContributionType;
  description: string | null;
  date: string;
  transactionId: number | null;
  createdAt: string;
}

export interface SavingsGoalInput {
  name: string;
  targetAmount: number;
  deadline?: string | null;
  color?: string;
  icon?: string;
  accountId?: number | null;
  notes?: string | null;
}

export interface ContributionInput {
  amount: number;
  type: ContributionType;
  description?: string | null;
  date: string;
}

export interface SavingsSummary {
  totalSaved: number;
  totalTarget: number;
  totalRemaining: number;
  activeGoals: number;
  completedGoals: number;
}

// ──────────────────────── Deudas y préstamos ───────────────────────
/** debt = yo debo (pasivo) · loan = me deben (activo) */
export type DebtType = 'debt' | 'loan';

export interface Debt {
  id: number;
  name: string;
  type: DebtType;
  totalAmount: string;
  remainingAmount: string;
  interestRate: string | null;
  creditorDebtor: string | null;
  startDate: string;
  dueDate: string | null;
  color: string;
  icon: string;
  isPaidOff: boolean;
  paidOffAt: string | null;
  notes: string | null;
  accountId: number | null;
  createdAt: string;
  updatedAt: string;
  accountName?: string | null;
  /** Solo en GET /api/debts/:id */
  payments?: DebtPayment[];
}

export interface DebtPayment {
  id: number;
  debtId: number;
  amount: string;
  date: string;
  description: string | null;
  transactionId: number | null;
  createdAt: string;
}

export interface DebtInput {
  name: string;
  type: DebtType;
  totalAmount: number;
  interestRate?: number | null;
  creditorDebtor?: string | null;
  startDate: string;
  dueDate?: string | null;
  color?: string;
  icon?: string;
  notes?: string | null;
  accountId?: number | null;
}

export interface DebtPaymentInput {
  amount: number;
  date: string;
  description?: string | null;
}

export interface DebtsSummary {
  totalDebt: number;
  totalLoan: number;
  netBalance: number;
  activeDebts: number;
  activeLoans: number;
}
