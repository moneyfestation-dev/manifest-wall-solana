import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { ManifestSol } from "../target/types/manifest_sol";
import * as fs from "fs";
import * as path from "path";
import { DEV_WALLET_PATH } from "./constants";

const WALLET_ID = "5YyJD93H";

const loadExistingWallet = (): Keypair => {
  const idExcerpt = WALLET_ID;
  const walletFiles = fs.readdirSync(".test_wallets");
  const walletFile = walletFiles.find((f) => f.includes(idExcerpt));

  if (!walletFile) {
    throw new Error(`No wallet found with ID containing: ${idExcerpt}`);
  }

  const walletPath = path.join(".test_wallets", walletFile);
  const walletInfo = JSON.parse(fs.readFileSync(walletPath, "utf-8"));

  return Keypair.fromSecretKey(new Uint8Array(walletInfo.secretKey));
};

// Update wallet info after transaction
const updateWalletInfo = (
  wallet: Keypair,
  txSignature: string,
  balanceChange: number
) => {
  const walletFile = fs
    .readdirSync(".test_wallets")
    .find((f) => f.includes(wallet.publicKey.toString().slice(0, 8)));

  if (!walletFile) {
    throw new Error("Wallet file not found");
  }

  const walletPath = path.join(".test_wallets", walletFile);
  const walletInfo = JSON.parse(fs.readFileSync(walletPath, "utf-8"));

  const updatedInfo = {
    ...walletInfo,
    lastUsed: new Date().toISOString(),
    lastTx: txSignature,
    balanceChange,
  };

  fs.writeFileSync(walletPath, JSON.stringify(updatedInfo, null, 2));
  return walletPath;
};

const main = async () => {
  // Get wallet ID from environment variable
  const walletId = WALLET_ID;
  if (!walletId) {
    throw new Error(
      "Please set WALLET_ID environment variable (e.g., '5YyJD93H')"
    );
  }

  // Set up the connection to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the existing wallet
  const existingWallet = loadExistingWallet();
  console.log("Loaded wallet:", existingWallet.publicKey.toString());

  // Create the wallet and provider
  const wallet = new anchor.Wallet(existingWallet);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Get the program
  const program = anchor.workspace.manifest_sol as Program<ManifestSol>;

  // Load dev wallet for PDA derivation
  const devWalletRaw = fs.readFileSync(DEV_WALLET_PATH, "utf-8");
  const devWallet = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(devWalletRaw))
  );

  // Get the wall PDA
  const [wallPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("wall"),
      devWallet.publicKey.toBuffer(),
      new anchor.BN(1).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  try {
    // Check dev wallet balance before
    const balanceBefore = await connection.getBalance(
      devWallet.publicKey,
      "confirmed"
    );
    console.log(
      "Dev wallet balance before:",
      balanceBefore / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Check existing wallet balance
    const walletBalance = await connection.getBalance(existingWallet.publicKey);
    console.log(
      "Existing wallet balance:",
      walletBalance / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Request airdrop if balance is low
    if (walletBalance < 0.1 * LAMPORTS_PER_SOL) {
      console.log("Requesting airdrop for wallet...");
      try {
        const signature = await connection.requestAirdrop(
          existingWallet.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction({
          signature,
          blockhash: await connection
            .getLatestBlockhash()
            .then((res) => res.blockhash),
          lastValidBlockHeight: await connection
            .getLatestBlockhash()
            .then((res) => res.lastValidBlockHeight),
        });
        console.log("Airdrop received!");
      } catch (airdropError) {
        console.error("Failed to get airdrop:", airdropError);
        if (walletBalance === 0) {
          throw new Error("Wallet has no SOL and airdrop failed");
        }
        console.log("Proceeding with existing balance");
      }
    }

    // Post a message
    console.log("Posting message to wall...");
    const tx = await program.methods
      .postMessage(
        `Reused message from ${existingWallet.publicKey
          .toString()
          .slice(0, 8)}...`
      )
      .accountsStrict({
        wall: wallPda,
        user: existingWallet.publicKey,
        devWallet: devWallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Message posted! Transaction signature:", tx);

    // Wait longer for the transaction to be fully confirmed
    console.log("Waiting for confirmation...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check dev wallet balance after with confirmed commitment
    const balanceAfter = await connection.getBalance(
      devWallet.publicKey,
      "confirmed"
    );
    console.log(
      "Dev wallet balance after:",
      balanceAfter / LAMPORTS_PER_SOL,
      "SOL"
    );
    const balanceChange = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;
    console.log("Balance change:", balanceChange, "SOL");

    // Final balance check of wallet
    const finalBalance = await connection.getBalance(existingWallet.publicKey);
    console.log(
      "Wallet final balance:",
      finalBalance / LAMPORTS_PER_SOL,
      "SOL"
    );
    console.log(
      "Wallet total spent:",
      (walletBalance - finalBalance) / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Update wallet info
    const savedTo = updateWalletInfo(existingWallet, tx, balanceChange);
    console.log("Wallet info updated in:", savedTo);
  } catch (e) {
    console.error("Error:", e);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
