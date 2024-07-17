import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import fs from 'fs';

function reshapeIdl(idl: any): any {
  function fixType(type: any): any {
    if (typeof type === 'string') {
      const typeMap: {[key: string]: string} = {
        'pubkey': 'publicKey',
        'string': 'string',
        'bool': 'bool',
        'u64': 'u64',
      };
      return typeMap[type] || type;
    }
    return type;
  }

  // Reshape accounts
  idl.accounts = idl.accounts.map((account: any) => ({
    name: account.name,
    type: {
      kind: "struct",
      fields: idl.types.find((t: any) => t.name === account.name).type.fields.map((field: any) => ({
        name: field.name,
        type: fixType(field.type)
      }))
    }
  }));

  // Fix types in instructions and maintain PDA seeds
  idl.instructions = idl.instructions.map((instruction: any) => ({
    ...instruction,
    args: instruction.args.map((arg: any) => ({
      ...arg,
      type: fixType(arg.type)
    })),
    accounts: instruction.accounts.map((account: any) => ({
      ...account,
      type: fixType(account.type),
      pda: account.pda ? {
        ...account.pda,
        seeds: account.pda.seeds.map((seed: any) => ({
          ...seed,
          type: fixType(seed.type)
        }))
      } : undefined
    }))
  }));

  // Remove types as they're now incorporated into accounts
  delete idl.types;

  return idl;
}

async function main() {
  try {
    // Set up the connection and wallet
    const connection = new Connection("http://localhost:8899", "confirmed");
    const wallet = Keypair.generate();
    
    // Load the IDL
    const idlFile = fs.readFileSync('./target/idl/multisynq_poc.json', 'utf8');
    let idl = JSON.parse(idlFile);
    console.log("IDL loaded successfully");
    
    // Reshape the IDL
    idl = reshapeIdl(idl);
    console.log("IDL reshaped successfully");
    console.log("Reshaped IDL:", JSON.stringify(idl, null, 2));

    // Get the program ID from the IDL
    const programId = new PublicKey(idl.address);
    console.log("Program ID:", programId.toBase58());

    // Create the program interface
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
    const program = new anchor.Program(idl, programId, provider);

    console.log("Airdropping SOL to wallet...");
    const airdropSignature = await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airdropSignature);
    console.log("Airdrop confirmed");

    // Create $SYNQ token mint
    console.log("Creating $SYNQ token mint...");
    const synqMint = await createMint(
      connection,
      wallet,
      wallet.publicKey,
      null,
      9 // 9 decimals
    );
    console.log("$SYNQ mint created:", synqMint.toBase58());

    // Create Data Token mint
    console.log("Creating Data Token mint...");
    const dataTokenMint = await createMint(
      connection,
      wallet,
      wallet.publicKey,
      null,
      9 // 9 decimals
    );
    console.log("Data Token mint created:", dataTokenMint.toBase58());

    // Create token accounts
    console.log("Creating token accounts...");
    const synqTokenAccount = await createAccount(connection, wallet, synqMint, wallet.publicKey);
    const dataTokenAccount = await createAccount(connection, wallet, dataTokenMint, wallet.publicKey);
    console.log("Token accounts created");

    // Mint initial $SYNQ tokens
    console.log("Minting initial $SYNQ tokens...");
    await mintTo(
      connection,
      wallet,
      synqMint,
      synqTokenAccount,
      wallet,
      1000000000 // 1 $SYNQ
    );
    console.log("Initial $SYNQ tokens minted");

    // Check initial balances
    let synqBalance = await getAccount(connection, synqTokenAccount);
    let dataTokenBalance = await getAccount(connection, dataTokenAccount);
    console.log("Initial $SYNQ balance:", synqBalance.amount.toString());
    console.log("Initial Data Token balance:", dataTokenBalance.amount.toString());



    console.log("Performing burn and mint operation...");
    try {
      const [mintAuthority] = await PublicKey.findProgramAddress(
        [Buffer.from("mint_authority")],
        program.programId
      );

      const tx = await program.methods
        .burnAndMint(new anchor.BN(100000000)) // 0.1 $SYNQ
        .accounts({
          synqMint,
          dataTokenMint,
          userSynqAccount: synqTokenAccount,
          userDataTokenAccount: dataTokenAccount,
          user: wallet.publicKey,
          mintAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([wallet])
        .rpc();

      console.log("Burn and mint transaction sent. Signature:", tx);
      await connection.confirmTransaction(tx);
      console.log("Burn and mint operation confirmed");

      // Check final balances
      synqBalance = await getAccount(connection, synqTokenAccount);
      dataTokenBalance = await getAccount(connection, dataTokenAccount);
      console.log("Final $SYNQ balance:", synqBalance.amount.toString());
      console.log("Final Data Token balance:", dataTokenBalance.amount.toString());
    } catch (error) {
      console.error("Error during burn and mint operation:", error);

    }

  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Unhandled error in main function:", err);
    process.exit(1);
  }
);