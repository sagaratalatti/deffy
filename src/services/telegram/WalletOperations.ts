import { Context } from 'telegraf';
import { TelegramServices } from './types';
import { UIComponents } from './UIComponents';
import { SessionManager } from './SessionManager';
import { TokenOperations } from './TokenOperations';

/**
 * Wallet Operations for Telegram bot
 * Handles all wallet-related functionality
 */
export class WalletOperations {
  private services: TelegramServices;
  private ui: UIComponents;
  private sessionManager: SessionManager;
  private tokenOperations: TokenOperations;

  constructor(services: TelegramServices, ui: UIComponents, sessionManager: SessionManager) {
    this.services = services;
    this.ui = ui;
    this.sessionManager = sessionManager;
    this.tokenOperations = new TokenOperations(services, ui, sessionManager);
  }

  /**
   * Create a new wallet for the user
   */
  async createWallet(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      // Check if user already has a wallet
      const existingWallet = await this.services.firebaseService.getWallet(telegramId);
      if (existingWallet) {
        await ctx.reply(
          'You already have a wallet! Use "My Wallet" to view your wallet details.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }

      // Show loading message
      const loadingMessage = await ctx.reply(this.ui.getLoadingMessage('Creating your wallet...'));

      // Create new wallet
      const wallet = this.services.walletService.createWallet();
      
      // Save wallet to Firebase
      await this.services.firebaseService.saveWallet(telegramId, {
        address: wallet.address,
        privateKey: wallet.privateKey
      });

      // Delete loading message
      await ctx.deleteMessage(loadingMessage.message_id);

      // Send success message
      await ctx.reply(
        this.ui.getWalletCreationSuccessMessage(wallet.address, wallet.privateKey),
        { 
          parse_mode: 'Markdown',
          reply_markup: this.ui.getBackToMainKeyboard().reply_markup
        }
      );

    } catch (error) {
      console.error('Error creating wallet:', error);
      await ctx.reply(
        this.ui.getErrorMessage('Failed to create wallet. Please try again.'),
        this.ui.getBackToMainKeyboard()
      );
    }
  }

  /**
   * Display user's wallet information with tokens
   */
  async showWallet(ctx: Context): Promise<void> {
    await this.tokenOperations.showWalletWithTokens(ctx);
  }

  /**
   * Show only token balances
   */
  async showTokenBalances(ctx: Context): Promise<void> {
    await this.tokenOperations.showTokenBalances(ctx);
  }

  /**
   * Start token transfer flow
   */
  async startTokenTransfer(ctx: Context): Promise<void> {
    await this.tokenOperations.startTokenTransfer(ctx);
  }

  /**
   * Handle token selection for transfer
   */
  async handleTokenSelection(ctx: Context, tokenAddress: string): Promise<void> {
    await this.tokenOperations.handleTokenSelection(ctx, tokenAddress);
  }

  /**
   * Handle text input for token transfer
   */
  async handleTokenTransferInput(ctx: Context, text: string): Promise<void> {
    await this.tokenOperations.handleTokenTransferInput(ctx, text);
  }

  /**
   * Execute token transfer
   */
  async executeTokenTransfer(ctx: Context): Promise<void> {
    await this.tokenOperations.executeTokenTransfer(ctx);
  }

  /**
   * Cancel token transfer
   */
  async cancelTokenTransfer(ctx: Context): Promise<void> {
    await this.tokenOperations.cancelTokenTransfer(ctx);
  }

  /**
   * Refresh wallet information
   */
  async refreshWallet(ctx: Context): Promise<void> {
    await this.tokenOperations.refreshWallet(ctx);
  }

  /**
   * Check if user has a wallet
   */
  async hasWallet(telegramId: string): Promise<boolean> {
    try {
      const wallet = await this.services.firebaseService.getWallet(telegramId);
      return !!wallet;
    } catch (error) {
      console.error('Error checking wallet existence:', error);
      return false;
    }
  }

  /**
   * Get user's wallet
   */
  async getWallet(telegramId: string): Promise<{ address: string; privateKey: string } | null> {
    try {
      return await this.services.firebaseService.getWallet(telegramId);
    } catch (error) {
      console.error('Error getting wallet:', error);
      return null;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(address: string): Promise<string> {
    try {
      return await this.services.walletService.getBalance(address);
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return '0';
    }
  }

  /**
   * Validate wallet address format
   */
  isValidAddress(address: string): boolean {
    try {
      return this.services.walletService.isValidAddress(address);
    } catch (error) {
      console.error('Error validating address:', error);
      return false;
    }
  }

  /**
   * Format wallet address for display
   */
  formatAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Format balance for display
   */
  formatBalance(balance: string): string {
    try {
      const num = parseFloat(balance);
      if (num === 0) return '0';
      if (num < 0.0001) return '< 0.0001';
      if (num < 1) return num.toFixed(4);
      if (num < 1000) return num.toFixed(2);
      return num.toLocaleString();
    } catch (error) {
      return balance;
    }
  }

  /**
   * Send wallet creation prompt with security warning
   */
  async sendWalletCreationPrompt(ctx: Context): Promise<void> {
    const message = `🔐 *Wallet Creation*\n\n` +
      `Creating a new wallet will generate:\n` +
      `• A unique wallet address\n` +
      `• A private key (keep this secure!)\n\n` +
      `⚠️ *Security Warning:*\n` +
      `• Never share your private key\n` +
      `• Store it in a secure location\n` +
      `• We cannot recover lost private keys\n\n` +
      `Do you want to proceed?`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Create Wallet', callback_data: 'confirm_create_wallet' },
            { text: '❌ Cancel', callback_data: 'back_to_main' }
          ]
        ]
      }
    });
  }

  /**
   * Handle wallet creation confirmation
   */
  async handleWalletCreationConfirmation(ctx: Context): Promise<void> {
    await this.createWallet(ctx);
  }
}