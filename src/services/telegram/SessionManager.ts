import { Context } from 'telegraf';
import { DAOCreationSession, DAOJoinSession, DAOManageSession, TokenTransferSession, WalletSession, TelegramServices } from './types';
import { DAOCreationFlow } from './DAOCreationFlow';
import { ethers } from 'ethers';

/**
 * Session Manager for Telegram bot
 * Handles all session state and user interaction flows
 */
export class SessionManager {
  private daoCreationSessions: Map<string, DAOCreationSession> = new Map();
  private daoJoinSessions: Map<string, DAOJoinSession> = new Map();
  private daoManageSessions: Map<string, DAOManageSession> = new Map();
  private tokenTransferSessions: Map<string, TokenTransferSession> = new Map();
  private walletSessions: Map<string, WalletSession> = new Map();
  private daoFlow: DAOCreationFlow;
  private services: TelegramServices;

  constructor(daoFlow: DAOCreationFlow, services: TelegramServices) {
    this.daoFlow = daoFlow;
    this.services = services;
    // Set the sessions map reference in the DAO flow
    this.daoFlow.setSessionsMap(this.daoCreationSessions);
  }

  /**
   * Handle text messages for interactive flows
   */
  async handleTextMessage(ctx: Context): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    
    if (!telegramId || !messageText) return;

    // Check if user is in DAO creation flow
    const daoSession = this.daoCreationSessions.get(telegramId);
    if (daoSession) {
      await this.daoFlow.handleTextInput(ctx, messageText, daoSession, this.daoCreationSessions);
      return;
    }

    // Check if user is in DAO join flow
    const joinSession = this.daoJoinSessions.get(telegramId);
    if (joinSession) {
      await this.handleDAOJoinInput(ctx, messageText, joinSession, telegramId);
      return;
    }
    
    // Check if user is in DAO manage flow
    const manageSession = this.daoManageSessions.get(telegramId);
    if (manageSession) {
      await this.handleDAOManageInput(ctx, messageText, manageSession, telegramId);
      return;
    }
    
    // Check if user is in wallet flow
    const walletSession = this.walletSessions.get(telegramId);
    if (walletSession) {
      await this.handleWalletInput(ctx, messageText, walletSession, telegramId);
      return;
    }

