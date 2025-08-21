import { ethers } from 'ethers';
import { WalletService } from './WalletService';
import { FirebaseService } from './FirebaseService';
import { CONTRACT_ADDRESSES, CONTRACT_CONSTANTS, loadContractABI, NETWORK_CONFIG } from '../config/contracts';

/**
 * VaultService implements vault operations for Phase 4: DAO Logic
 * Handles vault creation, deposits, withdrawals, and spending proposals
 */
export class VaultService {
  private walletService: WalletService;
  private firebaseService: FirebaseService;
  private provider: ethers.Provider;
  private vaultFactoryContract: ethers.Contract | null = null;

  constructor(walletService: WalletService, firebaseService: FirebaseService) {
    this.walletService = walletService;
    this.firebaseService = firebaseService;
    
    // Initialize provider (Arbitrum by default)
    const rpcUrl = process.env.ARBITRUM_RPC_URL || NETWORK_CONFIG.arbitrum.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    this.initializeContracts();
  }

  /**
   * Initialize contract instances
   */
  private async initializeContracts(): Promise<void> {
    try {
      // Load VaultFactory contract ABI
      const vaultFactoryABI = await loadContractABI('VaultFactory');
      
      // Initialize VaultFactory contract instance
      this.vaultFactoryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.VaultFactory.address,
        vaultFactoryABI,
        this.provider
      );
      
      console.log('Vault contracts initialized successfully');
    } catch (error) {
      console.error('Error initializing Vault contracts:', error);
    }
  }

  /**
   * Task 4.5: Vault Creation
   * Creates a new vault for a DAO
   */
  async createVault(
    telegramId: string,
    daoAddress: string,
    withdrawalLimit: string = "100000000000000000", // 0.1 ETH default
    requiredSignatures: number = 2
  ): Promise<{ success: boolean; vaultAddress?: string; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      const withdrawalLimitBN = ethers.parseEther(ethers.formatEther(withdrawalLimit));
      const minLimit = ethers.parseEther(ethers.formatEther(CONTRACT_CONSTANTS.MIN_WITHDRAWAL_LIMIT));
      const maxLimit = ethers.parseEther(ethers.formatEther(CONTRACT_CONSTANTS.MAX_WITHDRAWAL_LIMIT));
      
      if (withdrawalLimitBN < minLimit || withdrawalLimitBN > maxLimit) {
        return { 
          success: false, 
          error: `Withdrawal limit must be between ${ethers.formatEther(minLimit)} and ${ethers.formatEther(maxLimit)} ETH` 
        };
      }
      
      if (requiredSignatures < CONTRACT_CONSTANTS.MIN_REQUIRED_SIGNATURES || 
          requiredSignatures > CONTRACT_CONSTANTS.MAX_REQUIRED_SIGNATURES) {
        return { 
          success: false, 
          error: `Required signatures must be between ${CONTRACT_CONSTANTS.MIN_REQUIRED_SIGNATURES} and ${CONTRACT_CONSTANTS.MAX_REQUIRED_SIGNATURES}` 
        };
      }
      
      // Check if user is the DAO owner
      const isOwner = await this.isDAOOwner(telegramId, daoAddress);
      if (!isOwner) {
        return { success: false, error: 'Only DAO owner can create vaults' };
      }
      
      // Check if DAO already has a vault
      const existingVault = await this.getDAOVault(daoAddress);
      if (existingVault) {
        return { success: false, error: 'DAO already has a vault attached' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      if (!this.vaultFactoryContract) {
        return { success: false, error: 'Vault Factory contract not initialized' };
      }
      
      // Create vault transaction
      const vaultFactoryWithSigner = this.vaultFactoryContract.connect(connectedWallet) as any;
      const tx = await vaultFactoryWithSigner.createVault(
        daoAddress,
        withdrawalLimit,
        requiredSignatures,
        {
          gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.CREATE_VAULT
        }
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Extract vault address from events
      const vaultCreatedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.vaultFactoryContract!.interface.parseLog(log);
          return parsed?.name === 'VaultCreated';
        } catch {
          return false;
        }
      });
      
      if (!vaultCreatedEvent) {
        return { success: false, error: 'Failed to extract vault address from transaction' };
      }
      
      const parsedEvent = this.vaultFactoryContract.interface.parseLog(vaultCreatedEvent);
      if (!parsedEvent) {
        return { success: false, error: 'Failed to parse vault creation event' };
      }
      const vaultAddress = parsedEvent.args.vaultAddress;
      
      // Store vault info in Firebase
      await this.storeVaultInfo(daoAddress, vaultAddress, telegramId, withdrawalLimit, requiredSignatures, tx.hash);
      
      console.log(`Vault created successfully: ${vaultAddress} for DAO ${daoAddress}`);
      
      return {
        success: true,
        vaultAddress,
        txHash: tx.hash
      };
      
    } catch (error) {
      console.error('Error creating vault:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.6: Deposit Funds
   * Deposits ETH or tokens into a vault
   */
  async depositFunds(
    telegramId: string,
    vaultAddress: string,
    amount: string,
    tokenAddress?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate amount
      const amountBN = ethers.parseEther(amount);
      if (amountBN <= 0) {
        return { success: false, error: 'Deposit amount must be greater than 0' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Load vault contract ABI
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, connectedWallet);
      
      let tx;
      
      if (!tokenAddress) {
        // ETH deposit
        tx = await vaultContract.depositETH({
          value: amountBN,
          gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.DEPOSIT
        });
      } else {
        // ERC20 token deposit
        // First, approve the vault to spend tokens
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) external returns (bool)'],
          connectedWallet
        );
        
        const approveTx = await tokenContract.approve(vaultAddress, amountBN);
        await approveTx.wait();
        
        // Then deposit tokens
        tx = await vaultContract.depositToken(tokenAddress, amountBN, {
          gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.DEPOSIT
        });
      }
      
      // Wait for transaction confirmation
      await tx.wait();
      
      // Store deposit info in Firebase
      await this.storeDepositInfo(vaultAddress, telegramId, amount, tokenAddress, tx.hash);
      
      console.log(`Deposit successful: ${amount} ${tokenAddress ? 'tokens' : 'ETH'} to vault ${vaultAddress}`);
      
      return {
        success: true,
        txHash: tx.hash
      };
      
    } catch (error) {
      console.error('Error depositing funds:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.7: Withdrawal Operations
   * Withdraws funds from vault (small amounts) or creates spending proposal (large amounts)
   */
  async withdrawFunds(
    telegramId: string,
    vaultAddress: string,
    amount: string,
    recipient: string,
    tokenAddress?: string,
    description?: string
  ): Promise<{ success: boolean; txHash?: string; proposalId?: number; error?: string }> {
    try {
      // Validate inputs
      const amountBN = ethers.parseEther(amount);
      if (amountBN <= 0) {
        return { success: false, error: 'Withdrawal amount must be greater than 0' };
      }
      
      if (!ethers.isAddress(recipient)) {
        return { success: false, error: 'Invalid recipient address' };
      }
      
      // Get vault info to check withdrawal limit
      const vaultInfo = await this.getVaultInfo(vaultAddress);
      if (!vaultInfo) {
        return { success: false, error: 'Vault not found' };
      }
      
      // Check if user is authorized (DAO member or vault signer)
      const isAuthorized = await this.isAuthorizedForVault(telegramId, vaultAddress);
      if (!isAuthorized) {
        return { success: false, error: 'You are not authorized to withdraw from this vault' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Load vault contract ABI
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, connectedWallet);
      
      const withdrawalLimitBN = ethers.parseEther(ethers.formatEther(vaultInfo.withdrawalLimit));
      
      if (amountBN <= withdrawalLimitBN) {
        // Direct withdrawal for small amounts
        const tx = await vaultContract.withdraw(
          tokenAddress || ethers.ZeroAddress,
          amountBN,
          recipient,
          {
            gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.WITHDRAW
          }
        );
        
        await tx.wait();
        
        // Store withdrawal info in Firebase
        await this.storeWithdrawalInfo(vaultAddress, telegramId, amount, recipient, tokenAddress, tx.hash);
        
        console.log(`Direct withdrawal successful: ${amount} ${tokenAddress ? 'tokens' : 'ETH'} from vault ${vaultAddress}`);
        
        return {
          success: true,
          txHash: tx.hash
        };
      } else {
        // Create spending proposal for large amounts
        if (!description) {
          return { success: false, error: 'Description required for large withdrawals' };
        }
        
        const tx = await vaultContract.createSpendingProposal(
          tokenAddress || ethers.ZeroAddress,
          amountBN,
          recipient,
          description,
          {
            gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.CREATE_PROPOSAL
          }
        );
        
        const receipt = await tx.wait();
        
        // Extract proposal ID from events
        const proposalCreatedEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = vaultContract.interface.parseLog(log);
            return parsed?.name === 'SpendingProposalCreated';
          } catch {
            return false;
          }
        });
        
        if (!proposalCreatedEvent) {
          return { success: false, error: 'Failed to extract proposal ID from transaction' };
        }
        
        const parsedEvent = vaultContract.interface.parseLog(proposalCreatedEvent);
        if (!parsedEvent) {
          return { success: false, error: 'Failed to parse spending proposal event' };
        }
        const proposalId = Number(parsedEvent.args.proposalId);
        
        // Store spending proposal info in Firebase
        await this.storeSpendingProposalInfo(vaultAddress, proposalId, telegramId, amount, recipient, description, tokenAddress, tx.hash);
        
        console.log(`Spending proposal created: ID ${proposalId} for ${amount} ${tokenAddress ? 'tokens' : 'ETH'} from vault ${vaultAddress}`);
        
        return {
          success: true,
          proposalId,
          txHash: tx.hash
        };
      }
      
    } catch (error) {
      console.error('Error withdrawing funds:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.8: Spending Proposal Approval
   * Approves a spending proposal in a vault
   */
  async approveSpendingProposal(
    telegramId: string,
    vaultAddress: string,
    proposalId: number
  ): Promise<{ success: boolean; txHash?: string; executed?: boolean; error?: string }> {
    try {
      // Check if user is authorized signer
      const isSigner = await this.isVaultSigner(telegramId, vaultAddress);
      if (!isSigner) {
        return { success: false, error: 'You are not an authorized signer for this vault' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Load vault contract ABI
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, connectedWallet);
      
      // Approve spending proposal
      const tx = await vaultContract.approveSpendingProposal(proposalId, {
        gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.APPROVE_SPENDING
      });
      
      const receipt = await tx.wait();
      
      // Check if proposal was executed automatically
      const executedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = vaultContract.interface.parseLog(log);
          return parsed?.name === 'SpendingProposalExecuted';
        } catch {
          return false;
        }
      });
      
      const executed = !!executedEvent;
      
      // Store approval info in Firebase
      await this.storeApprovalInfo(vaultAddress, proposalId, telegramId, executed, tx.hash);
      
      console.log(`Spending proposal ${proposalId} approved${executed ? ' and executed' : ''} in vault ${vaultAddress}`);
      
      return {
        success: true,
        txHash: tx.hash,
        executed
      };
      
    } catch (error) {
      console.error('Error approving spending proposal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get vault information
   */
  async getVaultInfo(vaultAddress: string): Promise<any | null> {
    try {
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, this.provider);
      
      const [daoAddress, withdrawalLimit, requiredSignatures, spendingProposalCount] = await Promise.all([
        vaultContract.daoAddress(),
        vaultContract.withdrawalLimit(),
        vaultContract.requiredSignatures(),
        vaultContract.spendingProposalCount()
      ]);
      
      // Get balances
      const ethBalance = await vaultContract.getBalance(ethers.ZeroAddress);
      
      return {
        address: vaultAddress,
        daoAddress,
        withdrawalLimit: withdrawalLimit.toString(),
        requiredSignatures: Number(requiredSignatures),
        spendingProposalCount: Number(spendingProposalCount),
        ethBalance: ethers.formatEther(ethBalance)
      };
    } catch (error) {
      console.error('Error getting vault info:', error);
      return null;
    }
  }

  /**
   * Get spending proposal details
   */
  async getSpendingProposal(vaultAddress: string, proposalId: number): Promise<any | null> {
    try {
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, this.provider);
      
      const proposal = await vaultContract.getSpendingProposal(proposalId);
      
      return {
        id: Number(proposal.id),
        token: proposal.token,
        amount: ethers.formatEther(proposal.amount),
        recipient: proposal.recipient,
        description: proposal.description,
        approvals: Number(proposal.approvals),
        deadline: Number(proposal.deadline),
        executed: proposal.executed
      };
    } catch (error) {
      console.error('Error getting spending proposal:', error);
      return null;
    }
  }

  /**
   * Get DAO's vault address
   */
  async getDAOVault(daoAddress: string): Promise<string | null> {
    try {
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      
      const vaultAddress = await daoContract.attachedVault();
      return vaultAddress !== ethers.ZeroAddress ? vaultAddress : null;
    } catch (error) {
      console.error('Error getting DAO vault:', error);
      return null;
    }
  }

  /**
   * Check if user is DAO owner
   */
  private async isDAOOwner(telegramId: string, daoAddress: string): Promise<boolean> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return false;
      
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      
      const owner = await daoContract.owner();
      return owner.toLowerCase() === userAddress.toLowerCase();
    } catch (error) {
      console.error('Error checking DAO ownership:', error);
      return false;
    }
  }

  /**
   * Check if user is authorized for vault operations
   */
  private async isAuthorizedForVault(telegramId: string, vaultAddress: string): Promise<boolean> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return false;
      
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, this.provider);
      
      // Check if user is an authorized signer or vault owner
      const [isAuthorizedSigner, owner] = await Promise.all([
        vaultContract.authorizedSigners(userAddress),
        vaultContract.owner()
      ]);
      
      return isAuthorizedSigner || owner.toLowerCase() === userAddress.toLowerCase();
    } catch (error) {
      console.error('Error checking vault authorization:', error);
      return false;
    }
  }

  /**
   * Check if user is a vault signer
   */
  private async isVaultSigner(telegramId: string, vaultAddress: string): Promise<boolean> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return false;
      
      const vaultABI = await loadContractABI('Vault');
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, this.provider);
      
      return await vaultContract.authorizedSigners(userAddress);
    } catch (error) {
      console.error('Error checking vault signer status:', error);
      return false;
    }
  }

  /**
   * Store vault information in Firebase
   */
  private async storeVaultInfo(
    daoAddress: string,
    vaultAddress: string,
    creator: string,
    withdrawalLimit: string,
    requiredSignatures: number,
    txHash: string
  ): Promise<void> {
    try {
      const vaultData = {
        address: vaultAddress,
        daoAddress,
        creator,
        withdrawalLimit,
        requiredSignatures,
        createdAt: new Date().toISOString(),
        txHash
      };
      
      await this.firebaseService.setDocument(`vaults/${vaultAddress}`, vaultData);
      
      // Also store in DAO's vault reference
      await this.firebaseService.setDocument(`daos/${daoAddress}/vault`, {
        address: vaultAddress,
        attachedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error storing vault info:', error);
    }
  }

  /**
   * Store deposit information in Firebase
   */
  private async storeDepositInfo(
    vaultAddress: string,
    depositor: string,
    amount: string,
    tokenAddress: string | undefined,
    txHash: string
  ): Promise<void> {
    try {
      const depositData = {
        vaultAddress,
        depositor,
        amount,
        tokenAddress: tokenAddress || 'ETH',
        depositedAt: new Date().toISOString(),
        txHash
      };
      
      const depositId = `${txHash}_${Date.now()}`;
      await this.firebaseService.setDocument(`vaults/${vaultAddress}/deposits/${depositId}`, depositData);
    } catch (error) {
      console.error('Error storing deposit info:', error);
    }
  }

  /**
   * Store withdrawal information in Firebase
   */
  private async storeWithdrawalInfo(
    vaultAddress: string,
    withdrawer: string,
    amount: string,
    recipient: string,
    tokenAddress: string | undefined,
    txHash: string
  ): Promise<void> {
    try {
      const withdrawalData = {
        vaultAddress,
        withdrawer,
        amount,
        recipient,
        tokenAddress: tokenAddress || 'ETH',
        withdrawnAt: new Date().toISOString(),
        txHash
      };
      
      const withdrawalId = `${txHash}_${Date.now()}`;
      await this.firebaseService.setDocument(`vaults/${vaultAddress}/withdrawals/${withdrawalId}`, withdrawalData);
    } catch (error) {
      console.error('Error storing withdrawal info:', error);
    }
  }

  /**
   * Store spending proposal information in Firebase
   */
  private async storeSpendingProposalInfo(
    vaultAddress: string,
    proposalId: number,
    creator: string,
    amount: string,
    recipient: string,
    description: string,
    tokenAddress: string | undefined,
    txHash: string
  ): Promise<void> {
    try {
      const proposalData = {
        id: proposalId,
        vaultAddress,
        creator,
        amount,
        recipient,
        description,
        tokenAddress: tokenAddress || 'ETH',
        createdAt: new Date().toISOString(),
        txHash
      };
      
      await this.firebaseService.setDocument(`vaults/${vaultAddress}/spendingProposals/${proposalId}`, proposalData);
    } catch (error) {
      console.error('Error storing spending proposal info:', error);
    }
  }

  /**
   * Store approval information in Firebase
   */
  private async storeApprovalInfo(
    vaultAddress: string,
    proposalId: number,
    approver: string,
    executed: boolean,
    txHash: string
  ): Promise<void> {
    try {
      const approvalData = {
        proposalId,
        vaultAddress,
        approver,
        executed,
        approvedAt: new Date().toISOString(),
        txHash
      };
      
      const approvalId = `${proposalId}_${approver}`;
      await this.firebaseService.setDocument(`vaults/${vaultAddress}/spendingProposals/${proposalId}/approvals/${approvalId}`, approvalData);
    } catch (error) {
      console.error('Error storing approval info:', error);
    }
  }
}