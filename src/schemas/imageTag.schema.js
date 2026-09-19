import { z } from "zod";

/**
 * This is the contract for every vision-model response.
 * Nothing downstream (embeddings, matching, the guard) is allowed
 * to touch a tag object that hasn't passed this schema first.
 *
 * Design decisions worth defending to an evaluator:
 * - `category` is an enum, not a free string. The mismatch guard needs
 *   to compare categories reliably ("animal" vs "animal"), and a model
 *   that's allowed to say "animals" one time and "wildlife" another
 *   breaks that comparison. Lock the vocabulary now, in Phase 1 â€” not
 *   after you've tagged 50 images inconsistently.
 * - `confidence` is a plain 0-1 float. This is what lets us flag
 *   low-confidence results (Requirement: "flagged instead of accepted")
 *   without a second AI call â€” it's just a threshold check.
 * - `attributes` has a minimum of 1. An empty attributes array means
 *   the model gave you nothing useful, which should fail validation,
 *   not pass through as a technically-valid empty list.
 */

export const CATEGORIES = [
  "animal",
  "landscape",
  "person",
  "object",
  "food",
  "architecture",
  "plant",
  "other",
];

export const ImageTagSchema = z.object({
  subject: z.string().min(2).max(100),
  category: z.enum(CATEGORIES),
  attributes: z.array(z.string().min(1)).min(1).max(10),
  caption: z.string().min(5).max(300),
  confidence: z.number().min(0).max(1),
});

// Confidence below this line gets flagged for review, never silently
// accepted as ground truth. Section 6 requirement: "Low-confidence
// classifications are flagged instead of accepted." Tune this later
// against your eval set (Phase 4) â€” 0.6 is a starting guess, not gospel.
export const LOW_CONFIDENCE_THRESHOLD = 0.88;

/**
 * Validates a raw model response. Never throws on bad input â€”
 * returns a discriminated result so callers can flag-and-retry
 * instead of crashing the batch job on one weird response.
 */
export function validateImageTag(raw) {
  const result = ImageTagSchema.safeParse(raw);
  if (!result.success) {
    return { valid: false, errors: result.error.flatten(), data: null };
  }
  const data = result.data;
  return {
    valid: true,
    errors: null,
    data,
    needsReview: data.confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}
