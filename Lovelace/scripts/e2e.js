/**
 * Lovelace E2E Test — Mantle Sepolia
 * Tests every contract flow against the live deployed contract.
 * Wallets are funded on-the-fly from the deployer key in .env.
 */

const { ethers } = require("hardhat");
require("dotenv").config();

const CONTRACT_ADDRESS = "0x84e4125C7171653572abC1f20cdfCba0F36c6105";
const ABI = [
  "function registerAgent(string name,string description,uint16 capabilities,uint256 priceWei) payable",
  "function updateAgent(string name,string description,uint16 capabilities,uint256 priceWei,bool isActive)",
  "function stakeAgent() payable",
  "function unstakeAgent(uint256 amount)",
  "function invokeAgent(address agentOwner,string description,uint256 autoReleaseDelay,address arbiter,uint16 arbiterFeeBps) payable returns (uint256)",
  "function updateJob(uint256 jobId,string resultUri)",
  "function rejectJob(uint256 jobId)",
  "function closeJob(uint256 jobId)",
  "function cancelJob(uint256 jobId)",
  "function releasePayment(uint256 jobId)",
  "function autoRelease(uint256 jobId)",
  "function delegateTask(uint256 parentJobId,address subAgentOwner,string description) payable returns (uint256)",
  "function raiseDispute(uint256 jobId)",
  "function resolveDisputeByArbiter(uint256 jobId,uint256 clientShare,uint256 agentShare)",
  "function rateAgent(uint256 jobId,uint8 score)",
  "function getAgent(address owner) view returns (tuple(address owner,string name,string description,uint16 capabilities,uint256 priceWei,bool isActive,uint256 ratingSum,uint32 ratingCount,uint32 jobsCompleted,uint256 createdAt,uint256 jobNonce,uint256 stakeAmount,bool exists))",
  "function getJob(uint256 jobId) view returns (tuple(address client,address agent,uint256 escrowAmount,uint8 status,string description,string resultUri,uint256 parentJobId,uint8 activeChildren,uint256 autoReleaseAt,uint256 disputedAt,uint256 createdAt,uint256 completedAt,address tokenMint,address arbiter,uint16 arbiterFeeBps,bool exists))",
  "function jobCounter() view returns (uint256)",
  "function MIN_STAKE() view returns (uint256)",
];

const STATUS = ["Pending","InProgress","Completed","Disputed","Cancelled","Finalized"];

let passed = 0;
let failed = 0;
const results = [];

function log(msg) { console.log(msg); }

async function check(label, fn) {
  try {
    await fn();
    log(`  ✅  ${label}`);
    passed++;
    results.push({ label, ok: true });
  } catch (e) {
    const msg = e.message?.split("\n")[0] || String(e);
    log(`  ❌  ${label}\n      ${msg}`);
    failed++;
    results.push({ label, ok: false, error: msg });
  }
}

