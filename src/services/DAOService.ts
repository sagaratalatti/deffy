import { ethers } from 'ethers';
import { WalletService } from './WalletService';
import { FirebaseService } from './FirebaseService';
import { CONTRACT_ADDRESSES, CONTRACT_CONSTANTS, loadContractABI, NETWORK_CONFIG } from '../config/contracts';
import { TelegramBotService } from './TelegramBotService';

// Minimal ABI for DAO contract functions
const DAO_MIN_ABI = [
  "function name() view returns (string)",
  "function owner() view returns (address)",
  "function members(address) view returns (bool)",
  "function addMember(address)"
];

/**
 * DAOService implements Phase 4: DAO Logic from project.yaml
 * Handles DAO creation, proposal management, voting, and vault operations
 */
export class DAOService {
  private walletService: WalletService;
  private firebaseService: FirebaseService;
  private telegramBotService: TelegramBotService | null = null;
  private provider: ethers.Provider;
  private daoFactoryContract: ethers.Contract | null = null;
  private vaultFactoryContract: ethers.Contract | null = null;

  constructor(walletService: WalletService, firebaseService: FirebaseService, telegramBotService?: TelegramBotService) {
    this.walletService = walletService;
    this.firebaseService = firebaseService;
    this.telegramBotService = telegramBotService || null;
    
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
      // Load contract ABIs
      const daoFactoryABI = await loadContractABI('DAOFactory');
      const vaultFactoryABI = await loadContractABI('VaultFactory');
      
      // Initialize contract instances
      this.daoFactoryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.DAOFactory.address,
        daoFactoryABI,
        this.provider
      );
      