    // Handle other text-based flows here
    // For now, we'll ignore text messages that aren't part of a flow
  }

  /**
   * Create a new DAO creation session
   */
  createDAOCreationSession(telegramId: string, sessionData?: DAOCreationSession): DAOCreationSession {
    const session: DAOCreationSession = sessionData || {
      step: 1,
      data: {}
    };
    this.daoCreationSessions.set(telegramId, session);
    return session;
  }

  /**
   * Get DAO creation session
   */
  getDAOCreationSession(telegramId: string): DAOCreationSession | undefined {
    return this.daoCreationSessions.get(telegramId);
  }

  /**
   * Delete DAO creation session
   */
  deleteDAOCreationSession(telegramId: string): boolean {
    return this.daoCreationSessions.delete(telegramId);
  }

  /**
   * Check if user has an active DAO creation session
   */
  hasDAOCreationSession(telegramId: string): boolean {
    return this.daoCreationSessions.has(telegramId);
  }

  /**
   * Update DAO creation session step
   */
  updateDAOCreationStep(telegramId: string, step: number): void {
    const session = this.daoCreationSessions.get(telegramId);
    if (session) {
      session.step = step;
    }
  }

  /**
   * Update DAO creation session data
   */
  updateDAOCreationData(telegramId: string, data: Partial<DAOCreationSession['data']>): void {
    const session = this.daoCreationSessions.get(telegramId);
    if (session) {
      session.data = { ...session.data, ...data };
    }
  }

  /**
   * Get all active sessions count
   */
  getActiveSessionsCount(): number {
    return this.daoCreationSessions.size;
  }

  /**
   * Clean up expired sessions (optional - for memory management)
   */
  cleanupExpiredSessions(maxAgeMinutes: number = 60): number {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let cleaned = 0;

    for (const [telegramId, session] of this.daoCreationSessions.entries()) {
      // If session has a messageId, we can use it to determine age
      // For now, we'll implement a simple cleanup based on step timeout
      // This is a placeholder implementation
      if (session.messageId && (now - session.messageId) > maxAge) {
        this.daoCreationSessions.delete(telegramId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    daoCreationSessions: number;
    sessionsByStep: Record<number, number>;
  } {
    const sessionsByStep: Record<number, number> = {};
    
    for (const session of this.daoCreationSessions.values()) {
      sessionsByStep[session.step] = (sessionsByStep[session.step] || 0) + 1;
    }

    return {
      totalSessions: this.daoCreationSessions.size,
      daoCreationSessions: this.daoCreationSessions.size,
      sessionsByStep
    };
  }

  /**
   * Export sessions for backup/persistence (if needed)
   */
  exportSessions(): Record<string, DAOCreationSession> {
    const exported: Record<string, DAOCreationSession> = {};
    for (const [telegramId, session] of this.daoCreationSessions.entries()) {
      exported[telegramId] = { ...session };
    }
    return exported;
  }

  /**
   * Import sessions from backup/persistence (if needed)
   */
  importSessions(sessions: Record<string, DAOCreationSession>): void {
    this.daoCreationSessions.clear();
    for (const [telegramId, session] of Object.entries(sessions)) {
      this.daoCreationSessions.set(telegramId, session);
    }
  }

  /**
   * Get DAO creation sessions map
   */
  getDAOCreationSessions(): Map<string, DAOCreationSession> {
    return this.daoCreationSessions;
  }

  // Token Transfer Session Management
  
  /**
   * Create a new token transfer session
   */
  createTokenTransferSession(telegramId: string, sessionData?: Partial<TokenTransferSession>): TokenTransferSession {
    const session: TokenTransferSession = {
      step: 1,
      data: {},
      ...sessionData
    };
    
    this.tokenTransferSessions.set(telegramId, session);
    return session;
  }

  /**
   * Get token transfer session
   */
  getTokenTransferSession(telegramId: string): TokenTransferSession | undefined {
    return this.tokenTransferSessions.get(telegramId);
  }

  /**
   * Update token transfer session
   */
  updateTokenTransferSession(telegramId: string, updates: Partial<TokenTransferSession>): void {
    const session = this.tokenTransferSessions.get(telegramId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  /**
   * Delete token transfer session
   */
  deleteTokenTransferSession(telegramId: string): void {
    this.tokenTransferSessions.delete(telegramId);
  }

  /**
   * Get token transfer sessions map
   */
  getTokenTransferSessions(): Map<string, TokenTransferSession> {
    return this.tokenTransferSessions;
  }
  /**
   * Update wallet session
   */
  updateWalletSession(telegramId: string, updates: Partial<WalletSession>): void {
    const session = this.walletSessions.get(telegramId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  /**
   * Get wallet sessions map
   */
  getWalletSessions(): Map<string, WalletSession> {
    return this.walletSessions;
  }

  /**
   * Create a new DAO join session
   */
  createDAOJoinSession(telegramId: string): DAOJoinSession {
    const session: DAOJoinSession = {
      step: 1,
      data: {}
    };
    this.daoJoinSessions.set(telegramId, session);
    return session;
  }

  /**
   * Get DAO join session
   */
  getDAOJoinSession(telegramId: string): DAOJoinSession | undefined {
    return this.daoJoinSessions.get(telegramId);
  }

  /**
   * Delete DAO join session
   */
  deleteDAOJoinSession(telegramId: string): boolean {
    return this.daoJoinSessions.delete(telegramId);
  }

  /**
   * Handle DAO join input
   */
  private async handleDAOJoinInput(
    ctx: Context, 
    text: string, 
    session: DAOJoinSession,
    telegramId: string
  ): Promise<void> {
    try {
      if (session.step === 1) {
        // Validate DAO address format
        if (!text.startsWith('0x') || text.length !== 42) {
          await ctx.reply(
            '❌ *Invalid DAO Address*\n\n' +
            'Please enter a valid DAO contract address that starts with "0x" and is 42 characters long\.\n\n' +
            'Example: `0x1234567890123456789012345678901234567890`\n\n' +
            'The address must be registered with the Deffy Contract Factory\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }

        // Store the address and verify it exists
        session.data.daoAddress = text;
        
        // Check if DAO exists and is registered with the factory
        const daoInfo = await this.services.daoService.getDAOInfo(text);
        if (!daoInfo) {
          await ctx.reply(
            '❌ *DAO Not Found*\n\n' +
            'The provided DAO address is not registered with the Deffy Contract Factory\.\n\n' +
            'Please ensure you have the correct address of a DAO created through this platform\.',
            { parse_mode: 'MarkdownV2' }
          );
          this.deleteDAOJoinSession(telegramId);
          return;
        }

        // Check if user is already a member
        const isMember = await this.services.daoService.isDAOMember(telegramId, text);
        if (isMember) {
          const escapedDaoName = daoInfo.name.replace(/[_*\[\]()~`>#+=|{}.!\-]/g, '\\$&');
          await ctx.reply(
            '✅ *Already a Member*\\n' +
            '\\n' +
            `You are already a member of *${escapedDaoName}*\\n` +
            '\\n' +
            'Use /my\\_dao to view your DAO dashboard\\.',
            { parse_mode: 'MarkdownV2' }
          );
          this.deleteDAOJoinSession(telegramId);
          return;
        }
        
        // Proceed to step 2 - ask for join message
        session.step = 2;
        
        // Function to escape HTML special characters
        function escapeHtml(s: string) { 
          return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); 
        }
        
        await ctx.reply(
          `✏️ <b>Step 2: Join Message</b>\n\n` +
          `Please enter a message explaining why you want to join <b>${escapeHtml(daoInfo.name)}</b>\n\n` +
          `This message will be visible to the DAO owner when reviewing your request. ` +
          `Maximum 1000 words. Type your message below:`,
          { parse_mode: 'HTML' }
        );
      } else if (session.step === 2) {
        // Validate join message
        if (!text.trim()) {
          await ctx.reply(
            '❌ *Empty Message*\n\n' +
            'Please provide a message explaining why you want to join this DAO\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        // Check word count
        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount > 1000) {
          await ctx.reply(
            '❌ *Message Too Long*\n\n' +
            `Your message contains ${wordCount} words, but the maximum is 1000 words\. ` +
            'Please shorten your message and try again\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        // Store the join message
        session.data.joinMessage = text;
        
        // Process the join request
        if (session.data.daoAddress) {
          await this.processDAOJoin(ctx, telegramId, session.data.daoAddress, session.data.joinMessage);
        } else {
          await ctx.reply('❌ Session error. Please try again.');
          this.deleteDAOJoinSession(telegramId);
        }
      }
    } catch (error) {
      console.error('Error handling DAO join input:', error);
      await ctx.reply('❌ An error occurred. Please try again.');
      this.deleteDAOJoinSession(telegramId);
    }
  }

  /**
   * Process DAO join request
   */
  private async processDAOJoin(ctx: Context, telegramId: string, daoAddress: string, joinMessage?: string): Promise<void> {
    try {
      await ctx.reply('🔄 Processing your join request...');

      // Attempt to join the DAO
      const result = await this.services.daoService.joinDAO(telegramId, daoAddress, joinMessage);
      
      // Get DAO info for the response message
      const daoInfo = await this.services.daoService.getDAOInfo(daoAddress);
      
      if (result.success) {
        // Escape all special characters for MarkdownV2
        const escapedDaoName = daoInfo?.name.replace(/[_*\[\]()~`>#+=|{}.!\-]/g, '\\$&') || 'Unknown DAO';
        const escapedDescription = (daoInfo?.description || 'No description available').replace(/[_*\[\]()~`>#+=|{}.!\-]/g, '\\$&');
        
        // Make sure to escape all special characters in the entire message
        const message = 
          `🎉 *Join Request Submitted\!*\n` +
          `\n` +
          `🏛️ *DAO Name:* ${escapedDaoName}\n` +
          `📝 *Description:* ${escapedDescription}\n` +
          `🆔 *Address:* \`${daoAddress}\`\n` +
          `\n` +
          `Your request has been submitted to the DAO owner for review\. ` +
          `You will be notified when your request is approved\!\n` +
          `\n` +
          `Use /my\_dao to view your pending requests\.`;
          
        await ctx.reply(message, { parse_mode: 'MarkdownV2' });
      } else {
        const escapedError = result.error?.replace(/[_*\[\]()~`>#+=|{}.!\-]/g, '\\$&') || 'Unknown error';
        await ctx.reply(
          `❌ *Failed to Submit Join Request*\n\n` +
          `${escapedError}\n\n` +
          `Please try again or contact support\.`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      this.deleteDAOJoinSession(telegramId);
      
    } catch (error) {
      console.error('Error processing DAO join:', error);
      await ctx.reply('❌ An error occurred while processing your join request. Please try again.');
      this.deleteDAOJoinSession(telegramId);
    }
  }

  /**
   * Create a new DAO manage session
   */
  createDAOManageSession(telegramId: string): DAOManageSession {
    const session: DAOManageSession = {
      step: 1,
      data: {}
    };
    this.daoManageSessions.set(telegramId, session);
    return session;
  }

  /**
   * Get DAO manage session
   */
  getDAOManageSession(telegramId: string): DAOManageSession | undefined {
    return this.daoManageSessions.get(telegramId);
  }

  /**
   * Delete DAO manage session
   */
  deleteDAOManageSession(telegramId: string): boolean {
    return this.daoManageSessions.delete(telegramId);
  }

  /**
   * Check if user has an active DAO manage session
   */
  hasDAOManageSession(telegramId: string): boolean {
    return this.daoManageSessions.has(telegramId);
  }
  
  /**
   * Handle DAO manage input
   */
  async handleDAOManageInput(ctx: Context, input: string, session: DAOManageSession, telegramId: string): Promise<void> {
    try {
      const { step } = session;
      
      // Step 1: Process input based on the action type
      if (step === 1) {
        // For 'add' action, we expect a member address if DAO is already selected
        if (session.data.action === 'add' && session.data.daoAddress) {
          // Skip DAO validation - we already have a DAO address
          // Continue to member address validation in the 'else if' block below
          session.step = 2;
          // Update session data with memberAddress
          session.data = {
            ...session.data,
            memberAddress: input
          };
          // Save the updated session
          this.daoManageSessions.set(telegramId, session);
          return await this.handleDAOManageInput(ctx, input, session, telegramId);
        }
        
        // For other actions or when DAO is not selected, validate as DAO address
        // Validate DAO address format
        if (!ethers.isAddress(input)) {
          await ctx.reply(
            '❌ Invalid DAO address format. Please enter a valid Ethereum address.',
            { parse_mode: 'HTML' }
          );
          return;
        }
        
        // Check if DAO exists
        const daoInfo = await this.services.daoService.getDAOInfo(input);
        if (!daoInfo) {
          await ctx.reply(
            '❌ DAO not found. Please check the address and try again.',
            { parse_mode: 'HTML' }
          );
          return;
        }
        
        // Check if user is the owner
        const isOwner = await this.services.vaultService.isDAOOwner(telegramId, input);
        if (!isOwner) {
          await ctx.reply(
            '❌ You are not the owner of this DAO. Only the owner can manage the DAO.',
            { parse_mode: 'HTML' }
          );
          
          // Clean up the session
          this.deleteDAOManageSession(telegramId);
          return;
        }
        
        // Store DAO address in session
        session.data.daoAddress = input;
        
        // Show DAO management menu

        const escapeHtml = (text: string) => {
          return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        };
        
        await ctx.reply(
          `✅ **DAO Management**\n\n` +
          `You are now managing: **${daoInfo.name}**\n` +
          `Address: \`${input}\`\n\n` +
          `Select an action from the menu below:`,
          { 
            parse_mode: 'Markdown',
            reply_markup: this.services.ui.getDAOManagementKeyboard().reply_markup
          }
        );
        
        // Clean up the session as we're done with the input flow
        this.deleteDAOManageSession(telegramId);
      }
      // Handle add member action
      else if (session.data.action === 'add' && session.data.daoAddress) {
        // Validate member address using ethers.js
        if (!ethers.isAddress(input)) {
          await ctx.reply(
            '❌ **Invalid Address Format**\n\n' +
            'Please enter a valid Ethereum address starting with "0x" and 42 characters long.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Check if address is zero address
        if (input.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          await ctx.reply(
            '❌ **Invalid Address**\n\n' +
            'Cannot add the zero address as a member.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Check if the member address is the same as the DAO address
        if (input.toLowerCase() === session.data.daoAddress.toLowerCase()) {
          await ctx.reply(
            '❌ **Invalid Member Address**\n\n' +
            'The member address cannot be the same as the DAO address.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Check if the address is already a member in the DAO
        // We need to check if the input address (not the user's address) is a member
        // Use the checkAddressIsMember method instead of directly accessing the contract
        let isMember = false;
        try {
          // Call the DAO service to check if the address is a member
          const result = await this.services.daoService.checkAddressIsMember(
            session.data.daoAddress, 
            input
          );
          isMember = result.isMember;
        } catch (error) {
          console.warn(`Error checking if address is a member, assuming not a member: ${error}`);
        }
        
        if (isMember) {
          await ctx.reply(
            '❌ **Already a Member**\n\n' +
            'This address is already a member of this DAO.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Store the DAO address in the session for the callback handler to use
        if (ctx.session) {
          ctx.session.lastCallbackData = `dao_select_${session.data.daoAddress}`;
          ctx.session.currentDaoAddress = session.data.daoAddress; // Add a direct reference to the DAO address
          console.log(`[handleDAOManageInput] Stored DAO address in session: ${session.data.daoAddress}`);
        }
        
        // Confirm adding member
        await ctx.reply(
          '✅ **Confirm Add Member**\n\n' +
          `Are you sure you want to add this address as a member to your DAO?\n\n` +
          `Member Address: \`${input}\`\n` +
          `DAO Address: \`${session.data.daoAddress}\`\n\n` +
          'This will require a blockchain transaction.',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { 
                    text: '✅ Yes, Add Member', 
                    callback_data: `dao_confirm_add_${input}` 
                  },
                ],
                [
                  { 
                    text: '❌ Cancel', 
                    callback_data: `dao_select_${session.data.daoAddress}` 
                  }
                ]
              ]
            }
          }
        );
        
        // Don't delete the session yet, we need the DAO address for the callback
        // this.deleteDAOManageSession(telegramId);
      }
      // Handle transfer ownership action
      else if (session.data.action === 'transfer' && session.data.daoAddress) {
        // Validate new owner address
        if (!ethers.isAddress(input)) {
          await ctx.reply(
            '❌ **Invalid Address Format**\n\n' +
            'Please enter a valid Ethereum address starting with "0x" and 42 characters long.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Check if address is zero address
        if (input.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          await ctx.reply(
            '❌ **Invalid Address**\n\n' +
            'Cannot transfer ownership to the zero address.',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Confirm transfer ownership
        await ctx.reply(
          '⚠️ **Confirm Transfer Ownership**\n\n' +
          `Are you sure you want to transfer ownership of this DAO to:\n\n` +
          `\`${input}\`\n\n` +
          '**Warning:** This action will transfer all DAO management rights to the new owner.',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { 
                    text: '✅ Yes, Transfer Ownership', 
                    callback_data: `dao_confirm_transfer_${session.data.daoAddress}_${input}` 
                  },
                ],
                [
                  { 
                    text: '❌ Cancel', 
                    callback_data: `dao_select_${session.data.daoAddress}` 
                  }
                ]
              ]
            }
          }
        );
        
        // Clean up the session
        this.deleteDAOManageSession(telegramId);
      }
    } catch (error) {
      console.error('Error handling DAO manage input:', error);
      await ctx.reply('❌ An error occurred. Please try again.');
      this.deleteDAOManageSession(telegramId);
    }
  }

  /**
   * Create a wallet session
   */
  createWalletSession(telegramId: string, action: 'create_wallet' | 'import_wallet'): WalletSession {
    const session: WalletSession = {
      step: 1,
      data: {
        action
      }
    };
    this.walletSessions.set(telegramId, session);
    return session;
  }

  /**
   * Get wallet session
   */
  getWalletSession(telegramId: string): WalletSession | undefined {
    return this.walletSessions.get(telegramId);
  }

  /**
   * Delete wallet session
   */
  deleteWalletSession(telegramId: string): boolean {
    return this.walletSessions.delete(telegramId);
  }

  /**
   * Handle wallet import input
   */
  async handleWalletInput(ctx: Context, messageText: string, session: WalletSession, telegramId: string): Promise<void> {
    if (session.data.action === 'import_wallet') {
      // Handle private key input
      let privateKey = messageText.trim();
      
      // Try to import the wallet
      const result = await this.services.walletService.importWallet(telegramId, privateKey);
      
      if (result.success) {
        await ctx.reply(
          `✅ **Wallet Successfully Imported**\n\n` +
          `Your wallet has been imported and is ready to use.\n\n` +
          `📍 **Address:** \`${result.address}\`\n\n` +
          `⚠️ **Important:** For security reasons, please delete your message containing the private key.`,
          { 
            parse_mode: 'Markdown',
            ...this.services.ui.getBackToMainKeyboard()
          }
        );
        
        // Clean up the session
        this.deleteWalletSession(telegramId);
      } else {
        await ctx.reply(
          `❌ **Wallet Import Failed**\n\n${result.error}\n\nPlease try again with a valid private key.`,
          { 
            parse_mode: 'Markdown',
            ...this.services.ui.getBackToMainKeyboard()
          }
        );
      }
    }
  }
}