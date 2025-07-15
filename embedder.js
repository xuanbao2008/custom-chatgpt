import { OpenAI } from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { detect } from "tinyld";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const COLLECTION = "custom-chatgpt";
const HISTORY_LIMIT = 3;
const FALLBACK_MIN_LENGTH = 30;

const FALLBACK_MSGS = {
  en: "Sorry, I’m not sure yet. I’ll get back to you soon.",
  vi: "Xin lỗi bạn, mình cần check lại chút, sẽ cập nhật lại bạn sau nhé."
};

function getFallback(q) {
  const lang = detect(q) || "en";
  return FALLBACK_MSGS[lang] || FALLBACK_MSGS.en;
}

const sessionHistory = new Map();

export async function ensureCollection() {
  const cols = await qdrant.getCollections();
  if (!cols.collections.some(c => c.name === COLLECTION)) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: 1536, distance: "Cosine" }
    });
  }
}

export async function embedAndStoreChunks(chunks, { source }) {
  const sanitized = chunks.map(c => c?.trim()).filter(Boolean);
  if (!sanitized.length) return;
  const { data: embeddings } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: sanitized
  });
  const points = embeddings.map((e, i) => ({
    id: uuidv4(),
    vector: e.embedding,
    payload: { text: sanitized[i], source }
  }));
  await qdrant.upsert(COLLECTION, { points });
}

export async function embedQueryAndSearch(q) {
  if (!q.trim()) return [];
  const { data: [embed] } = await openai.embeddings.create({
    model: "text-embedding-3-small", input: [q.trim()]
  });
  const resp = await qdrant.search(COLLECTION, {
    vector: embed.embedding,
    limit: 5,
    with_payload: true
  });
  return resp.map(pt => pt.payload.text);
}

export async function answerWithRagAndFallback(sessionId, question) {
  const q = question.trim();
  const history = sessionHistory.get(sessionId) || [];
  const recent = history.slice(-HISTORY_LIMIT * 2);

  const chunks = await embedQueryAndSearch(q);
  console.log("Retrieved chunks count:", chunks.length);

  const messages = recent.map((m, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: m
  }));
  messages.push({ role: "system", content: "You are a helpful assistant." });

  if (chunks.length) {
    messages.push({
      role: "user",
      content:
        "Use the following documents to help answer the question. " +
        "If not enough, use your general knowledge as well.\n\n" +
        chunks.join("\n\n") +
        `\n\nQuestion: ${q}`
    });    
  } else {
    messages.push({ role: "user", content: q });
  }

  const res = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
    temperature: 0.7,
    max_tokens: 512
  });
  const reply = res.choices[0]?.message?.content.trim() || "";

  let answer, source;
  if (chunks.length) {
    answer = reply;
    source = "rag";
  } else {
    if (!reply || reply.length < FALLBACK_MIN_LENGTH) {
      answer = getFallback(q);
      source = "fallback";
    } else {
      answer = reply;
      source = "gpt";
    }
  }

  sessionHistory.set(sessionId, [...recent, q, answer].slice(-HISTORY_LIMIT * 2));
  return { answer, source };
}
