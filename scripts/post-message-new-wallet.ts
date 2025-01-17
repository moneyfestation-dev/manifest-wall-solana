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

// Save wallet with metadata for future use
const saveWalletInfo = (
  wallet: Keypair,
  txSignature?: string,
  balanceChange?: number
) => {
  const walletInfo = {
    publicKey: wallet.publicKey.toString(),
    secretKey: Array.from(wallet.secretKey),
    created: new Date().toISOString(),
    lastUsed: txSignature ? new Date().toISOString() : null,
    lastTx: txSignature || null,
    balanceChange: balanceChange || 0,
  };

  const filename = path.join(
    ".test_wallets",
    `single-use-${wallet.publicKey.toString().slice(0, 8)}.json`
  );
  fs.writeFileSync(filename, JSON.stringify(walletInfo, null, 2));
  return filename;
};

const main = async (): Promise<void> => {
  // Set up the connection to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Generate a fresh wallet for this run
  const newWallet = Keypair.generate();
  console.log("Created new wallet:", newWallet.publicKey.toString());

  // Save wallet immediately after creation
  const walletPath = saveWalletInfo(newWallet);
  console.log("Wallet saved to:", walletPath);

  // Create the wallet and provider
  const wallet = new anchor.Wallet(newWallet);
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

    // Request airdrop for new wallet
    console.log("Requesting airdrop for new wallet...");
    try {
      const signature = await connection.requestAirdrop(
        newWallet.publicKey,
        0.5 * LAMPORTS_PER_SOL // Request less SOL to avoid rate limits
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
      console.log(
        "Proceeding without airdrop - transaction may fail if wallet has no SOL"
      );
    }

    // Check new wallet balance
    const walletBalance = await connection.getBalance(newWallet.publicKey);
    console.log("New wallet balance:", walletBalance / LAMPORTS_PER_SOL, "SOL");

    // Post a message
    console.log("Posting message to wall...");
    const tx = await program.methods
      .postMessage(
        `One-time message from ${newWallet.publicKey.toString().slice(0, 8)}...`
      )
      .accountsStrict({
        wall: wallPda,
        user: newWallet.publicKey,
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

    // Final balance check of new wallet
    const finalBalance = await connection.getBalance(newWallet.publicKey);
    console.log(
      "New wallet final balance:",
      finalBalance / LAMPORTS_PER_SOL,
      "SOL"
    );
    console.log(
      "New wallet total spent:",
      (walletBalance - finalBalance) / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Update wallet info with transaction details
    const savedTo = saveWalletInfo(newWallet, tx, balanceChange);
    console.log("Wallet info updated with transaction details in:", savedTo);
  } catch (e) {
    console.error("Error:", e);
    console.log(
      "Wallet was saved to:",
      walletPath,
      "- you can use it later when airdrop is available"
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
