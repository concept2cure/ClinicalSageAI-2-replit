import prisma from '../prisma/client.js';
import axios from 'axios';

const EMBED_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

async function embed(text) {
  const { data } = await axios.post(
    EMBED_URL,
    { input: text, model: EMBED_MODEL },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  return data.data[0].embedding; // Float[] length 1536
}

export async function upsertDoc({ objectId, title, text }) {
  const vector = await embed(text.slice(0, 8192));
  return prisma.study_document.upsert({
    where: { objectId },
    update: { title, text, embedding: vector },
    create: { objectId, title, text, embedding: vector },
  });
}

export async function semanticQuery(query, topK = process.env.SEARCH_TOP_K) {
  const qVec = await embed(query);
  // pgvector cosine distance (smaller = closer)
  return prisma.$queryRaw`
    SELECT *, 1 - (embedding <#> ${qVec}::vector) AS score
    FROM study_document
    ORDER BY score DESC
    LIMIT ${Number(topK)};`;
}
