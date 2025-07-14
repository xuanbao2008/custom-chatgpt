import { OpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});
const COLLECTION = 'custom-chatgpt';

async function ensureCollection() {
  const cols = await qdrant.getCollections();
  if (!cols.collections.some(c => c.name === COLLECTION)) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: 1536, distance: 'Cosine' }
    });
    console.log(`Created Qdrant collection: ${COLLECTION}`);
  } else {
    console.log(`Qdrant collection "${COLLECTION}" already exists`);
  }
}

await ensureCollection();

export async function embedAndStoreChunks(chunks, { source }) {
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks
  });

  const points = embeddingRes.data.map((e, i) => ({
    id: uuidv4(),
    vector: e.embedding,
    payload: { text: chunks[i], source }
  }));

  await qdrant.upsert(COLLECTION, { points });
  console.log(`Stored ${points.length} chunk(s) with UUIDs in Qdrant`);
}

export async function embedQueryAndSearch(question, topK = 5) {
  const queryRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: [question]
  });

  const search = await qdrant.search(COLLECTION, {
    vector: queryRes.data[0].embedding,
    limit: topK,
    with_payload: true
  });

  return search.map(m => m.payload.text);
}

export async function answerWithGPT(question, contextChunks) {
  const context = contextChunks.join('\n\n');
  const prompt = `Use the following context to answer the question:\n\nContext:\n${context}\n\nQuestion: ${question}`;

  const chatRes = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  });

  return chatRes.choices[0].message.content;
}
