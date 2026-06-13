// ─────────────────────────────── Auth ──────────────────────────────
export interface User {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  password?: string;
  currentPassword?: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface VerifyResetCodeInput {
  email: string;
  code: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}

export interface VerifyResetCodeResponse {
  token: string;
}

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
  /** Monto recibido en la cuenta destino (transferencias entre monedas). */
  toAmount: string | null;
  categoryId: number | null;
  notes: string | null;
  /** Nombre del archivo de la foto del recibo (imagen local en el dispositivo). */
  receiptFilename: string | null;
  createdAt: string;
  // Campos enriquecidos por el join del backend
  accountName?: string | null;
  accountColor?: string | null;
  accountIcon?: string | null;
  accountCurrency?: string | null;
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
  /** Monto recibido en la cuenta destino (transferencias entre monedas distintas). */
  toAmount?: number | null;
  categoryId?: number | null;
  notes?: string | null;
  /** Nombre del archivo de la foto del recibo (imagen local en el dispositivo). */
  receiptFilename?: string | null;
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
  accountId: number | null;
  transactionId: number | null;
  createdAt: string;
  accountName?: string | null;
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
  /** Si es true y hay accountId, registra el desembolso inicial como transacción. */
  registerInitialTransaction?: boolean;
}

export interface DebtPaymentInput {
  amount: number;
  date: string;
  description?: string | null;
  /** Cuenta a la que entra (loan) o de la que sale (debt) el dinero del abono. */
  accountId?: number | null;
}

export interface DebtsSummary {
  totalDebt: number;
  totalLoan: number;
  netBalance: number;
  activeDebts: number;
  activeLoans: number;
}

// ──────────────────────── Gastos compartidos ───────────────────────
export interface SplitMember {
  id: number;
  groupId: number;
  name: string;
  isMe: boolean;
  createdAt: string;
}

export interface SplitGroup {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  members?: SplitMember[];
  /** Balance del miembro is_me (positivo = me deben). Solo en GET /api/splits */
  myBalance?: number;
}

export interface SplitShare {
  id: number;
  expenseId: number;
  memberId: number;
  amount: string;
  isSettled: boolean;
  settledAt: string | null;
}

export interface SplitExpense {
  id: number;
  groupId: number;
  description: string;
  totalAmount: string;
  paidByMemberId: number;
  date: string;
  accountId: number | null;
  transactionId: number | null;
  categoryId: number | null;
  createdAt: string;
  updatedAt: string;
  paidByName?: string;
  accountName?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  shares?: SplitShare[];
}

export interface SplitGroupInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  members?: { name: string; isMe?: boolean }[];
}

export interface SplitMemberInput {
  name: string;
  isMe?: boolean;
}

export interface SplitExpenseInput {
  description: string;
  totalAmount: number;
  paidByMemberId: number;
  date: string;
  categoryId?: number | null;
  /** Solo válido si el pagador es el miembro "Yo": cuenta de la que salió el dinero. */
  accountId?: number | null;
  shares: { memberId: number; amount: number }[];
}

export interface SplitTransfer {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
}

export interface SplitBalances {
  members: (SplitMember & { balance: number })[];
  transfers: SplitTransfer[];
}

export interface SettleInput {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
  date?: string;
  /** Cuenta del usuario cuando la liquidación lo involucra (depósito si me pagan, egreso si pago yo). */
  accountId?: number | null;
}

export interface SplitsSummary {
  totalOwedToMe: number;
  totalIOwe: number;
  netBalance: number;
  groups: { groupId: number; groupName: string; myBalance: number }[];
}

// ──────────────────────── Insights financieros ─────────────────────
export type InsightSeverity = 'info' | 'warning' | 'positive';
export type InsightType =
  | 'comparativa_categoria'
  | 'proyeccion_mes'
  | 'racha_registro'
  | 'top_crecimiento'
  | 'patron_semanal'
  | 'balance_salud';

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  message: string;
  /** Número crudo; el cliente lo formatea según `type` (moneda / % / días). */
  value?: number;
  categoryId?: number;
}

// ──────────────────────────── Multi-moneda ─────────────────────────
export interface RateResult {
  base: string;
  target: string;
  rate: number | null;
  stale: boolean;
  isManual: boolean;
  fetchedAt: string | null;
}

export interface RatesResponse {
  base: string;
  rates: RateResult[];
  stale: boolean;
}

export interface AccountsSummary {
  displayCurrency: string;
  total: number;
  byCurrency: { currency: string; total: number; converted: number }[];
  stale: boolean;
  ratesUpdatedAt: string | null;
}

// ──────────────────────── Importar / Exportar ──────────────────────
export type ExportFormat = 'csv' | 'json';

export interface ExportFilters {
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  type?: TxType;
}

/** Fila normalizada enviada a POST /api/transactions/import. */
export interface ImportTransactionRow {
  date: string;
  time: string;
  type: string;
  amount: string;
  description: string;
  account: string;
  toAccount: string;
  category: string;
  subcategory: string;
  tags: string;
  notes: string;
}

export interface ImportResult {
  imported: number;
  errors: { row: number; reason: string }[];
}

export interface SplitSettlement {
  id: number;
  groupId: number;
  fromMemberId: number;
  toMemberId: number;
  amount: string;
  date: string;
  accountId: number | null;
  transactionId: number | null;
  createdAt: string;
}
