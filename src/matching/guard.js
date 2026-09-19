import { cosineSimilarity } from "./embeddings.js";

// Tentative starting points — will tune against real measured data in
// the next step, per the brief: "set with your eval data, not guessed."
export const SIMILARITY_FLOOR = 0.65;
export const SUBJECT_MISMATCH_THRESHOLD = 0.65;

/**
 * Ranks every candidate image against a post embedding by caption
 * similarity, descending. This is the semantic ranking step.
 */
export function rankCandidates(postEmbedding, imageEmbeddings) {
  return imageEmbeddings
    .map((img) => ({
      ...img,
      similarity: cosineSimilarity(postEmbedding, img.captionEmbedding),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * The mismatch guard. Decides whether a specific candidate image is a
 * safe recommendation for a post, combining:
 *  1. Overall similarity floor — is this remotely related at all?
 *  2. Hard category reject — same top-level category as the best match?
 *  3. Subject-level check — same specific subject as the best match,
 *     even within the same category (this is what catches fox-vs-wolf,
 *     since both are "animal" but different species).
 *
 * If forcedCandidateFile is omitted, the guard evaluates the top-ranked
 * candidate. If provided, it evaluates that specific image instead —
 * this is how you test "force the wolf as a candidate for the fox post."
 */
export function matchAndGuard(postEmbedding, imageEmbeddings, { forcedCandidateFile } = {}) {
  const ranked = rankCandidates(postEmbedding, imageEmbeddings);
  const top = ranked[0];

  if (!top || top.similarity < SIMILARITY_FLOOR) {
    return {
      decision: "no_match",
      reason: `No image cleared the similarity floor (best: ${top ? top.similarity.toFixed(3) : "n/a"} < ${SIMILARITY_FLOOR})`,
    };
  }

  const expectedCategory = top.category;
  const expectedSubject = top.subject;
  const expectedSubjectEmbedding = top.subjectEmbedding;

  const candidate = forcedCandidateFile
    ? imageEmbeddings.find((c) => c.file === forcedCandidateFile)
    : top;

  if (!candidate) {
    throw new Error(`Forced candidate file not found: ${forcedCandidateFile}`);
  }

  const candidateSimilarity = cosineSimilarity(postEmbedding, candidate.captionEmbedding);

  if (candidateSimilarity < SIMILARITY_FLOOR) {
    return {
      decision: "rejected",
      candidate: candidate.file,
      reason: `Similarity below threshold (${candidateSimilarity.toFixed(3)} < ${SIMILARITY_FLOOR})`,
    };
  }

  if (candidate.category !== expectedCategory) {
    return {
      decision: "rejected",
      candidate: candidate.file,
      reason: `Category mismatch: expected "${expectedCategory}", detected "${candidate.category}"`,
    };
  }

  if (candidate.file !== top.file) {
    const subjectSim = cosineSimilarity(expectedSubjectEmbedding, candidate.subjectEmbedding);
    if (subjectSim < SUBJECT_MISMATCH_THRESHOLD) {
      return {
        decision: "rejected",
        candidate: candidate.file,
        reason: `${expectedCategory} subject mismatch: expected "${expectedSubject}", detected "${candidate.subject}" (subject similarity ${subjectSim.toFixed(3)} < ${SUBJECT_MISMATCH_THRESHOLD})`,
      };
    }
  }

  return {
    decision: "accepted",
    candidate: candidate.file,
    subject: candidate.subject,
    similarity: candidateSimilarity,
    needsReview: candidate.needsReview,
    reason: candidate.needsReview
      ? "Accepted, but underlying vision tag was flagged low-confidence — recommend human review."
      : "Accepted.",
  };
}
