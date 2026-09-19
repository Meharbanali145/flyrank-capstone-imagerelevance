# Build Log

Honest record of where AI (Claude) helped, where it was wrong or I changed it,
and what I actually understand well enough to explain. Updated as I go, not
written after the fact.

---

## Phase 1 — Design & scaffold

**What I asked Claude for:** project scaffold (Node + Express plan), the
image-tag Zod schema, and a Pexels corpus-download script.

**What Claude produced:**
- `src/schemas/imageTag.schema.js` — Zod schema validating vision output
  against `{subject, category, attributes, caption, confidence}`, with a
  fixed category enum and a 0.6 low-confidence threshold.
- `scripts/fetch-images.js` — pulls a 40-image corpus from Pexels across
  6 categories (including fox/wolf/dog as a deliberate confusable set).

**What I changed / verified myself:**
- Ran the schema against both a valid and an intentionally invalid tag
  object myself to confirm rejection actually works (not just trusting
  the code because it looked reasonable).
- Rotated my Pexels API key after realizing I'd put the real key in
  `.env.example` instead of `.env` — `.env.example` is committed,
  `.env` is not, and I mixed them up initially.

**What I can explain if asked:**
- Why `category` is an enum and not a free string (comparability for the
  mismatch guard later).
- Why `attributes` requires at least 1 item (empty array = useless tag,
  should fail validation, not pass silently).
- Why the corpus deliberately includes wolf alongside fox — it's test
  data for the mismatch guard in Phase 3, not filler.

---

## Phase 2 — Vision pipeline

**What I asked Claude for:** a Gemini Flash vision client to tag the 40-image
corpus, wired into a batch job with retries.

**What went wrong, and how it was actually diagnosed:**
- The first version of `geminiClient.js` called a completely made-up endpoint
  (`/v1beta/interactions`) with a made-up response shape. This was wrong, not
  a real Gemini API — it should have been caught earlier by checking actual
  docs instead of trusting a plausible-looking implementation.
- After fixing the endpoint to the real `generateContent` API, ingestion
  still failed with `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` on a correctly
  formatted, freshly issued AI Studio key (`AQ.` prefix, no whitespace or
  encoding issues — verified directly with `JSON.stringify(process.env.GEMINI_API_KEY)`
  to rule out hidden characters).
- Searched for this exact error and found it's a known, unresolved bug on
  Google's side affecting many developers with newly issued `AQ.`-format
  keys since mid-2026, with no confirmed fix in any report — not something
  fixable from this codebase.

**What I changed:**
- Switched the vision pipeline from Gemini Flash (cloud) to a local Ollama
  vision model (`llava`), which the capstone brief explicitly allows as the
  $0 local alternative. Old `geminiClient.js` left in the repo as dead code
  rather than deleted, since it documents a real, defensible debugging path.
- First attempt used `moondream` (smaller/faster model) but it repeatedly
  hallucinated bounding-box coordinate arrays in place of text attributes,
  and truncated JSON output on longer captions. Switched to `llava` instead,
  tightened the prompt to explicitly forbid numeric/coordinate output, added
  a JSON-extraction fallback (strip stray text around a JSON object before
  parsing) and raised `num_predict` to 512 so longer responses don't get cut
  off mid-object.
- Added incremental saving to `ingestImages.js` (write `image-metadata.json`
  after every image, not just once at the end) after realizing the original
  version would silently lose all progress if the job crashed or was
  interrupted near the end of a 40-image run.

**What I changed / verified myself:**
- Confirmed the Gemini auth failure was a platform bug, not my config, by
  checking token length/encoding directly and cross-referencing multiple
  independent community reports of the identical error.
- Manually tested the fixed Ollama client against `animal-gray_wolf-0.jpg` —
  the exact image that previously hallucinated "blue ceramic mug" — to
  confirm the fix actually worked on the specific failure case, not just in
  general.
- Ran the full 40-image batch to completion: 40/40 tagged, 0 failed.
- Noticed all 40 confidence scores clustered tightly between 0.80–0.95, so
  the default `LOW_CONFIDENCE_THRESHOLD = 0.6` would never flag anything —
  failing the brief's requirement that at least one low-confidence result
  gets flagged. Raised the threshold to `0.88` based on the actual observed
  distribution (not guessed), then re-validated the existing 40 results
  against the new threshold directly (no need to re-run vision inference,
  since only the flagging logic changed) — confirmed 2 images now correctly
  flag for review (`animal-dog-0.jpg` at 0.85, `animal-dog-5.jpg` at 0.80).

**What I can explain if asked:**
- Why the switch from Gemini to Ollama happened (real, external auth bug,
  not a workaround for something I didn't understand).
- Why `LOW_CONFIDENCE_THRESHOLD` is 0.88 and not the original 0.6 — tuned
  against this specific model's actual confidence distribution, per the
  brief's own guidance that 0.6 was "a starting guess, not gospel."
- Why the ingest job now writes progress after every image instead of once
  at the end.

---

## Phase 3 — Matching & the guard



---

## Phase 4 — Production layer & eval

## Phase 3 - Matching and guard

- Measured 5 real post-vs-corpus similarity scores before picking SIMILARITY_FLOOR: kitchen-faucet 0.462 (correct reject), salad 0.536 (genuine match), constellations 0.635 (false-positive match against mountain landscape captions), hiking 0.663 (genuine match), architecture 0.782 (genuine match). No single floor separates all 5 correctly - constellations (should reject) scores higher than salad (should accept). Chose 0.65 over 0.55 deliberately: it correctly rejects the constellations false-positive at the cost of also rejecting the salad post as a false negative. This follows the brief's own stated priority - avoiding a wrong match matters more than catching every right one. Documented as a known precision/recall tradeoff, to be quantified properly against the labeled eval set in Phase 4.
