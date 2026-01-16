import OpenAI from 'openai';
import { CSRValidator } from './validator.js';

export class LLMStructuredExtractor {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async extractFullPayload(text: string, context: string) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a Clinical Data Miner. Extract EXACT JSON matching the DeepCSRData schema.',
        },
        {
          role: 'user',
          content: `CONTEXT: ${context}\n\nTEXT:\n${text.substring(0, 25000)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const data = JSON.parse(completion.choices[0].message.content || '{}');
    const validation = new CSRValidator().validate(data);

    data._extractionMetadata = {
      confidenceScore: validation.score,
      missingSections: validation.errors.map(err => err.path.join('.')),
    };

    return data;
  }
}
