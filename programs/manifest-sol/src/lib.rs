use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("11111111111111111111111111111111");

/// Constants used throughout the program
pub mod constants {
    /// The fee charged for posting a message, set to 0.05 SOL (50,000,000 lamports)
    pub const MESSAGE_FEE_LAMPORTS: u64 = 50_000_000; // 0.05 * 1,000,000,000
    /// Maximum length allowed for messages
    pub const MAX_MESSAGE_LENGTH: usize = 500;
    /// Buffer for transaction fees (0.001 SOL)
    pub const TRANSACTION_FEE_BUFFER: u64 = 1_000_000;
}

use constants::*;

/// The main program module for the Manifestation Wall
/// This program allows users to post messages by paying a small fee to a developer-specified wallet.
/// The program ensures secure handling of funds and proper access control for wall initialization.
#[program]
pub mod manifestation_wall {
    use super::*;

    /// Initializes a new message wall with a specified wall ID.
    /// This instruction can only be executed by the dev wallet, which will become the fee recipient.
    /// 
    /// # Arguments
    /// * `ctx` - The context object containing the wall account and dev wallet
    /// * `wall_id` - A unique identifier for this wall, allowing multiple walls per dev wallet
    /// 
    /// # Security
    /// - Only the signer (dev_wallet) can initialize a wall
    /// - The wall PDA is derived using the dev wallet and wall ID to ensure uniqueness
    /// - Dev wallet pays for the wall account's rent
    pub fn initialize_wall(
        ctx: Context<InitializeWall>,
        wall_id: u64,
    ) -> Result<()> {
        let wall = &mut ctx.accounts.wall;
        wall.dev_wallet = ctx.accounts.dev_wallet.key();
        wall.wall_id    = wall_id;
        wall.bump = ctx.bumps.wall;

        emit!(WallInitialized {
            wall_id,
            dev_wallet: wall.dev_wallet,
        });

        Ok(())
    }

    /// Posts a message to a specific wall by paying the required fee.
    /// The fee is automatically transferred to the dev wallet associated with the wall.
    /// 
    /// # Arguments
    /// * `ctx` - The context object containing the wall, user, and dev wallet accounts
    /// * `message` - The message to post (must be 1-500 characters)
    /// 
    /// # Security
    /// - Validates message length (non-empty and ≤500 chars)
    /// - Ensures fee payment goes directly to the correct dev wallet
    /// - Uses CPI to handle SOL transfer securely
    /// 
    /// # Events
    /// Emits a MessagePosted event containing:
    /// - Wall ID
    /// - User's public key
    /// - Message content
    /// - Unix timestamp
    pub fn post_message(ctx: Context<PostMessage>, message: String) -> Result<()> {
        // 1. Check message length
        require!(message.len() > 0, WallError::EmptyMessage);
        require!(message.len() <= MAX_MESSAGE_LENGTH, WallError::MessageTooLong);

        // 2. Verify dev wallet matches
        require!(
            ctx.accounts.dev_wallet.key() == ctx.accounts.wall.dev_wallet,
            WallError::InvalidDevWallet
        );

        // 3. Check if user has sufficient funds (including buffer for tx fee)
        require!(
            ctx.accounts.user.lamports() >= MESSAGE_FEE_LAMPORTS + TRANSACTION_FEE_BUFFER,
            WallError::InsufficientFunds
        );

        // 4. Transfer fee from user to dev wallet
        let transfer_cpi = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.dev_wallet.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_cpi);
        system_program::transfer(cpi_ctx, MESSAGE_FEE_LAMPORTS)?;

