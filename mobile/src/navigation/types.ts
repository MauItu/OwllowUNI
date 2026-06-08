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
};

export type TabParamList = {
  Home: undefined;
  Transactions: { accountId?: number } | undefined;
  AddTab: undefined;
  Stats: undefined;
  More: undefined;
};
