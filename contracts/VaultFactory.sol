// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Vault.sol";

/**
 * @title VaultFactory
 * @dev Factory contract for creating vault instances
 */
contract VaultFactory is Ownable, ReentrancyGuard {
    // Events
    event VaultCreated(
        address indexed vaultAddress, 
        address indexed daoAddress, 
        address indexed creator,
        uint256 withdrawalLimit,
        uint256 requiredSignatures
    );
    event VaultTemplateUpdated(address indexed oldTemplate, address indexed newTemplate);
    event DefaultParametersUpdated(uint256 withdrawalLimit, uint256 requiredSignatures);

    // State variables
    mapping(address => address[]) public daoVaults; // DAO address => vault addresses
    mapping(address => address) public vaultToDAO; // vault address => DAO address
    address[] public allVaults;
    
    uint256 public vaultCount;
    uint256 public defaultWithdrawalLimit;
    uint256 public defaultRequiredSignatures;
    
    // Constants
    uint256 public constant MAX_VAULTS_PER_DAO = 5;
    uint256 public constant MIN_WITHDRAWAL_LIMIT = 0.01 ether;
    uint256 public constant MAX_WITHDRAWAL_LIMIT = 1000 ether;
    uint256 public constant MIN_REQUIRED_SIGNATURES = 1;
    uint256 public constant MAX_REQUIRED_SIGNATURES = 20;

    /**
     * @dev Constructor
     * @param _defaultWithdrawalLimit Default withdrawal limit for new vaults
     * @param _defaultRequiredSignatures Default required signatures for new vaults
     */
    constructor(
        uint256 _defaultWithdrawalLimit,
        uint256 _defaultRequiredSignatures
    ) {
        require(
            _defaultWithdrawalLimit >= MIN_WITHDRAWAL_LIMIT && 
            _defaultWithdrawalLimit <= MAX_WITHDRAWAL_LIMIT,
            "Invalid default withdrawal limit"
        );
        require(
            _defaultRequiredSignatures >= MIN_REQUIRED_SIGNATURES && 
            _defaultRequiredSignatures <= MAX_REQUIRED_SIGNATURES,
            "Invalid default required signatures"
        );
        
        defaultWithdrawalLimit = _defaultWithdrawalLimit;
        defaultRequiredSignatures = _defaultRequiredSignatures;
    }

    /**
     * @dev Creates a new vault instance
     * @param daoAddress The address of the DAO that will own the vault
     * @param withdrawalLimit The maximum amount that can be withdrawn without multi-sig
     * @return vaultAddress The address of the newly created vault
     */
    function createVault(
        address daoAddress,
        uint256 withdrawalLimit
    ) 
        external 
        nonReentrant 
        returns (address vaultAddress) 
    {
        return _createVault(daoAddress, withdrawalLimit, defaultRequiredSignatures);
    }

    /**
     * @dev Creates a new vault instance with custom parameters
     * @param daoAddress The address of the DAO that will own the vault
     * @param withdrawalLimit The maximum amount that can be withdrawn without multi-sig
     * @param requiredSignatures The number of signatures required for large transactions
     * @return vaultAddress The address of the newly created vault
     */
    function createVaultWithCustomParams(
        address daoAddress,
        uint256 withdrawalLimit,
        uint256 requiredSignatures
    ) 
        external 
        nonReentrant 
        returns (address vaultAddress) 
    {
        return _createVault(daoAddress, withdrawalLimit, requiredSignatures);
    }

    /**
     * @dev Internal function to create a vault
     * @param daoAddress The address of the DAO that will own the vault
     * @param withdrawalLimit The maximum amount that can be withdrawn without multi-sig
     * @param requiredSignatures The number of signatures required for large transactions
     * @return vaultAddress The address of the newly created vault
     */
    function _createVault(
        address daoAddress,
        uint256 withdrawalLimit,
        uint256 requiredSignatures
    ) 
        internal 
        returns (address vaultAddress) 
    {
        require(daoAddress != address(0), "Invalid DAO address");
        require(
            withdrawalLimit >= MIN_WITHDRAWAL_LIMIT && 
            withdrawalLimit <= MAX_WITHDRAWAL_LIMIT,
            "Invalid withdrawal limit"
        );
        require(
            requiredSignatures >= MIN_REQUIRED_SIGNATURES && 
            requiredSignatures <= MAX_REQUIRED_SIGNATURES,
            "Invalid required signatures"
        );
        require(
            daoVaults[daoAddress].length < MAX_VAULTS_PER_DAO,
            "Max vaults per DAO exceeded"
        );

        // Deploy new vault contract
        Vault newVault = new Vault(
            daoAddress,
            withdrawalLimit,
            requiredSignatures
        );
        vaultAddress = address(newVault);

        // Transfer ownership of the vault to the caller (usually the DAO owner)
        newVault.transferOwnership(msg.sender);

        // Update mappings
        daoVaults[daoAddress].push(vaultAddress);
        vaultToDAO[vaultAddress] = daoAddress;
        allVaults.push(vaultAddress);
        vaultCount++;

        emit VaultCreated(
            vaultAddress, 
            daoAddress, 
            msg.sender,
            withdrawalLimit,
            requiredSignatures
        );
        
        return vaultAddress;
    }

    /**
     * @dev Creates a vault with default parameters
     * @param daoAddress The address of the DAO that will own the vault
     * @return vaultAddress The address of the newly created vault
     */
    function createDefaultVault(address daoAddress) 
        external 
        nonReentrant 
        returns (address vaultAddress) 
    {
        return _createVault(daoAddress, defaultWithdrawalLimit, defaultRequiredSignatures);
    }

    /**
     * @dev Gets all vaults created for a DAO
     * @param daoAddress The DAO address
     * @return An array of vault addresses
     */
    function getDAOVaults(address daoAddress) external view returns (address[] memory) {
        return daoVaults[daoAddress];
    }

    /**
     * @dev Gets the DAO address for a vault
     * @param vaultAddress The vault address
     * @return The DAO address (address(0) if not found)
     */
    function getVaultDAO(address vaultAddress) external view returns (address) {
        return vaultToDAO[vaultAddress];
    }

    /**
     * @dev Gets all created vaults
     * @return An array of all vault addresses
     */
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    /**
     * @dev Gets the number of vaults created for a DAO
     * @param daoAddress The DAO address
     * @return The number of vaults
     */
    function getDAOVaultCount(address daoAddress) external view returns (uint256) {
        return daoVaults[daoAddress].length;
    }

    /**
     * @dev Checks if a vault was created by this factory
     * @param vaultAddress The vault address to check
     * @return True if the vault was created by this factory
     */
    function isVaultFromFactory(address vaultAddress) external view returns (bool) {
        return vaultToDAO[vaultAddress] != address(0);
    }

    /**
     * @dev Updates the default withdrawal limit (only owner)
     * @param newWithdrawalLimit The new default withdrawal limit
     */
    function updateDefaultWithdrawalLimit(uint256 newWithdrawalLimit) external onlyOwner {
        require(
            newWithdrawalLimit >= MIN_WITHDRAWAL_LIMIT && 
            newWithdrawalLimit <= MAX_WITHDRAWAL_LIMIT,
            "Invalid withdrawal limit"
        );
        
        defaultWithdrawalLimit = newWithdrawalLimit;
        
        emit DefaultParametersUpdated(defaultWithdrawalLimit, defaultRequiredSignatures);
    }

    /**
     * @dev Updates the default required signatures (only owner)
     * @param newRequiredSignatures The new default required signatures
     */
    function updateDefaultRequiredSignatures(uint256 newRequiredSignatures) external onlyOwner {
        require(
            newRequiredSignatures >= MIN_REQUIRED_SIGNATURES && 
            newRequiredSignatures <= MAX_REQUIRED_SIGNATURES,
            "Invalid required signatures"
        );
        
        defaultRequiredSignatures = newRequiredSignatures;
        
        emit DefaultParametersUpdated(defaultWithdrawalLimit, defaultRequiredSignatures);
    }

    /**
     * @dev Updates both default parameters (only owner)
     * @param newWithdrawalLimit The new default withdrawal limit
     * @param newRequiredSignatures The new default required signatures
     */
    function updateDefaultParameters(
        uint256 newWithdrawalLimit,
        uint256 newRequiredSignatures
    ) external onlyOwner {
        require(
            newWithdrawalLimit >= MIN_WITHDRAWAL_LIMIT && 
            newWithdrawalLimit <= MAX_WITHDRAWAL_LIMIT,
            "Invalid withdrawal limit"
        );
        require(
            newRequiredSignatures >= MIN_REQUIRED_SIGNATURES && 
            newRequiredSignatures <= MAX_REQUIRED_SIGNATURES,
            "Invalid required signatures"
        );
        
        defaultWithdrawalLimit = newWithdrawalLimit;
        defaultRequiredSignatures = newRequiredSignatures;
        
        emit DefaultParametersUpdated(defaultWithdrawalLimit, defaultRequiredSignatures);
    }

    /**
     * @dev Emergency function to remove a vault from tracking (only owner)
     * @param vaultAddress The vault address to remove
     */
    function emergencyRemoveVault(address vaultAddress) external onlyOwner {
        require(vaultAddress != address(0), "Invalid vault address");
        require(vaultToDAO[vaultAddress] != address(0), "Vault not found");
        
        address daoAddress = vaultToDAO[vaultAddress];
        
        // Remove from daoVaults array
        address[] storage vaults = daoVaults[daoAddress];
        for (uint256 i = 0; i < vaults.length; i++) {
            if (vaults[i] == vaultAddress) {
                vaults[i] = vaults[vaults.length - 1];
                vaults.pop();
                break;
            }
        }
        
        // Remove from allVaults array
        for (uint256 i = 0; i < allVaults.length; i++) {
            if (allVaults[i] == vaultAddress) {
                allVaults[i] = allVaults[allVaults.length - 1];
                allVaults.pop();
                break;
            }
        }
        
        // Clean up mapping
        delete vaultToDAO[vaultAddress];
        vaultCount--;
    }

    /**
     * @dev Gets factory statistics
     * @return totalVaults totalDAOsWithVaults averageVaultsPerDAO
     */
    function getFactoryStats() 
        external 
        view 
        returns (
            uint256 totalVaults,
            uint256 totalDAOsWithVaults,
            uint256 averageVaultsPerDAO
        ) 
    {
        totalVaults = vaultCount;
        
        // Count DAOs with vaults
        uint256 daoCount = 0;
        for (uint256 i = 0; i < allVaults.length; i++) {
            address daoAddr = vaultToDAO[allVaults[i]];
            if (daoAddr != address(0) && daoVaults[daoAddr].length > 0) {
                daoCount++;
            }
        }
        
        totalDAOsWithVaults = daoCount;
        averageVaultsPerDAO = daoCount > 0 ? totalVaults / daoCount : 0;
        
        return (totalVaults, totalDAOsWithVaults, averageVaultsPerDAO);
    }
}