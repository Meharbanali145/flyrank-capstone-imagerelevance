import express from "express";
import path from "node:path";
import { getDb, initSchema } from "../db/schema.js";
import { embedText } from "../matching/embeddings.js";
import { matchAndGuard, rankCandidates } from "../matching/guard.js";

function loadImageEmbeddingsFromDb(db) {
  const rows = db.prepare(`
    SELECT i.file, i.category, i.subject, i.caption, i.confidence,
           i.needs_review AS needsReview,
           e.caption_embedding AS captionEmbeddingJson,
           e.subject_embedding AS subjectEmbeddingJson
    FROM images i
    JOIN image_embeddings e ON e.image_id = i.id
  `).all();

  return rows.map((r) => ({
    file: r.file,
    category: r.category,
    subject: r.subject,
    caption: r.caption,
    confidence: r.confidence,
    needsReview: !!r.needsReview,
    captionEmbedding: JSON.parse(r.captionEmbeddingJson),
    subjectEmbedding: JSON.parse(r.subjectEmbeddingJson),
  }));
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const db = getDb();
  initSchema(db);

  function requirePostText(req, res, next) {
    const { text } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'text'." });
    }
    next();
  }

  function recordPostAndSuggestion(text, guardResult) {
    const insertPost = db.prepare(`INSERT INTO posts (text) VALUES (?)`);
    const { lastInsertRowid: postId } = insertPost.run(text);

    let imageId = null;
    if (guardResult.candidate) {
      const row = db.prepare(`SELECT id FROM images WHERE file = ?`).get(guardResult.candidate);
      imageId = row ? row.id : null;
    }

    db.prepare(`
      INSERT INTO suggestions (post_id, image_id, decision, similarity, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(postId, imageId, guardResult.decision, guardResult.similarity ?? null, guardResult.reason);

    return postId;
  }

  /**
   * POST /posts/match
   * Body: { text: "post content" }
   * Runs embed -> rank -> guard, and persists the post + suggestion as
   * real database rows (not just an in-memory response).
   */
  app.post("/posts/match", requirePostText, async (req, res) => {
    try {
      const imageEmbeddings = loadImageEmbeddingsFromDb(db);
      const postEmbedding = await embedText(req.body.text, "query");
      const ranked = rankCandidates(postEmbedding, imageEmbeddings);
      const guardResult = matchAndGuard(postEmbedding, imageEmbeddings);

      const postId = recordPostAndSuggestion(req.body.text, guardResult);

      res.json({
        postId,
        post: req.body.text,
        decision: guardResult,
        topCandidates: ranked.slice(0, 5).map((r) => ({
          file: r.file, subject: r.subject, category: r.category, similarity: r.similarity,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Matching failed", detail: err.message });
    }
  });

  app.post("/posts/match/force", requirePostText, async (req, res) => {
    const { candidateFile } = req.body ?? {};
    if (typeof candidateFile !== "string" || !candidateFile.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'candidateFile'." });
    }
    try {
      const imageEmbeddings = loadImageEmbeddingsFromDb(db);
      const postEmbedding = await embedText(req.body.text, "query");
      const guardResult = matchAndGuard(postEmbedding, imageEmbeddings, { forcedCandidateFile: candidateFile });

      const postId = recordPostAndSuggestion(req.body.text, guardResult);

      res.json({ postId, post: req.body.text, forcedCandidate: candidateFile, decision: guardResult });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Matching failed", detail: err.message });
    }
  });

  /**
   * GET /images - lists every image row from the database.
   */
  app.get("/images", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT file, category, subject, confidence, needs_review AS needsReview FROM images
      `).all();
      res.json(rows.map((r) => ({ ...r, needsReview: !!r.needsReview })));
    } catch (err) {
      res.status(500).json({ error: "Failed to load images", detail: err.message });
    }
  });

  /**
   * GET /suggestions - inspect every match decision ever made, with the
   * originating post text and (if accepted) which image file.
   */
  app.get("/suggestions", (req, res) => {
    const rows = db.prepare(`
      SELECT s.id, p.text AS postText, i.file AS candidateFile, s.decision, s.similarity, s.reason, s.created_at AS createdAt
      FROM suggestions s
      JOIN posts p ON p.id = s.post_id
      LEFT JOIN images i ON i.id = s.image_id
      ORDER BY s.id DESC
    `).all();
    res.json(rows);
  });

  /**
   * POST /reviews - records a human approve/reject decision, persisted
   * as a real row.
   */
  app.post("/reviews", (req, res) => {
    const { postText, candidateFile, decision, reviewer, note } = req.body ?? {};
    if (typeof postText !== "string" || !postText.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'postText'." });
    }
    if (typeof candidateFile !== "string" || !candidateFile.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'candidateFile'." });
    }
    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).json({ error: "Field 'decision' must be exactly 'approve' or 'reject'." });
    }

    const result = db.prepare(`
      INSERT INTO reviews (post_text, candidate_file, decision, reviewer, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(postText, candidateFile, decision, reviewer ?? null, note ?? null);

    const entry = db.prepare(`SELECT * FROM reviews WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(entry);
  });

  /**
   * GET /reviews - lists every recorded review decision, most recent first.
   */
  app.get("/reviews", (req, res) => {
    const rows = db.prepare(`SELECT * FROM reviews ORDER BY id DESC`).all();
    res.json(rows);
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  return app;
}
