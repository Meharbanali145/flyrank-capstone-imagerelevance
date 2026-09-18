import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

// Requirement (Section 3): "Use licensed-free images for your corpus
// (Unsplash / Pexels) ... keep the corpus small and commit it (or a
// download script) so evaluators can reproduce your results."
// This script IS that reproducibility story — commit this file, not
// necessarily the images themselves if they push you over a few MB.

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
  console.error("Missing PEXELS_API_KEY. Get a free key (no card) at:");
  console.error("https://www.pexels.com/api/  -> sign up -> copy key -> put in .env");
  process.exit(1);
}

// 5 categories, deliberately including a close-confusable pair
// (fox/wolf/dog) so your mismatch guard has something real to reject
// later in Phase 3. This is intentional test-data design, not filler.
const CATEGORIES = [
  { query: "red fox", category: "animal", count: 8 },
  { query: "gray wolf", category: "animal", count: 6 },
  { query: "dog", category: "animal", count: 6 },
  { query: "mountain landscape", category: "landscape", count: 8 },
  { query: "modern architecture building", category: "architecture", count: 6 },
  { query: "fresh food plate", category: "food", count: 6 },
];

const OUT_DIR = path.resolve("corpus");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function downloadOne(url, destPath) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(destPath, res.data);
}

async function fetchCategory({ query, category, count }) {
  const res = await axios.get("https://api.pexels.com/v1/search", {
    headers: { Authorization: PEXELS_API_KEY },
    params: { query, per_page: count },
  });

  const photos = res.data.photos ?? [];
  console.log(`\n${category} / "${query}": found ${photos.length} photos`);

  const manifestRows = [];
  for (const [i, photo] of photos.entries()) {
    const fileName = `${category}-${query.replace(/\s+/g, "_")}-${i}.jpg`;
    const destPath = path.join(OUT_DIR, fileName);
    await downloadOne(photo.src.medium, destPath);
    manifestRows.push({
      file: fileName,
      category,
      searchTerm: query,
      photographer: photo.photographer,
      sourceUrl: photo.url,
      license: "Pexels License (free to use, no attribution required, but credited here anyway)",
    });
    console.log(`  saved ${fileName}`);
  }
  return manifestRows;
}

async function main() {
  let manifest = [];
  for (const cat of CATEGORIES) {
    const rows = await fetchCategory(cat);
    manifest = manifest.concat(rows);
    // Be polite to the free tier — small delay between category calls.
    await new Promise((r) => setTimeout(r, 500));
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\nDone. ${manifest.length} images in /corpus, manifest.json written.`);
}

main().catch((err) => {
  console.error("Corpus fetch failed:", err.response?.data ?? err.message);
  process.exit(1);
});
