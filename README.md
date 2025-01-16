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
- [Yarn](https://yarnpkg.com/getting-started/install) (for tests)
- [pnpm](https://pnpm.io/installation) (for utility scripts)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/moneyfestation-dev/manifest-wall-solana
cd manifest-wall-solana
```

2. Install dependencies:

```bash
# Install test dependencies
yarn install

# Install script dependencies
pnpm install
```

3. Build the program:

```bash
anchor build
```

4. Set up configuration:

```bash
# Copy the example configuration
cp Anchor.example.toml Anchor.toml

# Get the program ID
solana-keygen pubkey target/deploy/manifest_sol-keypair.json

# Update the program ID in:
# 1. programs/manifest-sol/src/lib.rs
# 2. Anchor.toml (replace YOUR_PROGRAM_ID)

# Ensure your wallet is in the correct location
# The program expects it at .test_wallets/devnet-deploy-wallet.json
```

## Development Workflow

The project uses a `.test_wallets` directory to store development and test wallets. This directory is automatically created when running the scripts and is ignored by git.

### Available Scripts

The project uses two package managers:

- Yarn for tests (Anchor compatibility)
- pnpm for utility scripts

1. Initialize a new wall:

```bash
anchor run init-wall  # uses pnpm under the hood
```

2. Post a test message:

```bash
anchor run post-message  # uses pnpm under the hood
```

3. Run tests:

```bash
anchor test  # uses yarn under the hood
```

The scripts will automatically:

- Create `.test_wallets` directory if it doesn't exist
- Generate or reuse test wallets
- Request airdrops when needed
- Track wallet balances

### Configuration Files

- `Anchor.example.toml`: Template configuration with placeholder values
- `Anchor.toml`: Your local configuration (git-ignored)
- `.test_wallets/`: Directory for development wallets (git-ignored)

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

## Security Considerations

- Only the dev wallet can create walls
- Payment destination is enforced by the program
- Message fees are fixed at 0.05 SOL
- PDAs ensure wall account ownership
- Sensitive files (wallets, local config) are git-ignored

## License

MIT
