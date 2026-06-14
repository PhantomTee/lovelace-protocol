/**
 * E2E test — hire all 4 live agents, wait for real AI responses, verify on-chain.
 *
 * Run while agents/index.js is running in another terminal:
 *   node e2e.js
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const { ethers } = require("ethers");

const RPC      = process.env.RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDRESS;
const EXPLORER = "https://explorer.sepolia.mantle.xyz";

const CLIENT_ABI = [
  "function invokeAgent(address agentOwner,string description,uint256 autoReleaseDelay,address arbiter,uint16 arbiterFeeBps,bytes32 resultSpecHash) payable returns (uint256)",
  "function releasePayment(uint256 jobId)",
  "function rateAgent(uint256 jobId,uint8 score)",
  "function getJob(uint256 jobId) view returns (tuple(address client,address agent,uint256 escrowAmount,uint8 status,string description,string resultUri,bytes32 resultSpecHash,bytes32 resultContentHash,bool resultAttested,uint256 parentJobId,uint8 activeChildren,uint256 autoReleaseAt,uint256 disputedAt,uint256 createdAt,uint256 completedAt,address tokenMint,address arbiter,uint16 arbiterFeeBps,bool exists))",
  "function jobCounter() view returns (uint256)",
];

const STATUS = ["Pending","InProgress","Completed","Disputed","Cancelled","Finalized"];

// Agent addresses from .env
const AGENTS = [
  {
    name: "AuditBot",
    address: "0x33fE6d1ca0F9886dc566582e86FDdd8E8061f92C",
    task: "Review this Solidity function for reentrancy vulnerabilities:\n\nfunction withdraw(uint amount) external {\n  require(balances[msg.sender] >= amount);\n  (bool ok,) = msg.sender.call{value: amount}(\"\");\n  require(ok);\n  balances[msg.sender] -= amount;\n}",
    escrow: "0.05",
  },
  {
    name: "ResearchBot",
    address: "0xeBB786cB625C598A6167007C47128Ae250d3b7fF",
    task: "Write a concise research summary (3 paragraphs) on the current state of AI agent payment protocols in Web3, covering escrow mechanisms, on-chain verification, and the main projects building in this space.",
    escrow: "0.05",
  },
  {
    name: "ReasonBot",
    address: "0x63478351eF7902D9089D03e02fCb1C077FB604fC",
    task: "Flash loan attack on x*y=k AMM: pool has 10k MNT + 10k USDC. Attacker dumps 1k MNT. Calculate: (1) new USDC price of MNT post-dump, (2) profit extractable via 2% slippage arbitrage. Show steps.",
    escrow: "0.05",
  },
  {
    name: "Web3Bot",
    address: "0x11F9079E5E0552bD873E4971baE2Ab90D29D0e0b",
    task: "Provide an analysis of the Mantle Network ecosystem: its architecture, key DeFi protocols, token utility, and how it differs from other L2s. Focus on what makes it suitable for AI agent payment infrastructure.",
    escrow: "0.05",
  },
];

const WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per agent
const POLL_MS         = 8000;

function tick() { process.stdout.write("."); }

async function waitForCompletion(contract, jobId) {
  const start = Date.now();
  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    const job = await contract.getJob(jobId);
    const status = Number(job.status);
    if (status === 2) return job; // Completed
    if (status >= 4) throw new Error(`Unexpected status: ${STATUS[status]}`);
    tick();
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(`Timeout after ${WAIT_TIMEOUT_MS / 1000}s`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 5003, { staticNetwork: true });
  // Use deployer as client (it has funds)
  const deployer = new ethers.Wallet(process.env.AUDITBOT_PRIVATE_KEY || "", provider);

  // Use a fresh funded client wallet — derive from deployer env
  // Actually use the deployer key from Lovelace .env
  const { ethers: _e } = require("ethers");
  const deployerKey = require("fs")
    .readFileSync(require("path").join(__dirname, "../Lovelace/.env"), "utf8")
    .match(/PRIVATE_KEY=(.+)/)?.[1]?.trim();

  if (!deployerKey) throw new Error("Could not read PRIVATE_KEY from Lovelace/.env");
  const client = new ethers.Wallet(deployerKey, provider);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Lovelace Agent E2E Test                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Client   : ${EXPLORER}/address/${client.address}`);
  console.log(`  Contract : ${EXPLORER}/address/${CONTRACT}`);
  const bal = await provider.getBalance(client.address);
  console.log(`  Balance  : ${ethers.formatEther(bal)} MNT\n`);

  const contract = new ethers.Contract(CONTRACT, CLIENT_ABI, client);

  const results = [];

  for (const agent of AGENTS) {
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`  🧪 Testing ${agent.name} (${agent.address.slice(0,10)}…)`);
    console.log(`  Task    : ${agent.task.slice(0, 80)}…`);
    console.log(`  Escrow  : ${agent.escrow} MNT`);

    // Compute resultSpecHash from the task description
    const resultSpecHash = ethers.keccak256(ethers.toUtf8Bytes(agent.task));

    let jobId;
    try {
      console.log(`\n  [1/4] Creating job on-chain...`);
      const tx = await contract.invokeAgent(
        agent.address,
        agent.task,
        0,
        ethers.ZeroAddress,
        0,
        resultSpecHash,
        { value: ethers.parseEther(agent.escrow) }
      );
      const receipt = await tx.wait();
      jobId = Number(await contract.jobCounter());
      console.log(`  ✅ Job #${jobId} created`);
      console.log(`     TX: ${EXPLORER}/tx/${receipt.hash}`);
    } catch (e) {
      console.log(`  ❌ Failed to create job: ${e.message?.split("\n")[0]}`);
      results.push({ agent: agent.name, status: "FAILED_CREATE" });
      continue;
    }

    console.log(`\n  [2/4] Waiting for ${agent.name} to respond`);
    process.stdout.write("  ");

    let completedJob;
    try {
      completedJob = await waitForCompletion(contract, jobId);
      console.log(`\n  ✅ ${agent.name} completed job #${jobId}`);
      console.log(`     Status       : ${STATUS[Number(completedJob.status)]}`);
      console.log(`     Result URI   : ${completedJob.resultUri}`);
      console.log(`     Content hash : ${completedJob.resultContentHash}`);
    } catch (e) {
      console.log(`\n  ❌ ${agent.name} did not respond: ${e.message}`);
      results.push({ agent: agent.name, jobId, status: "TIMEOUT" });
      continue;
    }

    console.log(`\n  [3/4] Releasing payment to ${agent.name}...`);
    try {
      const tx = await contract.releasePayment(jobId);
      const receipt = await tx.wait();
      console.log(`  ✅ Payment released`);
      console.log(`     TX: ${EXPLORER}/tx/${receipt.hash}`);
    } catch (e) {
      console.log(`  ❌ Release failed: ${e.message?.split("\n")[0]}`);
      results.push({ agent: agent.name, jobId, status: "FAILED_RELEASE" });
      continue;
    }

    console.log(`\n  [4/4] Rating ${agent.name}...`);
    try {
      const tx = await contract.rateAgent(jobId, 5);
      await tx.wait();
      console.log(`  ✅ Rated 5★`);
    } catch (e) {
      console.log(`  ⚠️  Rating failed (non-fatal): ${e.message?.split("\n")[0]}`);
    }

    results.push({
      agent: agent.name,
      jobId,
      status: "PASS ✅",
      resultUri: completedJob.resultUri,
      contentHash: completedJob.resultContentHash,
      explorerJob: `${EXPLORER}/address/${CONTRACT}`,
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                   E2E Results                               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  for (const r of results) {
    console.log(`\n  ${r.agent.padEnd(14)} : ${r.status}`);
    if (r.jobId) console.log(`  Job ID         : #${r.jobId}`);
    if (r.resultUri) console.log(`  Result URI     : ${r.resultUri}`);
    if (r.contentHash) console.log(`  Content hash   : ${r.contentHash}`);
  }

  const passed = results.filter(r => r.status.startsWith("PASS")).length;
  console.log(`\n  ${passed}/${AGENTS.length} agents passed end-to-end\n`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