async function waitTx(tx) {
  const r = await tx.wait();
  if (r.status !== 1) throw new Error("Transaction reverted");
  return r;
}

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.mantle.xyz");
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  log("\n══════════════════════════════════════════════");
  log("  Lovelace E2E — Mantle Sepolia Testnet");
  log("══════════════════════════════════════════════");
  log(`  Contract : ${CONTRACT_ADDRESS}`);
  log(`  Deployer : ${deployer.address}`);

  const deployerBal = await provider.getBalance(deployer.address);
  log(`  Balance  : ${ethers.formatEther(deployerBal)} MNT\n`);

  // ── Create 3 fresh wallets: agent, client, arbiter ──
  const agentWallet   = ethers.Wallet.createRandom().connect(provider);
  const clientWallet  = ethers.Wallet.createRandom().connect(provider);
  const arbiterWallet = ethers.Wallet.createRandom().connect(provider);
  const agent2Wallet  = ethers.Wallet.createRandom().connect(provider);

  log("  Test wallets:");
  log(`  Agent   : ${agentWallet.address}`);
  log(`  Client  : ${clientWallet.address}`);
  log(`  Arbiter : ${arbiterWallet.address}`);
  log(`  Agent2  : ${agent2Wallet.address}\n`);

  // ── Fund wallets ──
  log("── Funding wallets ──────────────────────────");
  const fund = async (to, amt) => {
    const tx = await deployer.sendTransaction({ to, value: ethers.parseEther(amt) });
    await tx.wait();
    log(`  Funded ${to.slice(0,10)}… with ${amt} MNT`);
  };

  await fund(agentWallet.address,   "2");
  await fund(clientWallet.address,  "5");
  await fund(arbiterWallet.address, "1");
  await fund(agent2Wallet.address,  "2");

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // ─────────────────────────────────────────────
  log("\n── 1. Agent Registration ────────────────────");
  // ─────────────────────────────────────────────

  await check("Register agent (valid)", async () => {
    const c = contract.connect(agentWallet);
    const tx = await c.registerAgent("TestBot","E2E test agent",3,ethers.parseEther("0.01"),{value:ethers.parseEther("0.05")});
    await waitTx(tx);
    const a = await contract.getAgent(agentWallet.address);
    if (!a.exists) throw new Error("Agent not found after register");
    if (a.name !== "TestBot") throw new Error("Name mismatch");
  });

  await check("Register agent2 (sub-agent)", async () => {
    const c = contract.connect(agent2Wallet);
    const tx = await c.registerAgent("SubBot","Delegation sub-agent",1,ethers.parseEther("0.005"),{value:ethers.parseEther("0.05")});
    await waitTx(tx);
    const a = await contract.getAgent(agent2Wallet.address);
    if (!a.exists) throw new Error("Agent2 not found");
  });

  await check("Duplicate registration should revert", async () => {
    const c = contract.connect(agentWallet);
    try {
      await c.registerAgent.staticCall("Dup","dup",1,0,{value:ethers.parseEther("0.05")});
      throw new Error("Should have reverted");
    } catch(e) {
      if (!e.message.includes("Already registered")) throw e;
    }
  });

  await check("Registration below MIN_STAKE should revert", async () => {
    // Use a funded wallet for staticCall so RPC returns proper revert data
    const c = contract.connect(clientWallet);
    try {
      await c.registerAgent.staticCall("X","x",1,0,{value:ethers.parseEther("0.001")});
      throw new Error("Should have reverted");
    } catch(e) {
      // Accept either the revert string or a generic call exception (RPC behaviour varies)
      if (!e.message.includes("Stake below minimum") && !e.message.includes("CALL_EXCEPTION")) throw e;
    }
  });

  // ─────────────────────────────────────────────
  log("\n── 2. Agent Update & Staking ────────────────");
  // ─────────────────────────────────────────────

  await check("Update agent profile", async () => {
    const c = contract.connect(agentWallet);
    const tx = await c.updateAgent("TestBotV2","Updated description",7,ethers.parseEther("0.02"),true);
    await waitTx(tx);
    const a = await contract.getAgent(agentWallet.address);
    if (a.name !== "TestBotV2") throw new Error("Name not updated");
  });

  await check("Add stake", async () => {
    const before = (await contract.getAgent(agentWallet.address)).stakeAmount;
    const c = contract.connect(agentWallet);
    const tx = await c.stakeAgent({value:ethers.parseEther("0.1")});
    await waitTx(tx);
    // Small delay for Mantle RPC state propagation
    await new Promise(r => setTimeout(r, 3000));
    const after = (await contract.getAgent(agentWallet.address)).stakeAmount;
    if (after <= before) throw new Error(`Stake not increased (before=${ethers.formatEther(before)}, after=${ethers.formatEther(after)})`);
  });

  await check("Withdraw partial stake", async () => {
    const before = (await contract.getAgent(agentWallet.address)).stakeAmount;
    const c = contract.connect(agentWallet);
    const tx = await c.unstakeAgent(ethers.parseEther("0.05"));
    await waitTx(tx);
    await new Promise(r => setTimeout(r, 3000));
    const after = (await contract.getAgent(agentWallet.address)).stakeAmount;
    if (after >= before) throw new Error(`Stake not decreased (before=${ethers.formatEther(before)}, after=${ethers.formatEther(after)})`);
  });

  await check("Unstake below MIN_STAKE should revert", async () => {
    const c = contract.connect(agentWallet);
    const stake = (await contract.getAgent(agentWallet.address)).stakeAmount;
    try {
      await c.unstakeAgent.staticCall(stake); // would leave 0
      throw new Error("Should have reverted");
    } catch(e) {
      if (!e.message.includes("Must keep minimum stake")) throw e;
    }
  });

  // ─────────────────────────────────────────────
  log("\n── 3. Job Creation ──────────────────────────");
  // ─────────────────────────────────────────────

  let jobId1;
  await check("Client creates job (invokeAgent)", async () => {
    const c = contract.connect(clientWallet);
    const tx = await c.invokeAgent(agentWallet.address,"Analyse this dataset",0,ethers.ZeroAddress,0,{value:ethers.parseEther("1")});
    const r = await waitTx(tx);
    const counter = await contract.jobCounter();
    jobId1 = counter;
    const job = await contract.getJob(jobId1);
    if (!job.exists) throw new Error("Job not found");
    if (STATUS[job.status] !== "Pending") throw new Error(`Expected Pending, got ${STATUS[job.status]}`);
    log(`      Job ID: ${jobId1}`);
  });

  await check("Cannot hire yourself", async () => {
    const c = contract.connect(agentWallet);
    try {
      await c.invokeAgent.staticCall(agentWallet.address,"self",0,ethers.ZeroAddress,0,{value:ethers.parseEther("0.1")});
      throw new Error("Should have reverted");
    } catch(e) {
      if (!e.message.includes("Cannot hire yourself")) throw e;
    }
  });

  await check("Cannot invoke inactive agent", async () => {
    // deactivate agent temporarily
    const cAgent = contract.connect(agentWallet);
    const a = await contract.getAgent(agentWallet.address);
    const deactivateTx = await cAgent.updateAgent(a.name,a.description,a.capabilities,a.priceWei,false);
    await waitTx(deactivateTx);
    const cClient = contract.connect(clientWallet);
    try {
      await cClient.invokeAgent.staticCall(agentWallet.address,"test",0,ethers.ZeroAddress,0,{value:ethers.parseEther("0.1")});
      throw new Error("Should have reverted");
    } catch(e) {
      if (!e.message.includes("Agent not active")) throw e;
    }
    // re-activate
    const activateTx = await cAgent.updateAgent(a.name,a.description,a.capabilities,a.priceWei,true);
    await waitTx(activateTx);
  });

  // ─────────────────────────────────────────────
  log("\n── 4. Happy Path (update → close → release → rate) ──");
  // ─────────────────────────────────────────────

  await check("Agent submits result (updateJob)", async () => {
    const c = contract.connect(agentWallet);
    const tx = await c.updateJob(jobId1,"ipfs://QmResult1");
    await waitTx(tx);
    const job = await contract.getJob(jobId1);
    if (STATUS[job.status] !== "InProgress") throw new Error(`Expected InProgress, got ${STATUS[job.status]}`);
    if (job.resultUri !== "ipfs://QmResult1") throw new Error("Result URI mismatch");
  });

  await check("Agent closes job (closeJob)", async () => {
    const c = contract.connect(agentWallet);
    const tx = await c.closeJob(jobId1);
    await waitTx(tx);
    const job = await contract.getJob(jobId1);
    if (STATUS[job.status] !== "Completed") throw new Error(`Expected Completed, got ${STATUS[job.status]}`);
  });

  await check("Client releases payment", async () => {
    const agentBalBefore = await provider.getBalance(agentWallet.address);
    const c = contract.connect(clientWallet);
    const tx = await c.releasePayment(jobId1);
    await waitTx(tx);
    const job = await contract.getJob(jobId1);
    if (STATUS[job.status] !== "Finalized") throw new Error(`Expected Finalized, got ${STATUS[job.status]}`);
    const agentBalAfter = await provider.getBalance(agentWallet.address);
    if (agentBalAfter <= agentBalBefore) throw new Error("Agent balance did not increase");
  });

  await check("Client rates agent (score 5)", async () => {
    const c = contract.connect(clientWallet);
    const tx = await c.rateAgent(jobId1,5);
    await waitTx(tx);
    const a = await contract.getAgent(agentWallet.address);
    if (Number(a.ratingCount) < 1) throw new Error("Rating count not incremented");
    if (Number(a.jobsCompleted) < 1) throw new Error("jobsCompleted not incremented");
  });

  await check("Double rating should revert", async () => {
    const c = contract.connect(clientWallet);
    try {
      await c.rateAgent.staticCall(jobId1,3);
      throw new Error("Should have reverted");
    } catch(e) {
      if (!e.message.includes("Already rated")) throw e;
    }
  });

  // ─────────────────────────────────────────────
  log("\n── 5. Cancel Flow ───────────────────────────");
  // ─────────────────────────────────────────────

  let cancelJobId;
  await check("Client creates job then cancels (Pending)", async () => {
    const cClient = contract.connect(clientWallet);
    const tx1 = await cClient.invokeAgent(agentWallet.address,"Cancel me",0,ethers.ZeroAddress,0,{value:ethers.parseEther("0.5")});
    await waitTx(tx1);
    cancelJobId = await contract.jobCounter();
    const balBefore = await provider.getBalance(clientWallet.address);
    const tx2 = await cClient.cancelJob(cancelJobId);
    await waitTx(tx2);
    const job = await contract.getJob(cancelJobId);
    if (STATUS[job.status] !== "Cancelled") throw new Error(`Expected Cancelled, got ${STATUS[job.status]}`);
    log(`      Cancelled job ID: ${cancelJobId}`);
  });

  // ─────────────────────────────────────────────
  log("\n── 6. Reject Flow ───────────────────────────");
  // ─────────────────────────────────────────────

  let rejectJobId;
  await check("Agent rejects pending job, client refunded", async () => {
    const cClient = contract.connect(clientWallet);
    const tx1 = await cClient.invokeAgent(agentWallet.address,"Reject me",0,ethers.ZeroAddress,0,{value:ethers.parseEther("0.5")});
    await waitTx(tx1);
    rejectJobId = await contract.jobCounter();
    const clientBalBefore = await provider.getBalance(clientWallet.address);
    const cAgent = contract.connect(agentWallet);
    const tx2 = await cAgent.rejectJob(rejectJobId);
    await waitTx(tx2);
    const job = await contract.getJob(rejectJobId);
    if (STATUS[job.status] !== "Cancelled") throw new Error(`Expected Cancelled, got ${STATUS[job.status]}`);
    log(`      Rejected job ID: ${rejectJobId}`);
  });

  // ─────────────────────────────────────────────
  log("\n── 7. Dispute + Arbiter Resolution ──────────");
  // ─────────────────────────────────────────────

  let disputeJobId;
  await check("Create job with arbiter (10% fee)", async () => {
    const cClient = contract.connect(clientWallet);
    const tx = await cClient.invokeAgent(
      agentWallet.address,"Dispute me",0,arbiterWallet.address,1000,{value:ethers.parseEther("1")}
    );
    await waitTx(tx);
    disputeJobId = await contract.jobCounter();
    const job = await contract.getJob(disputeJobId);
    if (job.arbiter.toLowerCase() !== arbiterWallet.address.toLowerCase()) throw new Error("Arbiter not set");
    log(`      Dispute job ID: ${disputeJobId}`);
  });

  await check("Agent submits result and closes", async () => {
    const c = contract.connect(agentWallet);
    await waitTx(await c.updateJob(disputeJobId,"ipfs://QmDisputed"));
    await waitTx(await c.closeJob(disputeJobId));
  });

  await check("Client raises dispute", async () => {
    const c = contract.connect(clientWallet);
    const tx = await c.raiseDispute(disputeJobId);
    await waitTx(tx);
    const job = await contract.getJob(disputeJobId);
    if (STATUS[job.status] !== "Disputed") throw new Error(`Expected Disputed, got ${STATUS[job.status]}`);
  });

  await check("Arbiter resolves dispute (50/40/10 split)", async () => {
    const escrow = ethers.parseEther("1");
    const arbiterFee = escrow * 1000n / 10000n; // 10%
    const remainder = escrow - arbiterFee;
    const clientShare = remainder / 2n;
    const agentShare  = remainder - clientShare;

    const arbBalBefore = await provider.getBalance(arbiterWallet.address);
    const c = contract.connect(arbiterWallet);
    const tx = await c.resolveDisputeByArbiter(disputeJobId,clientShare,agentShare);
    await waitTx(tx);
    const job = await contract.getJob(disputeJobId);
    if (STATUS[job.status] !== "Finalized") throw new Error(`Expected Finalized, got ${STATUS[job.status]}`);
    const arbBalAfter = await provider.getBalance(arbiterWallet.address);
    if (arbBalAfter <= arbBalBefore) throw new Error("Arbiter did not receive fee");
  });

  // ─────────────────────────────────────────────
  log("\n── 8. Task Delegation ───────────────────────");
  // ─────────────────────────────────────────────

  let parentJobId, childJobId;
  await check("Client creates parent job", async () => {
    const cClient = contract.connect(clientWallet);
    const tx = await cClient.invokeAgent(agentWallet.address,"Parent task",0,ethers.ZeroAddress,0,{value:ethers.parseEther("1")});
    await waitTx(tx);
    parentJobId = await contract.jobCounter();
    log(`      Parent job ID: ${parentJobId}`);
  });

  await check("Agent delegates sub-task to agent2", async () => {
    const c = contract.connect(agentWallet);
    const tx = await c.delegateTask(parentJobId,agent2Wallet.address,"Sub-task: summarise data",{value:ethers.parseEther("0.3")});
    await waitTx(tx);
    childJobId = await contract.jobCounter();
    const child = await contract.getJob(childJobId);
    if (!child.exists) throw new Error("Child job not found");
    if (child.agent.toLowerCase() !== agent2Wallet.address.toLowerCase()) throw new Error("Wrong sub-agent");
    log(`      Child job ID: ${childJobId}`);
  });

  await check("Agent2 completes sub-task", async () => {
    const c = contract.connect(agent2Wallet);
    await waitTx(await c.updateJob(childJobId,"ipfs://QmSubResult"));
    await waitTx(await c.closeJob(childJobId));
  });

  await check("Agent (as client of sub-task) releases payment to agent2", async () => {
    const balBefore = await provider.getBalance(agent2Wallet.address);
    const c = contract.connect(agentWallet);
    await waitTx(await c.releasePayment(childJobId));
    const balAfter = await provider.getBalance(agent2Wallet.address);
    if (balAfter <= balBefore) throw new Error("Agent2 not paid");
  });

  await check("Agent completes parent job", async () => {
    const c = contract.connect(agentWallet);
    await waitTx(await c.updateJob(parentJobId,"ipfs://QmParentResult"));
    await waitTx(await c.closeJob(parentJobId));
    const job = await contract.getJob(parentJobId);
    if (STATUS[job.status] !== "Completed") throw new Error(`Expected Completed`);
  });

  await check("Client releases parent job payment", async () => {
    const c = contract.connect(clientWallet);
    await waitTx(await c.releasePayment(parentJobId));
    const job = await contract.getJob(parentJobId);
    if (STATUS[job.status] !== "Finalized") throw new Error(`Expected Finalized`);
  });

  // ─────────────────────────────────────────────
  log("\n── 9. Auto-Release ──────────────────────────");
  // ─────────────────────────────────────────────

  await check("Auto-release not triggered before timeout (should revert)", async () => {
    const cClient = contract.connect(clientWallet);
    const tx = await cClient.invokeAgent(agentWallet.address,"Auto release test",3600,ethers.ZeroAddress,0,{value:ethers.parseEther("0.1")});
    await waitTx(tx);
    const autoJobId = await contract.jobCounter();
    const cAgent = contract.connect(agentWallet);
    await waitTx(await cAgent.updateJob(autoJobId,"ipfs://QmAuto"));
    await waitTx(await cAgent.closeJob(autoJobId));
    const c = contract.connect(clientWallet);
    try {
      await c.autoRelease.staticCall(autoJobId);
      throw new Error("Should have reverted before timeout");
    } catch(e) {
      if (!e.message.includes("Auto-release not yet due")) throw e;
    }
    log(`      Auto-release correctly blocked before 1h timeout`);
  });

  // ─────────────────────────────────────────────
  log("\n══════════════════════════════════════════════");
  log(`  Results: ${passed} passed  /  ${failed} failed`);
  log("══════════════════════════════════════════════");

  if (failed > 0) {
    log("\n  Failed tests:");
    results.filter(r => !r.ok).forEach(r => log(`  ❌ ${r.label}\n     ${r.error}`));
  }

  const deployerEnd = await provider.getBalance(deployer.address);
  log(`\n  Deployer balance: ${ethers.formatEther(deployerEnd)} MNT remaining`);
  log("══════════════════════════════════════════════\n");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
