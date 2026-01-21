import OpenAI from 'openai';

export type EmbeddingProvider = 'kimi' | 'openai';

export interface EmbeddingResult {
  vector: number[];
  provider: EmbeddingProvider;
  model: string;
}

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const KIMI_EMBEDDING_MODEL = process.env.KIMI_EMBEDDING_MODEL || 'text-embedding-3-small';
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

const kimiClient = process.env.KIMI_API_KEY
  ? new OpenAI({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: KIMI_BASE_URL,
    })
  : null;

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    })
  : null;

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY);
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (kimiClient) {
    try {
      const response = await kimiClient.embeddings.create({
        model: KIMI_EMBEDDING_MODEL,
        input: text,
      });
      const vector = response.data[0]?.embedding;
      if (!vector) {
        throw new Error('Kimi embedding generation failed');
      }
      return { vector, provider: 'kimi', model: KIMI_EMBEDDING_MODEL };
    } catch (error) {
      console.warn('[EMBEDDINGS] Kimi embedding failed, falling back to OpenAI.', error);
    }
  }

  if (openaiClient) {
    const response = await openaiClient.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!vector) {
      throw new Error('OpenAI embedding generation failed');
    }
    return { vector, provider: 'openai', model: OPENAI_EMBEDDING_MODEL };
  }

  throw new Error('No embedding providers available');
}
