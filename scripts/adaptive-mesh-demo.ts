import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { MultisynqPoc } from "../target/types/multisynq_poc";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

async function main() {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.MultisynqPoc as Program<MultisynqPoc>;
  const provider = program.provider as anchor.AnchorProvider;

  console.log("Deploying Multisynq PoC demo...");

  // Generate a new keypair for our synchronizer
  const synchronizer = anchor.web3.Keypair.generate();

  // Create $SYNQ and Data Token mints
  const synqMint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    9
  );
  console.log("$SYNQ Mint created:", synqMint.toBase58());

  const dataTokenMint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    9
  );
  console.log("Data Token Mint created:", dataTokenMint.toBase58());

  // Create token accounts for the user
  const userSynqAccount = await createAccount(
    provider.connection,
    provider.wallet.payer,
    synqMint,
    provider.wallet.publicKey
  );
  console.log("User $SYNQ Account created:", userSynqAccount.toBase58());

  const userDataTokenAccount = await createAccount(
    provider.connection,
    provider.wallet.payer,
    dataTokenMint,
    provider.wallet.publicKey
  );
  console.log("User Data Token Account created:", userDataTokenAccount.toBase58());

  // Mint some initial $SYNQ to the user
  await mintTo(
    provider.connection,
    provider.wallet.payer,
    synqMint,
    userSynqAccount,
    provider.wallet.publicKey,
    1000000000 // 1 $SYNQ
  );
  console.log("1 $SYNQ minted to user account");

  // Initialize a synchronizer
  await program.methods
    .initializeSynchronizer("New York")
    .accounts({
      synchronizer: synchronizer.publicKey,
      owner: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([synchronizer])
    .rpc();
  console.log("Synchronizer initialized:", synchronizer.publicKey.toBase58());

  // Create a session
  const session = anchor.web3.Keypair.generate();
  await program.methods
    .createSession("session1")
    .accounts({
      session: session.publicKey,
      synchronizer: synchronizer.publicKey,
      user: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([session])
    .rpc();
  console.log("Session created:", session.publicKey.toBase58());

  // Perform burn and mint
  const [mintAuthority] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("mint_authority")],
    program.programId
  );

  await program.methods
    .burnAndMint(new anchor.BN(100000000)) // 0.1 $SYNQ
    .accounts({
      synqMint,
      dataTokenMint,
      userSynqAccount,
      userDataTokenAccount,
      user: provider.wallet.publicKey,
      mintAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("0.1 $SYNQ burned and 0.1 Data Tokens minted");

  // Verify balances
  const synqBalance = await getAccount(provider.connection, userSynqAccount);
  const dataTokenBalance = await getAccount(provider.connection, userDataTokenAccount);
  
  console.log("Final $SYNQ balance:", synqBalance.amount.toString());
  console.log("Final Data Token balance:", dataTokenBalance.amount.toString());

  console.log("Demo completed successfully!");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);