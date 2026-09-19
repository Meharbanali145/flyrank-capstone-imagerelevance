import express from "express";
import fs from "node:fs";
import path from "node:path";
import { embedText } from "../matching/embeddings.js";
import { matchAndGuard, rankCandidates } from "../matching/guard.js";

const CORPUS_DIR = path.resolve("corpus");
const IMAGE_EMBEDDINGS_FILE = path.join(CORPUS_DIR, "image-embeddings.json");
const APPROVALS_FILE = path.resolve("data", "approvals.json");

function loadImageEmbeddings() {
  return JSON.parse(fs.readFileSync(IMAGE_EMBEDDINGS_FILE, "utf-8").replace(/^\uFEFF/, ""));
}

function loadApprovals() {
  if (!fs.existsSync(APPROVALS_FILE)) return [];
  return JSON.parse(fs.readFileSync(APPROVALS_FILE, "utf-8").replace(/^\uFEFF/, ""));
}

function saveApprovals(approvals) {
  fs.mkdirSync(path.dirname(APPROVALS_FILE), { recursive: true });
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(approvals, null, 2));
}

export function createApp() {
  const app = express();
  app.use(express.json());

  // Validation at the boundary: reject malformed input with a clean 4xx,
  // never let it reach matching logic and throw a 500.
  function requirePostText(req, res, next) {
    const { text } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'text'." });
    }
    next();
  }

  /**
   * POST /posts/match
   * Body: { text: "post content" }
   * Runs the full pipeline: embed -> rank -> guard. Returns the guard's
   * decision plus the top few ranked candidates for transparency.
   */
  app.post("/posts/match", requirePostText, async (req, res) => {
    try {
      const imageEmbeddings = loadImageEmbeddings();
      const postEmbedding = await embedText(req.body.text, "query");
      const ranked = rankCandidates(postEmbedding, imageEmbeddings);
      const guardResult = matchAndGuard(postEmbedding, imageEmbeddings);

      res.json({
        post: req.body.text,
        decision: guardResult,
        topCandidates: ranked.slice(0, 5).map((r) => ({
          file: r.file,
          subject: r.subject,
          category: r.category,
          similarity: r.similarity,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Matching failed", detail: err.message });
    }
  });

  /**
   * POST /posts/match/force
   * Body: { text: "post content", candidateFile: "animal-gray_wolf-0.jpg" }
   * Forces the guard to evaluate a specific candidate instead of the
   * top-ranked one. This is how Probe 3 ("force the wolf as a candidate
   * for the fox post") is exercised via the API directly.
   */
  app.post("/posts/match/force", requirePostText, async (req, res) => {
    const { candidateFile } = req.body ?? {};
    if (typeof candidateFile !== "string" || !candidateFile.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty string field 'candidateFile'." });
    }
    try {
      const imageEmbeddings = loadImageEmbeddings();
      const postEmbedding = await embedText(req.body.text, "query");
      const guardResult = matchAndGuard(postEmbedding, imageEmbeddings, { forcedCandidateFile: candidateFile });
      res.json({ post: req.body.text, forcedCandidate: candidateFile, decision: guardResult });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Matching failed", detail: err.message });
    }
  });

  /**
   * GET /images
   * Lists every tagged image with its tags — for browsing/inspection.
   */
  app.get("/images", (req, res) => {
    try {
      const imageEmbeddings = loadImageEmbeddings();
      res.json(imageEmbeddings.map(({ file, subject, category, confidence, needsReview }) => ({
        file, subject, category, confidence, needsReview,
      })));
    } catch (err) {
      res.status(500).json({ error: "Failed to load images", detail: err.message });
    }
  });

  /**
   * POST /reviews
   * Body: { postText, candidateFile, decision: "approve" | "reject", reviewer?, note? }
   * Records a human review decision on a specific post/image pairing.
   * This is the "review API" workflow — approve, reject, and (via GET
   * below) inspect why.
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

    const approvals = loadApprovals();
    const entry = {
      id: approvals.length + 1,
      postText,
      candidateFile,
      decision,
      reviewer: typeof reviewer === "string" ? reviewer : null,
      note: typeof note === "string" ? note : null,
      reviewedAt: new Date().toISOString(),
    };
    approvals.push(entry);
    saveApprovals(approvals);

    res.status(201).json(entry);
  });

  /**
   * GET /reviews
   * Lists every recorded review decision, most recent first.
   */
  app.get("/reviews", (req, res) => {
    const approvals = loadApprovals();
    res.json(approvals.slice().reverse());
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  return app;
}
