import { Telegraf, Context } from 'telegraf';
import { FirebaseService } from './FirebaseService';
import { WalletService } from './WalletService';
import { DAOService } from './DAOService';
import { VaultService } from './VaultService';

// Import modular components
import { TelegramServices } from './telegram/types';
import { CommandHandlers } from './telegram/CommandHandlers';
import { CallbackHandlers } from './telegram/CallbackHandlers';
import { UIComponents } from './telegram/UIComponents';
import { DAOCreationFlow } from './telegram/DAOCreationFlow';
import { SessionManager } from './telegram/SessionManager';
import { WalletOperations } from './telegram/WalletOperations';

/**
 * Refactored Telegram Bot Service
 * Now modular and maintainable with separated concerns
 */
export class TelegramBotService {
  private bot: Telegraf;
  private services: TelegramServices;
  
  // Modular components
  private ui: UIComponents;
  private daoFlow: DAOCreationFlow;
  private sessionManager: SessionManager;
  private walletOps: WalletOperations;
  private commandHandlers: CommandHandlers;
  private callbackHandlers: CallbackHandlers;

  constructor(
    botToken: string,
    firebaseService: FirebaseService,
    walletService: WalletService,
    daoService: DAOService,
    vaultService: VaultService
  ) {
    this.bot = new Telegraf(botToken);
    
    // Initialize services object
    this.services = {
      firebaseService,
      walletService,
      daoService,
      vaultService,
      ui: new UIComponents() // Add UI components to services
    };

    // Initialize modular components
    this.ui = new UIComponents();
    this.daoFlow = new DAOCreationFlow(this.services, this.ui);
    this.sessionManager = new SessionManager(this.daoFlow, this.services);
    this.walletOps = new WalletOperations(this.services, this.ui, this.sessionManager);
    this.commandHandlers = new CommandHandlers(this.services);
    this.callbackHandlers = new CallbackHandlers(this.services, this.sessionManager);

    // Add walletOperations to services for access by other components
    this.services.walletOperations = this.walletOps;

    this.setupBot();
  }

  /**
   * Setup bot commands and middleware
   */
  private setupBot(): void {
    this.setupCommands();
    this.setupMiddleware();
    this.setupErrorHandling();
  }

  /**
   * Setup all bot commands
   */
  private setupCommands(): void {
    // Main commands
    this.bot.command('start', (ctx) => this.commandHandlers.handleStartCommand(ctx));
    this.bot.command('wallet', (ctx) => this.commandHandlers.handleWalletCommand(ctx));
    this.bot.command('help', (ctx) => this.commandHandlers.handleHelpCommand(ctx));
    this.bot.command('my_dao', (ctx) => this.commandHandlers.handleMyDAOCommand(ctx));
    
    // Wallet commands
    this.bot.command('tokens', (ctx) => this.commandHandlers.handleTokensCommand(ctx));
    this.bot.command('transfer', (ctx) => this.commandHandlers.handleTransferCommand(ctx));
    
    // DAO commands
    this.bot.command('create_dao', (ctx) => this.commandHandlers.handleCreateDAOCommand(ctx));
    this.bot.command('propose', (ctx) => this.commandHandlers.handleProposeCommand(ctx));
    this.bot.command('vote', (ctx) => this.commandHandlers.handleVoteCommand(ctx));
    
    // Vault commands (placeholders)
    this.bot.command('create_vault', (ctx) => this.commandHandlers.handleCreateVaultCommand(ctx));
    this.bot.command('vault', (ctx) => this.commandHandlers.handleVaultCommand(ctx));
    this.bot.command('deposit', (ctx) => this.commandHandlers.handleDepositCommand(ctx));
    this.bot.command('withdraw', (ctx) => this.commandHandlers.handleWithdrawCommand(ctx));
  }

  /**
   * Setup middleware for logging and message handling
   */
  private setupMiddleware(): void {
    // Session middleware - initialize session for each context
    this.bot.use(async (ctx, next) => {
      // Initialize session if it doesn't exist
      ctx.session = ctx.session || {};
      await next();
    });
    
    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const userId = ctx.from?.id;
      const username = ctx.from?.username || 'unknown';
      
      console.log(`[${new Date().toISOString()}] User ${userId} (${username}) - ${ctx.updateType}`);
      
      await next();
      
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] Processed in ${duration}ms`);
    });

    // Callback query handler
    this.bot.on('callback_query', (ctx) => this.callbackHandlers.handleCallbackQuery(ctx));
    
    // Text message handler for interactive flows
    this.bot.on('text', async (ctx) => {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) return;

      // Check for active token transfer session first
      const tokenSession = this.sessionManager.getTokenTransferSession(telegramId);
      if (tokenSession && ctx.message && 'text' in ctx.message) {
        await this.walletOps.handleTokenTransferInput(ctx, ctx.message.text);
        return;
      }

      // Handle other text messages (DAO creation, etc.)
      await this.sessionManager.handleTextMessage(ctx);
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.bot.catch(async (err, ctx) => {
      console.error('Bot error:', err);
      
      try {
        await ctx.reply(
          this.ui.getErrorMessage('An unexpected error occurred. Please try again.'),
          this.ui.getBackToMainKeyboard()
        );
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    try {
      console.log('Starting Telegram bot...');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      // Start polling with manual polling to avoid hanging
      await this.bot.launch();
      
      // Configure polling options
      this.bot.telegram.setWebhook(''); // Clear any existing webhook
      
      console.log('Telegram bot started successfully');
      
      // Log session statistics periodically
      setInterval(() => {
        const stats = this.sessionManager.getSessionStats();
        if (stats.totalSessions > 0) {
          console.log('Session stats:', stats);
        }
      }, 300000); // Every 5 minutes
      
    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Export sessions for persistence if needed
        const sessions = this.sessionManager.exportSessions();
        if (Object.keys(sessions).length > 0) {
          console.log(`Backing up ${Object.keys(sessions).length} active sessions`);
          // Here you could save sessions to a file or database
        }
        
        // Stop the bot
        this.bot.stop(signal);
        console.log('Bot stopped successfully');
        
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    try {
      console.log('Stopping Telegram bot...');
      this.bot.stop('SIGTERM');
      console.log('Telegram bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
      throw error;
    }
  }

  /**
   * Get the bot instance (for testing or external access)
   */
  getBot(): Telegraf {
    return this.bot;
  }

  /**
   * Get session manager (for external monitoring)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get services (for external access)
   */
  getServices(): TelegramServices {
    return this.services;
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    uptime: number;
    sessions: number;
    lastError?: string;
  }> {
    try {
      const stats = this.sessionManager.getSessionStats();
      
      return {
        status: 'healthy',
        uptime: process.uptime(),
        sessions: stats.totalSessions
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        uptime: process.uptime(),
        sessions: 0,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupSessions(maxAgeMinutes: number = 60): Promise<number> {
    return this.sessionManager.cleanupExpiredSessions(maxAgeMinutes);
  }
}