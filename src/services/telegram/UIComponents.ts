/**
 * UI Components for Telegram bot
 * Handles all inline keyboards, message formatting, and UI elements
 */
export class UIComponents {
  
  /**
   * Get welcome message based on wallet status
   */
  getWelcomeMessage(hasWallet: boolean): string {
    return hasWallet 
      ? `🎉 Welcome back to **Deffy DAO Bot**!\n\n` +
        `Your wallet is already set up and ready to use.\n\n` +
        `Choose an option below to get started:`
      : `🎉 Welcome to **Deffy DAO Bot**!\n\n` +
        `Your gateway to decentralized autonomous organizations.\n\n` +
        `Choose an option below to get started:`;
  }

  /**
   * Get main menu message
   */
  getMainMenuMessage(): string {
    return `🎉 Welcome back to Deffy DAO Bot!\n\n` +
           `Your wallet is already set up and ready to use.\n\n` +
           `Choose an option below to get started:`;
  }

  /**
   * Get main menu inline keyboard
   */
  getMainMenuKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏛️ Create DAO', callback_data: 'main_create_dao' },
            { text: '🤝 Join DAO', callback_data: 'main_join_dao' }
          ],
          [
            { text: '🔧 Manage DAO', callback_data: 'main_manage_dao' },
            { text: '💼 My Wallet', callback_data: 'main_my_wallet' }
          ],
          [
            { text: '❓ Help', callback_data: 'main_help' }
          ]
        ]
      }
    };
  }
  
  /**
   * Get DAO management menu keyboard
   */
  getDAOManagementKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Propose', callback_data: 'dao_manage_propose' },
            { text: '🗳️ Vote', callback_data: 'dao_manage_vote' },
            { text: '✅ Execute', callback_data: 'dao_manage_execute' }
          ],
          [
            { text: '➕ Add', callback_data: 'dao_manage_add' },
            { text: '➖ Remove', callback_data: 'dao_manage_remove' }
          ],
          [
            { text: '⏸️ Pause', callback_data: 'dao_manage_pause' },
            { text: '▶️ Unpause', callback_data: 'dao_manage_unpause' }
          ],
          [
            { text: '🔄 Renounce', callback_data: 'dao_manage_renounce' },
            { text: '🔀 Transfer', callback_data: 'dao_manage_transfer' }
          ],
          [
            { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
          ]
        ]
      }
    };
  }

  /**
   * Get back to main menu keyboard
   */
  getBackToMainKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
        ]]
      }
    };
  }

  /**
   * Get DAO creation step 1 keyboard (name input)
   */
  getDAOCreationStep1Keyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ Cancel', callback_data: 'dao_cancel' }
          ]
        ]
      }
    };
  }

  /**
   * Get DAO creation step 2 keyboard (description input)
   */
  getDAOCreationStep2Keyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⬅️ Back', callback_data: 'dao_step_1' },
            { text: '❌ Cancel', callback_data: 'dao_cancel' }
          ]
        ]
      }
    };
  }

  /**
   * Get DAO creation step 3 keyboard (voting period selection)
   */
  getDAOCreationStep3Keyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '24h', callback_data: 'dao_voting_24' },
            { text: '48h', callback_data: 'dao_voting_48' },
            { text: '72h', callback_data: 'dao_voting_72' }
          ],
          [
            { text: '1 week', callback_data: 'dao_voting_168' }
          ],
          [
            { text: '⬅️ Back', callback_data: 'dao_step_2' },
            { text: '❌ Cancel', callback_data: 'dao_cancel' }
          ]
        ]
      }
    };
  }

  /**
   * Get DAO creation step 4 keyboard (quorum input)
   */
  getDAOCreationStep4Keyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⬅️ Back', callback_data: 'dao_step_3' },
            { text: '❌ Cancel', callback_data: 'dao_cancel' }
          ]
        ]
      }
    };
  }

  /**
   * Get DAO creation confirmation keyboard
   */
  getDAOCreationConfirmationKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 Deploy DAO', callback_data: 'dao_deploy' }
          ],
          [
            { text: '⬅️ Back', callback_data: 'dao_step_4' },
            { text: '❌ Cancel', callback_data: 'dao_cancel' }
          ]
        ]
      }
    };
  }

  /**
   * Format DAO creation step 1 message
   */
  getDAOCreationStep1Message(): string {
    return `🏛️ **Create New DAO - Step 1/4**\n\n` +
      `📝 **DAO Name**\n\n` +
      `Please enter a name for your DAO:\n\n` +
      `**Requirements:**\n` +
      `• 1-50 characters\n` +
      `• Descriptive and unique\n` +
      `• No special characters\n\n` +
      `**Example:** \`Community Treasury DAO\``;
  }

  /**
   * Format DAO creation step 2 message
   */
  getDAOCreationStep2Message(name: string): string {
    return `🏛️ **Create New DAO - Step 2/4**\n\n` +
      `📋 **DAO Description**\n\n` +
      `**DAO Name:** ${name}\n\n` +
      `Please enter a description for your DAO:\n\n` +
      `**Requirements:**\n` +
      `• 1-500 words\n` +
      `• Clear purpose and goals\n` +
      `• What will this DAO do?\n\n` +
      `**Example:** \`A community-driven DAO focused on funding open-source projects and supporting developers.\``;
  }

  /**
   * Format DAO creation step 3 message
   */
  getDAOCreationStep3Message(name: string, description: string): string {
    return `🏛️ **Create New DAO - Step 3/4**\n\n` +
      `⏰ **Voting Period**\n\n` +
      `**DAO Name:** ${name}\n` +
      `**Description:** ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n\n` +
      `How long should members have to vote on proposals?\n\n` +
      `**Choose a voting period:**`;
  }

  /**
   * Format DAO creation step 4 message
   */
  getDAOCreationStep4Message(name: string, votingPeriodHours: number): string {
    return `🏛️ **Create New DAO - Step 4/4**\n\n` +
      `📊 **Quorum Percentage**\n\n` +
      `**DAO Name:** ${name}\n` +
      `**Voting Period:** ${votingPeriodHours} hours\n\n` +
      `Please enter the minimum percentage of members that must vote for a proposal to be valid:\n\n` +
      `**Requirements:**\n` +
      `• Between 50-85%\n` +
      `• Higher = more consensus needed\n` +
      `• Lower = easier to pass proposals\n\n` +
      `**Recommended:** 60% for most DAOs\n\n` +
      `**Example:** \`60\``;
  }

  /**
   * Format DAO creation confirmation message
   */
  getDAOCreationConfirmationMessage(data: any): string {
    return `🏛️ **Create New DAO - Confirmation**\n\n` +
      `Please review your DAO settings:\n\n` +
      `**📝 Name:** ${data.name}\n` +
      `**📋 Description:** ${data.description}\n` +
      `**⏰ Voting Period:** ${data.votingPeriodHours} hours\n` +
      `**📊 Quorum:** ${data.quorumPercentage}%\n\n` +
      `**💰 Deployment Cost:** ~0.01 ETH (gas fees)\n\n` +
      `⚠️ **Important:** Once deployed, these settings cannot be changed.\n\n` +
      `Ready to deploy your DAO?`;
  }

  /**
   * Format wallet creation success message
   */
  getWalletCreationSuccessMessage(address: string, privateKey: string): string {
    return `🎉 **Wallet Created Successfully!**\n\n` +
      `Your Web3 wallet is ready to use.\n\n` +
      `📍 **Address:**\n\`${address}\`\n\n` +
      `🔐 **Private Key:**\n\`${privateKey}\`\n\n` +
      `⚠️ **IMPORTANT SECURITY NOTICE:**\n` +
      `• Save your private key in a secure location\n` +
      `• Never share it with anyone\n` +
      `• We cannot recover lost private keys\n` +
      `• This message will not be shown again\n\n` +
      `🚀 **What's Next?**\n` +
      `• Fund your wallet with ETH for gas fees\n` +
      `• Create or join DAOs\n` +
      `• Start participating in governance!`;
  }

  /**
   * Format wallet info message
   */
  getWalletInfoMessage(address: string, balance?: string): string {
    return `💼 **Your Wallet Information**\n\n` +
      `📍 **Address:** \`${address}\`\n\n` +
      (balance ? `💰 **Balance:** ${balance} ETH\n\n` : '') +
      `🔒 Your private key is securely encrypted and stored.\n\n` +
      `**Available Actions:**\n` +
      `• Create DAOs\n` +
      `• Join existing DAOs\n` +
      `• Vote on proposals\n` +
      `• Manage treasury vaults`;
  }

  /**
   * Format simple error message
   */
  getErrorMessage(error: string): string {
    return `❌ ${error}`;
  }

  /**
   * Format error message with back button
   */
  getErrorMessageWithBack(error: string) {
    return {
      text: `❌ ${error}`,
      options: this.getBackToMainKeyboard()
    };
  }

  /**
   * Format loading message
   */
  getLoadingMessage(action: string): string {
    return `🔄 ${action}... Please wait.`;
  }

  /**
   * Format success message
   */
  getSuccessMessage(message: string): string {
    return `✅ ${message}`;
  }

  /**
   * Get wallet menu keyboard
   */
  getWalletMenuKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📤 Transfer ETH', callback_data: 'wallet_transfer_token' },
            { text: '💳 ETH Balance', callback_data: 'wallet_eth_balance' }
          ],
          [
            { text: '🔄 Refresh', callback_data: 'wallet_refresh' },
            { text: '🔙 Back to Main', callback_data: 'main_menu' }
          ]
        ]
      }
    };
  }

   /**
   * Get wallet options keyboard for users without a wallet
   */
  getWalletOptionsKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔑 Create New Wallet', callback_data: 'wallet_create' },
            { text: '📥 Import Existing Wallet', callback_data: 'wallet_import' }
          ],
          [
            { text: '🔙 Back to Main', callback_data: 'main_menu' }
          ]
        ]
      }
    };
  }

  /**
   * Get token selection keyboard - kept for backward compatibility
   * Note: Only ETH transfers are supported now
   */
  getTokenSelectionKeyboard(tokens: Array<{symbol: string, address: string}>) {
    // Since we only support ETH transfers now, we just return a back button
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Wallet', callback_data: 'wallet_menu' }]
        ]
      }
    };
  }

  /**
   * Get transfer confirmation keyboard
   */
  getTransferConfirmationKeyboard() {
    return {
      parse_mode: 'Markdown' as const,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Transfer', callback_data: 'transfer_confirm' },
            { text: '❌ Cancel', callback_data: 'transfer_cancel' }
          ],
          [
            { text: '🔙 Back to Wallet', callback_data: 'wallet_menu' }
          ]
        ]
      }
    };
  }

  /**
   * Get wallet info message with ETH and token balances
   */
  getWalletInfoWithTokensMessage(address: string, ethBalance: string, tokens: Array<{symbol: string, balance: string, name: string}>): string {
    let message = `💼 **My Wallet**\n\n`;
    message += `📍 **Address:** \`${this.formatAddress(address)}\`\n\n`;
    message += `💰 **ETH Balance:** ${this.formatBalance(ethBalance)} ETH\n\n`;
    
    if (tokens.length > 0) {
      message += `🪙 **Token Balances:**\n`;
      tokens.forEach(token => {
        message += `• **${token.symbol}**: ${this.formatBalance(token.balance)}\n`;
      });
    } else {
      message += `🪙 **Token Balances:** No tokens found\n`;
    }
    
    message += `\n💡 Use the buttons below to manage your wallet.`;
    return message;
  }

  /**
   * Get token transfer step 1 message (select token)
   */
  getTokenTransferStep1Message(): string {
    return `📤 **Transfer Token - Step 1/3**\n\n` +
           `Select the token you want to transfer:`;
  }

  /**
   * Get token transfer step 2 message (enter address)
   */
  getTokenTransferStep2Message(tokenSymbol: string): string {
    return `📤 **Transfer ${tokenSymbol} - Step 2/3**\n\n` +
           `Please enter the recipient's wallet address:\n\n` +
           `⚠️ **Important:** Make sure the address is correct. Transactions cannot be reversed!`;
  }

  /**
   * Get token transfer step 3 message (enter amount)
   */
  getTokenTransferStep3Message(tokenSymbol: string, toAddress: string, balance: string): string {
    return `📤 **Transfer ${tokenSymbol} - Step 3/3**\n\n` +
           `**To:** \`${this.formatAddress(toAddress)}\`\n` +
           `**Available Balance:** ${this.formatBalance(balance)} ${tokenSymbol}\n\n` +
           `Please enter the amount to transfer:`;
  }

  /**
   * Get token transfer confirmation message
   */
  getTokenTransferConfirmationMessage(tokenSymbol: string, amount: string, toAddress: string): string {
    return `📤 **Confirm Transfer**\n\n` +
           `**Token:** ${tokenSymbol}\n` +
           `**Amount:** ${amount}\n` +
           `**To:** \`${this.formatAddress(toAddress)}\`\n\n` +
           `⚠️ **Warning:** This action cannot be undone!\n\n` +
           `Do you want to proceed with this transfer?`;
  }

  /**
   * Get token list message
   */
  getTokenListMessage(tokens: Array<{symbol: string, balance: string, name: string}>): string {
    if (tokens.length === 0) {
      return `🪙 **Your Tokens**\n\n` +
             `No tokens found in your wallet.\n\n` +
             `💡 You can receive tokens by sharing your wallet address with others.`;
    }

    let message = `🪙 **Your Tokens**\n\n`;
    tokens.forEach((token, index) => {
      message += `${index + 1}. **${token.symbol}** (${token.name})\n`;
      message += `   Balance: ${this.formatBalance(token.balance)}\n\n`;
    });
    
    return message;
  }

  /**
   * Format address for display (show first 6 and last 4 characters)
   */
  private formatAddress(address: string): string {
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Format balance for display
   */
  private formatBalance(balance: string): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    if (num < 1000000) return (num / 1000).toFixed(2) + 'K';
    return (num / 1000000).toFixed(2) + 'M';
  }
}