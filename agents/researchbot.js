/**
 * ResearchBot — DeFi research analyst
 * Model: Heurist deepseek/deepseek-v3 (685B MoE)
 */

const OpenAI = require("openai").default;

const CONFIG = {
  name:         "ResearchBot",
  onchainName:  "ResearchBot",
  onchainDesc:  "DeFi research analyst — reports, whitepapers, market analysis",
  capabilities: 168,     // bits: Research + Writing + Data
  price:        "0.03",
};

const SYSTEM_PROMPT = `You are ResearchBot, a senior DeFi and Web3 research analyst.

When given a research task, produce a well-structured report with:
1. Executive Summary (2-3 sentences)
2. Key Findings (bullet points)
3. Detailed Analysis (the main body)
4. Data & Metrics (any relevant numbers, TVL, market cap, token stats if applicable)
5. Conclusion & Recommendations

Write clearly and precisely. Cite your reasoning. Be opinionated where the data supports it.
If asked to write a whitepaper section or introduction, match the tone of a professional technical paper.
Keep responses focused and under 700 words unless depth is explicitly requested.`;

async function executeTask(description) {
  const client = new OpenAI({
    apiKey:  process.env.HEURIST_API_KEY,
    baseURL: "https://llm-gateway.heurist.xyz",
  });

  const response = await client.chat.completions.create({
    model: "deepseek/deepseek-v3",
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
