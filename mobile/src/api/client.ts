import axios from 'axios';
import type {
  Account,
  AccountInput,
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
  Paginated,
  StatsSummary,
  CategoryStat,
  TimelinePoint,
  BalancePoint,
} from '../types';

/**
 * URL base del backend: la IP de tu PC en la LAN (NO uses localhost:
 * el dispositivo no lo resuelve). Cámbiala aquí si cambia tu IP.
 */
export const API_BASE_URL = 'http://192.168.0.12:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

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

// ───────────────────────── Accounts ─────────────────────────
export const accountsApi = {
  list: () => api.get<Account[]>('/accounts').then((r) => r.data),
  get: (id: number) => api.get<Account>(`/accounts/${id}`).then((r) => r.data),
  create: (data: AccountInput) => api.post<Account>('/accounts', data).then((r) => r.data),
  update: (id: number, data: Partial<AccountInput>) =>
    api.put<Account>(`/accounts/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`).then((r) => r.data),
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
  summary: () => api.get<DebtsSummary>('/debts/summary').then((r) => r.data),
};

// ─────────────────────────── Stats ──────────────────────────
export const statsApi = {
  summary: (from: string, to: string) =>
    api.get<StatsSummary>('/stats/summary', { params: { from, to } }).then((r) => r.data),
  byCategory: (from: string, to: string, type: 'income' | 'expense' = 'expense') =>
    api
      .get<CategoryStat[]>('/stats/by-category', { params: { from, to, type } })
      .then((r) => r.data),
  timeline: (from: string, to: string, group: 'day' | 'week' | 'month' = 'day') =>
    api
      .get<TimelinePoint[]>('/stats/timeline', { params: { from, to, group } })
      .then((r) => r.data),
  balanceEvolution: (from: string, to: string) =>
    api
      .get<BalancePoint[]>('/stats/balance-evolution', { params: { from, to } })
      .then((r) => r.data),
};
