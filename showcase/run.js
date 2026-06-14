/**
 * Lovelace Showcase — 20 Jobs
 * Generates rich on-chain activity across all contract flows.
 * Writes activity-data.json for the activity page.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../Lovelace/.env") });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CONTRACT = "0xCE43B018cCc600703890c84BdEd478129A189043";
const EXPLORER = "https://explorer.sepolia.mantle.xyz";
const RPC      = "https://rpc.sepolia.mantle.xyz";

const ABI = [
  "function registerAgent(string name,string description,uint16 capabilities,uint256 priceWei) payable",
  "function updateAgent(string name,string description,uint16 capabilities,uint256 priceWei,bool isActive)",
  "function stakeAgent() payable",
  "function unstakeAgent(uint256 amount)",
  "function invokeAgent(address agentOwner,string description,uint256 autoReleaseDelay,address arbiter,uint16 arbiterFeeBps,bytes32 resultSpecHash) payable returns (uint256)",
  "function updateJob(uint256 jobId,string resultUri,bytes32 resultContentHash)",
  "function closeJob(uint256 jobId)",
  "function cancelJob(uint256 jobId)",
  "function rejectJob(uint256 jobId)",
  "function releasePayment(uint256 jobId)",
  "function delegateTask(uint256 parentJobId,address subAgentOwner,string description) payable returns (uint256)",
  "function raiseDispute(uint256 jobId)",
  "function resolveDisputeByArbiter(uint256 jobId,uint256 clientShare,uint256 agentShare)",
  "function rateAgent(uint256 jobId,uint8 score)",
  "function getAgent(address owner) view returns (tuple(address owner,string name,string description,uint16 capabilities,uint256 priceWei,bool isActive,uint256 ratingSum,uint32 ratingCount,uint32 jobsCompleted,uint256 createdAt,uint256 jobNonce,uint256 stakeAmount,bool exists))",
  "function getJob(uint256 jobId) view returns (tuple(address client,address agent,uint256 escrowAmount,uint8 status,string description,string resultUri,bytes32 resultSpecHash,bytes32 resultContentHash,bool resultAttested,uint256 parentJobId,uint8 activeChildren,uint256 autoReleaseAt,uint256 disputedAt,uint256 createdAt,uint256 completedAt,address tokenMint,address arbiter,uint16 arbiterFeeBps,bool exists))",
  "function jobCounter() view returns (uint256)",
];

const STATUS_LABELS = ["Pending","InProgress","Completed","Disputed","Cancelled","Finalized"];

// Human personas for each wallet (makes activity look real)
const PERSONAS = {
  alice: { name: "Aria Chen",     handle: "aria.eth",    role: "Security Researcher",   avatar: "AC", color: "#7c3aed" },
  bob:   { name: "Marcus Webb",   handle: "marcuswebb",  role: "Research Analyst",      avatar: "MW", color: "#0891b2" },
  carol: { name: "Zoe Park",      handle: "zoepark.eth", role: "DeFi Developer",        avatar: "ZP", color: "#059669" },
  dave:  { name: "Liam Torres",   handle: "liamt",       role: "Protocol Researcher",   avatar: "LT", color: "#d97706" },
  eve:   { name: "Sage Winters",  handle: "sage.arb",    role: "Neutral Arbiter",       avatar: "SW", color: "#be185d" },
  frank: { name: "Rex Ortiz",     handle: "rexortiz",    role: "General AI User",       avatar: "RO", color: "#4b5563" },
};

const activity = [];    // collected events for activity page
let stepNum = 0;

function section(title) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(62));
}

function log_activity(type, actor, details, txHash, jobId = null, amount = null) {
  activity.push({
    type,
    actor: PERSONAS[actor] || { name: actor, handle: actor, role: "", avatar: actor[0].toUpperCase(), color: "#6b7280" },
    details,
    txHash,
    txUrl: `${EXPLORER}/tx/${txHash}`,
    jobId,
    amount,
    timestamp: Date.now(),
  });
}

async function send(label, fn, actor, evtType, evtDetails, jobId = null, amount = null) {
  stepNum++;
  process.stdout.write(`  [${String(stepNum).padStart(2,"0")}] ${label}... `);
  try {
    const tx = await fn();
    const r  = await tx.wait();
    console.log(`✅`);
    console.log(`       TX : ${EXPLORER}/tx/${r.hash}`);
    if (actor) log_activity(evtType, actor, evtDetails, r.hash, jobId, amount);
    return r;
  } catch(e) {
    console.log(`❌  ${e.message?.split("\n")[0]}`);
    return null;
  }
}

async function fund(deployer, to, amt, label) {
  stepNum++;
  process.stdout.write(`  [${String(stepNum).padStart(2,"0")}] Fund ${label} (${amt} MNT)... `);
  try {
    const tx = await deployer.sendTransaction({ to, value: ethers.parseEther(amt) });
    const r  = await tx.wait();
    console.log(`✅  TX: ${EXPLORER}/tx/${r.hash}`);
  } catch(e) {
    console.log(`❌  ${e.message?.split("\n")[0]}`);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Lovelace Showcase — 20 Jobs                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Contract : ${EXPLORER}/address/${CONTRACT}`);
  console.log(`  Deployer : ${EXPLORER}/address/${deployer.address}`);
  const bal = await provider.getBalance(deployer.address);
  console.log(`  Balance  : ${ethers.formatEther(bal)} MNT\n`);

  // ── Create wallets ──────────────────────────────────────────────────────────
  section("Creating Wallets");
  const W = {
    alice: ethers.Wallet.createRandom().connect(provider),
    bob:   ethers.Wallet.createRandom().connect(provider),
    carol: ethers.Wallet.createRandom().connect(provider),
    dave:  ethers.Wallet.createRandom().connect(provider),
    eve:   ethers.Wallet.createRandom().connect(provider),
    frank: ethers.Wallet.createRandom().connect(provider),
  };

  for (const [name, w] of Object.entries(W)) {
    const persona = PERSONAS[name];
    console.log(`  ${persona.name.padEnd(14)} (${name}): ${EXPLORER}/address/${w.address}`);
  }

  // ── Fund wallets ────────────────────────────────────────────────────────────
  section("Funding Wallets");
  await fund(deployer, W.alice.address,  "2.5",  "Aria Chen  (agent1)");
  await fund(deployer, W.bob.address,    "2.0",  "Marcus Webb (agent2)");
  await fund(deployer, W.carol.address,  "8.0",  "Zoe Park   (client1)");
  await fund(deployer, W.dave.address,   "6.0",  "Liam Torres (client2)");
  await fund(deployer, W.eve.address,    "0.5",  "Sage Winters (arbiter)");
  await fund(deployer, W.frank.address,  "0.5",  "Rex Ortiz  (agent3)");

  const C = w => new ethers.Contract(CONTRACT, ABI, w);
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  const nextId = async () => Number(await contract.jobCounter());

  // ── Register Agents ─────────────────────────────────────────────────────────
  section("Agent Registration & Staking");

  await send("Register Aria — Security + Code Review (caps=6)", () =>
    C(W.alice).registerAgent(
      "AriaBot",
      "Expert smart contract security auditor and code reviewer",
      6, ethers.parseEther("0.05"), { value: ethers.parseEther("0.2") }
    ), "alice", "register", "Aria Chen registered as a security agent with 0.2 MNT stake");

  await send("Register Marcus — Research + Writing + Data (caps=168)", () =>
    C(W.bob).registerAgent(
      "MarcusAI",
      "Senior research, data analysis and technical writing agent",
      168, ethers.parseEther("0.02"), { value: ethers.parseEther("0.2") }
    ), "bob", "register", "Marcus Webb registered as a research agent with 0.2 MNT stake");

  await send("Register Rex — General (caps=1)", () =>
    C(W.frank).registerAgent(
      "RexBot",
      "General purpose automation agent",
      1, ethers.parseEther("0.01"), { value: ethers.parseEther("0.1") }
    ), "frank", "register", "Rex Ortiz registered as a general-purpose agent");

  await send("Aria adds extra stake (+0.3 MNT)", () =>
    C(W.alice).stakeAgent({ value: ethers.parseEther("0.3") }),
    "alice", "stake", "Aria Chen added 0.3 MNT to her stake, signalling confidence");

  await send("Marcus upgrades profile (raises price)", () =>
    C(W.bob).updateAgent("MarcusAI Pro","Senior research and technical writing specialist",168,ethers.parseEther("0.05"),true),
    "bob", "update_agent", "Marcus Webb upgraded profile and raised price to 0.05 MNT");

  await send("Aria withdraws 0.05 MNT stake (partial)", () =>
    C(W.alice).unstakeAgent(ethers.parseEther("0.05")),
    "alice", "unstake", "Aria Chen withdrew 0.05 MNT stake");

  await send("Rex deactivates his agent listing", () =>
    C(W.frank).updateAgent("RexBot","General purpose automation agent",1,ethers.parseEther("0.01"),false),
    "frank", "deactivate", "Rex Ortiz deactivated his agent — no longer taking jobs");

  // ── FLOW A: Happy path × 5 (Zoe hires Aria) ───────────────────────────────
  section("Flow A — Happy Path × 5 (Zoe hires Aria)");

  const happyJobs = [
    { desc: "Audit Lovelace.sol for reentrancy and access control issues", escrow: "0.12", score: 5, result: "ipfs://QmAriaAudit1ReentrancyReport" },
    { desc: "Review ERC-20 token implementation — overflow and approval bugs", escrow: "0.10", score: 4, result: "ipfs://QmAriaAudit2ERC20Review" },
    { desc: "Security review of multisig wallet contract for DAO treasury", escrow: "0.15", score: 5, result: "ipfs://QmAriaAudit3MultisigReview" },
    { desc: "Gas optimisation report for AMM liquidity pool contract", escrow: "0.08", score: 3, result: "ipfs://QmAriaAudit4GasOptReport" },
    { desc: "Verify Merkle proof logic and bounds checking in airdrop contract", escrow: "0.10", score: 5, result: "ipfs://QmAriaAudit5MerkleVerify" },
  ];

  for (let i = 0; i < happyJobs.length; i++) {
    const j = happyJobs[i];
    const label = `A${i+1}`;

    await send(`Job ${label} — Zoe creates security audit job (${j.escrow} MNT)`, () =>
      C(W.carol).invokeAgent(W.alice.address, j.desc, 0, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther(j.escrow) }),
      "carol", "create_job", `Zoe Park hired Aria Chen: "${j.desc}"`, null, j.escrow);
    const jobId = await nextId();

    await send(`Job ${label} — Aria submits audit report`, () =>
      C(W.alice).updateJob(jobId, j.result, ethers.keccak256(ethers.toUtf8Bytes(j.result))),
      "alice", "submit_result", `Aria Chen delivered audit report for job #${jobId}`, jobId);

    await send(`Job ${label} — Aria closes job`, () =>
      C(W.alice).closeJob(jobId),
      "alice", "close_job", `Aria Chen marked job #${jobId} complete`, jobId);

    await send(`Job ${label} — Zoe releases payment`, () =>
      C(W.carol).releasePayment(jobId),
      "carol", "release_payment", `Zoe Park released ${j.escrow} MNT to Aria Chen for job #${jobId}`, jobId, j.escrow);

    await send(`Job ${label} — Zoe rates Aria (${j.score}★)`, () =>
      C(W.carol).rateAgent(jobId, j.score),
      "carol", "rate", `Zoe Park rated Aria Chen ${j.score}/5 stars for job #${jobId}`, jobId);
  }

  // ── FLOW B: Liam hires Marcus × 3 ─────────────────────────────────────────
  section("Flow B — Liam hires Marcus × 3");

  const bobJobs = [
    { desc: "Research report: top 10 DeFi protocols on Mantle by TVL", escrow: "0.08", score: 4, result: "ipfs://QmMarcusResearch1DeFiReport" },
    { desc: "Write technical whitepaper introduction for Lovelace AI protocol", escrow: "0.10", score: 5, result: "ipfs://QmMarcusResearch2Whitepaper" },
    { desc: "Analyse on-chain MNT token distribution and holder trends", escrow: "0.08", score: 4, result: "ipfs://QmMarcusResearch3MNTAnalysis" },
  ];

  for (let i = 0; i < bobJobs.length; i++) {
    const j = bobJobs[i];
    const label = `B${i+1}`;

    await send(`Job ${label} — Liam creates research job (${j.escrow} MNT)`, () =>
      C(W.dave).invokeAgent(W.bob.address, j.desc, 0, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther(j.escrow) }),
      "dave", "create_job", `Liam Torres hired Marcus Webb: "${j.desc}"`, null, j.escrow);
    const jobId = await nextId();

    await send(`Job ${label} — Marcus submits research`, () =>
      C(W.bob).updateJob(jobId, j.result, ethers.keccak256(ethers.toUtf8Bytes(j.result))),
      "bob", "submit_result", `Marcus Webb delivered research report for job #${jobId}`, jobId);

    await send(`Job ${label} — Marcus closes job`, () =>
      C(W.bob).closeJob(jobId),
      "bob", "close_job", `Marcus Webb marked job #${jobId} complete`, jobId);

    await send(`Job ${label} — Liam releases payment`, () =>
      C(W.dave).releasePayment(jobId),
      "dave", "release_payment", `Liam Torres released ${j.escrow} MNT to Marcus Webb for job #${jobId}`, jobId, j.escrow);

    await send(`Job ${label} — Liam rates Marcus (${j.score}★)`, () =>
      C(W.dave).rateAgent(jobId, j.score),
      "dave", "rate", `Liam Torres rated Marcus Webb ${j.score}/5 stars for job #${jobId}`, jobId);
  }

  // ── FLOW C: Cancel × 2 ─────────────────────────────────────────────────────
  section("Flow C — Client Cancels Jobs × 2");

  for (let i = 1; i <= 2; i++) {
    const label = `C${i}`;
    const escrow = "0.05";

    await send(`Job ${label} — Zoe creates job`, () =>
      C(W.carol).invokeAgent(W.alice.address, `Preliminary scope review #${i} — cancelled before start`, 0, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther(escrow) }),
      "carol", "create_job", `Zoe Park created job (later cancelled) — preliminary scope review #${i}`, null, escrow);
    const jobId = await nextId();

    await send(`Job ${label} — Zoe cancels (full refund)`, () =>
      C(W.carol).cancelJob(jobId),
      "carol", "cancel", `Zoe Park cancelled job #${jobId} and received full refund`, jobId);
  }

  // ── FLOW D: Agent rejects × 2 ──────────────────────────────────────────────
  section("Flow D — Agent Rejects Jobs × 2");

  const rejectDescs = [
    "Analyse proprietary closed-source protocol — rejected (out of scope)",
    "Legal review of DAO governance documents — rejected (not AI-suitable)",
  ];

  for (let i = 1; i <= 2; i++) {
    const label = `D${i}`;
    const escrow = "0.05";

    await send(`Job ${label} — Liam creates job`, () =>
      C(W.dave).invokeAgent(W.bob.address, rejectDescs[i-1], 0, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther(escrow) }),
      "dave", "create_job", `Liam Torres created job: "${rejectDescs[i-1]}"`, null, escrow);
    const jobId = await nextId();

    await send(`Job ${label} — Marcus rejects (client refunded)`, () =>
      C(W.bob).rejectJob(jobId),
      "bob", "reject", `Marcus Webb rejected job #${jobId} — client refunded`, jobId);
  }

  // ── FLOW E: Dispute + arbiter × 2 ─────────────────────────────────────────
  section("Flow E — Disputes + Arbiter Resolution × 2");

  const disputes = [
    {
      label: "E1", escrow: "0.20",
      desc: "Full DeFi protocol audit — 3 contracts, disputed on scope",
      clientSplit: 40, agentSplit: 50, arbiterPct: 10,
      result: "ipfs://QmDisputeE1PartialAudit",
      context: "Client claimed incomplete audit; Sage Winters ruled partial completion"
    },
    {
      label: "E2", escrow: "0.15",
      desc: "Machine learning model benchmarking report — disputed on quality",
      clientSplit: 20, agentSplit: 70, arbiterPct: 10,
      result: "ipfs://QmDisputeE2MLBenchmark",
      context: "Client unhappy with methodology; Sage Winters ruled mostly in agent's favour"
    },
  ];

  for (const d of disputes) {
    const escrowWei = ethers.parseEther(d.escrow);
    const arbFee    = escrowWei * 1000n / 10000n;
    const rem       = escrowWei - arbFee;
    const agentShare  = rem * BigInt(d.agentSplit)  / BigInt(d.agentSplit + d.clientSplit);
    const clientShare = rem - agentShare;

    await send(`Job ${d.label} — Zoe creates job with arbiter (${d.escrow} MNT, 10% arbiter fee)`, () =>
      C(W.carol).invokeAgent(W.alice.address, d.desc, 0, W.eve.address, 1000, ethers.ZeroHash, { value: escrowWei }),
      "carol", "create_job", `Zoe Park created job with Sage Winters as arbiter: "${d.desc}"`, null, d.escrow);
    const jobId = await nextId();

    await send(`Job ${d.label} — Aria submits result`, () =>
      C(W.alice).updateJob(jobId, d.result, ethers.keccak256(ethers.toUtf8Bytes(d.result))),
      "alice", "submit_result", `Aria Chen delivered result for disputed job #${jobId}`, jobId);

    await send(`Job ${d.label} — Aria closes job`, () =>
      C(W.alice).closeJob(jobId),
      "alice", "close_job", `Aria Chen marked job #${jobId} complete`, jobId);

    await send(`Job ${d.label} — Zoe raises dispute`, () =>
      C(W.carol).raiseDispute(jobId),
      "carol", "dispute", `Zoe Park raised a dispute on job #${jobId} — ${d.context}`, jobId);

    await send(`Job ${d.label} — Sage resolves: client ${d.clientSplit}% / agent ${d.agentSplit}% / arbiter 10%`, () =>
      C(W.eve).resolveDisputeByArbiter(jobId, clientShare, agentShare),
      "eve", "resolve_dispute", `Sage Winters resolved dispute #${jobId}: ${d.agentSplit}% to Aria, ${d.clientSplit}% to Zoe, 10% arbiter fee`, jobId);
  }

  // ── FLOW F: Task Delegation ─────────────────────────────────────────────────
  section("Flow F — Task Delegation (Aria delegates to Marcus)");

  await send("Job F1 — Liam creates parent job for Aria (0.20 MNT)", () =>
    C(W.dave).invokeAgent(W.alice.address, "Comprehensive DeFi protocol analysis: security audit + market research report", 0, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther("0.20") }),
    "dave", "create_job", "Liam Torres hired Aria Chen for comprehensive DeFi protocol analysis", null, "0.20");
  const parentId = await nextId();

  await send("Job F1 — Aria delegates research sub-task to Marcus (0.05 MNT)", () =>
    C(W.alice).delegateTask(parentId, W.bob.address, "Research component: DeFi protocol market analysis and TVL breakdown", { value: ethers.parseEther("0.05") }),
    "alice", "delegate", `Aria Chen delegated research sub-task to Marcus Webb (job #${parentId})`, parentId, "0.05");
  const childId = await nextId();

  await send("Job F1 child — Marcus submits + closes sub-task", async () => {
    await (await C(W.bob).updateJob(childId, "ipfs://QmMarcusSubResearchDeFiAnalysis", ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmMarcusSubResearchDeFiAnalysis")))).wait();
    return C(W.bob).closeJob(childId);
  }, "bob", "submit_result", `Marcus Webb completed delegated research sub-task #${childId}`, childId);

  await send("Job F1 child — Aria releases payment to Marcus", () =>
    C(W.alice).releasePayment(childId),
    "alice", "release_payment", `Aria Chen released payment to Marcus Webb for sub-task #${childId}`, childId, "0.05");

  await send("Job F1 parent — Aria submits combined audit + research", () =>
    C(W.alice).updateJob(parentId, "ipfs://QmAriaFullDeFiAnalysisCombined", ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmAriaFullDeFiAnalysisCombined"))),
    "alice", "submit_result", `Aria Chen delivered combined security + research report for job #${parentId}`, parentId);

  await send("Job F1 parent — Aria closes parent job", () =>
    C(W.alice).closeJob(parentId),
    "alice", "close_job", `Aria Chen marked parent job #${parentId} complete`, parentId);

  await send("Job F1 parent — Liam releases payment to Aria", () =>
    C(W.dave).releasePayment(parentId),
    "dave", "release_payment", `Liam Torres released 0.20 MNT to Aria Chen for job #${parentId}`, parentId, "0.20");

  await send("Job F1 parent — Liam rates Aria (5★)", () =>
    C(W.dave).rateAgent(parentId, 5),
    "dave", "rate", `Liam Torres rated Aria Chen 5/5 stars for the comprehensive analysis`, parentId);

  // ── FLOW G: Auto-release setup ──────────────────────────────────────────────
  section("Flow G — Auto-Release Job (1h timeout)");

  await send("Job G1 — Zoe creates job with 1h auto-release (0.05 MNT)", () =>
    C(W.carol).invokeAgent(W.alice.address, "Quick security check on storage layout — auto-releases in 1 hour", 3600, ethers.ZeroAddress, 0, ethers.ZeroHash, { value: ethers.parseEther("0.05") }),
    "carol", "create_job", "Zoe Park created an auto-release job (1h timeout) for Aria Chen", null, "0.05");
  const autoJobId = await nextId();

  await send("Job G1 — Aria submits + closes result", async () => {
    await (await C(W.alice).updateJob(autoJobId, "ipfs://QmAriaAutoReleaseStorageCheck", ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmAriaAutoReleaseStorageCheck")))).wait();
    return C(W.alice).closeJob(autoJobId);
  }, "alice", "submit_result", `Aria Chen delivered result for auto-release job #${autoJobId} — payment releases in 1h`, autoJobId);

  console.log(`\n  ℹ️  Job G1 (#${autoJobId}) is in Completed state — auto-releases after 1h\n`);

  // ── Write activity data ─────────────────────────────────────────────────────
  section("Writing Activity Data");

  // Enrich with on-chain job data
  const jobIds = [...new Set(activity.filter(a => a.jobId).map(a => a.jobId))];
  const jobData = {};
  for (const id of jobIds) {
    try {
      const j = await contract.getJob(id);
      jobData[id] = {
        id,
        status: STATUS_LABELS[Number(j.status)],
        escrow: ethers.formatEther(j.escrowAmount),
        description: j.description,
        resultUri: j.resultUri,
        createdAt: Number(j.createdAt),
        completedAt: Number(j.completedAt),
        explorerUrl: `${EXPLORER}/address/${CONTRACT}`,
      };
    } catch {}
  }

  // Agent stats
  const agentData = {};
  for (const [key, w] of Object.entries(W)) {
    if (["alice","bob","frank"].includes(key)) {
      try {
        const a = await contract.getAgent(w.address);
        agentData[key] = {
          persona: PERSONAS[key],
          address: w.address,
          name: a.name,
          isActive: a.isActive,
          ratingAvg: a.ratingCount > 0 ? Number(a.ratingSum) / Number(a.ratingCount) : 0,
          ratingCount: Number(a.ratingCount),
          jobsCompleted: Number(a.jobsCompleted),
          stakeAmount: ethers.formatEther(a.stakeAmount),
          explorerUrl: `${EXPLORER}/address/${w.address}`,
        };
      } catch {}
    }
  }

  const finalBals = {};
  for (const [key, w] of Object.entries(W)) {
    finalBals[key] = ethers.formatEther(await provider.getBalance(w.address));
  }

  const outputData = {
    generatedAt: Date.now(),
    contract: CONTRACT,
    contractUrl: `${EXPLORER}/address/${CONTRACT}`,
    network: "Mantle Sepolia",
    chainId: 5003,
    activity,
    jobs: jobData,
    agents: agentData,
    wallets: Object.fromEntries(
      Object.entries(W).map(([k,w]) => [k, {
        persona: PERSONAS[k],
        address: w.address,
        balance: finalBals[k],
        explorerUrl: `${EXPLORER}/address/${w.address}`,
      }])
    ),
  };

  const outPath = path.join(__dirname, "activity-data.json");
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2));
  console.log(`  ✅ Written to: ${outPath}`);

  // ── Final summary ───────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                  Run Complete ✅                            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Total activity events : ${activity.length}`);
  console.log(`  Jobs tracked          : ${jobIds.length}`);
  console.log(`  Contract              : ${EXPLORER}/address/${CONTRACT}`);

  const deployerFinal = await provider.getBalance(deployer.address);
  console.log(`  Deployer remaining    : ${ethers.formatEther(deployerFinal)} MNT`);
  console.log("─".repeat(62) + "\n");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
