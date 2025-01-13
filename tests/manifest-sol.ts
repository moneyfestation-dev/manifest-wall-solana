import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ManifestationWall } from "../target/types/manifestation_wall";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("manifest-sol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ManifestationWall as Program<ManifestationWall>;
  const wallId = new anchor.BN(1);
  const MESSAGE_FEE = 0.05; // SOL
  
  // Create wallets for testing
  const devWallet = Keypair.generate();
  const devWallet2 = Keypair.generate(); // Second dev wallet for multiple wall tests
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const poorUser = Keypair.generate(); // User with insufficient funds

  before(async () => {
    // Airdrop 2 SOL to dev wallets for rent and fees
    const signature1 = await provider.connection.requestAirdrop(
      devWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    const latestBlockhash1 = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: signature1,
      ...latestBlockhash1
    });

    const signature4 = await provider.connection.requestAirdrop(
      devWallet2.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction({
      signature: signature4,
      ...(await provider.connection.getLatestBlockhash())
    });

    // Airdrop 1 SOL to each user for testing
    const signature2 = await provider.connection.requestAirdrop(
      user1.publicKey,
      LAMPORTS_PER_SOL
    );
    const latestBlockhash2 = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: signature2,
      ...latestBlockhash2
    });

    const signature3 = await provider.connection.requestAirdrop(
      user2.publicKey,
      LAMPORTS_PER_SOL
    );
    const latestBlockhash3 = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: signature3,
      ...latestBlockhash3
    });

    // Airdrop only 0.01 SOL to poorUser (insufficient for message fee)
    const signature5 = await provider.connection.requestAirdrop(
      poorUser.publicKey,
      0.01 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction({
      signature: signature5,
      ...(await provider.connection.getLatestBlockhash())
    });
  });

  async function getWallPDA(devWalletPubkey: PublicKey, wallId: anchor.BN) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("wall"),
        devWalletPubkey.toBuffer(),
        wallId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    )[0];
  }

  describe("initialize_wall", () => {
    it("should initialize a new wall with dev wallet as owner", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      const tx = await program.methods
        .initializeWall(wallId)
        .accountsStrict({
          wall: wallPDA,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([devWallet])
        .rpc();

      // Fetch the created wall account
      const wallAccount = await program.account.wall.fetch(wallPDA);
      
      expect(wallAccount.devWallet.toString()).to.equal(devWallet.publicKey.toString());
      expect(wallAccount.wallId.toString()).to.equal(wallId.toString());
    });

    it("should not allow non-dev wallet to initialize", async () => {
      const randomWallet = Keypair.generate();
      const wallPDA = await getWallPDA(randomWallet.publicKey, new anchor.BN(2));
      
      try {
        await program.methods
          .initializeWall(new anchor.BN(2))
          .accountsStrict({
            wall: wallPDA,
            devWallet: randomWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([randomWallet])
          .rpc();
        expect.fail("Expected transaction to fail");
      } catch (error) {
        // Transaction should fail due to insufficient funds
        expect(error.toString()).to.include("custom program error: 0x1");
      }
    });

    it("should allow multiple walls with different IDs for same dev wallet", async () => {
      const wallId2 = new anchor.BN(2);
      const wallPDA2 = await getWallPDA(devWallet.publicKey, wallId2);
      
      const tx = await program.methods
        .initializeWall(wallId2)
        .accountsStrict({
          wall: wallPDA2,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([devWallet])
        .rpc();

      const wallAccount = await program.account.wall.fetch(wallPDA2);
      expect(wallAccount.wallId.toString()).to.equal(wallId2.toString());
    });

    it("should not allow initializing wall with existing ID", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      try {
        await program.methods
          .initializeWall(wallId)
          .accountsStrict({
            wall: wallPDA,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([devWallet])
          .rpc();
        expect.fail("Expected duplicate wall ID to fail");
      } catch (error) {
        expect(error.toString()).to.include("Error");
      }
    });

    it("should not allow initializing with different signer than dev wallet", async () => {
      const wallId3 = new anchor.BN(3);
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId3);
      
      try {
        await program.methods
          .initializeWall(wallId3)
          .accountsStrict({
            wall: wallPDA,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1]) // Using wrong signer
          .rpc();
        expect.fail("Expected wrong signer to fail");
      } catch (error) {
        expect(error.toString()).to.include("Error");
      }
    });
  });

  describe("post_message", () => {
    it("should allow user1 to post a message and transfer fee to dev wallet", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      const MESSAGE = "Hello from user1!";
      
      // Get initial balances
      const devBalanceBefore = await provider.connection.getBalance(devWallet.publicKey);
      
      const tx = await program.methods
        .postMessage(MESSAGE)
        .accountsStrict({
          wall: wallPDA,
          user: user1.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // Get final balances
      const devBalanceAfter = await provider.connection.getBalance(devWallet.publicKey);
      
      // Check that dev wallet received exactly 0.05 SOL
      const devBalanceDiff = (devBalanceAfter - devBalanceBefore) / LAMPORTS_PER_SOL;
      expect(devBalanceDiff).to.equal(MESSAGE_FEE);
    });

    it("should allow user2 to post a message and transfer fee to dev wallet", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      const MESSAGE = "Hello from user2!";
      
      // Get initial balances
      const devBalanceBefore = await provider.connection.getBalance(devWallet.publicKey);
      
      const tx = await program.methods
        .postMessage(MESSAGE)
        .accountsStrict({
          wall: wallPDA,
          user: user2.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      // Get final balances
      const devBalanceAfter = await provider.connection.getBalance(devWallet.publicKey);
      
      // Check that dev wallet received exactly 0.05 SOL
      const devBalanceDiff = (devBalanceAfter - devBalanceBefore) / LAMPORTS_PER_SOL;
      expect(devBalanceDiff).to.equal(MESSAGE_FEE);
    });

    it("should reject empty messages", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      try {
        await program.methods
          .postMessage("")
          .accountsStrict({
            wall: wallPDA,
            user: user1.publicKey,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Expected empty message to be rejected");
      } catch (error) {
        expect(error.toString()).to.include("Message cannot be empty");
      }
    });

    it("should reject messages > 500 chars", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      const longMessage = "a".repeat(501);
      
      try {
        await program.methods
          .postMessage(longMessage)
          .accountsStrict({
            wall: wallPDA,
            user: user1.publicKey,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Expected long message to be rejected");
      } catch (error) {
        expect(error.toString()).to.include("Message is too long");
      }
    });

    it("should allow posting message with exactly 1 character", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      const MESSAGE = "x";
      
      const tx = await program.methods
        .postMessage(MESSAGE)
        .accountsStrict({
          wall: wallPDA,
          user: user1.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
    });

    it("should allow posting message with exactly 500 characters", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      const MESSAGE = "x".repeat(500);
      
      const tx = await program.methods
        .postMessage(MESSAGE)
        .accountsStrict({
          wall: wallPDA,
          user: user1.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
    });

    it("should fail when posting to non-existent wall", async () => {
      const nonExistentWallId = new anchor.BN(999);
      const wallPDA = await getWallPDA(devWallet.publicKey, nonExistentWallId);
      
      try {
        await program.methods
          .postMessage("Hello")
          .accountsStrict({
            wall: wallPDA,
            user: user1.publicKey,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Expected posting to non-existent wall to fail");
      } catch (error) {
        expect(error.toString()).to.include("Error");
      }
    });

    it("should fail when user has insufficient funds", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      try {
        await program.methods
          .postMessage("No funds!")
          .accountsStrict({
            wall: wallPDA,
            user: poorUser.publicKey,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([poorUser])
          .rpc();
        expect.fail("Expected insufficient funds to fail");
      } catch (error) {
        expect(error.toString()).to.include("Error");
      }
    });

    it("should fail when using wrong dev wallet", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      try {
        await program.methods
          .postMessage("Wrong dev!")
          .accountsStrict({
            wall: wallPDA,
            user: user1.publicKey,
            devWallet: devWallet2.publicKey, // Wrong dev wallet
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Expected wrong dev wallet to fail");
      } catch (error) {
        expect(error.toString()).to.include("Error");
      }
    });

    it("should allow multiple messages from same user", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      // Post 3 messages in succession
      for (let i = 1; i <= 3; i++) {
        const tx = await program.methods
          .postMessage(`Message ${i}`)
          .accountsStrict({
            wall: wallPDA,
            user: user1.publicKey,
            devWallet: devWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
      }
    });

    it("should handle concurrent messages from different users", async () => {
      const wallPDA = await getWallPDA(devWallet.publicKey, wallId);
      
      // Create message transactions for both users
      const tx1Promise = program.methods
        .postMessage("Concurrent 1")
        .accountsStrict({
          wall: wallPDA,
          user: user1.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const tx2Promise = program.methods
        .postMessage("Concurrent 2")
        .accountsStrict({
          wall: wallPDA,
          user: user2.publicKey,
          devWallet: devWallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      // Send both transactions concurrently
      await Promise.all([tx1Promise, tx2Promise]);
    });
  });
});
