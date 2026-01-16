import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const Refinery = {
  /**
   * Enterprise AI Extraction
   * Uses GPT-4-Turbo to extract structured intelligence from raw regulatory text.
   */
  async extractDeficiency(
    sourceText: string,
    context: 'SEC_FILING' | 'FDA_WARNING' | 'CSR_NARRATIVE'
  ) {
    if (!sourceText || sourceText.length < 20) return null;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a Senior Regulatory Affairs Officer.
OUTPUT JSON ONLY:
{
  "insight": "Concise summary of the deficiency or finding.",
  "tags": ["Keywords"],
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "confidence": 0.0 to 1.0
}`,
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nRaw Text:\n${sourceText.substring(0, 8000)}`,
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.insight ? result : null;
    } catch (error) {
      console.error(`[Refinery] AI Failed: ${error}`);
      return null;
    }
  },
};
