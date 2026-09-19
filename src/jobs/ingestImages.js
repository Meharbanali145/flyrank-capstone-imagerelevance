import fs from "node:fs";
import path from "node:path";
import { classifyImage } from "../vision/ollamaClient.js";
import { logCost } from "../vision/costTracker.js";
import { validateImageTag } from "../schemas/imageTag.schema.js";

const CORPUS_DIR = path.resolve("corpus");
const OUTPUT_FILE = path.resolve("corpus", "image-metadata.json");
const MAX_ATTEMPTS = 4; // raised from 3 after seeing moondream need a few
// tries more often than a larger model would — still fails and reports
// honestly after this many attempts, just gives a weaker model a bit
// more room before giving up on an image.
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Requirement (Section 6): "Images are processed through a batch
 * background job with retries." This is that job. One image can fail
 * transiently (network blip, rate limit, a genuinely malformed model
 * response) without killing the whole batch — it retries up to
 * MAX_ATTEMPTS times, and only after that gives up and marks the image
 * as failed rather than silently skipping it.
 */
async function processImage(file) {
  const filePath = path.join(CORPUS_DIR, file);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { raw, usage } = await classifyImage(filePath);
      const validation = validateImageTag(raw);

      logCost({ file, usage, success: validation.valid });

      if (!validation.valid) {
        // The model responded, but not with something our schema accepts.
        // This is exactly the "never trust invalid model output" case —
        // retry it like any other failure, don't patch it up ourselves.
        lastError = `Schema validation failed: ${JSON.stringify(validation.errors)}`;
        console.log(`  [${file}] attempt ${attempt}: invalid schema, retrying...`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      return {
        file,
        status: "tagged",
        needsReview: validation.needsReview,
        tags: validation.data,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err.message;
      console.log(`  [${file}] attempt ${attempt} failed: ${err.message}`);
      logCost({ file, usage: null, success: false });
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return {
    file,
    status: "failed",
    error: lastError,
    attempts: MAX_ATTEMPTS,
  };
}

async function main() {
  const manifestPath = path.join(CORPUS_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("No corpus/manifest.json found. Run `npm run fetch-corpus` first.");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const files = manifest.map((m) => m.file);

  console.log(`Processing ${files.length} images through local Ollama vision model...\n`);

  const results = [];
  for (const file of files) {
    console.log(`[${file}]`);
    const result = await processImage(file);
    results.push(result);
    if (result.status === "tagged") {
      const flag = result.needsReview ? " (LOW CONFIDENCE - flagged for review)" : "";
      console.log(`  -> ${result.tags.subject} / ${result.tags.category}${flag}`);
    } else {
      console.log(`  -> FAILED after ${result.attempts} attempts: ${result.error}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  const tagged = results.filter((r) => r.status === "tagged");
  const flagged = tagged.filter((r) => r.needsReview);
  const failed = results.filter((r) => r.status === "failed");

  console.log(`\nDone.`);
  console.log(`  Tagged: ${tagged.length}/${results.length}`);
  console.log(`  Flagged low-confidence: ${flagged.length}`);
  console.log(`  Failed after retries: ${failed.length}`);
  console.log(`  Written to: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Ingestion job crashed:", err.message);
  process.exit(1);
});