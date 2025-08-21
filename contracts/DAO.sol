// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title DAO
 * @dev Individual DAO instance with proposal and voting functionality
 */
contract DAO is Ownable, Pausable, ReentrancyGuard {
    // Structs
    struct Proposal {
        uint256 id;
        string title;
        string description;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        bool executed;
        address proposer;
        mapping(address => bool) hasVoted;
    }

    // Events
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, uint256 deadline);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event MemberAdded(address indexed member, address indexed addedBy);
    event MemberRemoved(address indexed member, address indexed removedBy);
    event VaultAttached(address indexed vaultAddress, address indexed attachedBy);
    event VaultDetached(address indexed vaultAddress, address indexed detachedBy);
    event ProposalExecuted(uint256 indexed proposalId, bool success);

    // State variables
    string public name;
    mapping(address => bool) public members;
    mapping(uint256 => Proposal) public proposals;
    address[] public memberList;
    uint256 public proposalCount;
    uint256 public memberCount;
    address public attachedVault;
    
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant MIN_PROPOSAL_DURATION = 1 hours;
    uint256 public constant MAX_PROPOSAL_DURATION = 30 days;
    uint256 public quorumPercentage = 51; // 51% quorum required

    // Modifiers
    modifier onlyMember() {
        require(members[msg.sender] || msg.sender == owner(), "Not a member");
        _;
    }

    modifier validProposal(uint256 proposalId) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        _;
    }

    /**
     * @dev Constructor
     * @param _name The name of the DAO
     * @param _owner The owner of the DAO
     */
    constructor(string memory _name, address _owner) {
        require(bytes(_name).length > 0, "DAO name cannot be empty");
        require(_owner != address(0), "Invalid owner address");
        
        name = _name;
        _transferOwnership(_owner);
        
        // Add owner as first member
        members[_owner] = true;
        memberList.push(_owner);
        memberCount = 1;
    }

    /**
     * @dev Adds a new member to the DAO
     * @param member The address to add as a member
     */
    function addMember(address member) 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(member != address(0), "Invalid member address");
        require(!members[member], "Already a member");
        require(memberCount < 1000, "Max members reached"); // Prevent gas issues

        members[member] = true;
        memberList.push(member);
        memberCount++;

        emit MemberAdded(member, msg.sender);
    }

    /**
     * @dev Removes a member from the DAO
     * @param member The address to remove
     */
    function removeMember(address member) 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(member != address(0), "Invalid member address");
        require(members[member], "Not a member");
        require(member != owner(), "Cannot remove owner");

        members[member] = false;
        
        // Remove from memberList array
        for (uint256 i = 0; i < memberList.length; i++) {
            if (memberList[i] == member) {
                memberList[i] = memberList[memberList.length - 1];
                memberList.pop();
                break;
            }
        }
        
        memberCount--;

        emit MemberRemoved(member, msg.sender);
    }

    /**
     * @dev Creates a new proposal
     * @param title The title of the proposal
     * @param description The description of the proposal
     * @param duration The voting duration in seconds
     * @return proposalId The ID of the created proposal
     */
    function propose(
        string memory title,
        string memory description,
        uint256 duration
    ) 
        external 
        onlyMember 
        whenNotPaused 
        nonReentrant 
        returns (uint256 proposalId) 
    {
        require(bytes(title).length > 0, "Title cannot be empty");
        require(bytes(description).length > 0, "Description cannot be empty");
        require(duration >= MIN_PROPOSAL_DURATION && duration <= MAX_PROPOSAL_DURATION, "Invalid duration");

        proposalCount++;
        proposalId = proposalCount;
        
        Proposal storage newProposal = proposals[proposalId];
        newProposal.id = proposalId;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.deadline = block.timestamp + duration;
        newProposal.proposer = msg.sender;

        emit ProposalCreated(proposalId, msg.sender, title, newProposal.deadline);
        
        return proposalId;
    }

    /**
     * @dev Casts a vote on a proposal
     * @param proposalId The ID of the proposal
     * @param support True for yes, false for no
     */
    function vote(uint256 proposalId, bool support) 
        external 
        onlyMember 
        whenNotPaused 
        nonReentrant 
        validProposal(proposalId) 
    {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp < proposal.deadline, "Voting period ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        require(!proposal.executed, "Proposal already executed");

        proposal.hasVoted[msg.sender] = true;
        
        if (support) {
            proposal.yesVotes++;
        } else {
            proposal.noVotes++;
        }

        emit VoteCast(proposalId, msg.sender, support, 1);
    }

    /**
     * @dev Executes a proposal if it has passed
     * @param proposalId The ID of the proposal to execute
     */
    function executeProposal(uint256 proposalId) 
        external 
        whenNotPaused 
        nonReentrant 
        validProposal(proposalId) 
    {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.deadline, "Voting period not ended");
        require(!proposal.executed, "Proposal already executed");
        
        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;
        uint256 requiredQuorum = (memberCount * quorumPercentage) / 100;
        
        require(totalVotes >= requiredQuorum, "Quorum not reached");
        require(proposal.yesVotes > proposal.noVotes, "Proposal rejected");
        
        proposal.executed = true;
        
        emit ProposalExecuted(proposalId, true);
    }

    /**
     * @dev Attaches a vault to the DAO (admin only)
     * @param vaultAddress The address of the vault to attach
     */
    function attachVault(address vaultAddress) 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(vaultAddress != address(0), "Invalid vault address");
        require(attachedVault == address(0), "Vault already attached");
        
        attachedVault = vaultAddress;
        
        emit VaultAttached(vaultAddress, msg.sender);
    }

    /**
     * @dev Detaches the current vault from the DAO (admin only)
     */
    function detachVault() 
        external 
        onlyOwner 
        whenNotPaused 
        nonReentrant 
    {
        require(attachedVault != address(0), "No vault attached");
        
        address previousVault = attachedVault;
        attachedVault = address(0);
        
        emit VaultDetached(previousVault, msg.sender);
    }

    /**
     * @dev Gets proposal details
     * @param proposalId The ID of the proposal
     * @return id title description yesVotes noVotes deadline executed proposer
     */
    function getProposal(uint256 proposalId) 
        external 
        view 
        validProposal(proposalId) 
        returns (
            uint256 id,
            string memory title,
            string memory description,
            uint256 yesVotes,
            uint256 noVotes,
            uint256 deadline,
            bool executed,
            address proposer
        ) 
    {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.id,
            proposal.title,
            proposal.description,
            proposal.yesVotes,
            proposal.noVotes,
            proposal.deadline,
            proposal.executed,
            proposal.proposer
        );
    }

    /**
     * @dev Checks if an address has voted on a proposal
     * @param proposalId The ID of the proposal
     * @param voter The address to check
     * @return Whether the address has voted
     */
    function hasVoted(uint256 proposalId, address voter) 
        external 
        view 
        validProposal(proposalId) 
        returns (bool) 
    {
        return proposals[proposalId].hasVoted[voter];
    }

    /**
     * @dev Gets all members
     * @return Array of member addresses
     */
    function getMembers() external view returns (address[] memory) {
        return memberList;
    }

    /**
     * @dev Sets the quorum percentage (only owner)
     * @param _quorumPercentage The new quorum percentage (1-100)
     */
    function setQuorumPercentage(uint256 _quorumPercentage) external onlyOwner {
        require(_quorumPercentage > 0 && _quorumPercentage <= 100, "Invalid quorum percentage");
        quorumPercentage = _quorumPercentage;
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
}