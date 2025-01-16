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
import { TEST_WALLET_PATH, DEV_WALLET_PATH } from "./constants";

const main = async (): Promise<void> => {
  // Set up the connection to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Create or load test wallet
  let testWallet: Keypair;
  try {
    const rawWallet = fs.readFileSync(TEST_WALLET_PATH, "utf-8");
    testWallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(rawWallet)));
    console.log("Using existing test wallet:", testWallet.publicKey.toString());
  } catch {
    testWallet = Keypair.generate();
    fs.writeFileSync(
      TEST_WALLET_PATH,
      JSON.stringify(Array.from(testWallet.secretKey))
    );
    console.log("Created new test wallet:", testWallet.publicKey.toString());
  }

  // Create the wallet and provider
  const wallet = new anchor.Wallet(testWallet);
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

    // Check test wallet balance
    const testWalletBalance = await connection.getBalance(testWallet.publicKey);
    if (testWalletBalance < 0.1 * LAMPORTS_PER_SOL) {
      console.log("Requesting airdrop for test wallet...");
      const signature = await connection.requestAirdrop(
        testWallet.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      console.log("Airdrop received!");
    } else {
      console.log(
        "Test wallet has sufficient balance:",
        testWalletBalance / LAMPORTS_PER_SOL,
        "SOL"
      );
    }

    // Post a message
    console.log("Posting message to wall...");
    const tx = await program.methods
      .postMessage("Hello from test wallet!.")
      .accountsStrict({
        wall: wallPda,
        user: testWallet.publicKey,
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
    console.log(
      "Balance change:",
      (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL,
      "SOL"
    );
  } catch (e) {
    console.error("Error:", e);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
