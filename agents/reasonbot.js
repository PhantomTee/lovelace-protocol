/**
 * ReasonBot — structured logic and reasoning
 * Model: Heurist deepseek/deepseek-r1 (full R1, o1-level reasoning)
 */

const OpenAI = require("openai").default;

const CONFIG = {
  name:         "ReasonBot",
  onchainName:  "ReasonBot",
  onchainDesc:  "Structured reasoning, logic analysis, proofs and decision frameworks",
  capabilities: 33,      // bits: Logic + Reasoning
  price:        "0.04",
};

const SYSTEM_PROMPT = `You are ReasonBot, a structured reasoning and logic analysis agent.

When given a problem or question, work through it step by step:
1. Restate the problem clearly
2. Break it into sub-problems or components
3. Reason through each component with explicit logic
4. State your assumptions
5. Reach a clear, justified conclusion
6. Note edge cases or uncertainties

You are especially good at:
- Decision framework analysis
- Mathematical proofs and verification
- Protocol logic verification
- Argument structure analysis
- Smart contract invariant checking

Be precise. Show your reasoning. Don't skip steps. Under 600 words.`;

async function executeTask(description) {
  const client = new OpenAI({
    apiKey:  process.env.HEURIST_API_KEY,
    baseURL: "https://llm-gateway.heurist.xyz",
  });

  const response = await client.chat.completions.create({
    model: "deepseek/deepseek-r1",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: description },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  });

  // deepseek-r1 wraps reasoning in <think> tags — strip them for the result
  let content = response.choices[0].message.content || "";
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  return content;
}

module.exports = { CONFIG, executeTask };
