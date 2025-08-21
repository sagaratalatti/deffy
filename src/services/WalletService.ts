import { ethers } from 'ethers';
import * as CryptoJS from 'crypto-js';
import { FirebaseService } from './FirebaseService';
import { NETWORK_CONFIG } from '../config/contracts';

// We only support native ETH transfers
// No ERC20 tokens are supported

export interface TokenInfo {
  address: 'native';
  name: 'Ethereum';
  symbol: 'ETH';
  decimals: 18;
  balance: string;
  balanceWei: bigint;
}

export interface TokenTransferParams {
  tokenAddress: 'native'; // Only native ETH is supported
  toAddress: string;
  amount: string;
  gasLimit?: string;
}

/**
 * WalletService handles Web3 wallet creation and management for Telegram users
 * Implements Phase 1: Wallet System from project.yaml
 */
export class WalletService {
  private firebaseService: FirebaseService;
  private encryptionSalt: string;
  private provider: ethers.JsonRpcProvider;

  constructor(firebaseService: FirebaseService) {
    this.firebaseService = firebaseService;
    this.encryptionSalt = process.env.ENCRYPTION_SALT || 'default-salt-change-in-production';
    
    // Initialize provider (Arbitrum by default)
    const rpcUrl = process.env.ARBITRUM_RPC_URL || NETWORK_CONFIG.arbitrum.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Task 1.1: Wallet Creation
   * Creates a new wallet for a Telegram user and stores it securely
   */
  async createWallet(telegramId: string): Promise<{ success: boolean; address?: string; privateKey?: string; error?: string }> {
    try {
      // Use ethers.Wallet.createRandom()
      const wallet = ethers.Wallet.createRandom();
      
      // Encrypt private key using AES-256 (Telegram ID + app salt)
      const encryptionKey = this.generateEncryptionKey(telegramId);
      const encryptedPrivateKey = CryptoJS.AES.encrypt(wallet.privateKey, encryptionKey).toString();
      
      // Store encrypted key + address in Firestore under /users/{telegram_id}
      const userData = {
        address: wallet.address,
        encryptedPrivateKey,
        createdAt: new Date().toISOString(),
        telegramId
      };
      
      await this.firebaseService.setDocument(`users/${telegramId}`, userData);
      
      console.log(`Wallet created for Telegram user ${telegramId}: ${wallet.address}`);
      
      // Return success object with address and private key
      return {
        success: true,
        address: wallet.address,
        privateKey: wallet.privateKey
      };
    } catch (error) {
      console.error('Error creating wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create wallet'
      };
    }
  }

  /**
   * Task 1.2: Wallet Usage Handler
   * Loads and decrypts wallet for transaction signing
   */
  async getWallet(telegramId: string): Promise<ethers.Wallet> {
    try {
      // Load encrypted key from Firestore
      const userData = await this.firebaseService.getDocument(`users/${telegramId}`);
      
      if (!userData || !userData.encryptedPrivateKey) {
        throw new Error('Wallet not found for user');
      }
      
      // Decrypt using server salt + Telegram ID
      const encryptionKey = this.generateEncryptionKey(telegramId);
      const decryptedPrivateKey = CryptoJS.AES.decrypt(userData.encryptedPrivateKey, encryptionKey).toString(CryptoJS.enc.Utf8);
      
      if (!decryptedPrivateKey) {
        throw new Error('Failed to decrypt private key');
      }
      
      // Create wallet instance for signing transactions
      const wallet = new ethers.Wallet(decryptedPrivateKey);
      
      return wallet;
    } catch (error) {
      console.error('Error loading wallet:', error);
      throw new Error('Failed to load wallet');
    }
  }

  /**
   * Get wallet address without decrypting private key
   */
  async getWalletAddress(telegramId: string): Promise<string | null> {
    try {
      const userData = await this.firebaseService.getDocument(`users/${telegramId}`);
      return userData?.address || null;
    } catch (error) {
      console.error('Error getting wallet address:', error);
      return null;
    }
  }

  /**
   * Check if user has a wallet
   */
  async hasWallet(telegramId: string): Promise<boolean> {
    try {
      const userData = await this.firebaseService.getDocument(`users/${telegramId}`);
      return !!(userData && userData.address && userData.encryptedPrivateKey);
    } catch (error) {
      console.error('Error checking wallet existence:', error);
      return false;
    }
  }

  /**
   * Sign transaction using user's wallet
   * Used for votes or proposals as specified in task 1.2
   */
  async signTransaction(telegramId: string, transaction: any): Promise<string> {
    try {
      const wallet = await this.getWallet(telegramId);
      
      // Use wallet.signTransaction() for votes or proposals
      const signedTransaction = await wallet.signTransaction(transaction);
      
      return signedTransaction;
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw new Error('Failed to sign transaction');
    }
  }

  /**
   * Get wallet balance in ETH
   */
  async getWalletBalance(telegramId: string): Promise<{ balance: string; balanceWei: bigint } | null> {
    try {
      const address = await this.getWalletAddress(telegramId);
      if (!address) {
        return null;
      }

      const balanceWei = await this.provider.getBalance(address);
      const balance = ethers.formatEther(balanceWei);

      return {
        balance,
        balanceWei
      };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return null;
    }
  }

  /**
   * Check if wallet has sufficient balance for gas fees
   * Estimates minimum required balance for DAO creation (approximately 0.01 ETH)
   */
  async hasSufficientBalance(telegramId: string, minBalanceEth: string = '0.01'): Promise<{ sufficient: boolean; currentBalance?: string; requiredBalance: string }> {
    try {
      const balanceInfo = await this.getWalletBalance(telegramId);
      if (!balanceInfo) {
        return {
          sufficient: false,
          requiredBalance: minBalanceEth
        };
      }

      const requiredBalanceWei = ethers.parseEther(minBalanceEth);
      const sufficient = balanceInfo.balanceWei >= requiredBalanceWei;

      return {
        sufficient,
        currentBalance: balanceInfo.balance,
        requiredBalance: minBalanceEth
      };
    } catch (error) {
      console.error('Error checking sufficient balance:', error);
      return {
        sufficient: false,
        requiredBalance: minBalanceEth
      };
    }
  }

  /**
   * Get ETH balance as TokenInfo
   */
  async getETHBalance(telegramId: string): Promise<TokenInfo | null> {
    try {
      const address = await this.getWalletAddress(telegramId);
      if (!address) {
        return null;
      }
      
      const balanceWei = await this.provider.getBalance(address);
      const balance = ethers.formatEther(balanceWei);
      
      return {
        address: 'native',
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        balance,
        balanceWei
      };
    } catch (error: any) {
      console.error(`Error getting ETH balance:`, error.message);
      return null;
    }
  }

  /**
   * Transfer native ETH
   */
  async transferToken(telegramId: string, params: TokenTransferParams): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const wallet = await this.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Parse amount to wei
      const amountWei = ethers.parseEther(params.amount);
      
      // Check balance
      const balance = await this.provider.getBalance(wallet.address);
      if (balance < amountWei) {
        return {
          success: false,
          error: 'Insufficient ETH balance'
        };
      }

      // Estimate gas for ETH transfer
      const gasEstimate = await this.provider.estimateGas({
        from: wallet.address,
        to: params.toAddress,
        value: amountWei
      });

      // Add 20% buffer to gas estimate
      const gasLimit = gasEstimate * 120n / 100n;

      // Calculate gas cost
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('50', 'gwei'); // Fallback gas price
      const gasCost = gasPrice * gasLimit;

      // Check if user has enough ETH for transfer + gas
      if (balance < (amountWei + gasCost)) {
        return {
          success: false,
          error: `Insufficient ETH for transfer and gas fees. You need approximately ${ethers.formatEther(gasCost)} ETH for gas.`
        };
      }

      // Execute ETH transfer
      const tx = await connectedWallet.sendTransaction({
        to: params.toAddress,
        value: amountWei,
        gasLimit
      });

      console.log(`ETH transfer initiated: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt?.status === 1) {
        return {
          success: true,
          txHash: tx.hash
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed'
        };
      }
    } catch (error: any) {
      console.error('Error transferring ETH:', error);
      return {
        success: false,
        error: error.message || 'Transfer failed'
      };
    }
  }

  /**
   * Validate Ethereum address
   */
  isValidAddress(address: string): boolean {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  /**
   * Generate encryption key from Telegram ID + app salt
   */
  private generateEncryptionKey(telegramId: string): string {
    return CryptoJS.SHA256(telegramId + this.encryptionSalt).toString();
  }

  /**
   * Import an existing wallet using a private key
   */
  async importWallet(telegramId: string, privateKey: string): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      // Validate private key format
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey);
      
      // Encrypt private key using AES-256 (Telegram ID + app salt)
      const encryptionKey = this.generateEncryptionKey(telegramId);
      const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, encryptionKey).toString();
      
      // Store encrypted key + address in Firestore under /users/{telegram_id}
      const userData = {
        address: wallet.address,
        encryptedPrivateKey,
        createdAt: new Date().toISOString(),
        telegramId,
        imported: true
      };
      
      await this.firebaseService.setDocument(`users/${telegramId}`, userData);
      
      console.log(`Wallet imported for Telegram user ${telegramId}: ${wallet.address}`);
      
      // Return success object with address
      return {
        success: true,
        address: wallet.address
      };
    } catch (error) {
      console.error('Error importing wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import wallet. Invalid private key.'
      };
    }
  }
}