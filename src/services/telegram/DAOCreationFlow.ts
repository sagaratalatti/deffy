import { Context } from 'telegraf';
import { TelegramServices, DAOCreationSession, ValidationResult } from './types';
import { UIComponents } from './UIComponents';

/**
 * DAO Creation Flow handler
 * Manages the multi-step DAO creation process
 */
export class DAOCreationFlow {
  private services: TelegramServices;
  private ui: UIComponents;
  private sessions: Map<string, DAOCreationSession> | null = null;

  constructor(services: TelegramServices, ui: UIComponents) {
    this.services = services;
    this.ui = ui;
  }

  /**
   * Set the sessions map reference
   */
  setSessionsMap(sessions: Map<string, DAOCreationSession>): void {
    this.sessions = sessions;
  }

  /**
   * Start DAO creation step 1 - Name input
   */
  async startDAOCreationStep1(ctx: Context, telegramId: string): Promise<void> {
    try {
      await ctx.editMessageText(
        this.ui.getDAOCreationStep1Message(),
        this.ui.getDAOCreationStep1Keyboard()
      );
    } catch (error) {
      console.error('Error in startDAOCreationStep1:', error);
      await ctx.reply('❌ Failed to start DAO creation.');
    }
  }

  /**
   * Start DAO creation step 2 - Description input
   */
  async startDAOCreationStep2(ctx: Context, telegramId: string): Promise<void> {
    try {
      const session = this.getSession(telegramId);
      if (!session || !session.data.name) {
        await ctx.reply('❌ Session expired. Please start over with /create_dao');
        return;
      }

      await ctx.reply(
        this.ui.getDAOCreationStep2Message(session.data.name),
        this.ui.getDAOCreationStep2Keyboard()
      );
    } catch (error) {
      console.error('Error in startDAOCreationStep2:', error);
      await ctx.reply('❌ Failed to proceed to step 2.');
    }
  }

  /**
   * Start DAO creation step 3 - Voting period selection
   */
  async startDAOCreationStep3(ctx: Context, telegramId: string): Promise<void> {
    try {
      const session = this.getSession(telegramId);
      if (!session || !session.data.name || !session.data.description) {
        await ctx.reply('❌ Session expired. Please start over with /create_dao');
        return;
      }

      await ctx.reply(
        this.ui.getDAOCreationStep3Message(session.data.name, session.data.description),
        this.ui.getDAOCreationStep3Keyboard()
      );
    } catch (error) {
      console.error('Error in startDAOCreationStep3:', error);
      await ctx.reply('❌ Failed to proceed to step 3.');
    }
  }

  /**
   * Start DAO creation step 4 - Quorum input
   */
  async startDAOCreationStep4(ctx: Context, telegramId: string): Promise<void> {
    try {
      const session = this.getSession(telegramId);
      if (!session || !session.data.name || !session.data.votingPeriodHours) {
        await ctx.reply('❌ Session expired. Please start over with /create_dao');
        return;
      }

      await ctx.reply(
        this.ui.getDAOCreationStep4Message(session.data.name, session.data.votingPeriodHours),
        this.ui.getDAOCreationStep4Keyboard()
      );
    } catch (error) {
      console.error('Error in startDAOCreationStep4:', error);
      await ctx.reply('❌ Failed to proceed to step 4.');
    }
  }

  /**
   * Show DAO creation confirmation
   */
  async showDAOCreationConfirmation(ctx: Context, telegramId: string): Promise<void> {
    try {
      const session = this.getSession(telegramId);
      if (!session || !this.isSessionComplete(session)) {
        await ctx.reply('❌ Session incomplete. Please start over with /create_dao');
        return;
      }

      await ctx.reply(
        this.ui.getDAOCreationConfirmationMessage(session.data),
        this.ui.getDAOCreationConfirmationKeyboard()
      );
    } catch (error) {
      console.error('Error in showDAOCreationConfirmation:', error);
      await ctx.reply('❌ Failed to show confirmation.');
    }
  }

  /**
   * Handle DAO creation callback queries
   */
  async handleDAOCreationCallback(
    ctx: Context, 
    data: string, 
    session: DAOCreationSession | undefined,
    sessions: Map<string, DAOCreationSession>
  ): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery();

      // Handle navigation
      if (data.startsWith('dao_step_')) {
        const step = parseInt(data.split('_')[2]);
        if (session) {
          session.step = step;
          switch (step) {
            case 1: await this.startDAOCreationStep1(ctx, telegramId); break;
            case 2: await this.startDAOCreationStep2(ctx, telegramId); break;
            case 3: await this.startDAOCreationStep3(ctx, telegramId); break;
            case 4: await this.startDAOCreationStep4(ctx, telegramId); break;
          }
        } else {
          await ctx.editMessageText('❌ Session expired. Please start over with /create_dao');
        }
        return;
      }

