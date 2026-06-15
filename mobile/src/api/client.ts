import axios from 'axios';
import { removeToken } from '../services/auth';
import type {
  AuthResponse,
  User,
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ForgotPasswordInput,
  VerifyResetCodeInput,
  ResetPasswordInput,
  MessageResponse,
  VerifyResetCodeResponse,
  Account,
  AccountInput,
  CreditCardStatement,
  PayStatementInput,
  GenerateStatementResult,
  Category,
  CategoryInput,
  Transaction,
  TransactionInput,
  TransactionFilters,
  Template,
  TemplateInput,
  Tag,
  TagInput,
  SavingsGoal,
  SavingsGoalInput,
  ContributionInput,
  SavingsSummary,
  Debt,
  DebtInput,
  DebtPaymentInput,
  DebtsSummary,
  RecurringRule,
  RecurringRuleInput,
  Budget,
  BudgetsSummary,
  BudgetHistoryMonth,
  BudgetInput,
  SplitGroup,
  SplitGroupInput,
  SplitMember,
  SplitMemberInput,
  SplitExpense,
  SplitExpenseInput,
  SplitBalances,
  SettleInput,
  SettleResult,
  SplitSettlement,
  SplitsSummary,
  Paginated,
  StatsSummary,
  CategoryStat,
  TimelinePoint,
  BalancePoint,
  ExportFormat,
  ExportFilters,
  ImportTransactionRow,
  ImportResult,
  Insight,
  RatesResponse,
  RateResult,
  AccountsSummary,
} from '../types';

/**
 * URL base del backend.
 * - En el APK de producción la inyecta EAS Build vía `EXPO_PUBLIC_API_URL`
 *   (ver perfil `preview` en eas.json → backend deployado en Render).
 * - En desarrollo cae al fallback: la IP de tu PC en la LAN (NO uses localhost,
 *   el dispositivo no lo resuelve). Cámbiala aquí si cambia tu IP.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.12:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

// ───────────────────────── Token de sesión ──────────────────────────
// El token vive en SecureStore (services/auth) pero se cachea aquí en memoria
// para inyectarlo en cada request sin un acceso async. `useAuth` lo sincroniza.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

// Callback que dispara el cierre de sesión en la UI cuando el backend
// responde 401 (token vencido/ inválido). Lo registra `useAuth`.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(cb: (() => void) | null) {
  onUnauthorized = cb;
}

// Inyecta el Authorization header en cada request si hay token.
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Ante un 401 (salvo en las propias rutas de auth), limpia el token y avisa a
// la UI para redirigir al login.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register');
    if (status === 401 && !isAuthRoute) {
      authToken = null;
      await removeToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Extrae un mensaje de error legible de una respuesta de Axios. */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.code === 'ECONNABORTED') return 'La conexión tardó demasiado.';
    if (!err.response) return 'No se pudo conectar con el servidor.';
    return `Error ${err.response.status}`;
  }
  return 'Ocurrió un error inesperado.';
}

// ───────────────────────────── Auth ─────────────────────────
export const authApi = {
  register: (data: RegisterInput) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  updateProfile: (data: UpdateProfileInput) =>
    api.put<User>('/auth/profile', data).then((r) => r.data),
  // Recuperación de contraseña por email (código de 6 dígitos).
  forgotPassword: (data: ForgotPasswordInput) =>
    api.post<MessageResponse>('/auth/forgot-password', data).then((r) => r.data),
  verifyResetCode: (data: VerifyResetCodeInput) =>
    api.post<VerifyResetCodeResponse>('/auth/verify-reset-code', data).then((r) => r.data),
  resetPassword: (data: ResetPasswordInput) =>
    api.post<MessageResponse>('/auth/reset-password', data).then((r) => r.data),
};

// ───────────────────────── Accounts ─────────────────────────
export const accountsApi = {
  // includeInactive: true trae también las desactivadas (para la lista; los selectores
  // usan list() normal = solo activas).
  list: (includeInactive = false) =>
    api
      .get<Account[]>('/accounts', { params: { includeInactive: includeInactive || undefined } })
      .then((r) => r.data),
  get: (id: number) => api.get<Account>(`/accounts/${id}`).then((r) => r.data),
  create: (data: AccountInput) => api.post<Account>('/accounts', data).then((r) => r.data),
  update: (id: number, data: Partial<AccountInput>) =>
    api.put<Account>(`/accounts/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`).then((r) => r.data),
  // Desactiva/reactiva una cuenta (soft). Congela/descongela una tarjeta.
  toggleActive: (id: number) => api.patch<Account>(`/accounts/${id}/toggle-active`).then((r) => r.data),
  toggleFrozen: (id: number) => api.patch<Account>(`/accounts/${id}/toggle-frozen`).then((r) => r.data),
  summary: (displayCurrency: string, refresh = false) =>
    api
      .get<AccountsSummary>('/accounts/summary', { params: { displayCurrency, refresh: refresh || undefined } })
      .then((r) => r.data),
  // Estados de cuenta de una tarjeta de crédito (cortes), del más reciente al más antiguo.
  statements: (id: number, params?: { limit?: number; offset?: number }) =>
    api.get<CreditCardStatement[]>(`/accounts/${id}/statements`, { params }).then((r) => r.data),
  payStatement: (id: number, statementId: number, data: PayStatementInput) =>
    api
      .post<{ success: boolean; statement: CreditCardStatement }>(`/accounts/${id}/statements/${statementId}/pay`, data)
      .then((r) => r.data),
  // Genera el corte del periodo actual (manual) + deuda automática asociada.
  generateStatement: (id: number) =>
    api.post<GenerateStatementResult>(`/accounts/${id}/generate-statement`).then((r) => r.data),
};