        // 5. Emit event (so off-chain indexers can pick it up)
        let clock = Clock::get()?;
        emit!(MessagePosted {
            wall_id: ctx.accounts.wall.wall_id,
            user: ctx.accounts.user.key(),
            message,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ----------------------------------------------------------------
// ACCOUNTS
// ----------------------------------------------------------------

/// Account validation struct for the initialize_wall instruction
/// Creates a new PDA to store wall information and configuration
#[derive(Accounts)]
#[instruction(wall_id: u64)]
pub struct InitializeWall<'info> {
    /// The wall account - a PDA that stores wall configuration
    /// Seeds: ["wall", dev_wallet, wall_id]
    #[account(
        init,
        payer = dev_wallet,
        space = 8 + Wall::LEN, // 8 for account discriminator
        seeds = [b"wall", dev_wallet.key().as_ref(), &wall_id.to_le_bytes()],
        bump
    )]
    pub wall: Account<'info, Wall>,

    /// The dev wallet that initializes and owns this wall
    /// Must sign the transaction and pays for account rent
    #[account(mut)]
    pub dev_wallet: Signer<'info>,

    /// Required for account creation
    pub system_program: Program<'info, System>,
}

/// Account validation struct for the post_message instruction
/// Handles message posting and fee payment
#[derive(Accounts)]
pub struct PostMessage<'info> {
    /// The wall account being posted to
    /// Verified using PDA seeds to ensure authenticity
    #[account(
        mut,
        seeds = [b"wall", wall.dev_wallet.as_ref(), &wall.wall_id.to_le_bytes()],
        bump = wall.bump
    )]
    pub wall: Account<'info, Wall>,

    /// The user posting the message and paying the fee
    /// Must sign the transaction and have sufficient SOL
    #[account(mut)]
    pub user: Signer<'info>,

    /// The dev wallet receiving the fee
    /// Must match the wall's stored dev_wallet address
    #[account(
        mut,
        address = wall.dev_wallet // Enforce that this is the dev wallet stored on `wall`
    )]
    pub dev_wallet: SystemAccount<'info>,

    /// Required for SOL transfers
    pub system_program: Program<'info, System>,
}

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

/// The main account structure storing wall configuration
/// This account is a PDA owned by the program
#[account]
pub struct Wall {
    /// The wallet address that receives all message posting fees
    pub dev_wallet: Pubkey,
    /// Unique identifier for this wall, allowing multiple walls per dev wallet
    pub wall_id: u64,
    /// PDA bump seed, stored for convenient verification
    pub bump: u8,
}

impl Wall {
    /// Total space needed for the Wall account:
    /// - 32 bytes for Pubkey (dev_wallet)
    /// - 8 bytes for u64 (wall_id)
    /// - 1 byte for u8 (bump)
    pub const LEN: usize = 32  // dev_wallet
        + 8                    // wall_id
        + 1;                   // bump
}

// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------

/// Event emitted when a new wall is initialized
/// Useful for indexers to track wall creation
#[event]
pub struct WallInitialized {
    /// The wall's unique identifier
    pub wall_id: u64,
    /// The wallet that will receive message posting fees
    pub dev_wallet: Pubkey,
}

/// Event emitted when a message is posted
/// Contains all relevant information for indexers and UI
#[event]
pub struct MessagePosted {
    /// The ID of the wall the message was posted to
    pub wall_id: u64,
    /// The wallet address of the user who posted the message
    pub user: Pubkey,
    /// The actual message content
    pub message: String,
    /// Unix timestamp when the message was posted
    pub timestamp: i64,
}

// ----------------------------------------------------------------
// ERRORS
// ----------------------------------------------------------------

/// Custom error codes for the program
#[error_code]
pub enum WallError {
    /// Thrown when attempting to post an empty message
    #[msg("Message cannot be empty.")]
    EmptyMessage,

    /// Thrown when message exceeds 500 characters
    #[msg("Message is too long (maximum 500 characters).")]
    MessageTooLong,

    /// Thrown when user has insufficient funds to pay the message fee
    #[msg("Insufficient funds to pay message fee (0.05 SOL required).")]
    InsufficientFunds,

    /// Thrown when trying to use a different dev wallet than the one stored in the wall
    #[msg("Invalid dev wallet - must match the wall's stored dev wallet.")]
    InvalidDevWallet,
}


