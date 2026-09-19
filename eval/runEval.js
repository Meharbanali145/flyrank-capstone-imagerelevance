import fs from "node:fs";
import path from "node:path";
import { embedText } from "../src/matching/embeddings.js";
import { matchAndGuard, rankCandidates } from "../src/matching/guard.js";

const POSTS_FILE = path.resolve("eval", "posts.json");
const RESULTS_FILE = path.resolve("eval", "results.json");
const IMAGE_EMBEDDINGS_FILE = path.resolve("corpus", "image-embeddings.json");

async function main() {
  const posts = JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8").replace(/^\uFEFF/, ""));
  const imageEmbeddings = JSON.parse(fs.readFileSync(IMAGE_EMBEDDINGS_FILE, "utf-8").replace(/^\uFEFF/, ""));

  const results = [];
  for (const post of posts) {
    const postEmbedding = await embedText(post.text, "query");
    const ranked = rankCandidates(postEmbedding, imageEmbeddings);
    const guardResult = matchAndGuard(postEmbedding, imageEmbeddings);

    let correct;
    if (post.expectedCategory === null) {
      correct = guardResult.decision !== "accepted";
    } else if (post.expectedSubjectGroup) {
      correct = guardResult.decision === "accepted" && post.expectedSubjectGroup.includes(guardResult.subject);
    } else {
      const acceptedImg = imageEmbeddings.find((i) => i.file === guardResult.candidate);
      correct = guardResult.decision === "accepted" && acceptedImg?.category === post.expectedCategory;
    }

    results.push({
      id: post.id,
      text: post.text,
      expectedSubject: post.expectedSubject,
      topRanked: ranked[0]?.file ?? null,
      topSimilarity: ranked[0]?.similarity ?? null,
      guardDecision: guardResult.decision,
      guardCandidate: guardResult.candidate ?? null,
      guardSubject: guardResult.subject ?? null,
      guardReason: guardResult.reason,
      correct,
    });

    console.log(`[${post.id}] "${post.text}"`);
    console.log(`    expected subject: ${post.expectedSubject ?? "(no match)"}  |  guard: ${guardResult.decision} ${guardResult.candidate ?? ""} (${guardResult.subject ?? "-"})  |  ${correct ? "CORRECT" : "WRONG"}`);
  }

  const precision = results.filter((r) => r.correct).length / results.length;

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ precision, results }, null, 2));

  console.log(`\nTop-1 precision: ${(precision * 100).toFixed(1)}% (${results.filter(r => r.correct).length}/${results.length})`);
  console.log(`Full results written to ${RESULTS_FILE}`);
}

main().catch((err) => {
  console.error("Eval crashed:", err.message);
  process.exit(1);
});

