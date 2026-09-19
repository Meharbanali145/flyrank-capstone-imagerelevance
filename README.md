\# FlyRank Capstone — AI Image Understanding \& Content Matching Engine



Matches blog posts to the right image from a small corpus using vision

tagging + semantic embeddings, with a mismatch guard that refuses bad

pairings instead of guessing.



\## What it does



1\. Downloads a 40-image corpus from Pexels across 5 categories, including

&#x20;  a deliberate fox/wolf/dog confusable set.

2\. Tags every image with a local vision model (structured JSON, schema-validated).

3\. Embeds image captions/subjects and post text into a shared vector space.

4\. Ranks candidate images by semantic similarity to a post.

5\. Runs every candidate through a mismatch guard (similarity floor →

&#x20;  category hard-reject → same-category subject check) before ever

&#x20;  suggesting it.

6\. Persists posts, suggestions, and human review decisions in SQLite.

7\. Exposes everything through a small Express API — no frontend required.



\## Architecture



\## Stack



\- Node.js + Express

\- Ollama, fully local: `llava` (vision), `nomic-embed-text` (embeddings) — no API key, $0

\- SQLite via `better-sqlite3` — real tables, indexes, foreign keys

\- Zod for schema validation



\## Run it



```bash

npm install

```



Install Ollama (https://ollama.com/download/windows) and pull the two models used:

```bash

ollama pull llava

ollama pull nomic-embed-text

```



Copy `.env.example` to `.env` and fill in a Pexels key (free, no card, from https://www.pexels.com/api/). Ollama variables can be left at their defaults.



\## Seed the corpus (run once, in order)



```bash

npm run fetch-corpus      # downloads 40 images from Pexels

npm run ingest            # tags every image with the local vision model (\~several minutes)

npm run embed-images      # embeds captions/subjects (fast, text-only)

npm run migrate-db        # loads everything into SQLite

```



\## Run the server



```bash

npm run dev

```

Server runs at `http://localhost:3000`.



\## Run the eval



```bash

npm run eval

```

Measures top-1 precision against a 12-post hand-labeled set (`eval/posts.json`).



\*\*Current result: 91.7% top-1 precision (11/12).\*\*



\## API endpoints



\- `POST /posts/match` — `{ text }` → ranks + guards, returns decision, persists post+suggestion

\- `POST /posts/match/force` — `{ text, candidateFile }` → forces the guard to evaluate a specific image (used to test the mismatch guard directly, e.g. forcing a wolf image onto a fox post)

\- `GET /images` — lists all tagged images

\- `GET /suggestions` — every match decision ever made, most recent first

\- `POST /reviews` — `{ postText, candidateFile, decision: "approve"|"reject", reviewer?, note? }`

\- `GET /reviews` — every review decision, most recent first

\- `GET /health`



\## Known limitations



\- \*\*One eval miss (constellations/night-sky post):\*\* the 40-image, 5-category corpus has no astronomy category, so this post drifts toward the closest visual analog (mountain landscapes) and gets wrongly accepted. Documented, not silently hidden — a real corpus-scope limitation, not a guard defect.

\- \*\*Gemini Flash (cloud) was replaced with local Ollama\*\* after hitting a confirmed, unresolved Google-side auth bug (`401 ACCESS\_TOKEN\_TYPE\_UNSUPPORTED` on newly-issued `AQ.`-format API keys, affecting many developers, no fix found as of this writing). `geminiClient.js` is kept in the repo as a documented dead path. See `BUILDLOG.md` for full details.

\- \*\*Bare subject-word embeddings (e.g. "wolf", "dog") don't reliably discriminate species\*\* — measured wolf-vs-dog subject similarity (0.816) actually higher than fox-vs-wolf (0.715). The mismatch guard uses full caption embeddings instead, which measured a clean, usable gap (same-species \~0.90, cross-species 0.63–0.72).

\- Single vision model (`llava`) and single embedding model (`nomic-embed-text`) — no model comparison was done (out of scope per the brief).

