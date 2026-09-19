import { cosineSimilarity } from "./embeddings.js";

export const SIMILARITY_FLOOR = 0.5;
// Bare 1-2 word subject strings ("wolf", "dog") don't carry enough context
// to discriminate species reliably - measured wolf-vs-dog subject
// similarity at 0.816, HIGHER than fox-vs-wolf (0.715), making any subject-
// word threshold unsafe. Full captions discriminate far better: same-
// species caption similarity measured ~0.90, cross-species 0.63-0.72.
// This threshold operates on captionEmbedding, not subjectEmbedding.
export const SUBJECT_MISMATCH_THRESHOLD = 0.80;

export function rankCandidates(postEmbedding, imageEmbeddings) {
  return imageEmbeddings
    .map((img) => {
      const captionSim = cosineSimilarity(postEmbedding, img.captionEmbedding);
      const subjectSim = cosineSimilarity(postEmbedding, img.subjectEmbedding);
      return { ...img, similarity: Math.max(captionSim, subjectSim) };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

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
  const expectedCaptionEmbedding = top.captionEmbedding;

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
    // Caption-vs-caption comparison, NOT subject-vs-subject - bare subject
    // words don't discriminate species reliably (see threshold comment).
    const captionSim = cosineSimilarity(expectedCaptionEmbedding, candidate.captionEmbedding);
    if (captionSim < SUBJECT_MISMATCH_THRESHOLD) {
      return {
        decision: "rejected",
        candidate: candidate.file,
        reason: `${expectedCategory} subject mismatch: expected "${expectedSubject}", detected "${candidate.subject}" (caption similarity ${captionSim.toFixed(3)} < ${SUBJECT_MISMATCH_THRESHOLD})`,
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
