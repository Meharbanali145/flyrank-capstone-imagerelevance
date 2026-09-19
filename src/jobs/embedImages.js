import fs from "node:fs";
import path from "node:path";
import { embedText } from "../matching/embeddings.js";

const CORPUS_DIR = path.resolve("corpus");
const METADATA_FILE = path.join(CORPUS_DIR, "image-metadata.json");
const OUTPUT_FILE = path.join(CORPUS_DIR, "image-embeddings.json");

async function main() {
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
  const tagged = metadata.filter((m) => m.status === "tagged");

  console.log(`Embedding ${tagged.length} tagged images...\n`);

  const results = [];
  for (const entry of tagged) {
    const { file, tags, needsReview } = entry;
    const captionEmbedding = await embedText(tags.caption);
    const subjectEmbedding = await embedText(tags.subject);
    results.push({
      file,
      subject: tags.subject,
      category: tags.category,
      confidence: tags.confidence,
      needsReview,
      captionEmbedding,
      subjectEmbedding,
    });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`  embedded: ${file} (${tags.subject})`);
  }

  console.log(`\nDone. ${results.length} image embeddings written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Embedding job crashed:", err.message);
  process.exit(1);
});
