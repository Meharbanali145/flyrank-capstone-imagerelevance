import fs from "node:fs";
import path from "node:path";

// Gemini 2.5 Flash pricing (per 1M tokens), input/output.
// VERIFY THIS against https://ai.google.dev/gemini-api/docs/pricing before
// relying on it for anything real — pricing pages change. This exists so
// cost is visible and attributed per call (Section 6 requirement), not to
// be your actual billing source of truth: you're on the free tier, so no
// money moves either way, but the tracking habit is what's being graded.
const PRICE_PER_1M_INPUT_TOKENS = 0.30;
const PRICE_PER_1M_OUTPUT_TOKENS = 2.50;

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "cost-log.jsonl");

export function estimateCost(usage) {
  if (!usage) return { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
  const inputTokens = usage.total_input_tokens ?? 0;
  const outputTokens = usage.total_output_tokens ?? 0;
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS +
    (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS;
  return { inputTokens, outputTokens, estimatedCostUsd };
}

/**
 * Appends one line per call — jsonl, so it's trivial to sum later for
 * a total, and each line stands alone as an EVIDENCE.md-pastable proof.
 */
export function logCost({ file, usage, success }) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const cost = estimateCost(usage);
  const entry = {
    timestamp: new Date().toISOString(),
    file,
    success,
    ...cost,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  return entry;
}