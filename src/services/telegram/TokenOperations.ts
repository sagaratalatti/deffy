import { Context } from 'telegraf';
import { TelegramServices, TokenTransferSession } from './types';
import { UIComponents } from './UIComponents';
import { SessionManager } from './SessionManager';
import { TokenInfo } from '../WalletService';
import { ethers } from 'ethers';

/**
 * Token Operations for Telegram bot
 * Handles ETH transfer functionality
 */
export class TokenOperations {
  private services: TelegramServices;
  private ui: UIComponents;
  private sessionManager: SessionManager;

  constructor(services: TelegramServices, ui: UIComponents, sessionManager: SessionManager) {
    this.services = services;
    this.ui = ui;
    this.sessionManager = sessionManager;
  }

  /**
   * Show wallet with ETH balance
   */
  async showWalletWithTokens(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          'You don\'t have a wallet yet. Please create one first.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }

      // Show loading message
      const loadingMessage = await ctx.reply(this.ui.getLoadingMessage('Loading wallet information...'));

      try {
        // Get wallet address and ETH balance
        const address = await this.services.walletService.getWalletAddress(telegramId);
        const ethBalance = await this.services.walletService.getWalletBalance(telegramId);
        
        if (!address || !ethBalance) {
          await ctx.editMessageText('❌ Failed to load wallet information.');
          return;
        }

        // Delete loading message and show wallet info
        await ctx.deleteMessage(loadingMessage.message_id);
        await ctx.reply(
          this.ui.getWalletInfoMessage(address, ethBalance.balance),
          this.ui.getWalletMenuKeyboard()
        );
      } catch (error) {
        await ctx.editMessageText('❌ Failed to load wallet information.');
      }
    } catch (error) {
      console.error('Error in showWalletWithTokens:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to load wallet information'));
    }
  }

  /**
   * Show ETH balance
   */
  async showTokenBalances(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      // Show loading message
      const loadingMessage = await ctx.reply(this.ui.getLoadingMessage('Loading ETH balance...'));

      try {
        // Get ETH balance
        const ethBalance = await this.services.walletService.getWalletBalance(telegramId);
        
        if (!ethBalance) {
          await ctx.editMessageText('❌ Failed to load ETH balance.');
          return;
        }

        // Get wallet address
        const address = await this.services.walletService.getWalletAddress(telegramId);
        if (!address) {
          await ctx.editMessageText('❌ Failed to load wallet information.');
          return;
        }

        // Delete loading message and show ETH balance
        await ctx.deleteMessage(loadingMessage.message_id);
        await ctx.reply(
          `💰 **ETH Balance**\n\n${ethBalance.balance} ETH`,
          this.ui.getWalletMenuKeyboard()
        );
      } catch (error) {
        await ctx.editMessageText('❌ Failed to load ETH balance.');
      }
    } catch (error) {
      console.error('Error in showTokenBalances:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to load ETH balance'));
    }
  }

  /**
   * Start token transfer flow
   */
  async startTokenTransfer(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          'You don\'t have a wallet yet. Please create one first.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }

      // Get wallet ETH balance
      const ethBalance = await this.services.walletService.getWalletBalance(telegramId);
      
      // Create transfer session
      this.sessionManager.createTokenTransferSession(telegramId);

      // Update session with ETH as the token
      this.sessionManager.updateTokenTransferSession(telegramId, {
        step: 2,
        data: {
          tokenAddress: 'native',
          tokenSymbol: 'ETH'
        }
      });

      // Skip token selection and go directly to address input
      await ctx.reply(
        this.ui.getTokenTransferStep2Message('ETH')
      );
    } catch (error) {
      console.error('Error in startTokenTransfer:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to start token transfer'));
    }
  }

  /**
   * Handle token selection for transfer
   * Note: This method is kept for backward compatibility but is no longer used
   * as we now directly go to address input step
   */
  async handleTokenSelection(ctx: Context, tokenAddress: string): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      const session = this.sessionManager.getTokenTransferSession(telegramId);
      if (!session) {
        await ctx.reply('❌ Session expired. Please start over.');
        return;
      }

      // Only handle native ETH token
      // Get ETH balance
      const ethBalance = await this.services.walletService.getWalletBalance(telegramId);
      
      // Update session
      this.sessionManager.updateTokenTransferSession(telegramId, {
        step: 2,
        data: {
          ...session.data,
          tokenAddress: 'native',
          tokenSymbol: 'ETH'
        }
      });

      // Ask for recipient address
      await ctx.editMessageText(
        this.ui.getTokenTransferStep2Message('ETH')
      );
    } catch (error) {
      console.error('Error in handleTokenSelection:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to process token selection'));
    }
  }

  /**
   * Handle text input for token transfer
   */
  async handleTokenTransferInput(ctx: Context, text: string): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      const session = this.sessionManager.getTokenTransferSession(telegramId);
      if (!session) {
        return; // No active session
      }

      if (session.step === 2) {
        await this.handleAddressInput(ctx, text, session, telegramId);
      } else if (session.step === 3) {
        await this.handleAmountInput(ctx, text, session, telegramId);
      }
    } catch (error) {
      console.error('Error in handleTokenTransferInput:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to process input'));
    }
  }

  /**
   * Handle recipient address input
   */
  private async handleAddressInput(ctx: Context, address: string, session: TokenTransferSession, telegramId: string): Promise<void> {
    const trimmedAddress = address.trim();
    
    // Validate address
    if (!ethers.isAddress(trimmedAddress)) {
      await ctx.reply('❌ Invalid wallet address. Please enter a valid Ethereum address:');
      return;
    }

    // Update session
    this.sessionManager.updateTokenTransferSession(telegramId, {
      step: 3,
      data: {
        ...session.data,
        toAddress: trimmedAddress
      }
    });

    // Get ETH balance for display
    const tokenInfo = await this.services.walletService.getWalletBalance(telegramId);
    if (!tokenInfo) {
      await ctx.reply('❌ Failed to get token balance.');
      return;
    }

    // Ask for amount
    await ctx.reply(
      this.ui.getTokenTransferStep3Message(tokenInfo.symbol, trimmedAddress, tokenInfo.balance)
    );
  }

  /**
   * Handle transfer amount input - ETH only
   */
  private async handleAmountInput(ctx: Context, amountStr: string, session: TokenTransferSession, telegramId: string): Promise<void> {
    const trimmedAmount = amountStr.trim();
    
    // Parse amount
    const amount = parseFloat(trimmedAmount);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a valid number greater than 0:');
      return;
    }

    // Handle ETH transfer
    const ethBalanceInfo = await this.services.walletService.getWalletBalance(telegramId);
    if (!ethBalanceInfo) {
      await ctx.reply('❌ Failed to get ETH balance.');
      return;
    }
    const ethBalanceFloat = parseFloat(ethBalanceInfo.balance);
    
    // Estimate gas cost (approximately 0.0005 ETH for a simple transfer)
    const estimatedGasCost = 0.0005;
    const totalRequired = amount + estimatedGasCost;
    
    if (ethBalanceFloat < totalRequired) {
      await ctx.reply(
        `❌ Insufficient balance. You have ${ethBalanceInfo.balance} ETH, but need approximately ${totalRequired.toFixed(4)} ETH (${amount} ETH + ~${estimatedGasCost} ETH for gas). Please enter a smaller amount:`
      );
      return;
    }
    
    // Update session
    this.sessionManager.updateTokenTransferSession(telegramId, {
      data: {
        ...session.data,
        tokenAddress: 'native',
        tokenSymbol: 'ETH',
        amount: trimmedAmount
      }
    });
    
    // Show confirmation
    await ctx.reply(
      this.ui.getTokenTransferConfirmationMessage(
        'ETH',
        trimmedAmount,
        session.data.toAddress!
      ),
      this.ui.getTransferConfirmationKeyboard()
    );
  }

  /**
   * Execute ETH transfer
   */
  async executeTokenTransfer(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(this.ui.getErrorMessage('Unable to identify user'));
        return;
      }

      const session = this.sessionManager.getTokenTransferSession(telegramId);
      if (!session || !session.data.toAddress || !session.data.amount) {
        await ctx.reply('❌ Session incomplete. Please start over.');
        return;
      }

      // Show processing message
      const processingMessage = await ctx.editMessageText('⏳ Processing ETH transfer...');

      try {
        // Execute transfer - always use native ETH
        const result = await this.services.walletService.transferToken(telegramId, {
          tokenAddress: 'native',
          toAddress: session.data.toAddress,
          amount: session.data.amount
        });

        if (result.success && result.txHash) {
          // Determine network explorer based on token type
          const explorerName = 'Arbiscan';
          
          await ctx.editMessageText(
            `✅ **ETH Transfer Successful!**\n\n` +
            `**Amount:** ${session.data.amount} ETH\n` +
            `**To:** \`${session.data.toAddress}\`\n` +
            `**Transaction:** \`${result.txHash}\`\n\n` +
            `🔗 You can view the transaction on ${explorerName}.`,
            this.ui.getWalletMenuKeyboard()
          );
        } else {
          await ctx.editMessageText(
            `❌ **ETH Transfer Failed**\n\n` +
            `Error: ${result.error || 'Unknown error'}\n\n` +
            `Please try again or contact support if the problem persists.`,
            this.ui.getWalletMenuKeyboard()
          );
        }
      } catch (error) {
        await ctx.editMessageText(
          '❌ ETH Transfer failed. Please try again later.',
          this.ui.getWalletMenuKeyboard()
        );
      }

      // Clean up session
      this.sessionManager.deleteTokenTransferSession(telegramId);
    } catch (error) {
      console.error('Error in executeTokenTransfer:', error);
      await ctx.reply(this.ui.getErrorMessage('Failed to execute transfer'));
    }
  }

  /**
   * Cancel token transfer
   */
  async cancelTokenTransfer(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        return;
      }

      // Clean up session
      this.sessionManager.deleteTokenTransferSession(telegramId);

      await ctx.editMessageText(
        '❌ Transfer cancelled.',
        this.ui.getWalletMenuKeyboard()
      );
    } catch (error) {
      console.error('Error in cancelTokenTransfer:', error);
    }
  }

  /**
   * Refresh wallet information
   */
  async refreshWallet(ctx: Context): Promise<void> {
    await this.showWalletWithTokens(ctx);
  }
}