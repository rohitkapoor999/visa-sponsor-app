import "dotenv/config";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

if (!API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY is not set in .env — AI features will fail until you add it.");
}

/**
 * Calls Claude with optional web search tool enabled.
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {Array} opts.messages - message array (supports text and image content blocks)
 * @param {boolean} opts.useWebSearch - whether to enable the web_search tool
 * @param {number} opts.maxTokens
 */
export async function callClaude({ system, messages, useWebSearch = false, maxTokens = 4000 }) {
  if (!API_KEY) {
    throw new Error("Server is missing ANTHROPIC_API_KEY. Add it to server/.env and restart.");
  }

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages,
  };

  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  // Concatenate all text blocks (web search results interleave tool_use/tool_result blocks)
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { text, raw: data };
}

// Strips markdown fences and parses JSON, throws a descriptive error if it fails
export function parseJsonResponse(text) {
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON. Raw start: ${clean.slice(0, 200)}`);
  }
}
