import "dotenv/config";
import fs from "node:fs";
import axios from "axios";
import { CATEGORIES } from "../schemas/imageTag.schema.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const MODEL = process.env.OLLAMA_VISION_MODEL || "llava";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    attributes: { type: "array", items: { type: "string" } },
    caption: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["subject", "category", "attributes", "caption", "confidence"],
};

const PROMPT = `Look at this image and describe what it shows.
Respond with ONLY a JSON object (no markdown, no extra text before or after it) containing:
- subject: the main thing in the image, in a few words (e.g. "red fox")
- category: pick the single best fit from this list: ${CATEGORIES.join(", ")}
- attributes: an array of 3-6 short descriptive WORDS OR PHRASES as plain text,
  e.g. ["orange fur", "forest", "alert"]. NEVER output numbers, coordinates, or
  bounding boxes here — only descriptive text strings.
- caption: one plain sentence describing the image
- confidence: your own 0-1 estimate of how sure you are about this classification.
  Be honest — if the subject is ambiguous or you're guessing, use a lower number.

Output the complete JSON object on one line. Do not truncate it.`;

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 200)}`);
  }
  return text.slice(start, end + 1);
}

export async function classifyImage(filePath) {
  const imageBytes = fs.readFileSync(filePath);
  const base64Image = imageBytes.toString("base64");

  const body = {
    model: MODEL,
    prompt: PROMPT,
    images: [base64Image],
    format: RESPONSE_SCHEMA,
    stream: false,
    options: {
      num_predict: 512,
      temperature: 0.2,
    },
  };

  let res;
  try {
    res = await axios.post(`${OLLAMA_HOST}/api/generate`, body, { timeout: 300000 });
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(`Cannot reach Ollama at ${OLLAMA_HOST}. Is it running? Try: ollama serve`);
    }
    throw err;
  }

  const rawText = res.data.response;
  if (!rawText) {
    throw new Error(`Ollama returned no response text. Full payload: ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  const jsonSlice = extractJsonObject(rawText);

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    throw new Error(`Ollama response was not valid JSON: ${rawText.slice(0, 200)}`);
  }

  return {
    raw: parsed,
    usage: {
      total_input_tokens: res.data.prompt_eval_count ?? 0,
      total_output_tokens: res.data.eval_count ?? 0,
      total_tokens: (res.data.prompt_eval_count ?? 0) + (res.data.eval_count ?? 0),
    },
  };
}
