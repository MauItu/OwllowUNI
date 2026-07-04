import type { Template, TxType } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  AddTransaction:
    | {
        template?: Template;
        transactionId?: number;
        initialType?: TxType;
      }
    | undefined;
  AddAccount: { accountId?: number } | undefined;
  CreditCardDetail: { accountId: number };
  // Cuentas dejó de ser un tab: ahora se accede como screen del stack desde el Sidebar/Home.
  Accounts: { selectAccountId?: number } | undefined;
  Categories: undefined;
  Templates: undefined;
  Tags: undefined;
  Savings: undefined;
  AddSavingsGoal: { goalId?: number } | undefined;
  SavingsDetail: { goalId: number };
  Debts: undefined;
  AddDebt: { debtId?: number } | undefined;
  DebtDetail: { debtId: number };
  Budgets: undefined;
  Recurring: undefined;
  AddRecurring: { ruleId?: number } | undefined;
  Splits: undefined;
  AddSplitGroup: { groupId?: number } | undefined;
  SplitGroupDetail: { groupId: number };
  AddSplitExpense: { groupId: number; expenseId?: number };
  // Transactions ya no es un tab: se accede como screen del stack desde Home.
  Transactions: { accountId?: number; search?: string } | undefined;
  Search: undefined;
  SettingsNotifications: undefined;
  ImportExport: undefined;
  Insights: undefined;
  Rates: undefined;
  Security: undefined;
  Appearance: undefined;
  // Votación A/B del estilo de la app.
  StyleVote: undefined;
  // Mi cuenta: perfil + exportar todos los datos + eliminar cuenta.
  Account: undefined;
  // Documentos legales (también en el stack de auth, para el consentimiento del registro).
  Legal: { doc: 'privacy' | 'terms' };
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyResetCode: { email: string };
  ResetPassword: { token: string };
  Legal: { doc: 'privacy' | 'terms' };
};

export type TabParamList = {
  Home: undefined;
  // Tab "Cuentas": renderiza AccountsScreen como raíz del tab (distinto del screen
  // 'Accounts' del RootStack, que se sigue usando para navegación profunda).
  AccountsTab: undefined;
  AddTab: undefined;
  Stats: undefined;
  // Tab "Más": menú de navegación (antes vivía en el Sidebar).
  More: undefined;
};
