import "dotenv/config";
import axios from "axios";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

// nomic-embed-text is trained asymmetrically: queries and the documents
// they're searched against need different task prefixes to land in a
// properly comparable space. Skipping this silently degrades similarity
// quality without erroring - it just produces noisier scores.
const PREFIXES = {
  query: "search_query: ",
  document: "search_document: ",
};

/**
 * taskType: "query" for post text being searched with, "document" for
 * image captions/subjects being searched against. Required for
 * nomic-embed-text to produce well-calibrated similarity scores.
 */
export async function embedText(text, taskType = "document") {
  if (!text || !text.trim()) {
    throw new Error("embedText called with empty text");
  }
  const prefix = PREFIXES[taskType];
  if (!prefix) {
    throw new Error(`Unknown taskType "${taskType}", expected "query" or "document"`);
  }

  let res;
  try {
    res = await axios.post(`${OLLAMA_HOST}/api/embeddings`, {
      model: EMBED_MODEL,
      prompt: prefix + text,
    }, { timeout: 60000 });
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(`Cannot reach Ollama at ${OLLAMA_HOST}. Is it running?`);
    }
    throw err;
  }

  const embedding = res.data.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Ollama returned no embedding. Payload: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return embedding;
}

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
