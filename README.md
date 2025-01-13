# Manifestation Wall

<p align="center">
  <img src="assets/images/moneyfest-logo-256.png" alt="Manifestation Wall">
</p>

A Solana program that allows users to post messages by paying a small fee (i.e. 0.05 SOL) to a developer-specified wallet.

Brought you by [moneyfestation.net](https://www.moneyfestation.net)

## Features

- Dev wallet can create message walls
- Users can post messages by paying 0.05 SOL
- All fees go directly to the dev wallet
- Message validation (non-empty, max 500 chars)
- On-chain events for message tracking

## Prerequisites

- [Rust](https://rustup.rs/)
- [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) (v16 or later)
- [Yarn](https://yarnpkg.com/getting-started/install)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd manifest-sol
```

2. Install dependencies:
```bash
yarn install
```

3. Build the program:
```bash
anchor build
```

4. Update Program ID:
```bash
# Get the program ID
solana-keygen pubkey target/deploy/manifestation_wall-keypair.json

# Update the program ID in:
# 1. programs/manifest-sol/src/lib.rs
# 2. Anchor.toml
```

## Testing

Run the tests (this will automatically start a local test validator):
```bash
anchor test
```

## Program Architecture

### Accounts

1. `Wall` - A Program Derived Address (PDA) that stores:
   - Dev wallet address (fee recipient)
   - Wall ID
   - PDA bump

### Instructions

1. `initialize_wall`:
   - Only the dev wallet can create walls
   - Dev wallet pays for account rent
   - Stores dev wallet address for fee collection

2. `post_message`:
   - Any user can post messages
   - Requires 0.05 SOL payment
   - Payment goes directly to dev wallet
   - Validates message length (1-500 chars)

### Events

1. `WallInitialized`:
   - Emitted when a new wall is created
   - Contains wall ID and dev wallet address

2. `MessagePosted`:
   - Emitted for each message
   - Contains wall ID, user address, message, and timestamp

## Usage Example

```typescript
// Initialize a wall (dev wallet only)
const tx1 = await program.methods
  .initializeWall(new anchor.BN(1))
  .accountsStrict({
    wall: wallPDA,
    devWallet: devWallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([devWallet])
  .rpc();

// Post a message (any user)
const tx2 = await program.methods
  .postMessage("Hello, Solana!")
  .accountsStrict({
    wall: wallPDA,
    user: userWallet.publicKey,
    devWallet: devWallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([userWallet])
  .rpc();
```

## Security Considerations

- Only the dev wallet can create walls
- Payment destination is enforced by the program
- Message fees are fixed at 0.05 SOL
- PDAs ensure wall account ownership

## License

MIT 