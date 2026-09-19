import "dotenv/config";
import fs from "node:fs";
import axios from "axios";
import { CATEGORIES } from "../schemas/imageTag.schema.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
Respond with:
- subject: the main thing in the image, in a few words (e.g. "red fox")
- category: pick the single best fit from the allowed list
- attributes: 3-6 short descriptive words or phrases (color, setting, mood, etc.)
- caption: one plain sentence describing the image
- confidence: your own 0-1 estimate of how sure you are about this classification.
  Be honest — if the subject is ambiguous or you're guessing, use a lower number.
  Do not default to a high confidence just because you produced an answer.`;

function guessMimeType(filePath) {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function classifyImage(filePath) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Missing GEMINI_API_KEY. Get a free key (no card) at https://aistudio.google.com/apikey"
    );
  }

  const imageBytes = fs.readFileSync(filePath);
  const base64Image = imageBytes.toString("base64");
  const mimeType = guessMimeType(filePath);

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const res = await axios.post(ENDPOINT, body, {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    timeout: 30000,
  });

  const candidate = res.data.candidates?.[0];
  const rawText = candidate?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error(
      `Gemini returned no text. finishReason: ${candidate?.finishReason ?? "unknown"}. Full response: ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${rawText.slice(0, 200)}`);
  }

  const um = res.data.usageMetadata ?? {};

  return {
    raw: parsed,
    usage: {
      total_input_tokens: um.promptTokenCount ?? 0,
      total_output_tokens: um.candidatesTokenCount ?? 0,
      total_tokens: um.totalTokenCount ?? 0,
    },
  };
}
