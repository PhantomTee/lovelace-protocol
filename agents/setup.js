/**
 * One-time setup: generate 4 agent wallets, fund them, register on-chain.
 * Run: node setup.js
 * Paste the output private keys into agents/.env
 */

require("dotenv").config({ path: require("path").join(__dirname, "../Lovelace/.env") });
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { ensureRegistered, ABI, EXPLORER } = require("./framework");

const BOTS = [
  require("./auditbot"),
  require("./researchbot"),
  require("./reasonbot"),
  require("./web3bot"),
];

const CONTRACT  = process.env.CONTRACT_ADDRESS || "0xCE43B018cCc600703890c84BdEd478129A189043";
const RPC       = process.env.RPC_URL          || "https://rpc.sepolia.mantle.xyz";
const FUND_EACH = ethers.parseEther("0.25"); // enough for registration stake + gas

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 5003, { staticNetwork: true });
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");

  const deployer = new ethers.Wallet(deployerKey, provider);
  const balance  = await provider.getBalance(deployer.address);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║            Lovelace Agent Setup                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} MNT`);
  console.log(`  Contract : ${CONTRACT}\n`);

  const wallets = {};
  const envLines = [
    `CONTRACT_ADDRESS=${CONTRACT}`,
    `RPC_URL=${RPC}`,
    "",
    "# Paste your API keys:",
    "GROQ_API_KEY=",
    "HEURIST_API_KEY=",
    "",
    "# Generated agent wallets (DO NOT SHARE):",
  ];

  // Check if wallets already exist in .env
  const envPath = path.join(__dirname, ".env");
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const keyNames = ["AUDITBOT_PRIVATE_KEY","RESEARCHBOT_PRIVATE_KEY","REASONBOT_PRIVATE_KEY","WEB3BOT_PRIVATE_KEY"];

  for (let i = 0; i < BOTS.length; i++) {
    const bot  = BOTS[i];
    const name = bot.CONFIG.name;
    const key  = keyNames[i];

    // Reuse existing wallet if already in .env
    const existingMatch = existingEnv.match(new RegExp(`${key}=([0-9a-fA-Fx]+)`));
    let wallet;
    if (existingMatch && existingMatch[1].length === 66) {
      wallet = new ethers.Wallet(existingMatch[1], provider);
      console.log(`  ${name.padEnd(12)}: reusing existing wallet ${wallet.address}`);
    } else {
      wallet = ethers.Wallet.createRandom().connect(provider);
      console.log(`  ${name.padEnd(12)}: generated new wallet   ${wallet.address}`);
    }
    wallets[name] = wallet;
    envLines.push(`${key}=${wallet.privateKey}`);
  }

  // Write .env
  fs.writeFileSync(envPath, envLines.join("\n") + "\n");
  console.log(`\n  ✅ Wallet keys written to agents/.env`);
  console.log(`  ⚠️  Add your GROQ_API_KEY and HEURIST_API_KEY to agents/.env before starting\n`);

  // Fund wallets that need it
  console.log("──────────────────────────────────────────────────────────");
  console.log("  Funding agent wallets");
  console.log("──────────────────────────────────────────────────────────");

  for (const [name, wallet] of Object.entries(wallets)) {
    const bal = await provider.getBalance(wallet.address);
    if (bal >= FUND_EACH) {
      console.log(`  ${name.padEnd(12)}: already funded (${ethers.formatEther(bal)} MNT) ✅`);
      continue;
    }
    const needed = FUND_EACH - bal;
    process.stdout.write(`  ${name.padEnd(12)}: funding ${ethers.formatEther(needed)} MNT... `);
    try {
      const tx = await deployer.sendTransaction({ to: wallet.address, value: needed });
      await tx.wait();
      console.log(`✅  ${EXPLORER}/tx/${tx.hash}`);
    } catch (e) {
      console.log(`❌  ${e.message.split("\n")[0]}`);
    }
  }

  // Register agents on-chain
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  Registering agents on-chain");
  console.log("──────────────────────────────────────────────────────────");

  for (let i = 0; i < BOTS.length; i++) {
    const bot    = BOTS[i];
    const wallet = wallets[bot.CONFIG.name];
    try {
      await ensureRegistered(wallet, CONTRACT, provider, bot.CONFIG);
    } catch (e) {
      console.log(`  [${bot.CONFIG.name}] ❌ ${e.message.split("\n")[0]}`);
    }
  }

  // Final summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║              Setup Complete ✅                           ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  for (const bot of BOTS) {
    const w = wallets[bot.CONFIG.name];
    const b = await provider.getBalance(w.address);
    console.log(`  ${bot.CONFIG.name.padEnd(12)}: ${w.address}  (${ethers.formatEther(b)} MNT)`);
    console.log(`               ${EXPLORER}/address/${w.address}`);
  }
  console.log(`\n  Next: add API keys to agents/.env then run: node index.js\n`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
