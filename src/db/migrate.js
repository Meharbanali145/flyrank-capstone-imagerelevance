import fs from "node:fs";
import path from "node:path";
import { getDb, initSchema } from "../db/schema.js";

const METADATA_FILE = path.resolve("corpus", "image-metadata.json");
const EMBEDDINGS_FILE = path.resolve("corpus", "image-embeddings.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, ""));
}

function main() {
  fs.mkdirSync(path.resolve("data"), { recursive: true });
  const db = getDb();
  initSchema(db);

  const metadata = readJson(METADATA_FILE).filter((m) => m.status === "tagged");
  const embeddings = readJson(EMBEDDINGS_FILE);
  const embeddingsByFile = Object.fromEntries(embeddings.map((e) => [e.file, e]));

  const insertImage = db.prepare(`
    INSERT INTO images (file, category, subject, caption, confidence, needs_review)
    VALUES (@file, @category, @subject, @caption, @confidence, @needsReview)
    ON CONFLICT(file) DO UPDATE SET
      category=excluded.category, subject=excluded.subject, caption=excluded.caption,
      confidence=excluded.confidence, needs_review=excluded.needs_review
  `);
  const insertEmbedding = db.prepare(`
    INSERT INTO image_embeddings (image_id, caption_embedding, subject_embedding)
    VALUES (@imageId, @captionEmbedding, @subjectEmbedding)
    ON CONFLICT(image_id) DO UPDATE SET
      caption_embedding=excluded.caption_embedding, subject_embedding=excluded.subject_embedding
  `);
  const getImageId = db.prepare(`SELECT id FROM images WHERE file = ?`);

  const migrate = db.transaction(() => {
    for (const entry of metadata) {
      insertImage.run({
        file: entry.file,
        category: entry.tags.category,
        subject: entry.tags.subject,
        caption: entry.tags.caption,
        confidence: entry.tags.confidence,
        needsReview: entry.needsReview ? 1 : 0,
      });
      const imageId = getImageId.get(entry.file).id;
      const emb = embeddingsByFile[entry.file];
      if (emb) {
        insertEmbedding.run({
          imageId,
          captionEmbedding: JSON.stringify(emb.captionEmbedding),
          subjectEmbedding: JSON.stringify(emb.subjectEmbedding),
        });
      }
    }
  });
  migrate();

  const count = db.prepare("SELECT COUNT(*) AS n FROM images").get().n;
  const embCount = db.prepare("SELECT COUNT(*) AS n FROM image_embeddings").get().n;
  console.log(`Migrated ${count} images, ${embCount} embeddings into ${path.resolve("data", "app.db")}`);
  db.close();
}

main();
