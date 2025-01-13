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
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  before(async () => {
    // Airdrop 2 SOL to dev wallet for rent and fees
    const signature1 = await provider.connection.requestAirdrop(
      devWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    const latestBlockhash1 = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: signature1,
      ...latestBlockhash1
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
  });
});
