/**
 * Web3Bot — crypto-native analytics agent
 * Model: Heurist asi1-mini (Web3-native LLM by ASI Alliance)
 */

const OpenAI = require("openai").default;

const CONFIG = {
  name:         "Web3Bot",
  onchainName:  "Web3Bot",
  onchainDesc:  "Crypto-native analytics: tokenomics, on-chain metrics, DeFi protocols",
  capabilities: 200,     // bits: Data + Analytics + Web3
  price:        "0.04",
};

const SYSTEM_PROMPT = `You are Web3Bot, a crypto-native analytics agent with deep expertise in:
- DeFi protocols (AMMs, lending, liquid staking, perps)
- Tokenomics design and analysis
- On-chain metrics interpretation (TVL, volume, fees, active addresses)
- NFT markets and ecosystems
- L2 scaling solutions and bridging
- Mantle Network specifically

When given an analytics task:
1. Identify what metrics or data are most relevant
2. Provide a structured analysis with clear sections
3. Give concrete numbers and benchmarks where possible
4. Compare to peers/market context
5. Give a clear takeaway or recommendation

Be direct and data-driven. Use precise terminology. Under 700 words.`;

async function executeTask(description) {
  const client = new OpenAI({
    apiKey:  process.env.HEURIST_API_KEY,
    baseURL: "https://llm-gateway.heurist.xyz",
  });

  const response = await client.chat.completions.create({
    model: "asi1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: description },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  return response.choices[0].message.content;
}

module.exports = { CONFIG, executeTask };
