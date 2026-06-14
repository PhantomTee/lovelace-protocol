/**
 * Lovelace Agent Runner
 * Starts all 4 agents listening for jobs on the contract.
 *
 * Prerequisites:
 *   1. Run `node setup.js` first (generates wallets, funds, registers)
 *   2. Add HEURIST_API_KEY to agents/.env
 *   3. Run: node index.js
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });
// Also load deployer .env as fallback for RPC_URL
require("dotenv").config({ path: require("path").join(__dirname, "../Lovelace/.env") });

const { ethers }  = require("ethers");
const { startListener, ensureRegistered, EXPLORER } = require("./framework");

const BOTS = [
  { mod: require("./auditbot"),     keyEnv: "AUDITBOT_PRIVATE_KEY"    },
  { mod: require("./researchbot"),  keyEnv: "RESEARCHBOT_PRIVATE_KEY" },
  { mod: require("./reasonbot"),    keyEnv: "REASONBOT_PRIVATE_KEY"   },
  { mod: require("./web3bot"),      keyEnv: "WEB3BOT_PRIVATE_KEY"     },
];

const CONTRACT = process.env.CONTRACT_ADDRESS || "0xb9B3727B5CE642C8D364A45529D6dd682D6D2687";
const RPC      = process.env.RPC_URL          || "https://rpc.sepolia.mantle.xyz";

// Validate required env vars
const REQUIRED = ["HEURIST_API_KEY","AUDITBOT_PRIVATE_KEY","RESEARCHBOT_PRIVATE_KEY","REASONBOT_PRIVATE_KEY","WEB3BOT_PRIVATE_KEY"];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\nâŒ  Missing env vars: ${missing.join(", ")}`);
  console.error("    Run node setup.js first and add API keys to agents/.env\n");
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 5003, { staticNetwork: true });

  console.log("\nâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—");
  console.log("â•‘          Lovelace Agent Network â€” LIVE                  â•‘");
  console.log("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log(`  Contract : ${EXPLORER}/address/${CONTRACT}`);
  console.log(`  Network  : Mantle Sepolia (chain 5003)`);
  console.log(`  Agents   : ${BOTS.length} active\n`);

  for (const { mod, keyEnv } of BOTS) {
    const privateKey = process.env[keyEnv];
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);

    console.log(`  ðŸ¤– ${mod.CONFIG.name.padEnd(14)} ${wallet.address}  ${ethers.formatEther(balance)} MNT`);

    startListener(wallet, CONTRACT, provider, mod.CONFIG, mod.executeTask);
  }

  console.log("\n  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€");
  console.log("  Listening for JobCreated events... (Ctrl+C to stop)");
  console.log("  Results saved to: agents/results/job-{id}.json");
  console.log("  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n");

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n  Shutting down agents...\n");
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exitCode = 1; });
