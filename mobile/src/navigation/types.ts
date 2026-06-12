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
  Splits: undefined;
  AddSplitGroup: undefined;
  SplitGroupDetail: { groupId: number };
  AddSplitExpense: { groupId: number };
  SettingsNotifications: undefined;
};

export type TabParamList = {
  Home: undefined;
  Transactions: { accountId?: number } | undefined;
  AddTab: undefined;
  Stats: undefined;
  More: undefined;
};
