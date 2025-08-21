import { Context } from 'telegraf';
import { TelegramServices, DAOCreationSession } from './types';
import { UIComponents } from './UIComponents';
import { DAOCreationFlow } from './DAOCreationFlow';
import { SessionManager } from './SessionManager';
import { ethers } from 'ethers';

/**
 * Callback handlers for the Telegram bot
 * Handles all callback_query interactions from inline keyboards
 */
export class CallbackHandlers {
  private services: TelegramServices;
  private ui: UIComponents;
  private daoFlow: DAOCreationFlow;
  private sessionManager: SessionManager;

  constructor(services: TelegramServices, sessionManager: SessionManager) {
    this.services = services;
    this.ui = new UIComponents();
    this.daoFlow = new DAOCreationFlow(services, this.ui);
    this.sessionManager = sessionManager;
    // Set the sessions map reference in the DAO flow
    this.daoFlow.setSessionsMap(this.sessionManager.getDAOCreationSessions());
  }

  /**
   * Handle all callback queries
   */
  async handleCallbackQuery(ctx: Context): Promise<void> {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;
  
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;
  
    const data = callbackQuery.data;
    console.log('Received callback data:', data);
  
    try {
      // Handle main menu callbacks
      if (data.startsWith('main_')) {
        await this.handleMainMenuCallback(ctx, data);
        return;
      }
  
      // Handle back navigation to main menu
      if (data === 'back_to_main') {
        await this.showMainMenu(ctx);
        return;
      }
  
      // Handle DAO selection for management
      if (data.startsWith('dao_select_')) {
        await this.handleDAOSelection(ctx, data);
        return;
      }
      
      // Handle DAO management callbacks
      if (data.startsWith('dao_manage_')) {
        await this.handleDAOManageCallback(ctx, data);
        return;
      }
      
      // Handle DAO confirm renounce callbacks
      if (data.startsWith('dao_confirm_renounce_')) {
        await this.handleDAOConfirmRenounceCallback(ctx, data);
        return;
      }
      
      // Handle DAO confirm transfer callbacks
      if (data.startsWith('dao_confirm_transfer_')) {
        await this.handleDAOConfirmTransferCallback(ctx, data);
        return;
      }
      
      // Handle DAO confirm add member callbacks
      if (data.startsWith('dao_confirm_add_')) {
        await this.handleDAOConfirmAddCallback(ctx, data);
        return;
      }
      
      // Handle DAO creation callbacks
      if (data.startsWith('dao_')) {
        const session = this.sessionManager.getDAOCreationSession(telegramId);
        await this.daoFlow.handleDAOCreationCallback(ctx, data, session, this.sessionManager.getDAOCreationSessions());
        return;
      }
  
      // Handle wallet callbacks
      if (data.startsWith('wallet_')) {
        await this.handleWalletCallback(ctx, data);
        return;
      }
  
      // Handle token callbacks
      if (data.startsWith('token_')) {
        await this.handleTokenCallback(ctx, data);
        return;
      }
  
      // Handle transfer callbacks
      if (data.startsWith('transfer_')) {
        await this.handleTransferCallback(ctx, data);
        return;
      }
  
      // If no handler matches, show unknown action error
      await ctx.answerCbQuery('❌ Unknown action. Please try again.');
      console.warn('Unhandled callback data:', data);
  
    } catch (error) {
      console.error('Error handling callback query:', error);
      await ctx.answerCbQuery('❌ An error occurred. Please try again.');
    }
  }

