import { Context } from 'telegraf';
import { TelegramServices } from './types';
import { UIComponents } from './UIComponents';

/**
 * Command handlers for the Telegram bot
 * Handles all /command interactions
 */
export class CommandHandlers {
  private services: TelegramServices;
  private ui: UIComponents;

  constructor(services: TelegramServices) {
    this.services = services;
    this.ui = new UIComponents();
  }

  /**
   * Handle /start command - Creates wallet for new users
   */
  async handleStartCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user. Please try again.');
        return;
      }

      // Check if user already has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      
      await ctx.reply(
        this.ui.getWelcomeMessage(hasWallet),
        this.ui.getMainMenuKeyboard()
      );
      
    } catch (error) {
      console.error('Error in start command:', error);
      await ctx.reply(
        '❌ Failed to load main menu. Please try again later or contact support.'
      );
    }
  }

  /**
   * Handle /wallet command - Show wallet information with tokens
   */
  async handleWalletCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      
      if (!hasWallet) {
        await ctx.reply(
          '❌ You don\'t have a wallet yet.\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      // Use WalletOperations to show wallet with tokens
      await this.services.walletOperations.showWallet(ctx);
      
    } catch (error) {
      console.error('Error in wallet command:', error);
      await ctx.reply('❌ Failed to retrieve wallet information.');
    }
  }

  /**
   * Handle /tokens command - Show token balances
   */
  async handleTokensCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      
      if (!hasWallet) {
        await ctx.reply(
          '❌ You don\'t have a wallet yet.\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      await this.services.walletOperations.showTokenBalances(ctx);
      
    } catch (error) {
      console.error('Error in tokens command:', error);
      await ctx.reply('❌ Failed to retrieve token information.');
    }
  }

  /**
   * Handle /transfer command - Start token transfer
   */
  async handleTransferCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      
      if (!hasWallet) {
        await ctx.reply(
          '❌ You don\'t have a wallet yet.\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      await this.services.walletOperations.startTokenTransfer(ctx);
      
    } catch (error) {
      console.error('Error in transfer command:', error);
      await ctx.reply('❌ Failed to start token transfer.');
    }
  }

  /**
   * Handle /help command
   */
  async handleHelpCommand(ctx: Context): Promise<void> {
    const helpMessage = `🤖 **Deffy DAO Bot - Help Guide**\n\n` +
      `**🏛️ DAO Management**\n` +
      `• \`/create_dao\` - Create a new DAO\n` +
      `• \`/my_dao\` - View your DAOs\n` +
      `• \`/propose <dao_id> | <title> | <description>\` - Create proposal\n` +
      `• \`/vote <proposal_id> | <yes/no>\` - Vote on proposals\n\n` +
      `**💼 Wallet Management**\n` +
      `• \`/wallet\` - View wallet info with tokens\n` +
      `• \`/tokens\` - View token balances\n` +
      `• \`/transfer\` - Transfer tokens\n` +
      `• \`/start\` - Create wallet (first time)\n\n` +
      `**🏦 Treasury Management**\n` +
      `• \`/create_vault\` - Create treasury vault\n` +
      `• \`/vault\` - View vault info\n` +
      `• \`/deposit\` - Deposit to vault\n` +
      `• \`/withdraw\` - Withdraw from vault\n\n` +
      `**🔒 Security Features**\n` +
      `• All private keys are encrypted\n` +
      `• Secure blockchain transactions\n` +
      `• Decentralized governance\n\n` +
      `**📊 Current Status: Phase 4**\n` +
      `✅ Wallet Creation\n` +
      `✅ DAO Creation & Management\n` +
      `✅ Proposal & Voting System\n` +
      `✅ Treasury Vaults\n\n` +
      `Need help? Contact support or check our documentation.`;

    await ctx.reply(helpMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
        ]]
      }
    });
  }

  /**
   * Handle /my_dao command
   */
  async handleMyDAOCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          '❌ You need a wallet first!\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      await ctx.reply('🔄 Loading your DAO information...');

      // Get user's DAOs
      const userDAOs = await this.services.daoService.getUserDAOs(telegramId);
      
      if (userDAOs.length === 0) {
        await ctx.reply(
          '📊 My DAO Dashboard\n\n' +
          '🏛️ No DAOs Found\n\n' +
          'You haven\'t created or joined any DAOs yet.\n\n' +
          'Use /create_dao to create your first DAO!',
          { 
            parse_mode: undefined,
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
              ]]
            }
          }
        );
        return;
      }

      let response = `📊 My DAO Dashboard\n\n`;
      response += `🏛️ Your DAOs (${userDAOs.length}/5)\n\n`;

      for (const dao of userDAOs) {
        response += `🏛️ ${dao.name}\n`;
        response += `📝 ${dao.description}\n`;
        response += `🆔 Address: ${dao.address}\n`;
        response += `👥 Members: ${dao.memberCount}\n`;
        response += `📋 Total Proposals: ${dao.proposalCount}\n`;
        
        // Skip expensive proposal fetching for faster response
        // Users can use callback interface for detailed proposal info
        response += `🔥 Active Proposals: Use main menu for details\n\n`;
        response += `---\n\n`;
      }

      response += `Commands:\n`;
      response += `• /propose <dao_id> | <title> | <description>\n`;
      response += `• /vote <proposal_id> | <yes/no>\n`;
      response += `• /create_dao - Create new DAO`;

      await ctx.reply(response, { 
        parse_mode: undefined,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
          ]]
        }
      });
      
    } catch (error) {
      console.error('Error in my_dao command:', error);
      await ctx.reply('❌ Failed to load DAO dashboard.');
    }
  }

  /**
   * Handle /propose command
   */
  async handleProposeCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      const chatType = ctx.chat?.type;
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          '❌ You need a wallet first!\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      const contextInfo = chatType === 'group' || chatType === 'supergroup' ? 
        '\n\n👥 **Group Proposal**\nThis proposal will be visible to all group members.' : 
        '\n\n👤 **Personal Proposal**\nManage proposals for your DAOs.';

      await ctx.reply(
        `📝 **Create Proposal**\n\n` +
        `Please provide the following information:\n\n` +
        `**Format:** \`/propose <dao_id> | <title> | <description>\`\n\n` +
        `**Example:** \`/propose dao123 | Increase treasury allocation | Proposal to allocate 10% more to development\`\n\n` +
        `**Parameters:**\n` +
        `• **DAO ID:** The DAO to create proposal for\n` +
        `• **Title:** Proposal title (max 100 characters)\n` +
        `• **Description:** Detailed description (max 500 characters)${contextInfo}\n\n` +
        `Use /my_dao to see your available DAOs.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Error in propose command:', error);
      await ctx.reply('❌ Failed to process proposal request.');
    }
  }

  /**
   * Handle /vote command
   */
  async handleVoteCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      const chatType = ctx.chat?.type;
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          '❌ You need a wallet first!\n\n' +
          'Use /start to create your Web3 wallet.'
        );
        return;
      }

      const contextInfo = chatType === 'group' || chatType === 'supergroup' ? 
        '\n\n👥 **Group Voting**\nView and vote on group proposals.' : 
        '\n\n👤 **Personal Voting**\nManage votes across your DAOs.';

      await ctx.reply(
        `🗳️ **Vote on Proposals**\n\n` +
        `Please provide the following information:\n\n` +
        `**Format:** \`/vote <proposal_id> | <yes/no>\`\n\n` +
        `**Example:** \`/vote prop123 | yes\`\n\n` +
        `**Parameters:**\n` +
        `• **Proposal ID:** The proposal to vote on\n` +
        `• **Vote:** Either "yes" or "no"${contextInfo}\n\n` +
        `Use /my_dao to see active proposals in your DAOs.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Error in vote command:', error);
      await ctx.reply('❌ Failed to process voting request.');
    }
  }

  /**
   * Handle /create_dao command
   */
  async handleCreateDAOCommand(ctx: Context): Promise<void> {
    try {
      const telegramId = ctx.from?.id?.toString();
      
      if (!telegramId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
      }

      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.reply(
          '❌ **Wallet Required**\n\n' +
          'You need a wallet to create DAOs. Use /start to create your Web3 wallet first.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Check if user already has maximum DAOs (using faster count method)
      const userDAOCount = await this.services.daoService.getUserDAOCount(telegramId);
      if (userDAOCount >= 5) {
        await ctx.reply(
          '❌ **DAO Limit Reached**\n\n' +
          `You can only create up to 5 DAOs. You currently have ${userDAOCount} DAOs.\n\n` +
          'Use /my_dao to manage your existing DAOs.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply(
        '🏛️ **Create New DAO**\n\n' +
        'Use the main menu to start the DAO creation process with a guided interface.\n\n' +
        'Click /start to access the main menu with DAO creation options.',
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Error in create_dao command:', error);
      await ctx.reply('❌ Failed to process DAO creation request.');
    }
  }

  /**
   * Handle vault-related commands
   */
  async handleCreateVaultCommand(ctx: Context): Promise<void> {
    await ctx.reply('🏦 Vault creation feature coming soon!');
  }

  async handleVaultCommand(ctx: Context): Promise<void> {
    await ctx.reply('🏦 Vault management feature coming soon!');
  }

  async handleDepositCommand(ctx: Context): Promise<void> {
    await ctx.reply('💰 Deposit feature coming soon!');
  }

  async handleWithdrawCommand(ctx: Context): Promise<void> {
    await ctx.reply('💸 Withdraw feature coming soon!');
  }
}