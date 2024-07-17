use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
//use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("CBTq287t3pjLuwgHMcmkq1ErQu7EW16aBLy79JjKsTDc");

// Constants for account sizes
const DISCRIMINATOR_LENGTH: usize = 8;
const PUBKEY_LENGTH: usize = 32;
const LOCATION_LENGTH: usize = 32;
const BOOL_LENGTH: usize = 1;
const EXTRA_SPACE: usize = 1000; // Extra space to ensure we're not running out
const SYNCHRONIZER_SIZE: usize = DISCRIMINATOR_LENGTH + PUBKEY_LENGTH + LOCATION_LENGTH + BOOL_LENGTH + EXTRA_SPACE;



#[program]
pub mod multisynq_poc {
    use super::*;

    pub fn initialize_synchronizer(ctx: Context<InitializeSynchronizer>, location: [u8; LOCATION_LENGTH]) -> Result<()> {
        msg!("Initializing synchronizer...");
        let synchronizer = &mut ctx.accounts.synchronizer;
        synchronizer.owner = ctx.accounts.owner.key();
        synchronizer.location = location;
        synchronizer.is_active = true;
        msg!("Synchronizer initialized successfully");
        msg!("Owner: {:?}", synchronizer.owner);
        msg!("Location: {:?}", synchronizer.location);
        msg!("Is Active: {:?}", synchronizer.is_active);
        Ok(())
    }

    pub fn create_session(ctx: Context<CreateSession>, session_id: String) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.id = session_id;
        session.synchronizer = ctx.accounts.synchronizer.key();
        session.is_active = true;
        Ok(())
    }


    pub fn burn_and_mint(ctx: Context<BurnAndMint>, amount: u64) -> Result<()> {
        // Burn $SYNQ tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.synq_mint.to_account_info(),
                    from: ctx.accounts.user_synq_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
    
        // Mint Data Tokens
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.data_token_mint.to_account_info(),
                    to: ctx.accounts.user_data_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[&[b"mint_authority", &[ctx.bumps.mint_authority]]],
            ),
            amount,
        )?;
    
        Ok(())
    }

}

#[derive(Accounts)]
pub struct InitializeSynchronizer<'info> {
    #[account(
        init,
        payer = owner,
        space = SYNCHRONIZER_SIZE
    )]
    pub synchronizer: Account<'info, Synchronizer>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateSession<'info> {
    #[account(init, payer = user, space = 8 + 64 + 32 + 1)]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub synchronizer: Account<'info, Synchronizer>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct BurnAndMint<'info> {
    #[account(mut)]
    pub synq_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub data_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_synq_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_data_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This is safe because it's a PDA used as the mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(Default)]
pub struct Synchronizer {
    pub owner: Pubkey,
    pub location: [u8; LOCATION_LENGTH],
    pub is_active: bool,
}

#[account]
pub struct Session {
    pub id: String,
    pub synchronizer: Pubkey,
    pub is_active: bool,
}