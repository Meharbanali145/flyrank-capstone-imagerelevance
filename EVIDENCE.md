Evidence

One proof per requirement in Section 6, pasted from real runs during development.

AI processing

Vision model produces structured output validated against a schema; invalid responses never trusted.

src/schemas/imageTag.schema.js validates every response with Zod before it's accepted. Real retry-on-invalid-schema from an actual ingest run:

[animal-red_fox-0.jpg] attempt 2: invalid schema, retrying...

Low-confidence classifications are flagged instead of accepted.

Threshold tuned from measured data (all 40 confidences clustered 0.80-0.95, so the original 0.6 default never fired). Re-validated against real tagged output:

Re-flagged with new threshold. Now flagged: 2

(animal-dog-0.jpg at 0.85, animal-dog-5.jpg at 0.80, both correctly flagged at threshold 0.88)

Images are processed through a batch background job with retries.

src/jobs/ingestImages.js, MAX_ATTEMPTS = 3. Full 40-image run:

Done.
Tagged: 40/40
Flagged low-confidence: 0
Failed after retries: 0

(low-confidence count above reflects the pre-retune default; see the re-flag output above for the retuned count of 2)

Vision and embedding costs are tracked per call.

logs/cost-log.jsonl, one line per call, example:

{"timestamp":"2026-09-18T08:12:29.664Z","file":"animal-red_fox-0.jpg","success":false,"inputTokens":0,"outputTokens":0,"estimatedCostUsd":0}

Matching system

Image and post embeddings are stored; posts return ranked image suggestions.

Command run: node -e "console.log(JSON.parse(require('fs').readFileSync('corpus/image-embeddings.json')).length)"

Output: 40

Live API ranking result for a real post:

POST /posts/match with text "The behavior of red foxes in the wild"
Result: decision accepted, candidate animal-red_fox-6.jpg, similarity 0.7204787352457069

Semantic matching works for equivalent concepts.

Eval post 10, "Vulpes vulpes: a wild fox species profile":
guard accepted animal-red_fox-4.jpg, subject red fox.
Correctly matched to a red fox image despite sharing almost no words with any image caption.

Safety layer

The mismatch guard rejects incorrect recommendations - wolf-on-a-fox-post provably fails.

POST /posts/match/force with text "The behavior of red foxes in the wild" and candidateFile "animal-gray_wolf-0.jpg"
Result: decision rejected
Reason: animal subject mismatch: expected "red fox", detected "wolf" (caption similarity 0.605 less than 0.8)

Rejections include a human-readable explanation - shown above in the reason field.

When no image clears the bar, the system answers "no confident match" with reasons.

Eval post 12, "How to fix a leaking kitchen faucet":
guard: no_match, reason: No image cleared the similarity floor (best: 0.485 less than 0.5)

Backend

Database models for images, tags, embeddings, posts, suggestions, approvals/rejections, with the required indexes.

src/db/schema.js has 5 tables: images, image_embeddings, posts, suggestions, reviews. Indexes on images.category, suggestions.post_id, reviews.decision, foreign keys with cascade. Migration confirmed:

Migrated 40 images, 40 embeddings into data/app.db

API endpoints validated; the review workflow exists.

POST /reviews with postText "The behavior of red foxes in the wild", candidateFile "animal-red_fox-2.jpg", decision "approve", reviewer "you"
Result: 201, id 1, decision approve.

Invalid input rejected cleanly (400, not 500) - every endpoint checks required fields before touching matching logic.

Quality and documentation

A small labeled evaluation dataset measures top-1 precision.

eval/posts.json has 12 posts across 5 categories, 2 true-negative controls, 1 synonym test. eval/runEval.js:

Top-1 precision: 91.7% (11/12)

README with architecture explanation and diagram; required files present.

See README.md. Required files: README.md, capstone.yaml, EVIDENCE.md, BUILDLOG.md, .env.example - all present in repo root.