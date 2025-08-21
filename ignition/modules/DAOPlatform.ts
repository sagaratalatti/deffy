

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const DAOPlatformModule = buildModule("DAOPlatform", (m) => {
  const deployer = m.getAccount(0);
  
  // Deploy core factories
  const daoFactory = m.contract("DAOFactory");
  
  const defaultWithdrawalLimit = ethers.toBigInt("1000000000000000000"); // 1 ETH
  const defaultRequiredSignatures = 1;
  
  const vaultFactory = m.contract("VaultFactory", [
    defaultWithdrawalLimit,
    defaultRequiredSignatures
  ]);
  
  // Deploy template DAO
  const templateDAO = m.contract("DAO", [
    "Template DAO",
    deployer
  ]);
  
  // Deploy template Vault
  const templateVault = m.contract("Vault", [
    templateDAO,
    defaultWithdrawalLimit,
    defaultRequiredSignatures
  ]);
  
  // Advanced: Create a demo DAO using the factory
  const createDemoDAO = m.call(daoFactory, "createDAO", ["Demo DAO"]);
  
  // Read the created DAO address from the event
  const demoDAOAddress = m.readEventArgument(
    createDemoDAO, 
    "DAOCreated", 
    "daoAddress"
  );
  
  // Reference the created DAO contract
  const demoDAO = m.contractAt("DAO", demoDAOAddress, {
    id: "DemoDAO"
  });
  
  // Note: Members can be added later via the Telegram bot interface
  // For deployment, we only use the deployer account
  
  // Create a vault for the demo DAO
  const createDemoVault = m.call(vaultFactory, "createVault", [
    demoDAOAddress,
    defaultWithdrawalLimit
  ]);
  
  // Read the created vault address
  const demoVaultAddress = m.readEventArgument(
    createDemoVault,
    "VaultCreated",
    "vaultAddress"
  );
  
  // Reference the created vault
  const demoVault = m.contractAt("Vault", demoVaultAddress, {
    id: "DemoVault"
  });
  
  // Register the vault with the DAO
  const registerVault = m.call(daoFactory, "registerVault", [
    demoDAOAddress,
    demoVaultAddress
  ]);
  
  // Verification calls (executed but not returned)
  m.staticCall(daoFactory, "daoCount", []);
  m.staticCall(vaultFactory, "vaultCount", []);
  m.staticCall(demoDAO, "memberCount", []);
  
  // Only return ContractFuture objects
  return {
    daoFactory,
    vaultFactory,
    templateDAO,
    templateVault,
    demoDAO,
    demoVault
  };
});

export default DAOPlatformModule;