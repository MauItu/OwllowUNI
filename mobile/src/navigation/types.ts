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
  Categories: undefined;
  Templates: undefined;
  Tags: undefined;
  Savings: undefined;
  AddSavingsGoal: { goalId?: number } | undefined;
  SavingsDetail: { goalId: number };
  Debts: undefined;
  AddDebt: { debtId?: number } | undefined;
  DebtDetail: { debtId: number };
  Splits: undefined;
  AddSplitGroup: undefined;
  SplitGroupDetail: { groupId: number };
  AddSplitExpense: { groupId: number };
  // Transactions ya no es un tab: se accede como screen del stack desde Home.
  Transactions: { accountId?: number } | undefined;
  // Estadísticas ya no es un tab: se accede como screen del stack desde el Sidebar.
  Stats: undefined;
  SettingsNotifications: undefined;
  ImportExport: undefined;
  Insights: undefined;
  Rates: undefined;
  Security: undefined;
  Appearance: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyResetCode: { email: string };
  ResetPassword: { token: string };
};

export type TabParamList = {
  Home: undefined;
  AddTab: undefined;
  Accounts: { selectAccountId?: number } | undefined;
};
