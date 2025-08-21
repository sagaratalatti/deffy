// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DAO.sol";

/**
 * @title DAOFactory
 * @dev Factory contract for creating and managing DAO instances
 */
contract DAOFactory is Ownable, Pausable, ReentrancyGuard {
    // Events
    event DAOCreated(address indexed daoAddress, address indexed creator, string name);
    event VaultRegistered(address indexed daoAddress, address indexed vaultAddress);
    event VaultUnregistered(address indexed daoAddress, address indexed vaultAddress);

    // State variables
    mapping(address => address[]) public userDAOs; // user address => DAO addresses
    mapping(address => address) public daoToVault; // DAO address => Vault address
    mapping(address => address) public vaultToDAO; // Vault address => DAO address
    address[] public allDAOs;
    
    uint256 public daoCount;
    uint256 public constant MAX_DAOS_PER_USER = 10;

    /**
     * @dev Creates a new DAO instance
     * @param name The name of the DAO
     * @return daoAddress The address of the newly created DAO
     */
    function createDAO(string memory name) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (address daoAddress) 
    {
        require(bytes(name).length > 0, "DAO name cannot be empty");
        require(bytes(name).length <= 100, "DAO name too long");
        require(userDAOs[msg.sender].length < MAX_DAOS_PER_USER, "Max DAOs per user exceeded");

        // Deploy new DAO contract
        DAO newDAO = new DAO(name, msg.sender);
        daoAddress = address(newDAO);

        // Update mappings
        userDAOs[msg.sender].push(daoAddress);
        allDAOs.push(daoAddress);
        daoCount++;

        emit DAOCreated(daoAddress, msg.sender, name);
        
        return daoAddress;
    }

    /**
     * @dev Registers a vault with a DAO
     * @param daoAddress The address of the DAO
     * @param vaultAddress The address of the vault
     */
    function registerVault(address daoAddress, address vaultAddress) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        require(daoAddress != address(0), "Invalid DAO address");
        require(vaultAddress != address(0), "Invalid vault address");
        require(daoToVault[daoAddress] == address(0), "DAO already has a vault");
        require(vaultToDAO[vaultAddress] == address(0), "Vault already registered");
        
        // Only DAO owner can register vault
        require(DAO(daoAddress).owner() == msg.sender, "Only DAO owner can register vault");

        daoToVault[daoAddress] = vaultAddress;
        vaultToDAO[vaultAddress] = daoAddress;

        emit VaultRegistered(daoAddress, vaultAddress);
    }

    /**
     * @dev Unregisters a vault from a DAO
     * @param daoAddress The address of the DAO
     */
    function unregisterVault(address daoAddress) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        require(daoAddress != address(0), "Invalid DAO address");
        require(daoToVault[daoAddress] != address(0), "No vault registered for this DAO");
        
        // Only DAO owner can unregister vault
        require(DAO(daoAddress).owner() == msg.sender, "Only DAO owner can unregister vault");

        address vaultAddress = daoToVault[daoAddress];
        delete daoToVault[daoAddress];
        delete vaultToDAO[vaultAddress];

        emit VaultUnregistered(daoAddress, vaultAddress);
    }

    /**
     * @dev Gets all DAOs created by a user
     * @param user The user address
     * @return An array of DAO addresses
     */
    function getUserDAOs(address user) external view returns (address[] memory) {
        return userDAOs[user];
    }

    /**
     * @dev Gets the vault address for a DAO
     * @param daoAddress The DAO address
     * @return The vault address (address(0) if no vault)
     */
    function getDAOVault(address daoAddress) external view returns (address) {
        return daoToVault[daoAddress];
    }

    /**
     * @dev Gets the DAO address for a vault
     * @param vaultAddress The vault address
     * @return The DAO address (address(0) if not registered)
     */
    function getVaultDAO(address vaultAddress) external view returns (address) {
        return vaultToDAO[vaultAddress];
    }

    /**
     * @dev Gets all created DAOs
     * @return An array of all DAO addresses
     */
    function getAllDAOs() external view returns (address[] memory) {
        return allDAOs;
    }

    /**
     * @dev Pauses the contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpauses the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency function to remove a DAO from tracking (only owner)
     * @param daoAddress The DAO address to remove
     */
    function emergencyRemoveDAO(address daoAddress) external onlyOwner {
        require(daoAddress != address(0), "Invalid DAO address");
        
        // Remove from allDAOs array
        for (uint256 i = 0; i < allDAOs.length; i++) {
            if (allDAOs[i] == daoAddress) {
                allDAOs[i] = allDAOs[allDAOs.length - 1];
                allDAOs.pop();
                break;
            }
        }
        
        // Clean up vault mappings if any
        address vaultAddress = daoToVault[daoAddress];
        if (vaultAddress != address(0)) {
            delete daoToVault[daoAddress];
            delete vaultToDAO[vaultAddress];
        }
        
        daoCount--;
    }
}