      this.vaultFactoryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.VaultFactory.address,
        vaultFactoryABI,
        this.provider
      );
      
      console.log('DAO contracts initialized successfully');
    } catch (error) {
      console.error('Error initializing DAO contracts:', error);
    }
  }

  /**
   * Task 4.1: DAO Creation
   * Creates a new DAO for a Telegram user
   */
  async createDAO(telegramId: string, daoName: string, description?: string): Promise<{ success: boolean; daoAddress?: string; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoName || daoName.length === 0) {
        return { success: false, error: 'DAO name cannot be empty' };
      }
      
      if (daoName.length > CONTRACT_CONSTANTS.MAX_DAO_NAME_LENGTH) {
        return { success: false, error: `DAO name too long (max ${CONTRACT_CONSTANTS.MAX_DAO_NAME_LENGTH} characters)` };
      }
      
      // Check if user has reached max DAOs
      const userDAOs = await this.getUserDAOs(telegramId);
      if (userDAOs.length >= CONTRACT_CONSTANTS.MAX_DAOS_PER_USER) {
        return { success: false, error: `Maximum ${CONTRACT_CONSTANTS.MAX_DAOS_PER_USER} DAOs per user reached` };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      if (!this.daoFactoryContract) {
        return { success: false, error: 'DAO Factory contract not initialized' };
      }
      
      // Check if contract is deployed (not zero address)
      const factoryAddress = await this.daoFactoryContract.getAddress();
      if (factoryAddress === '0x0000000000000000000000000000000000000000') {
        return { 
          success: false, 
          error: '🚧 Smart contracts are not deployed yet. Please contact the administrator to deploy the contracts first.' 
        };
      }
      
      // Create DAO transaction
      const daoFactoryWithSigner = this.daoFactoryContract.connect(connectedWallet) as any;
      const tx = await daoFactoryWithSigner.createDAO(daoName, {
        gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.CREATE_DAO
      });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Extract DAO address from events
      const daoCreatedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.daoFactoryContract!.interface.parseLog(log);
          return parsed?.name === 'DAOCreated';
        } catch {
          return false;
        }
      });
      
      if (!daoCreatedEvent) {
        return { success: false, error: 'Failed to extract DAO address from transaction' };
      }
      
      const parsedEvent = this.daoFactoryContract.interface.parseLog(daoCreatedEvent);
      if (!parsedEvent) {
        return { success: false, error: 'Failed to parse DAO creation event' };
      }
      const daoAddress = parsedEvent.args.daoAddress;
      
      // Store DAO info in Firebase
      await this.storeDAOInfo(telegramId, daoAddress, daoName, description, tx.hash);
      
      console.log(`DAO created successfully: ${daoAddress} for user ${telegramId}`);
      
      return {
        success: true,
        daoAddress,
        txHash: tx.hash
      };
      
    } catch (error) {
      console.error('Error creating DAO:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.2: Proposal Creation
   * Creates a new proposal in a DAO
   */
  async createProposal(
    telegramId: string,
    daoAddress: string,
    title: string,
    description: string,
    targets: string[] = [],
    values: string[] = [],
    calldatas: string[] = [],
    durationHours: number = 168 // 7 days default
  ): Promise<{ success: boolean; proposalId?: number; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }
      
      if (!title || title.length === 0) {
        return { success: false, error: 'Proposal title cannot be empty' };
      }
      
      if (!description || description.length === 0) {
        return { success: false, error: 'Proposal description cannot be empty' };
      }
      
      const durationSeconds = durationHours * 3600;
      if (durationSeconds < CONTRACT_CONSTANTS.MIN_PROPOSAL_DURATION || 
          durationSeconds > CONTRACT_CONSTANTS.MAX_PROPOSAL_DURATION) {
        return { 
          success: false, 
          error: `Duration must be between ${CONTRACT_CONSTANTS.MIN_PROPOSAL_DURATION / 3600} and ${CONTRACT_CONSTANTS.MAX_PROPOSAL_DURATION / 3600} hours` 
        };
      }
      
      // If targets are provided, validate them along with values and calldatas
      if (targets.length > 0) {
        if (targets.length !== values.length || targets.length !== calldatas.length) {
          return { success: false, error: 'Targets, values, and calldatas must have the same length' };
        }
        
        // Validate target addresses
        for (const target of targets) {
          if (!target || !target.startsWith('0x') || target.length !== 42) {
            return { success: false, error: 'Invalid target address format' };
          }
        }
        
        // Validate values (ensure they are valid numbers)
        for (const value of values) {
          try {
            ethers.parseEther(value);
          } catch (error) {
            return { success: false, error: 'Invalid value format. Must be a valid ETH amount' };
          }
        }
      }
      
      // Check if user is a member of the DAO
      const isMember = await this.isDAOMember(telegramId, daoAddress);
      if (!isMember) {
        return { success: false, error: 'You are not a member of this DAO' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);
      
      // Create proposal transaction
      let tx;
      if (targets.length > 0) {
        // Convert values to BigInt
        const bigIntValues = values.map(value => ethers.parseEther(value));
        
        // Create proposal with targets, values, and calldatas
        tx = await daoContract.propose(
          targets,
          bigIntValues,
          calldatas,
          title,
          description,
          durationSeconds,
          { gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.CREATE_PROPOSAL }
        );
      } else {
        // Create simple proposal with just title and description
        tx = await daoContract.propose(title, description, durationSeconds, {
          gasLimit: CONTRACT_CONSTANTS.GAS_LIMITS.CREATE_PROPOSAL
        });
      }
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Extract proposal ID from events
      const proposalCreatedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = daoContract.interface.parseLog(log);
          return parsed?.name === 'ProposalCreated';
        } catch {
          return false;
        }
      });
      
      if (!proposalCreatedEvent) {
        return { success: false, error: 'Failed to extract proposal ID from transaction' };
      }
      
      const parsedEvent = daoContract.interface.parseLog(proposalCreatedEvent);
      if (!parsedEvent) {
        return { success: false, error: 'Failed to parse proposal creation event' };
      }
      const proposalId = Number(parsedEvent.args.proposalId);
      
      // Store proposal info in Firebase
      await this.storeProposalInfo(
        daoAddress, 
        proposalId, 
        title, 
        description, 
        telegramId, 
        tx.hash,
        targets,
        values,
        calldatas
      );
      
      console.log(`Proposal created successfully: ID ${proposalId} in DAO ${daoAddress}`);
      
      return {
        success: true,
        proposalId,
        txHash: tx.hash
      };
      
    } catch (error) {
      console.error('Error creating proposal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.3: Voting System
   * Casts a vote on a proposal
   */
  async vote(
    telegramId: string,
    daoAddress: string,
    proposalId: number,
    support: boolean
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      if (!proposalId || proposalId <= 0) {
        return { success: false, error: 'Invalid proposal ID' };
      }
      
      // Check if user is a member of the DAO
      const isMember = await this.isDAOMember(telegramId, daoAddress);
      if (!isMember) {
        return { success: false, error: 'You are not a member of this DAO' };
      }
      
      // Check if user has already voted
      const hasVoted = await this.hasUserVoted(telegramId, daoAddress, proposalId);
      if (hasVoted) {
        return { success: false, error: 'You have already voted on this proposal' };
      }
      
      // Get proposal details to check if voting is still open
      const proposal = await this.getProposal(daoAddress, proposalId);
      if (!proposal) {
        return { success: false, error: 'Proposal not found' };
      }
      
      if (proposal.deadline <= Date.now() / 1000) {
        return { success: false, error: 'Voting period has ended' };
      }
      
      if (proposal.executed) {
        return { success: false, error: 'Proposal has already been executed' };
      }
      
      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      
      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);
      
      // Estimate gas for the transaction
      const gasEstimate = await daoContract.vote.estimateGas(proposalId, support);
      console.log(`Gas estimate for voting: ${gasEstimate}`);
      
      // Cast vote transaction with gas limit
      const tx = await daoContract.vote(proposalId, support, {
        gasLimit: Math.max(Number(gasEstimate), CONTRACT_CONSTANTS.GAS_LIMITS.VOTE)
      });
      
      // Wait for transaction confirmation
      await tx.wait();
      
      // Store vote info in Firebase
      await this.storeVoteInfo(daoAddress, proposalId, telegramId, support, tx.hash);
      
      console.log(`Vote cast successfully: ${support ? 'YES' : 'NO'} on proposal ${proposalId} in DAO ${daoAddress}`);
      
      return {
        success: true,
        txHash: tx.hash
      };
      
    } catch (error) {
      console.error('Error casting vote:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Task 4.4: DAO Management
   * Gets user's DAOs and their details
   */
  async getUserDAOs(telegramId: string): Promise<any[]> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || !this.daoFactoryContract) {
        return [];
      }
      
      // Check if contract is deployed (not zero address)
      const factoryAddress = await this.daoFactoryContract.getAddress();
      if (factoryAddress === '0x0000000000000000000000000000000000000000') {
        console.warn('DAOFactory contract not deployed yet');
        return [];
      }
      
      // Get DAOs from contract
      const daoAddresses = await this.daoFactoryContract.getUserDAOs(userAddress);
      
      // Get DAO details for each address
      const daos = [];
      for (const daoAddress of daoAddresses) {
        try {
          const daoInfo = await this.getDAOInfo(daoAddress);
          if (daoInfo) {
            daos.push(daoInfo);
          }
        } catch (error) {
          console.error(`Error getting DAO info for ${daoAddress}:`, error);
        }
      }
      
      return daos;
    } catch (error) {
      console.error('Error getting user DAOs:', error);
      // If it's a contract call error due to undeployed contracts, return empty array
      if (error instanceof Error && error.message && error.message.includes('could not decode result data')) {
        console.warn('Contracts not deployed yet - returning empty DAO list');
        return [];
      }
      return [];
    }
  }

  /**
   * Get user DAO count (faster than getUserDAOs)
   */
  async getUserDAOCount(telegramId: string): Promise<number> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return 0;
      
      // Get DAO collection from Firebase (faster than blockchain calls)
      const userDAOs = await this.firebaseService.getCollection(`users/${telegramId}/daos`);
      
      return userDAOs.length;
    } catch (error) {
      console.error('Error getting user DAO count:', error);
      return 0;
    }
  }

  /**
   * Get detailed DAO information
   */
  async getDAOInfo(daoAddress: string): Promise<any | null> {
    try {
      // Validate address format
      if (!ethers.isAddress(daoAddress)) {
        console.error('Invalid DAO address format:', daoAddress);
        return null;
      }

      // Check if there's code at the address
      console.log(`[getDAOInfo] Checking DAO address: ${daoAddress}`);
      const code = await this.provider.getCode(daoAddress);
      if (code === '0x') {
        // This is likely a regular wallet address (EOA), not a contract
        console.error(`No contract code at address: ${daoAddress} - This appears to be a regular wallet address, not a DAO contract`);
        // Return null instead of throwing an error
        return null;
      }

      // Normalize the address
      const normalizedAddress = ethers.getAddress(daoAddress);
      
      // For ethers v6, we'll use a simpler approach to validate the DAO contract
      try {
        // Use the predefined minimal ABI for consistent function detection
        const tempContract = new ethers.Contract(normalizedAddress, DAO_MIN_ABI, this.provider);
        
        // Try to call basic functions that any DAO should have
        try {
          // First try to get the name - this is a simple read operation
          const contractName = await tempContract.name();
          console.log(`Found DAO with name: ${contractName}`);
          // If we get here, the contract has a name function that works
        } catch (nameError) {
          console.warn('Contract does not have a working name() function:', nameError);
          
          // If name() fails, try owner() as a fallback
          try {
            const ownerAddress = await tempContract.owner();
            console.log(`Found contract with owner: ${ownerAddress}`);
            // If we get here, at least the owner function works
          } catch (ownerError) {
            console.error('Contract does not have working owner() function:', ownerError);
            throw new Error(`Contract at address ${daoAddress} is not a compatible DAO contract`);
          }
        }
      } catch (error) {
        console.error('Error validating DAO contract:', error);
        // Provide a clear error message
        if (error instanceof Error) {
          throw error; // Re-throw our validation error if it's already formatted
        } else {
          throw new Error(`Contract at address ${daoAddress} is not a compatible DAO contract`);
        }
      }
      
      // Try to get existing DAO data from Firebase as a fallback
      let existingDaoData = null;
      try {
        // Use the correct method name getDocument instead of getDoc
        existingDaoData = await this.firebaseService.getDocument(`daos/${normalizedAddress}`);
      } catch (dbError) {
        console.warn('Error fetching DAO from database:', dbError);
        // Continue without database data
      }
      
      // Initialize with default values or database values
      const daoInfo = {
        address: normalizedAddress,
        name: existingDaoData?.name || 'Unknown DAO',
        owner: existingDaoData?.owner || ethers.ZeroAddress,
        memberCount: existingDaoData?.memberCount || 0,
        proposalCount: existingDaoData?.proposalCount || 0,
        attachedVault: existingDaoData?.attachedVault || null,
        isExternal: existingDaoData?.isExternal || false
      };
      
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(normalizedAddress, daoABI, this.provider);
      
      // Try to get name - ethers v6 compatible approach
      try {
        // In ethers v6, directly try to call the function
        const contractName = await daoContract.name();
        if (contractName && typeof contractName === 'string' && contractName.trim() !== '') {
          daoInfo.name = contractName;
        }
      } catch (nameError) {
        console.warn('Error getting DAO name:', nameError);
        // Keep the default or database-provided name
      }
      
      // Try to get owner - ethers v6 compatible approach
      try {
        // In ethers v6, directly try to call the function
        const contractOwner = await daoContract.owner();
        if (contractOwner && ethers.isAddress(contractOwner)) {
          daoInfo.owner = contractOwner;
        }
      } catch (ownerError) {
        console.warn('Error getting DAO owner:', ownerError);
        // Keep the default or database-provided owner
      }
      
      // Try to get memberCount - ethers v6 compatible approach
      try {
        // In ethers v6, directly try to call the function
        const count = await daoContract.memberCount();
        daoInfo.memberCount = Number(count);
      } catch (memberCountError) {
        console.warn('Error getting DAO member count:', memberCountError);
        // Keep the default or database-provided memberCount
      }
      
      // Try to get proposalCount
      try {
        if (daoContract.interface.hasFunction('proposalCount()')) {
          const count = await daoContract.proposalCount();
          daoInfo.proposalCount = Number(count);
        }
      } catch (proposalCountError) {
        console.warn('Error getting DAO proposal count:', proposalCountError);
        // Keep the default or database-provided proposalCount
      }
      
      // Try to get attachedVault
      try {
        if (daoContract.interface.hasFunction('attachedVault()')) {
          const vault = await daoContract.attachedVault();
          daoInfo.attachedVault = vault !== ethers.ZeroAddress ? vault : null;
        }
      } catch (vaultError) {
        console.warn('Error getting DAO attached vault:', vaultError);
        // Keep the default or database-provided attachedVault
      }
      
      return daoInfo;
    } catch (error) {
      console.error('Error getting DAO info:', error);
      return null;
    }
  }

  /**
   * Get proposal details
   */
  async getProposal(daoAddress: string, proposalId: number): Promise<any | null> {
    try {
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      
      const proposal = await daoContract.getProposal(proposalId);
      
      return {
        id: Number(proposal.id),
        title: proposal.title,
        description: proposal.description,
        yesVotes: Number(proposal.yesVotes),
        noVotes: Number(proposal.noVotes),
        deadline: Number(proposal.deadline),
        executed: proposal.executed,
        proposer: proposal.proposer
      };
    } catch (error) {
      console.error('Error getting proposal:', error);
      return null;
    }
  }

  /**
   * Check if an address is a member of a DAO
   * This method is used by the SessionManager to check if an address is a member
   * without confusing it with a DAO address
   */
  async checkAddressIsMember(daoAddress: string, memberAddress: string): Promise<{isMember: boolean, error?: string}> {
    try {
      // Validate DAO address format
      if (!ethers.isAddress(daoAddress)) {
        console.error('Invalid DAO address format:', daoAddress);
        return { isMember: false, error: 'Invalid DAO address format' };
      }
      
      // Validate member address format
      if (!ethers.isAddress(memberAddress)) {
        console.error('Invalid member address format:', memberAddress);
        return { isMember: false, error: 'Invalid member address format' };
      }
      
      // Check if there's code at the DAO address
      const code = await this.provider.getCode(daoAddress);
      if (code === '0x') {
        console.error('No DAO contract found at address:', daoAddress);
        return { isMember: false, error: `No DAO contract found at address: ${daoAddress}` };
      }
      
      // IMPORTANT: Do NOT check if the member address is a contract - it's a regular address
      
      // Use the minimal DAO ABI for consistent function detection
      const daoContract = new ethers.Contract(daoAddress, DAO_MIN_ABI, this.provider);
      
      // In ethers v6, we directly try to call the function instead of checking interface
      try {
        // Check if the address is a member - in ethers v6, we need to handle the return value properly
        const result = await daoContract.members(memberAddress);
        // Convert the result to a boolean explicitly
        const isMember = Boolean(result);
        console.log(`Membership check for ${memberAddress} in DAO ${daoAddress}: ${isMember}`);
        return { isMember };
      } catch (functionError) {
        console.warn('Error calling members function:', functionError);
        return { isMember: false, error: 'Contract does not support membership checking' };
      }
    } catch (error) {
      console.error('Error checking if address is a member:', error);
      return { isMember: false, error: 'Error checking membership status' };
    }
  }

  /**
   * Check if user is a member of a DAO
   */
  async isDAOMember(telegramId: string, daoAddress: string): Promise<boolean> {
    try {
      // Validate address format
      if (!ethers.isAddress(daoAddress)) {
        console.error('Invalid DAO address format:', daoAddress);
        return false;
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return false;
      
      // Use the checkAddressIsMember method to avoid checking if the member address is a contract
      const result = await this.checkAddressIsMember(daoAddress, userAddress);
      return result.isMember;
    } catch (error) {
      console.error('Error checking DAO membership:', error);
      return false;
    }
  }

  /**
   * Check if user has voted on a proposal
   */
  async hasUserVoted(telegramId: string, daoAddress: string, proposalId: number): Promise<boolean> {
    try {
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) return false;
      
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      
      return await daoContract.hasVoted(proposalId, userAddress);
    } catch (error) {
      console.error('Error checking vote status:', error);
      return false;
    }
  }

  /**
   * Join an existing DAO (request to join)
   * Since addMember is onlyOwner, this creates a join request
   */
  async joinDAO(telegramId: string, daoAddress: string, joinMessage?: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate DAO address using ethers.js
      if (!ethers.isAddress(daoAddress)) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      // Check if DAO exists and is registered with factory
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found or not registered with Deffy Contract Factory' };
      }

      // Check if user is already a member
      const isMember = await this.isDAOMember(telegramId, daoAddress);
      if (isMember) {
        return { success: false, error: 'You are already a member of this DAO' };
      }

      // Get user's wallet address
      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress) {
        return { success: false, error: 'User wallet not found' };
      }

      // Get DAO creator's Telegram ID from Firestore
      const daoData = await this.firebaseService.getDocument(`daos/${daoAddress}`);
      if (!daoData) {
        return { success: false, error: 'DAO information not found in database' };
      }
      
      const creatorTelegramId = daoData.creator;

      // Store join request in the structured format requested
      // Add user's ethereum address to the join_requests collection under the DAO
      await this.firebaseService.setDocument(`daos/${daoAddress}/join_requests/${userAddress}`, {
        userTelegramId: telegramId,
        userAddress: userAddress,
        joinMessage: joinMessage || '',
        requestedAt: new Date().toISOString(),
        status: 'pending'
      });

      // Also store in user's join requests for reference
      await this.firebaseService.setDocument(`users/${telegramId}/joinRequests/${daoAddress}`, {
        daoAddress: daoAddress,
        daoName: daoInfo.name,
        requestedAt: new Date().toISOString(),
        status: 'pending'
      });

      // Send notification to DAO owner
      try {
        // Get the bot instance from the TelegramBotService
        if (this.telegramBotService && creatorTelegramId) {
          const bot = this.telegramBotService.getBot();
          
          // Function to escape HTML special characters
          function escapeHtml(s: string) { 
            return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)); 
          }
          
          // Prepare notification message
          const messageLines = [
            '🔔 <b>New DAO Join Request</b>',
            '',
            `New request to join <b>${escapeHtml(daoInfo.name)}</b>: <code>${escapeHtml(daoInfo.address)}</code>`,
            '',
            `<b>User Address:</b> <code>${escapeHtml(userAddress)}</code>`,
            `<b>Requested At:</b> ${escapeHtml(new Date().toLocaleString())}`
          ];
          
          // Add join message if provided
          if (joinMessage) {
            messageLines.push('');
            messageLines.push('<b>Join Message:</b>');
            messageLines.push(escapeHtml(joinMessage));
          }
          
          messageLines.push('');
          messageLines.push('Use /my_dao to view and manage join requests.');
          
          // Send notification message to the DAO owner
          await bot.telegram.sendMessage(
            creatorTelegramId,
            messageLines.join('\n'),
            { parse_mode: 'HTML' }
          );
        }
      } catch (notificationError) {
        console.error('Error sending notification to DAO owner:', notificationError);
        // Continue even if notification fails
      }

      return { 
        success: true, 
        error: 'Join request submitted. The DAO owner will review your request.' 
      };
    } catch (error) {
      console.error('Error joining DAO:', error);
      return { success: false, error: 'Failed to join DAO. Please try again.' };
    }
  }

  /**
   * Store DAO information in Firebase
   */
  private async storeDAOInfo(telegramId: string, daoAddress: string, daoName: string, description: string | undefined, txHash: string): Promise<void> {
    try {
      const daoData = {
        address: daoAddress,
        name: daoName,
        description: description || '',
        creator: telegramId,
        createdAt: new Date().toISOString(),
        txHash
      };
      
      await this.firebaseService.setDocument(`daos/${daoAddress}`, daoData);
      
      // Also store in user's DAO list
      const userDAORef = `users/${telegramId}/daos/${daoAddress}`;
      await this.firebaseService.setDocument(userDAORef, {
        address: daoAddress,
        name: daoName,
        description: description || '',
        role: 'owner',
        joinedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error storing DAO info:', error);
    }
  }

  /**
   * Store proposal information in Firebase
   */
  private async storeProposalInfo(
    daoAddress: string,
    proposalId: number,
    title: string,
    description: string,
    creator: string,
    txHash: string,
    targets: string[] = [],
    values: string[] = [],
    calldatas: string[] = []
  ): Promise<void> {
    try {
      const proposalData = {
        id: proposalId,
        title,
        description,
        creator,
        daoAddress,
        createdAt: new Date().toISOString(),
        txHash,
        targets: targets || [],
        values: values || [],
        calldatas: calldatas || [],
        hasActions: targets.length > 0
      };
      
      await this.firebaseService.setDocument(`daos/${daoAddress}/proposals/${proposalId}`, proposalData);
    } catch (error) {
      console.error('Error storing proposal info:', error);
    }
  }

  /**
   * Store vote information in Firebase
   */
  private async storeVoteInfo(
    daoAddress: string,
    proposalId: number,
    voter: string,
    support: boolean,
    txHash: string
  ): Promise<void> {
    try {
      const voteData = {
        proposalId,
        voter,
        support,
        daoAddress,
        votedAt: new Date().toISOString(),
        txHash
      };
      
      await this.firebaseService.setDocument(`daos/${daoAddress}/proposals/${proposalId}/votes/${voter}`, voteData);
    } catch (error) {
      console.error('Error storing vote info:', error);
    }
  }

  /**
   * Execute a proposal in a DAO
   * @param telegramId The Telegram ID of the user
   * @param daoAddress The address of the DAO
   * @param proposalId The ID of the proposal to execute
   * @returns Success status, transaction hash, and any error
   */
  async executeProposal(
    telegramId: string,
    daoAddress: string,
    proposalId: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      if (!proposalId || proposalId <= 0) {
        return { success: false, error: 'Invalid proposal ID' };
      }

      // Check if user is a member of the DAO
      const isMember = await this.isDAOMember(telegramId, daoAddress);
      if (!isMember) {
        return { success: false, error: 'You are not a member of this DAO' };
      }

      // Get proposal details to check if it can be executed
      const proposal = await this.getProposal(daoAddress, proposalId);
      if (!proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      if (proposal.executed) {
        return { success: false, error: 'Proposal has already been executed' };
      }

      if (proposal.deadline > Date.now() / 1000) {
        return { success: false, error: 'Voting period has not ended yet' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);

      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);

      // Estimate gas for the transaction
      const gasEstimate = await daoContract.executeProposal.estimateGas(proposalId);
      console.log(`Gas estimate for executing proposal: ${gasEstimate}`);

      // Execute proposal transaction with gas limit
      const tx = await daoContract.executeProposal(proposalId, {
        gasLimit: Math.max(Number(gasEstimate), CONTRACT_CONSTANTS.GAS_LIMITS.EXECUTE_PROPOSAL)
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store execution info in Firebase
      await this.storeProposalExecutionInfo(daoAddress, proposalId, telegramId, tx.hash);

      console.log(`Proposal executed successfully: ID ${proposalId} in DAO ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error executing proposal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Add a member to a DAO
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @param memberAddress The Ethereum address of the member to add
   * @returns Success status, transaction hash, and any error
   */
  async addMember(
    telegramId: string,
    daoAddress: string,
    memberAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log(`[AddMember] DAO= ${daoAddress} | MEMBER= ${memberAddress}`);
      
      // Validate inputs using ethers.js
      if (!ethers.isAddress(daoAddress)) {
        return { success: false, error: 'Invalid DAO address format. Please provide a valid Ethereum address for the DAO.' };
      }

      if (!ethers.isAddress(memberAddress)) {
        return { success: false, error: 'Invalid member address format. Please provide a valid Ethereum address for the member.' };
      }
      
      // Check for zero address
      if (memberAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        return { success: false, error: 'Cannot add zero address as a member. Please provide a valid member address.' };
      }
      
      // Prevent DAO address and member address from being the same
      if (daoAddress.toLowerCase() === memberAddress.toLowerCase()) {
        return { success: false, error: 'Member address cannot be the same as the DAO address.' };
      }

      // Check if the DAO address is a contract
      const codeDAO = await this.provider.getCode(daoAddress);
      if (codeDAO === '0x') {
        return { success: false, error: `DAO address has no code: ${daoAddress}` };
      }
      
      // Check if member address is a contract (for diagnostics only)
      const codeMember = await this.provider.getCode(memberAddress);
      if (codeMember !== '0x') {
        console.warn(`Member address has code (contract): ${memberAddress}`);
      }
      
      // IMPORTANT: Do NOT check if the member address is a contract - it's a regular address
      
      // Try to get DAO info - only check the DAO address
      // IMPORTANT: We're only checking the DAO address here, not the member address
      let daoInfo;
      try {
        daoInfo = await this.getDAOInfo(daoAddress);
        if (!daoInfo) {
          return { success: false, error: `No valid DAO contract found at address: ${daoAddress}` };
        }
      } catch (error) {
        // Catch the specific error thrown by getDAOInfo
        return { 
          success: false, 
          error: error instanceof Error ? error.message : `Error with DAO address: ${daoAddress}` 
        };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can add members' };
      }

      // Check if member is already in the DAO
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      
      // Try to check if the address is already a member, handle potential errors
      let isMember = false;
      try {
        // In ethers v6, directly try to call the function
        isMember = await daoContract.members(memberAddress);
      } catch (error) {
        console.warn(`Error checking if address is a member, assuming not a member: ${error}`);
        // Continue with the process, assuming the address is not a member
      }
      
      if (isMember) {
        return { success: false, error: 'Address is already a member of this DAO' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      const daoWithSigner = daoContract.connect(connectedWallet);

      // Check if the contract has the addMember function
      let addMemberMethod;
      try {
        // In ethers v6, we need to use getFunction to access contract functions
        addMemberMethod = daoWithSigner.getFunction('addMember');
      } catch (error) {
        console.error('Contract does not have addMember function:', error);
        return { 
          success: false, 
          error: 'This contract does not support the addMember function. It may not be a standard DAO contract.' 
        };
      }
      
      // Estimate gas for the transaction
      let gasEstimate;
      try {
        gasEstimate = await addMemberMethod.estimateGas(memberAddress);
        console.log(`Gas estimate for adding member: ${gasEstimate}`);
      } catch (error) {
        console.error('Error estimating gas:', error);
        
        // Provide more specific error messages based on the error
        const errorObj = error as Error;
        if (errorObj && typeof errorObj.message === 'string' && errorObj.message.includes('execution reverted')) {
          return { 
            success: false, 
            error: 'The contract rejected this operation. You may not have permission to add members or the member may already exist.' 
          };
        } else {
          return { 
            success: false, 
            error: 'Failed to estimate gas for this transaction. The contract may not support this operation.' 
          };
        }
      }

      // Add member transaction with gas limit
      const tx = await addMemberMethod(memberAddress, {
        gasLimit: Math.max(Number(gasEstimate), CONTRACT_CONSTANTS.GAS_LIMITS.ADD_MEMBER)
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store member addition info in Firebase
      await this.storeMemberActionInfo(daoAddress, memberAddress, telegramId, 'add', tx.hash);

      console.log(`Member added successfully: ${memberAddress} to DAO ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error adding member:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Remove a member from a DAO
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @param memberAddress The Ethereum address of the member to remove
   * @returns Success status, transaction hash, and any error
   */
  async removeMember(
    telegramId: string,
    daoAddress: string,
    memberAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs using ethers.js
      if (!ethers.isAddress(daoAddress)) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      if (!ethers.isAddress(memberAddress)) {
        return { success: false, error: 'Invalid member address format' };
      }
      
      // Check for zero address
      if (memberAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        return { success: false, error: 'Cannot remove zero address as a member' };
      }

      // Check if user is the DAO owner
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found' };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can remove members' };
      }

      // Check if member is in the DAO
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, this.provider);
      const isMember = await daoContract.members(memberAddress);
      if (!isMember) {
        return { success: false, error: 'Address is not a member of this DAO' };
      }

      // Check if trying to remove the owner
      if (memberAddress.toLowerCase() === daoInfo.owner.toLowerCase()) {
        return { success: false, error: 'Cannot remove the DAO owner' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);
      const daoWithSigner = daoContract.connect(connectedWallet);

      // Estimate gas for the transaction
      const removeMemberMethod = daoWithSigner.getFunction('removeMember');
      const gasEstimate = await removeMemberMethod.estimateGas(memberAddress);
      console.log(`Gas estimate for removing member: ${gasEstimate}`);

      // Remove member transaction with gas limit
      const tx = await removeMemberMethod(memberAddress, {
        gasLimit: Math.max(Number(gasEstimate), CONTRACT_CONSTANTS.GAS_LIMITS.ADD_MEMBER) // Reuse ADD_MEMBER gas limit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store member removal info in Firebase
      await this.storeMemberActionInfo(daoAddress, memberAddress, telegramId, 'remove', tx.hash);

      console.log(`Member removed successfully: ${memberAddress} from DAO ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error removing member:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Pause a DAO's operations
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @returns Success status, transaction hash, and any error
   */
  async pauseDAO(
    telegramId: string,
    daoAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      // Check if user is the DAO owner
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found' };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can pause the DAO' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);

      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);

      // Check if DAO is already paused
      const isPaused = await daoContract.paused();
      if (isPaused) {
        return { success: false, error: 'DAO is already paused' };
      }

      // Estimate gas for the transaction
      const gasEstimate = await daoContract.pause.estimateGas();
      console.log(`Gas estimate for pausing DAO: ${gasEstimate}`);

      // Pause DAO transaction
      const tx = await daoContract.pause({
        gasLimit: Math.max(Number(gasEstimate), 100000) // Use a reasonable gas limit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store pause action in Firebase
      await this.storeDAOStatusChange(daoAddress, telegramId, 'paused', tx.hash);

      console.log(`DAO paused successfully: ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error pausing DAO:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Unpause a DAO's operations
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @returns Success status, transaction hash, and any error
   */
  async unpauseDAO(
    telegramId: string,
    daoAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      // Check if user is the DAO owner
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found' };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can unpause the DAO' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);

      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);

      // Check if DAO is already unpaused
      const isPaused = await daoContract.paused();
      if (!isPaused) {
        return { success: false, error: 'DAO is not paused' };
      }

      // Estimate gas for the transaction
      const gasEstimate = await daoContract.unpause.estimateGas();
      console.log(`Gas estimate for unpausing DAO: ${gasEstimate}`);

      // Unpause DAO transaction
      const tx = await daoContract.unpause({
        gasLimit: Math.max(Number(gasEstimate), 100000) // Use a reasonable gas limit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store unpause action in Firebase
      await this.storeDAOStatusChange(daoAddress, telegramId, 'unpaused', tx.hash);

      console.log(`DAO unpaused successfully: ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error unpausing DAO:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Renounce ownership of a DAO
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @returns Success status, transaction hash, and any error
   */
  async renounceDAOOwnership(
    telegramId: string,
    daoAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      // Check if user is the DAO owner
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found' };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can renounce ownership' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);

      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);

      // Estimate gas for the transaction
      const gasEstimate = await daoContract.renounceOwnership.estimateGas();
      console.log(`Gas estimate for renouncing ownership: ${gasEstimate}`);

      // Renounce ownership transaction
      const tx = await daoContract.renounceOwnership({
        gasLimit: Math.max(Number(gasEstimate), 100000) // Use a reasonable gas limit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store ownership change in Firebase
      await this.storeDAOOwnershipChange(daoAddress, telegramId, ethers.ZeroAddress, 'renounced', tx.hash);

      console.log(`DAO ownership renounced successfully: ${daoAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error renouncing DAO ownership:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Transfer ownership of a DAO
   * @param telegramId The Telegram ID of the user (must be DAO owner)
   * @param daoAddress The address of the DAO
   * @param newOwnerAddress The Ethereum address of the new owner
   * @returns Success status, transaction hash, and any error
   */
  async transferDAOOwnership(
    telegramId: string,
    daoAddress: string,
    newOwnerAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate inputs
      if (!daoAddress || !daoAddress.startsWith('0x') || daoAddress.length !== 42) {
        return { success: false, error: 'Invalid DAO address format' };
      }

      if (!newOwnerAddress || !newOwnerAddress.startsWith('0x') || newOwnerAddress.length !== 42) {
        return { success: false, error: 'Invalid new owner address format' };
      }

      if (newOwnerAddress === ethers.ZeroAddress) {
        return { success: false, error: 'Cannot transfer ownership to zero address' };
      }

      // Check if user is the DAO owner
      const daoInfo = await this.getDAOInfo(daoAddress);
      if (!daoInfo) {
        return { success: false, error: 'DAO not found' };
      }

      const userAddress = await this.walletService.getWalletAddress(telegramId);
      if (!userAddress || daoInfo.owner.toLowerCase() !== userAddress.toLowerCase()) {
        return { success: false, error: 'Only the DAO owner can transfer ownership' };
      }

      // Get user's wallet
      const wallet = await this.walletService.getWallet(telegramId);
      const connectedWallet = wallet.connect(this.provider);

      // Load DAO contract ABI
      const daoABI = await loadContractABI('DAO');
      const daoContract = new ethers.Contract(daoAddress, daoABI, connectedWallet);

      // Estimate gas for the transaction
      const gasEstimate = await daoContract.transferOwnership.estimateGas(newOwnerAddress);
      console.log(`Gas estimate for transferring ownership: ${gasEstimate}`);

      // Transfer ownership transaction
      const tx = await daoContract.transferOwnership(newOwnerAddress, {
        gasLimit: Math.max(Number(gasEstimate), 100000) // Use a reasonable gas limit
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Store ownership change in Firebase
      await this.storeDAOOwnershipChange(daoAddress, telegramId, newOwnerAddress, 'transferred', tx.hash);

      console.log(`DAO ownership transferred successfully: ${daoAddress} to ${newOwnerAddress}`);

      return {
        success: true,
        txHash: tx.hash
      };

    } catch (error) {
      console.error('Error transferring DAO ownership:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Store proposal execution information in Firebase
   */
  private async storeProposalExecutionInfo(
    daoAddress: string,
    proposalId: number,
    executorTelegramId: string,
    txHash: string
  ): Promise<void> {
    try {
      const executionData = {
        proposalId,
        executor: executorTelegramId,
        daoAddress,
        executedAt: new Date().toISOString(),
        txHash
      };
      
      // Update the proposal document with execution info
      await this.firebaseService.updateDocument(
        `daos/${daoAddress}/proposals/${proposalId}`,
        { executed: true, executionData }
      );
    } catch (error) {
      console.error('Error storing proposal execution info:', error);
    }
  }

  /**
   * Store member action (add/remove) information in Firebase
   */
  private async storeMemberActionInfo(
    daoAddress: string,
    memberAddress: string,
    actorTelegramId: string,
    action: 'add' | 'remove',
    txHash: string
  ): Promise<void> {
    try {
      const actionData = {
        memberAddress,
        actor: actorTelegramId,
        action,
        daoAddress,
        timestamp: new Date().toISOString(),
        txHash
      };
      
      // Store the action in the DAO's member actions collection
      await this.firebaseService.setDocument(
        `daos/${daoAddress}/memberActions/${Date.now()}`,
        actionData
      );

      // If adding a member, also store in the user's DAOs collection
      if (action === 'add') {
        // Try to get the user's Telegram ID from the member address
        const userDocs = await this.firebaseService.queryCollection('users', 'walletAddress', '==', memberAddress);
        if (userDocs && userDocs.length > 0) {
          const memberTelegramId = userDocs[0].id;
          const daoInfo = await this.getDAOInfo(daoAddress);
          
          if (daoInfo) {
            await this.firebaseService.setDocument(`users/${memberTelegramId}/daos/${daoAddress}`, {
              address: daoAddress,
              name: daoInfo.name,
              role: 'member',
              joinedAt: new Date().toISOString()
            });
          }
        }
      } else if (action === 'remove') {
        // If removing a member, try to remove from the user's DAOs collection
        const userDocs = await this.firebaseService.queryCollection('users', 'walletAddress', '==', memberAddress);
        if (userDocs && userDocs.length > 0) {
          const memberTelegramId = userDocs[0].id;
          await this.firebaseService.deleteDocument(`users/${memberTelegramId}/daos/${daoAddress}`);
        }
      }
    } catch (error) {
      console.error(`Error storing member ${action} info:`, error);
    }
  }

  /**
   * Store DAO status change (pause/unpause) in Firebase
   */
  private async storeDAOStatusChange(
    daoAddress: string,
    actorTelegramId: string,
    status: 'paused' | 'unpaused',
    txHash: string
  ): Promise<void> {
    try {
      const statusData = {
        status,
        actor: actorTelegramId,
        daoAddress,
        timestamp: new Date().toISOString(),
        txHash
      };
      
      // Store the status change in the DAO's status history collection
      await this.firebaseService.setDocument(
        `daos/${daoAddress}/statusHistory/${Date.now()}`,
        statusData
      );

      // Update the DAO document with current status
      await this.firebaseService.updateDocument(
        `daos/${daoAddress}`,
        { status }
      );
    } catch (error) {
      console.error(`Error storing DAO status change:`, error);
    }
  }

  /**
   * Store DAO ownership change in Firebase
   */
  private async storeDAOOwnershipChange(
    daoAddress: string,
    previousOwnerTelegramId: string,
    newOwnerAddress: string,
    action: 'transferred' | 'renounced',
    txHash: string
  ): Promise<void> {
    try {
      const ownershipData = {
        previousOwner: previousOwnerTelegramId,
        newOwnerAddress,
        action,
        daoAddress,
        timestamp: new Date().toISOString(),
        txHash
      };
      
      // Store the ownership change in the DAO's ownership history collection
      await this.firebaseService.setDocument(
        `daos/${daoAddress}/ownershipHistory/${Date.now()}`,
        ownershipData
      );

      // Update the DAO document with new owner
      await this.firebaseService.updateDocument(
        `daos/${daoAddress}`,
        { owner: newOwnerAddress }
      );

      // If ownership was transferred (not renounced), update user roles
      if (action === 'transferred' && newOwnerAddress !== ethers.ZeroAddress) {
        // Try to get the new owner's Telegram ID
        const userDocs = await this.firebaseService.queryCollection('users', 'walletAddress', '==', newOwnerAddress);
        if (userDocs && userDocs.length > 0) {
          const newOwnerTelegramId = userDocs[0].id;
          
          // Update previous owner's role to member
          await this.firebaseService.updateDocument(
            `users/${previousOwnerTelegramId}/daos/${daoAddress}`,
            { role: 'member' }
          );
          
          // Update new owner's role to owner
          const daoInfo = await this.getDAOInfo(daoAddress);
          if (daoInfo) {
            await this.firebaseService.setDocument(
              `users/${newOwnerTelegramId}/daos/${daoAddress}`,
              {
                address: daoAddress,
                name: daoInfo.name,
                role: 'owner',
                joinedAt: new Date().toISOString()
              }
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error storing DAO ownership change:`, error);
    }
  }

  /**
   * Set the Telegram bot service (used to resolve circular dependency)
   */
  public setTelegramBotService(telegramBotService: TelegramBotService): void {
    this.telegramBotService = telegramBotService;
  }
}