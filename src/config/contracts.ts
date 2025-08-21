/**
 * Contract configuration and addresses for the Telegram DAO Platform
 * This file will be updated after deployment with actual contract addresses
 */

export interface ContractConfig {
  address: string;
  abi: any[];
  deploymentBlock?: number;
}

export interface DeployedContracts {
  DAOFactory: ContractConfig;
  VaultFactory: ContractConfig;
  TemplateDAO?: ContractConfig;
  TemplateVault?: ContractConfig;
}

// Network configurations
export const NETWORK_CONFIG = {
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18
    }
  },
  arbitrumGoerli: {
    chainId: 421613,
    name: "Arbitrum Goerli",
    rpcUrl: "https://goerli-rollup.arbitrum.io/rpc",
    blockExplorer: "https://goerli.arbiscan.io",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18
    }
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    blockExplorer: "https://sepolia.arbiscan.io",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18
    }
  },
  ethereumSepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
    blockExplorer: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18
    }
  }
};

// Contract addresses from Arbitrum Sepolia deployment
export const CONTRACT_ADDRESSES: DeployedContracts = {
  DAOFactory: {
    address: "0x7C2b03d94efC42F36bBc13dc9E6F2dA9eDf09AaF", // Deployed on Arbitrum Sepolia
    abi: [], // To be loaded from artifacts
    deploymentBlock: 0
  },
  VaultFactory: {
    address: "0x7a84EC03a81E19c63ea39F37B4c749E65113DaD3", // Deployed on Arbitrum Sepolia
    abi: [], // To be loaded from artifacts
    deploymentBlock: 0
  },
  TemplateDAO: {
    address: "0x454E180F980990F69cb34Cef579F82E590789D10", // Deployed on Arbitrum Sepolia
    abi: [], // To be loaded from artifacts
    deploymentBlock: 0
  },
  TemplateVault: {
    address: "0xD1BD26a8D2B32561b44238b526f967782184a5AD", // Deployed on Arbitrum Sepolia
    abi: [], // To be loaded from artifacts
    deploymentBlock: 0
  }
};

// Contract interaction constants
export const CONTRACT_CONSTANTS = {
  // DAO Factory
  MAX_DAOS_PER_USER: 10,
  MAX_DAO_NAME_LENGTH: 100,
  
  // DAO
  MIN_PROPOSAL_DURATION: 3600, // 1 hour in seconds
  MAX_PROPOSAL_DURATION: 2592000, // 30 days in seconds
  DEFAULT_VOTING_PERIOD: 604800, // 7 days in seconds
  DEFAULT_QUORUM_PERCENTAGE: 51,
  MAX_MEMBERS_PER_DAO: 1000,
  
  // Vault Factory
  MAX_VAULTS_PER_DAO: 5,
  MIN_WITHDRAWAL_LIMIT: "10000000000000000", // 0.01 ETH in wei
  MAX_WITHDRAWAL_LIMIT: "1000000000000000000000", // 1000 ETH in wei
  MIN_REQUIRED_SIGNATURES: 1,
  MAX_REQUIRED_SIGNATURES: 20,
  
  // Vault
  MAX_SIGNERS: 20,
  PROPOSAL_DURATION: 604800, // 7 days in seconds
  
  // Gas limits for different operations
  GAS_LIMITS: {
    CREATE_DAO: 2000000, // Increased from 500000 to fix transaction reverted error
    CREATE_VAULT: 800000,
    ADD_MEMBER: 100000,
    CREATE_PROPOSAL: 150000,
    VOTE: 80000,
    EXECUTE_PROPOSAL: 200000,
    DEPOSIT: 100000,
    WITHDRAW: 150000,
    APPROVE_SPENDING: 120000
  }
};

// Event signatures for filtering
export const EVENT_SIGNATURES = {
  // DAOFactory events
  DAO_CREATED: "DAOCreated(address,address,string)",
  VAULT_REGISTERED: "VaultRegistered(address,address)",
  VAULT_UNREGISTERED: "VaultUnregistered(address,address)",
  
  // DAO events
  PROPOSAL_CREATED: "ProposalCreated(uint256,address,string,uint256)",
  VOTE_CAST: "VoteCast(uint256,address,bool,uint256)",
  MEMBER_ADDED: "MemberAdded(address,address)",
  MEMBER_REMOVED: "MemberRemoved(address,address)",
  VAULT_ATTACHED: "VaultAttached(address,address)",
  VAULT_DETACHED: "VaultDetached(address,address)",
  PROPOSAL_EXECUTED: "ProposalExecuted(uint256,bool)",
  
  // VaultFactory events
  VAULT_CREATED: "VaultCreated(address,address,address,uint256,uint256)",
  
  // Vault events
  DEPOSIT: "Deposit(address,address,uint256)",
  WITHDRAWAL: "Withdrawal(address,address,uint256)",
  SPENDING_PROPOSAL_CREATED: "SpendingProposalCreated(uint256,address,uint256,address)",
  SPENDING_PROPOSAL_APPROVED: "SpendingProposalApproved(uint256,address)",
  SPENDING_PROPOSAL_EXECUTED: "SpendingProposalExecuted(uint256,bool)",
  EMERGENCY_PAUSE: "EmergencyPause(address,string)",
  SIGNER_ADDED: "SignerAdded(address,address)",
  SIGNER_REMOVED: "SignerRemoved(address,address)"
};

// Helper function to load contract addresses from deployment file
export async function loadContractAddresses(network: string = "arbitrum"): Promise<DeployedContracts> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const deploymentPath = path.join(process.cwd(), 'deployments', `${network}.json`);
    
    if (fs.existsSync(deploymentPath)) {
      const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      
      return {
        DAOFactory: {
          address: deploymentData.contracts.DAOFactory.address,
          abi: [], // Will be loaded separately
          deploymentBlock: deploymentData.contracts.DAOFactory.blockNumber
        },
        VaultFactory: {
          address: deploymentData.contracts.VaultFactory.address,
          abi: [], // Will be loaded separately
          deploymentBlock: deploymentData.contracts.VaultFactory.blockNumber
        },
        TemplateDAO: deploymentData.contracts.TemplateDAO ? {
          address: deploymentData.contracts.TemplateDAO.address,
          abi: [],
          deploymentBlock: deploymentData.contracts.TemplateDAO.blockNumber
        } : undefined,
        TemplateVault: deploymentData.contracts.TemplateVault ? {
          address: deploymentData.contracts.TemplateVault.address,
          abi: [],
          deploymentBlock: deploymentData.contracts.TemplateVault.blockNumber
        } : undefined
      };
    }
  } catch (error) {
    console.warn(`Could not load contract addresses for network ${network}:`, error);
  }
  
  return CONTRACT_ADDRESSES;
}

// Helper function to load contract ABIs
export async function loadContractABI(contractName: string): Promise<any[]> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
    
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      return artifact.abi;
    }
  } catch (error) {
    console.warn(`Could not load ABI for contract ${contractName}:`, error);
  }
  
  return [];
}

// Helper function to get current network configuration
export function getCurrentNetworkConfig() {
  const networkName = process.env.NODE_ENV === 'production' ? 'arbitrum' : 'arbitrumSepolia';
  return NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG];
}

// Helper function to format contract address for display
export function formatContractAddress(address: string): string {
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    return "Not deployed";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper function to get block explorer URL
export function getBlockExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  const network = getCurrentNetworkConfig();
  return `${network.blockExplorer}/${type}/${address}`;
}