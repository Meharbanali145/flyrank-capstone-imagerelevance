import "dotenv/config";
import axios from "axios";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

/**
 * Returns a numeric embedding vector for a piece of text, using a local
 * Ollama embedding model. Used for both image captions/tags and post
 * content, so they land in the same vector space and are comparable.
 */
export async function embedText(text) {
  if (!text || !text.trim()) {
    throw new Error("embedText called with empty text");
  }

  let res;
  try {
    res = await axios.post(`${OLLAMA_HOST}/api/embeddings`, {
      model: EMBED_MODEL,
      prompt: text,
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

/**
 * Cosine similarity between two equal-length vectors. Returns a value
 * in [-1, 1]; for embeddings in practice this is almost always [0, 1].
 */
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
