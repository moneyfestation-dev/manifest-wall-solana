import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ManifestSol } from "../target/types/manifest_sol";
import * as fs from "fs";
import { DEV_WALLET_PATH } from "./constants";

const main = async (): Promise<void> => {
  // Set up the connection to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the wallet keypair
  const rawWallet = fs.readFileSync(DEV_WALLET_PATH, "utf-8");
  const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(rawWallet)));

  // Create the wallet and provider
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Get the program from workspace
  const program = anchor.workspace.manifest_sol as Program<ManifestSol>;

  try {
    console.log("Initializing wall with ID 1...");
    const tx = await program.methods.initializeWall(new anchor.BN(1)).rpc();
    console.log("Wall initialized! Transaction signature:", tx);

    // Optional: Fetch the wall account to verify
    const [wallPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("wall"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    console.log("Wall PDA:", wallPda.toString());
  } catch (e) {
    console.error("Error:", e);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
