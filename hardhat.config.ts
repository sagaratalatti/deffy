import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Default dummy private key for compilation (never use for real deployment)
const DUMMY_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";

// Get private key from env or use dummy for compilation
const getPrivateKey = (): string => {
  const envKey = process.env.PRIVATE_KEY;
  if (!envKey || envKey === "your_deployer_private_key" || envKey.length < 64) {
    console.warn("⚠️  Using dummy private key for compilation. Set PRIVATE_KEY in .env for deployment.");
    return DUMMY_PRIVATE_KEY;
  }
  return envKey.startsWith('0x') ? envKey : `0x${envKey}`;
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: [getPrivateKey()],
      chainId: 42161,
    },
    arbitrumGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts: [getPrivateKey()],
      chainId: 421613,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [getPrivateKey()],
      chainId: 421614,
    },
    ethereumSepolia: {
      url: process.env.ETHEREUM_SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: [getPrivateKey()],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      arbitrumGoerli: process.env.ARBISCAN_API_KEY || "",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;