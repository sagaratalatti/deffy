import { Context } from 'telegraf';
import { UIComponents } from './UIComponents';

/**
 * Common types for Telegram bot modules
 */
export interface TelegramServices {
  walletService: any;
  firebaseService: any;
  daoService: any;
  vaultService: any;
  walletOperations?: any; // WalletOperations - using any to avoid circular dependency
  ui: UIComponents; // Add UIComponents to the interface
}

export interface DAOCreationSession {
  step: number;
  data: {
    name?: string;
    description?: string;
    votingPeriodHours?: number;
    quorumPercentage?: number;
  };
  messageId?: number;
}

export interface DAOJoinSession {
  step: number;
  data: {
    daoAddress?: string;
    joinMessage?: string;
  };
  messageId?: number;
}

export interface DAOManageSession {
  step: number;
  data: {
    daoAddress?: string;
    action?: string;
    memberAddress?: string;
  };
  messageId?: number;
}

export interface CommandHandler {
  (ctx: Context, services: TelegramServices): Promise<void>;
}

export interface CallbackHandler {
  (ctx: Context, data: string, services: TelegramServices): Promise<void>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  wordCount?: number;
}

export interface TokenTransferSession {
  step: number;
  data: {
    tokenAddress?: string;
    tokenSymbol?: string;
    toAddress?: string;
    amount?: string;
  };
  messageId?: number;
}

export interface WalletSession {
  step: number;
  data: {
    action?: 'view_tokens' | 'transfer_token' | 'add_token' | 'create_wallet' | 'import_wallet';
    selectedToken?: string;
    privateKey?: string; // For wallet import
  };
  messageId?: number;
}

export interface ProposalCreationSession {
  step: number;
  data: {
    daoAddress?: string;
    daoName?: string;
    proposalId?: string;
    proposalTitle?: string;
    proposalMessage?: string;
    ethAmount?: string;
  };
  messageId?: number;
}