      // Handle voting period selection
      if (data.startsWith('dao_voting_')) {
        const hours = parseInt(data.split('_')[2]);
        if (session) {
          session.data.votingPeriodHours = hours;
          session.step = 4;
          await this.startDAOCreationStep4(ctx, telegramId);
        } else {
          await ctx.editMessageText('❌ Session expired. Please start over with /create_dao');
        }
        return;
      }

      // Handle final deployment
      if (data === 'dao_deploy') {
        await this.deployDAO(ctx, telegramId, sessions);
        return;
      }

      // Handle cancellation
      if (data === 'dao_cancel') {
        sessions.delete(telegramId);
        await ctx.editMessageText(
          '❌ DAO Creation Cancelled\n\nYou can start again anytime with /create_dao'
        );
        return;
      }

    } catch (error) {
      console.error('Error handling DAO creation callback:', error);
      await ctx.reply('❌ An error occurred during DAO creation.');
    }
  }

  /**
   * Handle text input for DAO creation steps
   */
  async handleTextInput(
    ctx: Context, 
    text: string, 
    session: DAOCreationSession,
    sessions: Map<string, DAOCreationSession>
  ): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      switch (session.step) {
        case 1:
          await this.handleNameInput(ctx, text, session, telegramId);
          break;
        case 2:
          await this.handleDescriptionInput(ctx, text, session, telegramId);
          break;
        case 4:
          await this.handleQuorumInput(ctx, text, session, telegramId);
          break;
        default:
          // Ignore text input for other steps
          break;
      }
    } catch (error) {
      console.error('Error handling text input:', error);
      await ctx.reply('❌ An error occurred processing your input.');
    }
  }

  /**
   * Handle name input (step 1)
   */
  private async handleNameInput(ctx: Context, name: string, session: DAOCreationSession, telegramId: string): Promise<void> {
    const validation = this.validateDAOName(name);
    
    if (!validation.valid) {
      await ctx.reply(`❌ ${validation.error}\n\nPlease try again:`);
      return;
    }

    session.data.name = name.trim();
    session.step = 2;
    await this.startDAOCreationStep2(ctx, telegramId);
  }

  /**
   * Handle description input (step 2)
   */
  private async handleDescriptionInput(ctx: Context, description: string, session: DAOCreationSession, telegramId: string): Promise<void> {
    const validation = this.validateDAODescription(description);
    
    if (!validation.valid) {
      await ctx.reply(`❌ ${validation.error}\n\nPlease try again:`);
      return;
    }

    session.data.description = description.trim();
    session.step = 3;
    await this.startDAOCreationStep3(ctx, telegramId);
  }

  /**
   * Handle quorum input (step 4)
   */
  private async handleQuorumInput(ctx: Context, quorumStr: string, session: DAOCreationSession, telegramId: string): Promise<void> {
    const trimmedInput = quorumStr.trim();
    
    // Remove % symbol if present
    const cleanInput = trimmedInput.replace('%', '');
    
    // Parse the number
    const quorum = parseInt(cleanInput);
    const validation = this.validateQuorum(quorum);
    
    if (!validation.valid) {
      await ctx.reply(`❌ ${validation.error}\n\nPlease enter a number between 50 and 85 (e.g., "60" or "60%"):`);
      return;
    }

    session.data.quorumPercentage = quorum;
    await this.showDAOCreationConfirmation(ctx, telegramId);
  }

  /**
   * Deploy the DAO after confirmation
   */
  private async deployDAO(ctx: Context, telegramId: string, sessions: Map<string, DAOCreationSession>): Promise<void> {
    const session = sessions.get(telegramId);
    if (!session || !this.isSessionComplete(session)) {
      await ctx.editMessageText('❌ Session incomplete. Please start over.');
      return;
    }

    const { name, description, votingPeriodHours, quorumPercentage } = session.data;
    
    try {
      await ctx.editMessageText(
        '🔍 **Checking wallet balance...**\n\n' +
        '⏳ Please wait while we verify you have sufficient funds for deployment.',
        { parse_mode: 'Markdown' }
      );

      // Check wallet balance before deployment
      const balanceCheck = await this.services.walletService.hasSufficientBalance(telegramId, '0.01');
      
      if (!balanceCheck.sufficient) {
        await ctx.editMessageText(
          `❌ **Insufficient Balance**\n\n` +
          `💰 **Current Balance:** ${balanceCheck.currentBalance || '0'} ETH\n` +
          `💸 **Required:** ${balanceCheck.requiredBalance} ETH\n\n` +
          `You need at least ${balanceCheck.requiredBalance} ETH to cover gas fees for DAO deployment.\n\n` +
          `**How to add funds:**\n` +
          `• Send ETH to your wallet address\n` +
          `• Use /wallet to see your address\n` +
          `• Try again with /create_dao once funded`,
          { parse_mode: 'Markdown' }
        );
        sessions.delete(telegramId);
        return;
      }

      await ctx.editMessageText(
        '🚀 **Deploying your DAO...**\n\n' +
        `💰 **Balance:** ${balanceCheck.currentBalance} ETH ✅\n` +
        '⏳ Please wait while we create your DAO on the blockchain.',
        { parse_mode: 'Markdown' }
      );

      // Create the DAO
      const result = await this.services.daoService.createDAO(telegramId, name!, description);
      
      if (!result.success) {
        // Check if it's a contract deployment issue
        if (result.error?.includes('contracts are not yet deployed') || result.error?.includes('zero address')) {
          await ctx.editMessageText(
            `⚠️ **Platform Setup Required**\n\n` +
            `The DAO platform contracts need to be deployed first.\n\n` +
            `**For Developers:**\n` +
            `• Run: npx hardhat ignition deploy ignition/modules/DAOPlatform.ts --network localhost\n` +
            `• Update contract addresses in src/config/contracts.ts\n\n` +
            `**For Users:**\n` +
            `Please contact the platform administrator to complete the setup.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await ctx.editMessageText(
            `❌ DAO Creation Failed\n\n${result.error}\n\nPlease try again with /create_dao`
          );
        }
        sessions.delete(telegramId);
        return;
      }

      // Clean up session
      sessions.delete(telegramId);

      await ctx.editMessageText(
        `🎉 **DAO Created Successfully!**\n\n` +
        `🏛️ **Name:** ${name}\n` +
        `🆔 **Address:** \`${result.daoAddress}\`\n` +
        `🔗 **Transaction:** \`${result.txHash}\`\n\n` +
        `Your DAO is now live on the blockchain! 🚀\n\n` +
        `**Next Steps:**\n` +
        `• Use /my_dao to manage your DAO\n` +
        `• Create proposals with /propose\n` +
        `• Set up a treasury with /create_vault`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Error deploying DAO:', error);
      sessions.delete(telegramId);
      await ctx.editMessageText(
        '❌ Deployment Error\n\nSomething went wrong. Please try again with /create_dao'
      );
    }
  }

  /**
   * Validate DAO name input
   */
  private validateDAOName(name: string): ValidationResult {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'DAO name cannot be empty' };
    }
    
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      return { valid: false, error: 'DAO name must be at least 3 characters long' };
    }
    if (trimmedName.length > 50) {
      return { valid: false, error: `Name too long (${trimmedName.length}/50 characters). Please shorten it.` };
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      return { valid: false, error: 'DAO name can only contain letters, numbers, spaces, hyphens, and underscores' };
    }
    
    return { valid: true };
  }

  /**
   * Validate DAO description input
   */
  private validateDAODescription(description: string): ValidationResult {
    if (!description || description.trim().length === 0) {
      return { valid: false, error: 'Description cannot be empty', wordCount: 0 };
    }
    
    const trimmedDescription = description.trim();
    const words = trimmedDescription.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    if (trimmedDescription.length < 10) {
      return { valid: false, error: 'Description must be at least 10 characters long', wordCount };
    }
    if (trimmedDescription.length > 2000) {
      return { valid: false, error: `Description too long (${trimmedDescription.length}/2000 characters). Please shorten it.`, wordCount };
    }
    if (wordCount > 300) {
      return { valid: false, error: `Description too long (${wordCount}/300 words). Please shorten it.`, wordCount };
    }
    
    return { valid: true, wordCount };
  }

  /**
   * Validate quorum percentage input
   */
  private validateQuorum(quorum: number): ValidationResult {
    if (isNaN(quorum)) {
      return { valid: false, error: 'Please enter a valid number for quorum percentage' };
    }
    if (!Number.isInteger(quorum)) {
      return { valid: false, error: 'Quorum percentage must be a whole number' };
    }
    if (quorum < 50) {
      return { valid: false, error: 'Quorum must be at least 50% to ensure meaningful governance' };
    }
    if (quorum > 85) {
      return { valid: false, error: 'Quorum cannot exceed 85% to maintain accessibility' };
    }
    return { valid: true };
  }

  /**
   * Check if session is complete
   */
  private isSessionComplete(session: DAOCreationSession): boolean {
    return !!(session.data.name && 
             session.data.description && 
             session.data.votingPeriodHours && 
             session.data.quorumPercentage);
  }

  /**
   * Get session from the sessions map
   */
  private getSession(telegramId: string): DAOCreationSession | undefined {
    return this.sessions?.get(telegramId);
  }
}