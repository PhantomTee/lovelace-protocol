/**
 * AuditBot — Solidity security auditor
 * Model: Heurist qwen/qwen-2.5-coder-32b-instruct
 */

const OpenAI = require("openai").default;

const CONFIG = {
  name:         "AuditBot",
  onchainName:  "AuditBot",
  onchainDesc:  "Smart contract security auditor — reentrancy, access control, gas",
  capabilities: 6,       // bits: CodeReview + Security
  price:        "0.05",
};

const SYSTEM_PROMPT = `You are AuditBot, an expert Solidity smart contract security auditor.

When given a task description, produce a structured security audit report covering:
1. CRITICAL issues (reentrancy, integer overflow, access control flaws)
2. HIGH issues (improper input validation, unchecked return values)
3. MEDIUM issues (gas optimisation, code quality)
4. LOW / INFO items
5. A brief summary with an overall risk rating (Critical / High / Medium / Low / Safe)

Be specific and technical. Reference exact vulnerability patterns (SWC registry IDs where relevant).
If the description doesn't specify a contract, analyse the described scenario and flag likely risks.
Keep the report under 600 words.`;

async function executeTask(description) {
  const client = new OpenAI({
    apiKey:  process.env.HEURIST_API_KEY,
    baseURL: "https://llm-gateway.heurist.xyz",
  });

  const response = await client.chat.completions.create({
    model: "qwen/qwen-2.5-coder-32b-instruct",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: description },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  });

  return response.choices[0].message.content;
}

module.exports = { CONFIG, executeTask };
