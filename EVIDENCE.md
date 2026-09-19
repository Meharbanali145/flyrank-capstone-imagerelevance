\# Evidence



One proof per requirement in Section 6, pasted from real runs during development.



\## AI processing



\*\*Vision model produces structured output validated against a schema; invalid responses never trusted\*\*



`src/schemas/imageTag.schema.js` validates every response with Zod before it's accepted. Real retry-on-invalid-schema from an actual ingest run:



\*\*Low-confidence classifications are flagged instead of accepted\*\*



Threshold tuned from measured data (all 40 confidences clustered 0.80–0.95, so the original 0.6 default never fired). Re-validated against real tagged output:(`animal-dog-0.jpg` at 0.85, `animal-dog-5.jpg` at 0.80, both correctly flagged at threshold 0.88)



\*\*Images are processed through a batch background job with retries\*\*



`src/jobs/ingestImages.js`, `MAX\_ATTEMPTS = 3`. Full 40-image run:(low-confidence count reflects pre-retune default; see above for the retuned flag count)



\*\*Vision and embedding costs are tracked per call\*\*



`corpus/../logs/cost-log.jsonl`, one line per call, e.g.:

```json

{"timestamp":"2026-09-18T08:12:29.664Z","file":"animal-red\_fox-0.jpg","success":false,"inputTokens":0,"outputTokens":0,"estimatedCostUsd":0}

```



\## Matching system



\*\*Image and post embeddings are stored; posts return ranked image suggestions\*\*



```powershell

node -e "console.log(JSON.parse(require('fs').readFileSync('corpus/image-embeddings.json')).length)"

```Live API ranking result for a real post:

\*\*Semantic matching works for equivalent concepts\*\*



Eval post #10, "Vulpes vulpes: a wild fox species profile" → correctly matched to a red fox image (subject: "red fox"), despite sharing almost no words with any image caption.



\## Safety layer



\*\*The mismatch guard rejects incorrect recommendations — wolf-on-a-fox-post provably fails\*\*

\*\*Rejections include a human-readable explanation\*\* — shown above (`reason` field).



\*\*When no image clears the bar, the system answers "no confident match" with reasons\*\*



Eval post #12, "How to fix a leaking kitchen faucet":

\## Backend



\*\*Database models for images, tags, embeddings, posts, suggestions, approvals/rejections — with the required indexes\*\*



`src/db/schema.js` — 5 tables (`images`, `image\_embeddings`, `posts`, `suggestions`, `reviews`), indexes on `images.category`, `suggestions.post\_id`, `reviews.decision`, foreign keys with cascade. Migration confirmed:

\*\*API endpoints validated; the review workflow exists\*\*Invalid input rejected cleanly (400, not 500) — every endpoint checks required fields before touching matching logic.



\## Quality \& documentation



\*\*A small labeled evaluation dataset measures top-1 precision\*\*



`eval/posts.json` (12 posts, 5 categories, 2 true-negative controls, 1 synonym test), `eval/runEval.js`:

\*\*README with architecture explanation and diagram; required files present\*\*



See `README.md`. Required files: `README.md`, `capstone.yaml`, `EVIDENCE.md`, `BUILDLOG.md`, `.env.example` — all present in repo root.

