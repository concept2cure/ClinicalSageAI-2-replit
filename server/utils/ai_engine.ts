import OpenAI from 'openai';

// Kimi AI (Moonshot) Configuration
const kimiClient = process.env.KIMI_API_KEY
  ? new OpenAI({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: 'https://api.moonshot.cn/v1',
    })
  : null;

// OpenAI Backup Configuration
const openAIClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export const generateEmbedding = async (text: string): Promise<number[]> => {
  // Truncate to avoid context limit errors (approx 8k tokens)
  const safeText = text.substring(0, 8000);

  if (kimiClient) {
    try {
      console.log('[AI ENGINE] 🧠 Primary: Requesting Kimi AI...');
      const response = await kimiClient.embeddings.create({
        model: 'gamma-embedding-001',
        input: safeText,
      });
      return response.data[0].embedding;
    } catch (kimiError: any) {
      console.warn('[AI ENGINE] ⚠️ Primary Failed. Engaging Backup (OpenAI)...', kimiError?.message);
    }
  }

  if (openAIClient) {
    try {
      const backupResponse = await openAIClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: safeText,
      });
      return backupResponse.data[0].embedding;
    } catch (openAiError) {
      console.error('[AI ENGINE] ❌ Both Engines Failed.');
      throw new Error('Embedding generation failed on all providers');
    }
  }

  throw new Error('Embedding generation failed on all providers');
};
