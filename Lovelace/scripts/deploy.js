const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const EXPLORER = "https://explorer.sepolia.mantle.xyz";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║            Lovelace Protocol — Deploy                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${hre.ethers.formatEther(balance)} MNT\n`);

  // ── 1. Deploy Lovelace ──────────────────────────────────────────────────────
  process.stdout.write("  [1/3] Deploying Lovelace... ");
  const Lovelace = await hre.ethers.getContractFactory("Lovelace");
  const lovelace = await Lovelace.deploy();
  await lovelace.waitForDeployment();
  const lovelaceAddr = await lovelace.getAddress();
  console.log(`✅  ${lovelaceAddr}`);
  console.log(`       ${EXPLORER}/address/${lovelaceAddr}`);

  // ── 2. Deploy LovelaceAgentNFT ─────────────────────────────────────────────
  process.stdout.write("  [2/3] Deploying LovelaceAgentNFT (ERC-8004)... ");
  const NFT = await hre.ethers.getContractFactory("LovelaceAgentNFT");
  const nft = await NFT.deploy(lovelaceAddr);
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log(`✅  ${nftAddr}`);
  console.log(`       ${EXPLORER}/address/${nftAddr}`);

  // ── 3. Link NFT to Lovelace ────────────────────────────────────────────────
  process.stdout.write("  [3/3] Linking NFT contract to Lovelace... ");
  const tx = await lovelace.setAgentNFT(nftAddr);
  await tx.wait();
  console.log(`✅`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  Deployment Complete ✅                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Lovelace    : ${lovelaceAddr}`);
  console.log(`  AgentNFT    : ${nftAddr}`);
  console.log(`  Network     : Mantle Sepolia (5003)`);
  console.log(`  Owner       : ${deployer.address}`);

  // Write addresses to a local file for easy reference
  const out = {
    network: "mantleSepolia",
    chainId: 5003,
    lovelace: lovelaceAddr,
    agentNFT: nftAddr,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    explorer: EXPLORER,
  };
  const outPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n  Addresses saved to: deployed-addresses.json`);

  console.log("\n  Next steps:");
  console.log(`  1. npx hardhat verify --network mantleSepolia ${lovelaceAddr}`);
  console.log(`  2. npx hardhat verify --network mantleSepolia ${nftAddr} "${lovelaceAddr}"`);
  console.log(`  3. Update CONTRACT_ADDRESS in frontend/app.js`);
  console.log(`  4. Update CONTRACT in agents/index.js and agents/setup.js`);
  console.log(`  5. Run: node ../agents/setup.js   (re-register bots)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