// ──────────────────────── Multi-moneda (tasas) ──────────────────────
export const ratesApi = {
  list: (base: string, targets: string[], refresh = false) =>
    api
      .get<RatesResponse>('/rates', {
        params: { base, targets: targets.join(','), refresh: refresh || undefined },
      })
      .then((r) => r.data),
  setManual: (data: { base: string; target: string; rate: number }) =>
    api.put<RateResult>('/rates/manual', data).then((r) => r.data),
  removeManual: (base: string, target: string) =>
    api.delete('/rates/manual', { params: { base, target } }).then((r) => r.data),
};

// ──────────────────────── Categories ────────────────────────
export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  byType: (type: 'income' | 'expense') =>
    api.get<Category[]>(`/categories/${type}`).then((r) => r.data),
  create: (data: CategoryInput) => api.post<Category>('/categories', data).then((r) => r.data),
  update: (id: number, data: Partial<CategoryInput>) =>
    api.put<Category>(`/categories/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`).then((r) => r.data),
};

// ─────────────────────── Transactions ───────────────────────
export const transactionsApi = {
  list: (filters: TransactionFilters = {}) =>
    api
      .get<Paginated<Transaction>>('/transactions', { params: filters })
      .then((r) => r.data),
  get: (id: number) => api.get<Transaction>(`/transactions/${id}`).then((r) => r.data),
  create: (data: TransactionInput) =>
    api.post<Transaction>('/transactions', data).then((r) => r.data),
  update: (id: number, data: TransactionInput) =>
    api.put<Transaction>(`/transactions/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`).then((r) => r.data),
};

// ─────────────────────── Importar / Exportar ────────────────
export const importExportApi = {
  /** Descarga el contenido del archivo (texto CSV o JSON) según el formato. */
  export: (format: ExportFormat, filters: ExportFilters = {}) =>
    api
      .get<string>('/transactions/export', {
        params: { format, ...filters },
        responseType: 'text',
        // Evita que Axios intente parsear el CSV/JSON: lo queremos como texto crudo.
        transformResponse: (d) => d,
      })
      .then((r) => r.data),
  import: (transactions: ImportTransactionRow[]) =>
    api.post<ImportResult>('/transactions/import', { transactions }).then((r) => r.data),
};

// ───────────────────────── Templates ────────────────────────
export const templatesApi = {
  list: () => api.get<Template[]>('/templates').then((r) => r.data),
  create: (data: TemplateInput) => api.post<Template>('/templates', data).then((r) => r.data),
  update: (id: number, data: Partial<TemplateInput>) =>
    api.put<Template>(`/templates/${id}`, data).then((r) => r.data),
  use: (id: number) => api.post<Template>(`/templates/${id}/use`).then((r) => r.data),
  remove: (id: number) => api.delete(`/templates/${id}`).then((r) => r.data),
};

// ──────────────────────────── Tags ──────────────────────────
export const tagsApi = {
  list: () => api.get<Tag[]>('/tags').then((r) => r.data),
  create: (data: TagInput) => api.post<Tag>('/tags', data).then((r) => r.data),
  update: (id: number, data: Partial<TagInput>) =>
    api.put<Tag>(`/tags/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/tags/${id}`).then((r) => r.data),
};

// ─────────────────────── Metas de ahorro ────────────────────
export const savingsApi = {
  list: () => api.get<SavingsGoal[]>('/savings').then((r) => r.data),
  get: (id: number) => api.get<SavingsGoal>(`/savings/${id}`).then((r) => r.data),
  create: (data: SavingsGoalInput) => api.post<SavingsGoal>('/savings', data).then((r) => r.data),
  update: (id: number, data: Partial<SavingsGoalInput>) =>
    api.put<SavingsGoal>(`/savings/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/savings/${id}`).then((r) => r.data),
  contribute: (id: number, data: ContributionInput) =>
    api.post<SavingsGoal>(`/savings/${id}/contribute`, data).then((r) => r.data),
  summary: () => api.get<SavingsSummary>('/savings/summary').then((r) => r.data),
};

