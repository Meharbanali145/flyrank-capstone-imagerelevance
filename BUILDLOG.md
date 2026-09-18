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



---

## Phase 3 — Matching & the guard



---

## Phase 4 — Production layer & eval


