import * as dotenv from 'dotenv';
import { TelegramBotService } from './services/TelegramBotService';
import { FirebaseService } from './services/FirebaseService';
import { WalletService } from './services/WalletService';
import { DAOService } from './services/DAOService';
import { VaultService } from './services/VaultService';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 * Implements Phase 3: Bot Core for Telegram DAO Platform
 * 
 * Phase 1: ✅ Wallet System - Complete
 * Phase 3: ✅ Bot Core - Complete (Command structure and routing)
 * Phase 4: 🚧 DAO Logic - Next phase
 */
class TelegramDAOPlatform {
  private telegramBot: TelegramBotService;
  private firebaseService: FirebaseService;
  private walletService: WalletService;
  private daoService: DAOService;
  private vaultService: VaultService;

  constructor() {
    console.log('🔧 Starting TelegramDAOPlatform constructor...');
    
    console.log('✅ Validating environment variables...');
    this.validateEnvironment();
    console.log('✅ Environment validation complete');
    
    // Initialize services
    console.log('🔥 Initializing Firebase service...');
    this.firebaseService = new FirebaseService();
    console.log('✅ Firebase service initialized');
    
    console.log('💰 Initializing Wallet service...');
    this.walletService = new WalletService(this.firebaseService);
    console.log('✅ Wallet service initialized');
    
    console.log('🏛️ Initializing DAO service...');
    this.daoService = new DAOService(this.walletService, this.firebaseService);
    console.log('✅ DAO service initialized');
    
    console.log('🔐 Initializing Vault service...');
    this.vaultService = new VaultService(this.walletService, this.firebaseService);
    console.log('✅ Vault service initialized');
    
    // Initialize Telegram bot with all services
    console.log('🤖 Getting bot token from environment...');
    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    console.log('✅ Bot token retrieved');
    
    console.log('🚀 Creating TelegramBotService instance...');
    this.telegramBot = new TelegramBotService(
      botToken,
      this.firebaseService,
      this.walletService,
      this.daoService,
      this.vaultService
    );
    console.log('✅ TelegramBotService instance created');
    
    // Set the telegramBot in the DAOService
    this.daoService.setTelegramBotService(this.telegramBot);
    
    // Make the bot instance globally available
    // Using globalThis instead of global
    globalThis.telegramBot = this.telegramBot;
  }

  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    const requiredEnvVars = [
      'TELEGRAM_BOT_TOKEN',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL',
      'ENCRYPTION_SALT'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:');
      missingVars.forEach(varName => console.error(`  - ${varName}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      process.exit(1);
    }
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Telegram DAO Platform...');
      console.log('📋 Phase 1: Wallet System Implementation');
      
      console.log('🔄 Initializing Telegram bot service...');
      // Start Telegram bot
      await this.telegramBot.start();
      console.log('✅ Telegram bot service started successfully!');
      
      console.log('✅ Telegram DAO Platform is running!');
      console.log('\n📱 Bot Features Available:');
      console.log('  • /start - Create Web3 wallet for users');
      console.log('  • /wallet - View wallet information');
      console.log('  • /create_dao - Create new DAO (Phase 3)');
      console.log('  • /propose - Create proposals (Phase 3)');
      console.log('  • /vote - Vote on proposals (Phase 3)');
      console.log('  • /my_dao - View DAO dashboard (Phase 3)');
      console.log('  • /help - Show available commands');
      console.log('\n🔐 Security Features:');
      console.log('  • AES-256 encryption for private keys');
      console.log('  • Secure key derivation using Telegram ID + salt');
      console.log('  • Firebase Firestore for encrypted data storage');
      console.log('\n🤖 Bot Core Features:');
      console.log('  • Command routing for group vs private messages');
      console.log('  • Group mode with @BotName mention support');
      console.log('  • Context-aware command responses');
      console.log('\n⏱️  Performance Target: Wallet creation < 2s')
      
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      console.log('\n🛑 Shutting down Telegram DAO Platform...');
      await this.telegramBot.stop();
      console.log('✅ Application shut down successfully.');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

// Handle application lifecycle
const app = new TelegramDAOPlatform();

// Start the application
app.start().catch(error => {
  console.error('❌ Application startup failed:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📡 Received SIGINT signal');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📡 Received SIGTERM signal');
  await app.shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});