// ────────────────────── Deudas y préstamos ──────────────────
export const debtsApi = {
  list: () => api.get<Debt[]>('/debts').then((r) => r.data),
  get: (id: number) => api.get<Debt>(`/debts/${id}`).then((r) => r.data),
  create: (data: DebtInput) => api.post<Debt>('/debts', data).then((r) => r.data),
  update: (id: number, data: Partial<DebtInput>) =>
    api.put<Debt>(`/debts/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/debts/${id}`).then((r) => r.data),
  pay: (id: number, data: DebtPaymentInput) =>
    api.post<Debt>(`/debts/${id}/pay`, data).then((r) => r.data),
  updatePayment: (id: number, paymentId: number, data: DebtPaymentInput) =>
    api.put<Debt>(`/debts/${id}/payments/${paymentId}`, data).then((r) => r.data),
  summary: () => api.get<DebtsSummary>('/debts/summary').then((r) => r.data),
};

// ────────────────────── Presupuestos mensuales ──────────────
export const budgetsApi = {
  list: () => api.get<Budget[]>('/budgets').then((r) => r.data),
  summary: () => api.get<BudgetsSummary>('/budgets/summary').then((r) => r.data),
  history: (months = 6) =>
    api.get<BudgetHistoryMonth[]>('/budgets/history', { params: { months } }).then((r) => r.data),
  create: (data: BudgetInput) => api.post<Budget>('/budgets', data).then((r) => r.data),
  update: (id: number, data: Partial<BudgetInput> & { isActive?: boolean }) =>
    api.put<Budget>(`/budgets/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/budgets/${id}`).then((r) => r.data),
};

// ─────────────────────── Gastos compartidos ─────────────────
export const splitsApi = {
  list: () => api.get<SplitGroup[]>('/splits').then((r) => r.data),
  get: (id: number) => api.get<SplitGroup>(`/splits/${id}`).then((r) => r.data),
  create: (data: SplitGroupInput) => api.post<SplitGroup>('/splits', data).then((r) => r.data),
  update: (id: number, data: Partial<Omit<SplitGroupInput, 'members'>>) =>
    api.put<SplitGroup>(`/splits/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/splits/${id}`).then((r) => r.data),
  addMember: (groupId: number, data: SplitMemberInput) =>
    api.post<SplitMember>(`/splits/${groupId}/members`, data).then((r) => r.data),
  removeMember: (groupId: number, memberId: number) =>
    api.delete(`/splits/${groupId}/members/${memberId}`).then((r) => r.data),
  expenses: (groupId: number) =>
    api.get<SplitExpense[]>(`/splits/${groupId}/expenses`).then((r) => r.data),
  addExpense: (groupId: number, data: SplitExpenseInput) =>
    api.post<SplitExpense>(`/splits/${groupId}/expenses`, data).then((r) => r.data),
  balances: (groupId: number) =>
    api.get<SplitBalances>(`/splits/${groupId}/balances`).then((r) => r.data),
  settle: (groupId: number, data: SettleInput) =>
    api.post<SettleResult>(`/splits/${groupId}/settle`, data).then((r) => r.data),
  settlements: (groupId: number) =>
    api.get<SplitSettlement[]>(`/splits/${groupId}/settlements`).then((r) => r.data),
  summary: () => api.get<SplitsSummary>('/splits/summary').then((r) => r.data),
};

// ────────────────────────── Insights ────────────────────────
export const insightsApi = {
  list: () => api.get<Insight[]>('/insights').then((r) => r.data),
};

// ────────────────────── Pagos recurrentes ───────────────────
export const recurringApi = {
  list: () => api.get<RecurringRule[]>('/recurring-rules').then((r) => r.data),
  create: (data: RecurringRuleInput) =>
    api.post<RecurringRule>('/recurring-rules', data).then((r) => r.data),
  update: (id: number, data: RecurringRuleInput) =>
    api.put<RecurringRule>(`/recurring-rules/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/recurring-rules/${id}`).then((r) => r.data),
  toggle: (id: number) =>
    api.patch<RecurringRule>(`/recurring-rules/${id}/toggle`).then((r) => r.data),
  // Materializa los cargos recurrentes pendientes del usuario (idempotente).
  // Se llama una vez al abrir la app, en background (ver useAuth).
  catchUp: () =>
    api.post<{ generatedCount: number }>('/recurring/catch-up').then((r) => r.data),
};

// ─────────────────────────── Stats ──────────────────────────
export const statsApi = {
  summary: (from: string, to: string, displayCurrency = 'COP') =>
    api.get<StatsSummary>('/stats/summary', { params: { from, to, displayCurrency } }).then((r) => r.data),
  byCategory: (from: string, to: string, type: 'income' | 'expense' = 'expense', displayCurrency = 'COP') =>
    api
      .get<CategoryStat[]>('/stats/by-category', { params: { from, to, type, displayCurrency } })
      .then((r) => r.data),
  timeline: (from: string, to: string, group: 'day' | 'week' | 'month' = 'day', displayCurrency = 'COP') =>
    api
      .get<TimelinePoint[]>('/stats/timeline', { params: { from, to, group, displayCurrency } })
      .then((r) => r.data),
  balanceEvolution: (from: string, to: string, displayCurrency = 'COP') =>
    api
      .get<BalancePoint[]>('/stats/balance-evolution', { params: { from, to, displayCurrency } })
      .then((r) => r.data),
};
