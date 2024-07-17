import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import fs from 'fs';
import * as borsh from 'borsh';

interface IDL {
  address: string;
  instructions: {
    name: string;
    discriminator: number[];
    args: { name: string; type: string }[];
  }[];
}

class Synchronizer {
  owner: Uint8Array;
  location: Uint8Array;
  is_active: number;
  extra_space: Uint8Array;

  constructor(fields: {owner: Uint8Array, location: Uint8Array, is_active: number, extra_space: Uint8Array}) {
    this.owner = fields.owner;
    this.location = fields.location;
    this.is_active = fields.is_active;
    this.extra_space = fields.extra_space;
  }

  static schema = new Map([
    [Synchronizer, {
      kind: 'struct',
      fields: [
        ['owner', [32]],
        ['location', [32]],
        ['is_active', 'u8'],
        ['extra_space', [1000]],  // Adjust this size based on your Rust program
      ]
    }]
  ]);
}

async function main() {
  try {
    // Set up the connection
    const connection = new Connection("http://localhost:8899", "confirmed");
    
    // Load the IDL
    const idlFile = fs.readFileSync('./target/idl/multisynq_poc.json', 'utf8');
    const idl: IDL = JSON.parse(idlFile);
    console.log("IDL loaded successfully");

    // Get the program ID from the IDL
    const programId = new PublicKey(idl.address);
    console.log("Program ID:", programId.toBase58());

    // Create a new wallet
    const wallet = Keypair.generate();
    console.log("Wallet public key:", wallet.publicKey.toBase58());

    // Airdrop SOL to the wallet
    const airdropSignature = await connection.requestAirdrop(wallet.publicKey, 2 * 1000000000); // 2 SOL
    await connection.confirmTransaction(airdropSignature);
    console.log("Airdropped 2 SOL to wallet");

    // Generate a new keypair for our synchronizer
    const synchronizer = Keypair.generate();
    console.log("Synchronizer public key:", synchronizer.publicKey.toBase58());

    // Prepare the accounts
    const accounts = [
      { pubkey: synchronizer.publicKey, isSigner: true, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    // Prepare the instruction data
    const initializeSynchronizerIx = idl.instructions.find(ix => ix.name === 'initialize_synchronizer');
    if (!initializeSynchronizerIx) {
      throw new Error('initialize_synchronizer instruction not found in IDL');
    }

    // Create a fixed-size array for the location
    const locationBuffer = Buffer.alloc(32); // Allocate 32 bytes
    Buffer.from("New York").copy(locationBuffer); // Copy "New York" into the buffer

    const data = Buffer.concat([
      Buffer.from(initializeSynchronizerIx.discriminator),
      locationBuffer
    ]);

    // Create the instruction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId,
      data,
    });

    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    
    console.log("Sending transaction...");
    const signature = await connection.sendTransaction(transaction, [wallet, synchronizer], {
      skipPreflight: true, // Skip preflight to get more detailed error information
    });

    console.log("Transaction sent. Signature:", signature);
    const result = await connection.confirmTransaction(signature, 'confirmed');
    
    if (result.value.err) {
      console.error("Transaction failed:", result.value.err);
      const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
      console.log("Transaction info:", JSON.stringify(txInfo, null, 2));
    } else {
      console.log("Transaction confirmed successfully");

    

      const accountInfo = await connection.getAccountInfo(synchronizer.publicKey);
      if (accountInfo !== null && accountInfo.data.length > 0) {
        console.log("Raw account data:", accountInfo.data.toString('hex'));
        try {
          const decodedData = borsh.deserialize(
            Synchronizer.schema,
            Synchronizer,
            accountInfo.data.slice(8) // Skip the 8-byte discriminator
          );
          console.log("Synchronizer account data:");
          console.log("Owner:", new PublicKey(decodedData.owner).toBase58());
          console.log("Location:", Buffer.from(decodedData.location).toString().replace(/\0+$/, '')); // Remove null padding
          console.log("Is Active:", decodedData.is_active === 1);  // 1 is true, 0 is false
          console.log("Extra space size:", decodedData.extra_space.length);
        } catch (error) {
          console.error("Error decoding account data:", error);
          
          // Attempt to decode the data manually
          if (accountInfo.data.length >= 73) {  // 8 (discriminator) + 32 (owner) + 32 (location) + 1 (is_active)
            const owner = new PublicKey(accountInfo.data.slice(8, 40));
            const location = accountInfo.data.slice(40, 72).toString().replace(/\0+$/, '');
            const isActive = accountInfo.data[72] === 1;
            console.log("Manually decoded data:");
            console.log("Owner:", owner.toBase58());
            console.log("Location:", location);
            console.log("Is Active:", isActive);
          }
        }
      } else {
        console.log("No account data found for the synchronizer");
      }



    }

  } catch (error) {
    console.error("An error occurred during script execution:");
    console.error(error);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Unhandled error in main function:", err);
    process.exit(1);
  }
);