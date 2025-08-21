// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault
 * @dev Modular vault contract for DAO treasury management
 */
contract Vault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Structs
    struct SpendingProposal {
        uint256 id;
        address token; // address(0) for ETH
        uint256 amount;
        address recipient;
        string description;
        uint256 approvals;
        uint256 deadline;
        bool executed;
        mapping(address => bool) hasApproved;
    }

    // Events
    event Deposit(address indexed token, address indexed depositor, uint256 amount);
    event Withdrawal(address indexed token, address indexed recipient, uint256 amount);
    event SpendingProposalCreated(uint256 indexed proposalId, address indexed token, uint256 amount, address indexed recipient);
    event SpendingProposalApproved(uint256 indexed proposalId, address indexed approver);
    event SpendingProposalExecuted(uint256 indexed proposalId, bool success);
    event EmergencyPause(address indexed pauser, string reason);
    event SignerAdded(address indexed signer, address indexed addedBy);
    event SignerRemoved(address indexed signer, address indexed removedBy);
    event WithdrawalLimitUpdated(uint256 oldLimit, uint256 newLimit);

    // State variables
    address public daoAddress;
    uint256 public withdrawalLimit;
    uint256 public requiredSignatures;
    uint256 public spendingProposalCount;
    
    mapping(address => bool) public authorizedSigners;
    mapping(uint256 => SpendingProposal) public spendingProposals;
    mapping(address => uint256) public tokenBalances; // token => balance
    address[] public signerList;
    address[] public supportedTokens;
    
    uint256 public constant MAX_SIGNERS = 20;
    uint256 public constant MIN_SIGNATURES = 1;
    uint256 public constant PROPOSAL_DURATION = 7 days;

    // Modifiers
    modifier onlyDAO() {
        require(msg.sender == daoAddress, "Only DAO can call this function");
        _;
    }

    modifier onlyAuthorizedSigner() {
        require(authorizedSigners[msg.sender] || msg.sender == owner(), "Not an authorized signer");
        _;
    }

    modifier validSpendingProposal(uint256 proposalId) {
        require(proposalId > 0 && proposalId <= spendingProposalCount, "Invalid proposal ID");
        _;
    }

    /**
     * @dev Constructor
     * @param _daoAddress The address of the DAO that owns this vault
     * @param _withdrawalLimit The maximum amount that can be withdrawn without multi-sig
     * @param _requiredSignatures The number of signatures required for large transactions
     */
    constructor(
        address _daoAddress,
        uint256 _withdrawalLimit,
        uint256 _requiredSignatures
    ) {
        require(_daoAddress != address(0), "Invalid DAO address");
        require(_requiredSignatures >= MIN_SIGNATURES, "Invalid signature requirement");
        
        daoAddress = _daoAddress;
        withdrawalLimit = _withdrawalLimit;
        requiredSignatures = _requiredSignatures;
        
        // Add DAO owner as first authorized signer
        authorizedSigners[msg.sender] = true;
        signerList.push(msg.sender);
    }

    /**
     * @dev Deposits ETH into the vault
     */
    function depositETH() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Deposit amount must be greater than 0");
        
        tokenBalances[address(0)] += msg.value;
        
        emit Deposit(address(0), msg.sender, msg.value);
    }

    /**
     * @dev Deposits ERC20 tokens into the vault
     * @param token The address of the ERC20 token
     * @param amount The amount to deposit
     */
    function depositToken(address token, uint256 amount) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Deposit amount must be greater than 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;
        
        // Add to supported tokens if not already present
        _addSupportedToken(token);
        
        emit Deposit(token, msg.sender, amount);
    }

    /**
     * @dev Withdraws funds directly (only for amounts below withdrawal limit)
     * @param token The token address (address(0) for ETH)
     * @param amount The amount to withdraw
     * @param recipient The recipient address
     */
    function withdraw(
        address token,
        uint256 amount,
        address recipient
    ) 
        external 
        onlyDAO 
        whenNotPaused 
        nonReentrant 
    {
        require(amount > 0, "Withdrawal amount must be greater than 0");
        require(recipient != address(0), "Invalid recipient address");
        require(amount <= withdrawalLimit, "Amount exceeds withdrawal limit");
        require(tokenBalances[token] >= amount, "Insufficient balance");
        
        tokenBalances[token] -= amount;
        
        if (token == address(0)) {
            // ETH withdrawal
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 withdrawal
            IERC20(token).safeTransfer(recipient, amount);
        }
        
        emit Withdrawal(token, recipient, amount);
    }

    /**
     * @dev Creates a spending proposal for large transactions
     * @param token The token address (address(0) for ETH)
     * @param amount The amount to spend
     * @param recipient The recipient address
     * @param description Description of the spending proposal
     * @return proposalId The ID of the created proposal
     */
    function createSpendingProposal(
        address token,
        uint256 amount,
        address recipient,
        string memory description
    ) 
        external 
        onlyAuthorizedSigner 
        whenNotPaused 
        nonReentrant 
        returns (uint256 proposalId) 
    {
        require(amount > withdrawalLimit, "Use direct withdrawal for small amounts");
        require(recipient != address(0), "Invalid recipient address");
        require(tokenBalances[token] >= amount, "Insufficient balance");
        require(bytes(description).length > 0, "Description cannot be empty");
        
        spendingProposalCount++;
        proposalId = spendingProposalCount;
        
        SpendingProposal storage proposal = spendingProposals[proposalId];
        proposal.id = proposalId;
        proposal.token = token;
        proposal.amount = amount;
        proposal.recipient = recipient;
        proposal.description = description;
        proposal.deadline = block.timestamp + PROPOSAL_DURATION;
        
        emit SpendingProposalCreated(proposalId, token, amount, recipient);
        
        return proposalId;
    }

    /**
     * @dev Approves a spending proposal
     * @param proposalId The ID of the proposal to approve
     */
    function approveSpendingProposal(uint256 proposalId) 
        external 
        onlyAuthorizedSigner 
        whenNotPaused 
        nonReentrant 
        validSpendingProposal(proposalId) 
    {
        SpendingProposal storage proposal = spendingProposals[proposalId];
        require(block.timestamp < proposal.deadline, "Proposal expired");
        require(!proposal.executed, "Proposal already executed");
        require(!proposal.hasApproved[msg.sender], "Already approved");
        
        proposal.hasApproved[msg.sender] = true;
        proposal.approvals++;
        
        emit SpendingProposalApproved(proposalId, msg.sender);
        
        // Auto-execute if enough approvals
        if (proposal.approvals >= requiredSignatures) {
            _executeSpendingProposal(proposalId);
        }
    }

    /**
     * @dev Executes a spending proposal if it has enough approvals
     * @param proposalId The ID of the proposal to execute
     */
    function executeSpendingProposal(uint256 proposalId) 
        external 
        whenNotPaused 
        nonReentrant 
        validSpendingProposal(proposalId) 
    {
        SpendingProposal storage proposal = spendingProposals[proposalId];
        require(proposal.approvals >= requiredSignatures, "Not enough approvals");
        require(!proposal.executed, "Proposal already executed");
        require(tokenBalances[proposal.token] >= proposal.amount, "Insufficient balance");
        
        _executeSpendingProposal(proposalId);
    }

    /**
     * @dev Internal function to execute spending proposal
     * @param proposalId The ID of the proposal to execute
     */
    function _executeSpendingProposal(uint256 proposalId) internal {
        SpendingProposal storage proposal = spendingProposals[proposalId];
        
        proposal.executed = true;
        tokenBalances[proposal.token] -= proposal.amount;
        
        bool success;
        if (proposal.token == address(0)) {
            // ETH transfer
            (success, ) = proposal.recipient.call{value: proposal.amount}("");
        } else {
            // ERC20 transfer
            try IERC20(proposal.token).transfer(proposal.recipient, proposal.amount) {
                success = true;
            } catch {
                success = false;
            }
        }
        
        if (!success) {
            // Revert the state changes if transfer failed
            proposal.executed = false;
            tokenBalances[proposal.token] += proposal.amount;
        }
        
        emit SpendingProposalExecuted(proposalId, success);
    }

    /**
     * @dev Adds an authorized signer
     * @param signer The address to add as a signer
     */
    function addSigner(address signer) 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(signer != address(0), "Invalid signer address");
        require(!authorizedSigners[signer], "Already a signer");
        require(signerList.length < MAX_SIGNERS, "Max signers reached");
        
        authorizedSigners[signer] = true;
        signerList.push(signer);
        
        emit SignerAdded(signer, msg.sender);
    }

    /**
     * @dev Removes an authorized signer
     * @param signer The address to remove
     */
    function removeSigner(address signer) 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(signer != address(0), "Invalid signer address");
        require(authorizedSigners[signer], "Not a signer");
        require(signerList.length > requiredSignatures, "Cannot remove signer below required threshold");
        
        authorizedSigners[signer] = false;
        
        // Remove from signerList array
        for (uint256 i = 0; i < signerList.length; i++) {
            if (signerList[i] == signer) {
                signerList[i] = signerList[signerList.length - 1];
                signerList.pop();
                break;
            }
        }
        
        emit SignerRemoved(signer, msg.sender);
    }

    /**
     * @dev Updates the withdrawal limit
     * @param newLimit The new withdrawal limit
     */
    function updateWithdrawalLimit(uint256 newLimit) external onlyOwner {
        uint256 oldLimit = withdrawalLimit;
        withdrawalLimit = newLimit;
        
        emit WithdrawalLimitUpdated(oldLimit, newLimit);
    }

    /**
     * @dev Updates the required signatures
     * @param newRequiredSignatures The new required signatures count
     */
    function updateRequiredSignatures(uint256 newRequiredSignatures) external onlyOwner {
        require(newRequiredSignatures >= MIN_SIGNATURES, "Invalid signature requirement");
        require(newRequiredSignatures <= signerList.length, "Required signatures exceed signer count");
        
        requiredSignatures = newRequiredSignatures;
    }

    /**
     * @dev Emergency pause function
     * @param reason The reason for pausing
     */
    function emergencyPause(string memory reason) external onlyAuthorizedSigner {
        _pause();
        emit EmergencyPause(msg.sender, reason);
    }

    /**
     * @dev Unpauses the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Gets the balance of a token in the vault
     * @param token The token address (address(0) for ETH)
     * @return The balance
     */
    function getBalance(address token) external view returns (uint256) {
        return tokenBalances[token];
    }

    /**
     * @dev Gets spending proposal details
     * @param proposalId The ID of the proposal
     * @return id token amount recipient description approvals deadline executed
     */
    function getSpendingProposal(uint256 proposalId) 
        external 
        view 
        validSpendingProposal(proposalId) 
        returns (
            uint256 id,
            address token,
            uint256 amount,
            address recipient,
            string memory description,
            uint256 approvals,
            uint256 deadline,
            bool executed
        ) 
    {
        SpendingProposal storage proposal = spendingProposals[proposalId];
        return (
            proposal.id,
            proposal.token,
            proposal.amount,
            proposal.recipient,
            proposal.description,
            proposal.approvals,
            proposal.deadline,
            proposal.executed
        );
    }

    /**
     * @dev Gets all authorized signers
     * @return Array of signer addresses
     */
    function getSigners() external view returns (address[] memory) {
        return signerList;
    }

    /**
     * @dev Gets all supported tokens
     * @return Array of token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    /**
     * @dev Internal function to add a token to supported tokens list
     * @param token The token address to add
     */
    function _addSupportedToken(address token) internal {
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                return; // Token already in list
            }
        }
        supportedTokens.push(token);
    }

    /**
     * @dev Fallback function to receive ETH
     */
    receive() external payable {
        if (msg.value > 0) {
            tokenBalances[address(0)] += msg.value;
            emit Deposit(address(0), msg.sender, msg.value);
        }
    }
}