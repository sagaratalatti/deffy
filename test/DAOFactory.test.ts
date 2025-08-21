import { expect } from "chai";
import hre from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { DAOFactory, DAO } from "../typechain-types";

describe("DAOFactory", function () {
  let daoFactory: DAOFactory;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2] = await hre.ethers.getSigners();

    const DAOFactory = await hre.ethers.getContractFactory("DAOFactory");
    daoFactory = (await DAOFactory.deploy()) as unknown as DAOFactory;
    await daoFactory.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await daoFactory.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero DAOs", async function () {
      expect(await daoFactory.daoCount()).to.equal(0);
    });
  });

  describe("DAO Creation", function () {
    it("Should create a new DAO", async function () {
      const daoName = "Test DAO";
      
      const tx = await daoFactory.connect(user1).createDAO(daoName);
      const receipt = await tx.wait();
      
      // Check if DAOCreated event was emitted
      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "DAOCreated"
      );
      expect(event).to.not.be.undefined;
      
      // Check DAO count increased
      expect(await daoFactory.daoCount()).to.equal(1);
      
      // Check user's DAO list
      const userDAOs = await daoFactory.getUserDAOs(user1.address);
      expect(userDAOs.length).to.equal(1);
    });

    it("Should fail with empty DAO name", async function () {
      await expect(
        daoFactory.connect(user1).createDAO("")
      ).to.be.revertedWith("DAO name cannot be empty");
    });

    it("Should fail with too long DAO name", async function () {
      const longName = "a".repeat(101);
      await expect(
        daoFactory.connect(user1).createDAO(longName)
      ).to.be.revertedWith("DAO name too long");
    });

    it("Should allow multiple DAOs per user", async function () {
      await daoFactory.connect(user1).createDAO("DAO 1");
      await daoFactory.connect(user1).createDAO("DAO 2");
      
      const userDAOs = await daoFactory.getUserDAOs(user1.address);
      expect(userDAOs.length).to.equal(2);
      expect(await daoFactory.daoCount()).to.equal(2);
    });
  });

  describe("Vault Registry", function () {
    let daoAddress: string;
    let dao: DAO;
    
    beforeEach(async function () {
      const tx = await daoFactory.connect(user1).createDAO("Test DAO");
      const receipt = await tx.wait();
      
      const userDAOs = await daoFactory.getUserDAOs(user1.address);
      daoAddress = userDAOs[0];
      
      dao = await hre.ethers.getContractAt("DAO", daoAddress) as unknown as DAO;
    });

    it("Should register a vault for a DAO", async function () {
      const mockVaultAddress = user2.address; // Using user2 as mock vault
      
      await daoFactory.connect(user1).registerVault(daoAddress, mockVaultAddress);
      
      expect(await daoFactory.getDAOVault(daoAddress)).to.equal(mockVaultAddress);
      expect(await daoFactory.getVaultDAO(mockVaultAddress)).to.equal(daoAddress);
    });

    it("Should fail to register vault if not DAO owner", async function () {
      const mockVaultAddress = user2.address;
      
      await expect(
        daoFactory.connect(user2).registerVault(daoAddress, mockVaultAddress)
      ).to.be.revertedWith("Only DAO owner can register vault");
    });

    it("Should fail to register vault with zero address", async function () {
      await expect(
        daoFactory.connect(user1).registerVault(daoAddress, hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid vault address");
    });

    it("Should fail to register vault for non-existent DAO", async function () {
      const fakeVaultAddress = "0x1234567890123456789012345678901234567890";
      await expect(
        daoFactory.connect(user1).registerVault(hre.ethers.ZeroAddress, fakeVaultAddress)
      ).to.be.revertedWith("Invalid DAO address");
    });

    it("Should unregister a vault", async function () {
      const mockVaultAddress = user2.address;
      
      // Register first
      await daoFactory.connect(user1).registerVault(daoAddress, mockVaultAddress);
      
      // Then unregister
      await daoFactory.connect(user1).unregisterVault(daoAddress);
      
      expect(await daoFactory.getDAOVault(daoAddress)).to.equal(hre.ethers.ZeroAddress);
      expect(await daoFactory.getVaultDAO(mockVaultAddress)).to.equal(hre.ethers.ZeroAddress);
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow owner to pause", async function () {
      await daoFactory.connect(owner).pause();
      expect(await daoFactory.paused()).to.be.true;
    });

    it("Should prevent DAO creation when paused", async function () {
      await daoFactory.connect(owner).pause();
      
      await expect(
        daoFactory.connect(user1).createDAO("Test DAO")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow owner to unpause", async function () {
      await daoFactory.connect(owner).pause();
      await daoFactory.connect(owner).unpause();
      
      expect(await daoFactory.paused()).to.be.false;
      
      // Should be able to create DAO again
      await daoFactory.connect(user1).createDAO("Test DAO");
      expect(await daoFactory.daoCount()).to.equal(1);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await daoFactory.connect(user1).createDAO("DAO 1");
      await daoFactory.connect(user1).createDAO("DAO 2");
      await daoFactory.connect(user2).createDAO("DAO 3");
    });

    it("Should return all DAOs", async function () {
      const allDAOs = await daoFactory.getAllDAOs();
      expect(allDAOs.length).to.equal(3);
    });

    it("Should return user-specific DAOs", async function () {
      const user1DAOs = await daoFactory.getUserDAOs(user1.address);
      const user2DAOs = await daoFactory.getUserDAOs(user2.address);
      
      expect(user1DAOs.length).to.equal(2);
      expect(user2DAOs.length).to.equal(1);
    });
  });
});