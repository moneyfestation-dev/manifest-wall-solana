use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("11111111111111111111111111111111");

// A constant fee (0.05 SOL in lamports):
const MESSAGE_FEE_LAMPORTS: u64 = 50_000_000; // 0.05 * 1,000,000,000

#[program]
pub mod manifestation_wall {
    use super::*;

    /// Creates a new "Wall" account, storing the dev wallet and authority.
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

    /// Posts a message, charging 0.05 SOL to the user, which goes to the dev wallet.
    pub fn post_message(ctx: Context<PostMessage>, message: String) -> Result<()> {
        // 1. Check message length
        require!(message.len() > 0, WallError::EmptyMessage);
        require!(message.len() <= 500, WallError::MessageTooLong);

        // 2. Transfer fee from user to dev wallet
        let user = &ctx.accounts.user;

        // We do a CPI call to system_program::transfer
        let transfer_cpi = Transfer {
            from: user.to_account_info(),
            to: ctx.accounts.dev_wallet.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_cpi);
        system_program::transfer(cpi_ctx, MESSAGE_FEE_LAMPORTS)?;

        // 3. Emit event (so off-chain indexers can pick it up)
        let clock = Clock::get()?;
        emit!(MessagePosted {
            wall_id: ctx.accounts.wall.wall_id,
            user: user.key(),
            message,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ----------------------------------------------------------------
// ACCOUNTS
// ----------------------------------------------------------------

#[derive(Accounts)]
#[instruction(wall_id: u64)]
pub struct InitializeWall<'info> {
    // We'll create a fresh PDA for the wall
    #[account(
        init,
        payer = dev_wallet,
        space = 8 + Wall::LEN, // 8 for account discriminator
        seeds = [b"wall", dev_wallet.key().as_ref(), &wall_id.to_le_bytes()],
        bump
    )]
    pub wall: Account<'info, Wall>,

    /// The dev wallet that initializes and owns this wall (pays the rent)
    #[account(mut)]
    pub dev_wallet: Signer<'info>,

    /// Needed for creating system accounts
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PostMessage<'info> {
    // We read/update the existing wall
    #[account(
        mut,
        seeds = [b"wall", wall.dev_wallet.as_ref(), &wall.wall_id.to_le_bytes()],
        bump = wall.bump
    )]
    pub wall: Account<'info, Wall>,

    /// The user who is paying to post a message
    #[account(mut)]
    pub user: Signer<'info>,

    /// The dev wallet that must match `wall.dev_wallet`
    #[account(
        mut,
        address = wall.dev_wallet // Enforce that this is the dev wallet stored on `wall`
    )]
    pub dev_wallet: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

#[account]
pub struct Wall {
    /// Where the fees go - this is the wallet that created the wall
    pub dev_wallet: Pubkey,
    /// Unique ID for this wall, if you want multiple
    pub wall_id: u64,
    /// Bump for the PDA
    pub bump: u8,
}

impl Wall {
    pub const LEN: usize = 32  // dev_wallet
        + 8                   // wall_id
        + 1;                  // bump
}

// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------

#[event]
pub struct WallInitialized {
    pub wall_id: u64,
    pub dev_wallet: Pubkey,
}

#[event]
pub struct MessagePosted {
    pub wall_id: u64,
    pub user: Pubkey,
    pub message: String,
    pub timestamp: i64,
}

// ----------------------------------------------------------------
// ERRORS
// ----------------------------------------------------------------

#[error_code]
pub enum WallError {
    #[msg("Message cannot be empty.")]
    EmptyMessage,
    #[msg("Message is too long.")]
    MessageTooLong,
}