  /**
   * Handle main menu callback queries
   */
  /**
   * Handle main menu callbacks
   */
  private async handleMainMenuCallback(ctx: Context, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
      
      switch (data) {
        case 'main_create_dao':
          await this.handleCreateDAO(ctx);
          break;
          
        case 'main_join_dao':
          await this.handleJoinDAO(ctx);
          break;
          
        case 'main_my_wallet':
          await this.handleMyWallet(ctx);
          break;
          
        case 'main_manage_dao':
          await this.handleManageDAO(ctx);
          break;
          
        case 'main_help':
          await this.handleHelp(ctx);
          break;
          
        case 'main_menu':
          await this.showMainMenu(ctx);
          break;
          
        // Remove main_create_wallet case as it's now part of the My Wallet flow
          
        default:
          await ctx.editMessageText('❌ Unknown action.');
      }
    } catch (error) {
      console.error('Error handling main menu callback:', error);
      await ctx.answerCbQuery('❌ An error occurred.');
    }
  }

  /**
   * Show main menu
   */
  private async showMainMenu(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.editMessageText(
        this.ui.getMainMenuMessage(),
        this.ui.getMainMenuKeyboard()
      );
    } catch (error) {
      console.error('Error showing main menu:', error);
      await ctx.reply('❌ Failed to load main menu.');
    }
  }

  /**
   * Handle Create DAO callback
   */
  private async handleCreateDAO(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.editMessageText(
          '❌ *Wallet Required*\n\n' +
          'You need a wallet to create DAOs. Use "Create Wallet" first.',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      // Check if user already has maximum DAOs (using faster count method)
      const userDAOCount = await this.services.daoService.getUserDAOCount(telegramId);
      if (userDAOCount >= 5) {
        await ctx.editMessageText(
          '❌ *DAO Limit Reached*\n\n' +
          `You can only create up to 5 DAOs. You currently have ${userDAOCount} DAOs.\n\n` +
          'Use "My DAOs" to manage your existing DAOs.',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      // Initialize DAO creation session
      this.sessionManager.createDAOCreationSession(telegramId, {
        step: 1,
        data: {}
      });

      await this.daoFlow.startDAOCreationStep1(ctx, telegramId);
      
    } catch (error) {
      console.error('Error in handleCreateDAO:', error);
      await ctx.editMessageText('❌ Failed to start DAO creation.');
    }
  }

  /**
   * Handle Join DAO callback
   */
  private async handleJoinDAO(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.editMessageText(
          '❌ *Wallet Required*\n\n' +
          'You need a wallet to join DAOs. Use "Create Wallet" first.',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      // Start DAO join flow
      this.sessionManager.createDAOJoinSession(telegramId);
      
      await ctx.editMessageText(
        '🤝 *Join DAO*\n\n' +
        'Please enter the DAO contract address you want to join.\n\n' +
        '📋 *Requirements:*\n' +
        '• Address must start with "0x"\n' +
        '• Must be 42 characters long\n' +
        '• Must be registered with Deffy Contract Factory\n\n' +
        '💡 *Example:*\n' +
        '`0x1234567890123456789012345678901234567890`\n\n' +
        '✍️ *Please type the DAO address:*',
        { 
          parse_mode: 'Markdown',
          ...this.ui.getBackToMainKeyboard()
        }
      );
      
    } catch (error) {
      console.error('Error in handleJoinDAO:', error);
      await ctx.editMessageText('❌ Failed to start join DAO process.');
    }
  }

  /**
   * Handle My DAOs callback
   */
  private async handleMyDAOs(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.editMessageText(
          '❌ *Wallet Required*\n\n' +
          'You need a wallet to view DAOs. Use "Create Wallet" first.',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      await ctx.editMessageText('🔄 Loading your DAO information...');

      // Get user's DAOs
      const userDAOs = await this.services.daoService.getUserDAOs(telegramId);
      
      if (userDAOs.length === 0) {
        await ctx.editMessageText(
          '📊 *My DAO Dashboard*\n\n' +
          '🏛️ *No DAOs Found*\n\n' +
          'You haven\'t created or joined any DAOs yet.\n\n' +
          'Use "Create DAO" to create your first DAO!',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      let response = `📊 My DAO Dashboard\n\n`;
      response += `🏛️ Your DAOs (${userDAOs.length}/5)\n\n`;

      for (const dao of userDAOs) {
        response += `🏛️ ${dao.name}\n`;
        response += `📝 ${dao.description || 'No description available'}\n`;
        response += `🆔 Address: ${dao.address}\n`;
        response += `👥 Members: ${dao.memberCount}\n`;
        response += `📋 Total Proposals: ${dao.proposalCount}\n`;
        
        // Skip expensive proposal fetching for faster response
        // Users can use /my_dao command for detailed proposal info
        response += `🔥 Active Proposals: Use /my_dao for details\n\n`;
        response += `---\n\n`;
      }

      response += `Commands:\n`;
      response += `• /propose <dao_id> | <title> | <description>\n`;
      response += `• /vote <proposal_id> | <yes/no>\n`;
      response += `• /create_dao - Create new DAO`;

      await ctx.editMessageText(response, { 
        ...this.ui.getBackToMainKeyboard()
      });
      
    } catch (error) {
      console.error('Error in handleMyDAOs:', error);
      await ctx.editMessageText('❌ Failed to load DAO dashboard.');
    }
  }

  /**
   * Handle My Wallet callback
   */
  private async handleMyWallet(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      
      if (!hasWallet) {
        // Show wallet options instead of error message
        await ctx.editMessageText(
          '💼 *Wallet Options*\n\n' +
          'You don\'t have a wallet yet. Choose an option below:',
          { 
            ...this.ui.getWalletOptionsKeyboard()
          }
        );
        return;
      }

      // Use WalletOperations to show wallet with tokens
      await this.services.walletOperations.showWallet(ctx);
      
    } catch (error) {
      console.error('Error in handleMyWallet:', error);
      await ctx.editMessageText('❌ Failed to load wallet information.');
    }
  }

  /**
   * Handle wallet-related callbacks
   */
  private async handleWalletCallback(ctx: Context, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;
      
      switch (data) {
        case 'wallet_view_tokens':
          await this.services.walletOperations.showTokenBalances(ctx);
          break;
          
        case 'wallet_transfer_token':
          await this.services.walletOperations.startTokenTransfer(ctx);
          break;
          
        case 'wallet_eth_balance':
          await this.services.walletOperations.refreshWallet(ctx);
          break;
          
        case 'wallet_refresh':
          await this.services.walletOperations.refreshWallet(ctx);
          break;
          
        case 'wallet_create':
          await this.handleCreateWallet(ctx);
          break;
          
        case 'wallet_menu':
          await this.services.walletOperations.showWallet(ctx);
          break;
          
        case 'wallet_import':
          // Start wallet import flow
          this.sessionManager.createWalletSession(telegramId, 'import_wallet');
          
          await ctx.editMessageText(
            '📥 *Import Wallet*\n\n' +
            'Please enter your wallet\'s private key to import it.\n\n' +
            '⚠️ *Security Warning:*\n' +
            '• Your private key will be encrypted and stored securely\n' +
            '• Never share your private key with anyone else\n' +
            '• We recommend deleting your message after sending\n\n' +
            '✍️ *Please type your private key:*',
            { 
              parse_mode: 'Markdown',
              ...this.ui.getBackToMainKeyboard()
            }
          );
          break;
          
        default:
          await ctx.editMessageText('❌ Unknown wallet action.');
      }
    } catch (error) {
      console.error('Error handling wallet callback:', error);
      await ctx.answerCbQuery('❌ An error occurred.');
    }
  }

  /**
   * Handle token-related callbacks
   */
  private async handleTokenCallback(ctx: Context, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
      
      // Extract token address from callback data
      const tokenAddress = data.replace('token_', '');
      
      if (tokenAddress) {
        await this.services.walletOperations.handleTokenSelection(ctx, tokenAddress);
      } else {
        await ctx.editMessageText('❌ Invalid token selection.');
      }
    } catch (error) {
      console.error('Error handling token callback:', error);
      await ctx.answerCbQuery('❌ An error occurred.');
    }
  }

  /**
   * Handle transfer-related callbacks
   */
  private async handleTransferCallback(ctx: Context, data: string): Promise<void> {
    try {
      await ctx.answerCbQuery();
      
      switch (data) {
        case 'transfer_confirm':
          await this.services.walletOperations.executeTokenTransfer(ctx);
          break;
          
        case 'transfer_cancel':
          await this.services.walletOperations.cancelTokenTransfer(ctx);
          break;
          
        default:
          await ctx.editMessageText('❌ Unknown transfer action.');
      }
    } catch (error) {
       console.error('Error handling transfer callback:', error);
       await ctx.answerCbQuery('❌ An error occurred.');
     }
   }

  /**
   * Handle Create Wallet callback
   */
  private async handleCreateWallet(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      // Check if user already has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (hasWallet) {
        const address = await this.services.walletService.getWalletAddress(telegramId);
        await ctx.editMessageText(
          `💼 *Wallet Already Exists*\n\n` +
          `You already have a wallet set up.\n\n` +
          `📍 *Address:* \`${address}\`\n\n` +
          `Use "My Wallet" to view more details.`,
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      await ctx.editMessageText('🔄 Creating your Web3 wallet...');

      // Create new wallet
      const result = await this.services.walletService.createWallet(telegramId);
      
      if (!result.success) {
        await ctx.editMessageText(
          `❌ *Wallet Creation Failed*\n\n${result.error}\n\nPlease try again.`,
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      await ctx.editMessageText(
        this.ui.getWalletCreationSuccessMessage(result.address!, result.privateKey!),
        { 
          parse_mode: 'Markdown',
          ...this.ui.getBackToMainKeyboard()
        }
      );
      
    } catch (error) {
      console.error('Error in handleCreateWallet:', error);
      await ctx.editMessageText('❌ Failed to create wallet. Please try again.');
    }
  }

  /**
   * Handle Help callback
   */
  private async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `🤖 *Deffy DAO Bot - Help Guide*\n\n` +
      `*🏛️ DAO Management*\n` +
      `• Create and manage DAOs\n` +
      `• Create proposals and vote\n` +
      `• View DAO dashboard\n\n` +
      `*💼 Wallet Management*\n` +
      `• Secure Web3 wallet creation\n` +
      `• View wallet information\n` +
      `• Encrypted private key storage\n\n` +
      `*🏦 Treasury Management*\n` +
      `• Create treasury vaults\n` +
      `• Manage DAO funds\n` +
      `• Secure multi-sig operations\n\n` +
      `*🔒 Security Features*\n` +
      `• All private keys are encrypted\n` +
      `• Secure blockchain transactions\n` +
      `• Decentralized governance\n\n` +
      `*📊 Current Status: Phase 4*\n` +
      `✅ Wallet Creation\n` +
      `✅ DAO Creation & Management\n` +
      `✅ Proposal & Voting System\n` +
      `✅ Treasury Vaults\n\n` +
      `Need help? Contact support or check our documentation.`;

    await ctx.editMessageText(helpMessage, { 
      parse_mode: 'Markdown',
      ...this.ui.getBackToMainKeyboard()
    });
  }

  /**
   * Get DAO creation sessions (for external access)
   */
  getDAOCreationSessions(): Map<string, DAOCreationSession> {
    return this.sessionManager.getDAOCreationSessions();
  }

  /**
   * Handle Manage DAO callback
   */
  private async handleManageDAO(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      // Check if user has a wallet
      const hasWallet = await this.services.walletService.hasWallet(telegramId);
      if (!hasWallet) {
        await ctx.editMessageText(
          '❌ *Wallet Required*\n\n' +
          'You need a wallet to manage DAOs. Use "Create Wallet" first.',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      await ctx.editMessageText('🔄 Loading your DAO information...');

      // Get user's DAOs
      const userDAOs = await this.services.daoService.getUserDAOs(telegramId);
      
      if (userDAOs.length === 0) {
        await ctx.editMessageText(
          '🔧 *Manage DAO*\n\n' +
          '🏛️ *No DAOs Found*\n\n' +
          'You haven\'t created any DAOs yet.\n\n' +
          'Use "Create DAO" to create your first DAO!',
          { 
            parse_mode: 'Markdown',
            ...this.ui.getBackToMainKeyboard()
          }
        );
        return;
      }

      let response = `🔧 *Manage DAO*\n\n`;
      response += `🏛️ *Your DAOs (${userDAOs.length}/5)*\n\n`;
      response += `Select a DAO to manage:\n\n`;

      // Create inline keyboard with buttons for each DAO
      const inlineKeyboard: any[] = [];
      
      for (const dao of userDAOs) {
        // Add a button for each DAO
        inlineKeyboard.push([{
          text: `🏛️ ${dao.name}`,
          callback_data: `dao_select_${dao.address}`
        }]);
      }
      
      // Add back button
      inlineKeyboard.push([{
        text: '🔙 Back to Main Menu',
        callback_data: 'back_to_main'
      }]);

      await ctx.editMessageText(response, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
    } catch (error) {
      console.error('Error in handleManageDAO:', error);
      await ctx.editMessageText(
        '❌ An error occurred. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }
  
  /**
   * Handle DAO selection for management
   */
  private async handleDAOSelection(ctx: Context, data: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery(); // Acknowledge the callback
      
      // Extract the DAO address from the callback data
      const daoAddress = data.replace('dao_select_', '');
      
      // Verify the DAO exists and user is the owner
      const daoInfo = await this.services.daoService.getDAOInfo(daoAddress);
      if (!daoInfo) {
        await ctx.editMessageText(
          '❌ DAO not found. Please try again.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      // Check if user is the owner
      const isOwner = await this.services.vaultService.isDAOOwner(telegramId, daoAddress);
      if (!isOwner) {
        await ctx.editMessageText(
          '❌ You are not the owner of this DAO. Only the owner can manage it.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      // Display DAO details and management options
      let response = `🏛️ *${daoInfo.name}*\n\n`;
      response += `📝 ${daoInfo.description || 'No description available'}\n`;
      response += `🆔 Address: \`${daoAddress}\`\n`;
      response += `👥 Members: ${daoInfo.memberCount}\n`;
      response += `📋 Total Proposals: ${daoInfo.proposalCount}\n\n`;
      response += `Select an action to manage this DAO:`;
      
      await ctx.editMessageText(response, this.ui.getDAOManagementKeyboard());
      
    } catch (error) {
      console.error('Error in handleDAOSelection:', error);
      await ctx.editMessageText(
        '❌ An error occurred. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }
  
  /**
   * Handle DAO management callbacks
   */
  private async handleDAOManageCallback(ctx: Context, data: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery(); // Acknowledge the callback
      
      // Extract the action from the callback data
      const action = data.replace('dao_manage_', '');
      
      // Get the DAO address from the context
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !('message' in callbackQuery)) return;
      
      const message = callbackQuery.message;
      if (!message || !('text' in message)) return;
      
      // Extract DAO address from the message text
      const messageText = message.text;
      console.log('Message text for DAO address extraction:', messageText);
      
      // Try to extract from the previous callback data first (most reliable source)
      let daoAddress = '';
      const previousData = ctx.session?.lastCallbackData;
      if (previousData && previousData.startsWith('dao_select_')) {
        daoAddress = previousData.replace('dao_select_', '');
        console.log('Extracted from callback data:', daoAddress);
        
        // Validate with ethers.js
        if (!ethers.isAddress(daoAddress)) {
          daoAddress = ''; // Reset if invalid
          console.log('Address from callback data is invalid');
        }
      }
      
      // If not found in callback data, try message text patterns
      if (!daoAddress) {
        // Try multiple regex patterns to extract the address
        let addressMatch = messageText.match(/Address: \`([^\`]+)\`/i);
        console.log('Backtick match:', addressMatch);
        
        // If not found, try alternative format (HTML code tag)
        if (!addressMatch || !addressMatch[1]) {
          addressMatch = messageText.match(/Address: <code>([^<]+)<\/code>/i);
          console.log('HTML code tag match:', addressMatch);
        }
        
        // If not found, try without formatting
        if (!addressMatch || !addressMatch[1]) {
          addressMatch = messageText.match(/Address: (0x[a-fA-F0-9]+)/i);
          console.log('Plain text match:', addressMatch);
        }
        
        // If still not found, try to find any Ethereum address in the text
        if (!addressMatch || !addressMatch[1]) {
          // Look for any Ethereum address pattern
          const ethAddressRegex = /(0x[a-fA-F0-9]{40})/i;
          addressMatch = messageText.match(ethAddressRegex);
          console.log('Any Ethereum address match:', addressMatch);
        }
        
        // Set the address if found
        if (addressMatch && addressMatch[1]) {
          daoAddress = addressMatch[1];
        }
      }
      
      // Final validation with ethers.js
      if (!daoAddress || !ethers.isAddress(daoAddress)) {
        await ctx.editMessageText(
          '❌ Could not determine a valid DAO address. Please try again.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      // Verify ownership again for security
      const isOwner = await this.services.vaultService.isDAOOwner(telegramId, daoAddress);
      if (!isOwner) {
        await ctx.editMessageText(
          '❌ You are not the owner of this DAO. Only the owner can manage the DAO.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      // Handle the specific action
      switch (action) {
        case 'propose':
          // Implement propose functionality
          await ctx.editMessageText(
            '📝 Proposal creation will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'vote':
          // Implement vote functionality
          await ctx.editMessageText(
            '🗳️ Voting will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'execute':
          // Implement execute functionality
          await ctx.editMessageText(
            '✅ Execution will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'add':
          // Create a session for adding a member
          const addSession = this.sessionManager.createDAOManageSession(telegramId);
          addSession.data.daoAddress = daoAddress;
          addSession.data.action = 'add';
          
          // Store the callback data for future reference
      if (ctx.session) {
        ctx.session.lastCallbackData = data;
      }
          
          // Prompt user to enter the member's address
          await ctx.editMessageText(
            `➕ *Add Member to DAO*\n\nPlease enter the Ethereum address of the member you want to add to the DAO:\n\nDAO Address: \`${daoAddress}\``,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔙 Back', callback_data: `dao_select_${daoAddress}` }
                ]]
              }
            }
          );
          break;
          
        case 'remove':
          // Implement remove functionality
          await ctx.editMessageText(
            '➖ Removing members will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'pause':
          // Implement pause functionality
          await ctx.editMessageText(
            '⏸️ Pausing will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'unpause':
          // Implement unpause functionality
          await ctx.editMessageText(
            '▶️ Unpausing will be implemented in a future update.',
            this.ui.getDAOManagementKeyboard()
          );
          break;
          
        case 'renounce':
          // Start renounce ownership flow
          await ctx.editMessageText(
            '⚠️ Renounce DAO Ownership*\n\n' +
            'Are you sure you want to renounce ownership of this DAO?\n\n' +
            '*Warning:* This action is irreversible. Once you renounce ownership, ' +
            'you will no longer be able to manage this DAO.\n\n' +
            `DAO Address: \`${daoAddress}\``,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Yes, Renounce Ownership', callback_data: `dao_confirm_renounce_${daoAddress}` },
                  ],
                  [
                    { text: '❌ Cancel', callback_data: `dao_select_${daoAddress}` }
                  ]
                ]
              }
            }
          );
          break;
          
        case 'transfer':
          // Start transfer ownership flow
          // Create a session to collect the new owner address
          this.sessionManager.createDAOManageSession(telegramId);
          const transferSession = this.sessionManager.getDAOManageSession(telegramId);
          if (transferSession) {
            transferSession.data.daoAddress = daoAddress;
            transferSession.data.action = 'transfer';
          }
          
          await ctx.editMessageText(
            '🔀 *Transfer DAO Ownership*\n\n' +
            'Please enter the Ethereum address of the new owner.\n\n' +
            '*Requirements:*\n' +
            '• Address must start with "0x"\n' +
            '• Must be 42 characters long\n' +
            '• Cannot be the zero address\n\n' +
            '*Warning:* This action will transfer all DAO management rights to the new owner.\n\n' +
            `DAO Address: \`${daoAddress}\`\n\n` +
            '✍️ *Please type the new owner address:*',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '❌ Cancel', callback_data: `dao_select_${daoAddress}` }
                  ]
                ]
              }
            }
          );
          break;
          
        default:
          await ctx.editMessageText(
            '❌ Unknown action. Please try again.',
            this.ui.getDAOManagementKeyboard()
          );
      }
      
    } catch (error) {
      console.error('Error handling DAO management callback:', error);
      await ctx.editMessageText(
        '❌ An error occurred. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }

  /**
   * Handle DAO confirm renounce callback
   */
  private async handleDAOConfirmRenounceCallback(ctx: Context, data: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery(); // Acknowledge the callback
      
      // Extract the DAO address from the callback data
      const renounceDAOAddress = data.replace('dao_confirm_renounce_', '');
      
      await ctx.editMessageText('🔄 Processing renounce ownership transaction...');
      
      const renounceResult = await this.services.daoService.renounceDAOOwnership(
        telegramId,
        renounceDAOAddress
      );
      
      if (renounceResult.success) {
        await ctx.editMessageText(
          '✅ *Ownership Renounced Successfully*\n\n' +
          `You have successfully renounced ownership of the DAO.\n\n` +
          `Transaction Hash: \`${renounceResult.txHash}\``,
          this.ui.getBackToMainKeyboard()
        );
      } else {
        await ctx.editMessageText(
          '❌ *Renounce Ownership Failed*\n\n' +
          `Error: ${renounceResult.error}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔙 Back to DAO', callback_data: `dao_select_${renounceDAOAddress}` }
                ],
                [
                  { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error handling DAO confirm renounce callback:', error);
      await ctx.editMessageText(
        '❌ An error occurred. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }

  /**
   * Handle DAO confirm transfer callback
   */
  private async handleDAOConfirmTransferCallback(ctx: Context, data: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery(); // Acknowledge the callback
      
      // Extract DAO address and new owner address from callback data
      const transferData = data.replace('dao_confirm_transfer_', '');
      const [daoAddressToTransfer, newOwnerAddress] = transferData.split('_');
      
      await ctx.editMessageText('🔄 Processing transfer ownership transaction...');
      
      const transferResult = await this.services.daoService.transferDAOOwnership(
        telegramId,
        daoAddressToTransfer,
        newOwnerAddress
      );
      
      if (transferResult.success) {
        await ctx.editMessageText(
          '✅ *Ownership Transferred Successfully*\n\n' +
          `You have successfully transferred ownership of the DAO to:\n\n` +
          `\`${newOwnerAddress}\`\n\n` +
          `Transaction Hash: \`${transferResult.txHash}\``,
          this.ui.getBackToMainKeyboard()
        );
      } else {
        await ctx.editMessageText(
          '❌ *Transfer Ownership Failed*\n\n' +
          `Error: ${transferResult.error}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔙 Back to DAO', callback_data: `dao_select_${daoAddressToTransfer}` }
                ],
                [
                  { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error handling DAO confirm transfer callback:', error);
      await ctx.editMessageText(
        '❌ An error occurred. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }
  
  /**
   * Handle DAO confirm add member callback
   */
private async handleDAOConfirmAddCallback(ctx: Context, data: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;

    try {
      await ctx.answerCbQuery(); // Acknowledge the callback

      console.log(`[handleDAOConfirmAddCallback] Raw callback data: ${data}`);
      
      // Extract member address from callback data
      // New format is dao_confirm_add_${memberAddress}
      const memberAddress = data.replace("dao_confirm_add_", "");
      console.log(`[handleDAOConfirmAddCallback] Member address from callback: ${memberAddress}`);
      
      // Try to extract DAO address from the previous callback data
      let finalDaoAddress = '';
      
      // First try to get the DAO address directly from the session
      if (ctx.session?.currentDaoAddress && ethers.isAddress(ctx.session.currentDaoAddress)) {
        finalDaoAddress = ctx.session.currentDaoAddress;
        console.log('[handleDAOConfirmAddCallback] Using DAO address from session.currentDaoAddress:', finalDaoAddress);
      }
      // If not found, try from previous callback data
      else {
        console.log('[handleDAOConfirmAddCallback] Session data:', JSON.stringify(ctx.session || {}));
        const previousData = ctx.session?.lastCallbackData;
        console.log('[handleDAOConfirmAddCallback] Previous callback data:', previousData);
        
        if (previousData && previousData.startsWith('dao_select_')) {
          finalDaoAddress = previousData.replace('dao_select_', '');
          console.log('[handleDAOConfirmAddCallback] Extracted DAO address from previous callback:', finalDaoAddress);
          
          // Validate with ethers.js
          if (!ethers.isAddress(finalDaoAddress)) {
            finalDaoAddress = ''; // Reset if invalid
            console.log('[handleDAOConfirmAddCallback] DAO address from previous callback is invalid');
          }
        }
      }
      
      // If we don't have a valid DAO address yet, try to get it directly from the session manager
      if (!finalDaoAddress || !ethers.isAddress(finalDaoAddress)) {
        const session = this.sessionManager.getDAOManageSession(telegramId);
        console.log('[handleDAOConfirmAddCallback] DAO manage session:', JSON.stringify(session || {}));
        
        // Try to get the DAO address from the session directly
        if (session?.data?.daoAddress && ethers.isAddress(session.data.daoAddress)) {
          finalDaoAddress = session.data.daoAddress;
          console.log('[handleDAOConfirmAddCallback] Using DAO address from session:', finalDaoAddress);
        }
      }
    
    // Validate member address first
    if (!ethers.isAddress(memberAddress)) {
      await ctx.editMessageText(
        "❌ *Invalid Address Format*\n\n" +
          "Member address is invalid. Please try again.",
        this.ui.getBackToMainKeyboard()
      );
      return;
    }
    
    // Check if we have a valid DAO address from previous callback
    let daoInfo = null;
    if (finalDaoAddress && ethers.isAddress(finalDaoAddress)) {
      console.log(`[handleDAOConfirmAddCallback] Using DAO address from previous callback: ${finalDaoAddress}`);
      daoInfo = await this.services.daoService.getDAOInfo(finalDaoAddress);
    }

    // If no valid DAO address from previous callback, try from session
    if (!daoInfo) {
        console.log(`[handleDAOConfirmAddCallback] No valid DAO address from previous callback, checking session`);
        const session = this.sessionManager.getDAOManageSession(telegramId);
        const storedDaoAddress = session?.data?.daoAddress;

        if (storedDaoAddress && ethers.isAddress(storedDaoAddress)) {
          console.log(`[handleDAOConfirmAddCallback] Found DAO address in session: ${storedDaoAddress}`);
          const storedDaoInfo = await this.services.daoService.getDAOInfo(storedDaoAddress);
          
          if (storedDaoInfo) {
            finalDaoAddress = storedDaoAddress;
            daoInfo = storedDaoInfo;
            
            await ctx.editMessageText(
              "⚠️ *Using Stored DAO Address*\n\n" +
                `Using your previously stored DAO address.\n\n` +
                `DAO: ${storedDaoInfo.name} \`(${storedDaoAddress})\`\\n` +
                `Adding Member: ${memberAddress}`,
              { parse_mode: "Markdown" }
            );

            // Wait a moment for the user to read
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }
      }
      
      // If we still don't have a valid DAO address, show error
      if (!daoInfo || !finalDaoAddress) {
        await ctx.editMessageText(
          "❌ *No Valid DAO Address Found*\n\n" +
            "Could not find a valid DAO address to add this member to. Please select a DAO first using the manage menu.",
          this.ui.getBackToMainKeyboard()
        );
        return;
      }

    // Process the member addition with the validated DAO address
    return this.processAddMember(ctx, telegramId, finalDaoAddress, memberAddress);
  } catch (error: any) {
    console.error("Error handling DAO confirm add member callback:", error);
    await ctx.editMessageText(
      "❌ An error occurred. Please try again.",
      this.ui.getBackToMainKeyboard()
    );
  }
}
    
  /**
   * Process the actual member addition after validation
   */
  private async processAddMember(ctx: Context, telegramId: string, daoAddress: string, memberAddress: string): Promise<void> {
    try {
      // Log the addresses to help with debugging
      console.log(`[processAddMember] Adding member to DAO - DAO Address: ${daoAddress}, Member Address: ${memberAddress}`);
      
      // Double-check that addresses are valid and different
      if (!ethers.isAddress(daoAddress) || !ethers.isAddress(memberAddress)) {
        console.error(`[processAddMember] Invalid address format - DAO: ${daoAddress}, Member: ${memberAddress}`);
        await ctx.editMessageText(
          '❌ *Invalid Address Format*\n\n' +
          'One of the addresses is invalid. Please try again.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      if (daoAddress.toLowerCase() === memberAddress.toLowerCase()) {
        console.error(`[processAddMember] DAO and member addresses are the same: ${daoAddress}`);
        await ctx.editMessageText(
          '❌ *Invalid Address Combination*\n\n' +
          'The DAO address and member address cannot be the same. Please try again.',
          this.ui.getBackToMainKeyboard()
        );
        return;
      }
      
      await ctx.editMessageText('🔄 Processing add member transaction...');
      
      // Make sure we're passing the correct addresses in the correct order
      const addResult = await this.services.daoService.addMember(
        telegramId,
        daoAddress, // This should be the DAO contract address
        memberAddress // This should be the member's wallet address
      );
      
      if (addResult.success) {
        await ctx.editMessageText(
          '✅ *Member Added Successfully*\n\n' +
          `You have successfully added a new member to the DAO:\n\n` +
          `Member Address: <code>${memberAddress}</code>\n\n` +
          `Transaction Hash: <code>${addResult.txHash}</code>`,
          this.ui.getBackToMainKeyboard()
        );
      } else {
        await ctx.editMessageText(
          '❌ *Add Member Failed*\n\n' +
          `Error: ${addResult.error}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔙 Back to DAO', callback_data: `dao_select_${daoAddress}` }
                ],
                [
                  { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
              ]
            }
          }
        );
      }
    } catch (error: any) {
      console.error('Error processing add member:', error);
      await ctx.editMessageText(
        '❌ An error occurred while adding the member. Please try again.',
        this.ui.getBackToMainKeyboard()
      );
    }
  }
}