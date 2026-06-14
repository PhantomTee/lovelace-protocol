/**
 * Shared framework for all Lovelace agents.
 * Handles: contract connection, job event listening, result submission.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function dbWrite(jobId, agentName, agentAddr, clientAddr, description, resultText, txHash, escrowMnt) {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.query(
      `INSERT INTO jobs (job_id, agent_name, agent_addr, client_addr, description, result, tx_hash, tx_url, escrow_mnt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (job_id) DO UPDATE SET result=$6, tx_hash=$7, tx_url=$8, completed_at=NOW()`,
      [Number(jobId), agentName, agentAddr, clientAddr, description, resultText, txHash,
       `${EXPLORER}/tx/${txHash}`, escrowMnt]
    );
    await db.query(
      `INSERT INTO events (event_type, job_id, actor, detail, tx_hash)
       VALUES ('complete_job', $1, $2, $3, $4)`,
      [Number(jobId), agentName, `Job #${jobId} completed by ${agentName}`, txHash]
    );
  } catch (e) {
    console.log(`  [DB] Write failed: ${e.message}`);
  }
}

async function dbWriteAgent(agentAddr, config) {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.query(
      `INSERT INTO agents (address, name, description, capabilities, price_wei, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (address) DO UPDATE SET name=$2, description=$3, capabilities=$4, price_wei=$5, is_active=true, updated_at=NOW()`,
      [agentAddr, config.onchainName, config.onchainDesc, config.capabilities, config.price]
    );
  } catch (e) {
    console.log(`  [DB] Agent write failed: ${e.message}`);
  }
}

const ABI = [
  "function registerAgent(string name,string description,uint16 capabilities,uint256 priceWei) payable",
  "function updateAgent(string name,string description,uint16 capabilities,uint256 priceWei,bool isActive)",
  "function updateJob(uint256 jobId,string resultUri,bytes32 resultContentHash)",
  "function closeJob(uint256 jobId)",
  "function rejectJob(uint256 jobId)",
  "function getAgent(address owner) view returns (tuple(address owner,string name,string description,uint16 capabilities,uint256 priceWei,bool isActive,uint256 ratingSum,uint32 ratingCount,uint32 jobsCompleted,uint256 createdAt,uint256 jobNonce,uint256 stakeAmount,bool exists))",
  "function getJob(uint256 jobId) view returns (tuple(address client,address agent,uint256 escrowAmount,uint8 status,string description,string resultUri,bytes32 resultSpecHash,bytes32 resultContentHash,bool resultAttested,uint256 parentJobId,uint8 activeChildren,uint256 autoReleaseAt,uint256 disputedAt,uint256 createdAt,uint256 completedAt,address tokenMint,address arbiter,uint16 arbiterFeeBps,bool exists))",
  "function jobCounter() view returns (uint256)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed agent, uint256 escrow)",
];

const RESULTS_DIR = path.join(__dirname, "results");
const MIN_STAKE   = ethers.parseEther("0.02");
const EXPLORER    = "https://explorer.sepolia.mantle.xyz";

function saveResult(jobId, agentName, description, resultText, txHash) {
  const data = {
    jobId: Number(jobId),
    agent: agentName,
    description,
    result: resultText,
    txHash,
    txUrl: `${EXPLORER}/tx/${txHash}`,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(RESULTS_DIR, `job-${jobId}.json`),
    JSON.stringify(data, null, 2)
  );
  return data;
}

const FALLBACK_RPCS = [
  "https://rpc.sepolia.mantle.xyz",
  "https://mantle-sepolia.drpc.org",
  "https://mantle-sepolia-testnet.rpc.thirdweb.com",
];

function makeProvider(rpc) {
  const urls = [rpc, ...FALLBACK_RPCS.filter(u => u !== rpc)];
  return new ethers.FallbackProvider(
    urls.map((url, i) => ({
      provider: new ethers.JsonRpcProvider(url, 5003, { staticNetwork: true }),
      priority: i + 1,
      weight: 1,
      stallTimeout: 4000,
    })),
    5003,
    { quorum: 1 }
  );
}

async function ensureRegistered(wallet, contractAddress, provider, config) {
  const contract = new ethers.Contract(contractAddress, ABI, provider);
  const agent = await contract.getAgent(wallet.address);

  if (agent.exists) {
    console.log(`  [${config.name}] Already registered on-chain ✅`);
    await dbWriteAgent(wallet.address, config);
    return;
  }

  console.log(`  [${config.name}] Registering on-chain...`);
  const connected = new ethers.Contract(contractAddress, ABI, wallet);
  const tx = await connected.registerAgent(
    config.onchainName,
    config.onchainDesc,
    config.capabilities,
    ethers.parseEther(config.price),
    { value: MIN_STAKE }
  );
  await tx.wait();
  console.log(`  [${config.name}] Registered ✅  ${EXPLORER}/tx/${tx.hash}`);
  await dbWriteAgent(wallet.address, config);
}

async function submitResult(jobId, resultText, wallet, contractAddress) {
  const contract = new ethers.Contract(contractAddress, ABI, wallet);
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(resultText));
  const resultUri   = `lovelace://results/job-${jobId}`;

  const tx1 = await contract.updateJob(jobId, resultUri, contentHash);
  await tx1.wait();

  const tx2 = await contract.closeJob(jobId);
  await tx2.wait();

  return { contentHash, resultUri, updateTx: tx1.hash, closeTx: tx2.hash };
}

async function handleJob(jobId, client, agent, escrow, txHash, wallet, contractAddress, provider, config, executeTask) {
  if (agent.toLowerCase() !== wallet.address.toLowerCase()) return;

  const id = Number(jobId);
  console.log(`\n  ─────────────────────────────────────────`);
  console.log(`  [${config.name}] 📥 Job #${id} received`);
  console.log(`  Client  : ${client}`);
  console.log(`  Escrow  : ${ethers.formatEther(escrow)} MNT`);
  console.log(`  TX      : ${EXPLORER}/tx/${txHash}`);

  let job;
  try {
    const c = new ethers.Contract(contractAddress, ABI, provider);
    job = await c.getJob(id);
    // Skip if already handled (Completed=2, Finalized=5, Cancelled=4)
    const status = Number(job.status);
    if (status !== 0 && status !== 1) {
      console.log(`  [${config.name}] ⏭  Job #${id} already in state ${status} — skipping`);
      return;
    }
    console.log(`  Task    : ${job.description}`);
  } catch {
    console.log(`  [${config.name}] ⚠️  Could not read job details`);
    return;
  }

  console.log(`  [${config.name}] 🧠 Working on task...`);

  let resultText;
  try {
    resultText = await executeTask(job.description);
  } catch (e) {
    console.log(`  [${config.name}] ❌ Task execution failed: ${e.message}`);
    return;
  }

  console.log(`  [${config.name}] ✍️  Submitting result on-chain...`);

  try {
    const { updateTx, closeTx } = await submitResult(id, resultText, wallet, contractAddress);
    const escrowMnt = ethers.formatEther(job.escrowAmount);
    saveResult(id, config.name, job.description, resultText, updateTx);
    await dbWrite(id, config.name, wallet.address, job.client, job.description, resultText, updateTx, escrowMnt);
    console.log(`  [${config.name}] ✅ Job #${id} complete`);
    console.log(`  updateJob TX : ${EXPLORER}/tx/${updateTx}`);
    console.log(`  closeJob  TX : ${EXPLORER}/tx/${closeTx}`);
    console.log(`  Result saved : results/job-${id}.json`);
  } catch (e) {
    console.log(`  [${config.name}] ❌ On-chain submission failed: ${e.message}`);
  }
}

function startListener(wallet, contractAddress, provider, config, executeTask) {
  const contract  = new ethers.Contract(contractAddress, ABI, provider);
  const filter    = contract.filters.JobCreated(null, null, wallet.address);
  const POLL_MS      = 8000;
  const LOOKBACK     = 200; // scan back N blocks on startup to catch missed jobs
  const seen         = new Set();
  let lastBlock      = 0;
  let initialised    = false;

  console.log(`\n  🤖 ${config.name} listening for jobs → ${wallet.address}`);

  async function poll() {
    try {
      const current = await provider.getBlockNumber();
      let from;
      if (!initialised) {
        from        = Math.max(0, current - LOOKBACK);
        initialised = true;
      } else {
        from = lastBlock > 0 ? lastBlock : current;
      }
      const events  = await contract.queryFilter(filter, from, current);
      lastBlock     = current + 1;

      for (const ev of events) {
        const key = ev.transactionHash + ev.index;
        if (seen.has(key)) continue;
        seen.add(key);
        const [jobId, client, agent, escrow] = ev.args;
        await handleJob(jobId, client, agent, escrow, ev.transactionHash,
          wallet, contractAddress, provider, config, executeTask);
      }
    } catch (e) {
      // suppress noisy filter errors, log real ones
      if (!e.message?.includes("filter not found") && !e.message?.includes("ECONNRESET")) {
        console.log(`  [${config.name}] ⚠️  Poll error: ${e.message?.split("\n")[0]}`);
      }
    }
    setTimeout(poll, POLL_MS);
  }

  poll();
}

module.exports = { ensureRegistered, startListener, submitResult, saveResult, makeProvider, ABI, EXPLORER, dbWriteAgent };
