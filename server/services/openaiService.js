import OpenAI from 'openai';

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';

class OpenAIService {
  constructor() {
    const apiKey = process.env.KIMI_API_KEY;
    this.isAvailable = !!apiKey;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: KIMI_BASE_URL,
        })
      : null;
  }

  async analyzeRegulatoryDocument(text, documentType = 'CMC') {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || 'moonshot-v1-32k',
        messages: [
          {
            role: 'system',
            content: `You are a regulatory affairs expert specializing in ${documentType} documentation. Analyze the provided text for:
            1. FDA compliance issues
            2. ICH guideline adherence
            3. EMA requirements
            4. Missing required elements
            5. Terminology accuracy
            6. Structure and format compliance
            
            Provide specific, actionable suggestions with regulatory citations. Return response in JSON format with:
            - suggestions: array of objects with {type, severity, text, suggestion, guideline, action}
            - overallScore: number (0-100)
            - complianceAreas: object with FDA, ICH, EMA scores`,
          },
          {
            role: 'user',
            content: `Analyze this ${documentType} document text:\n\n${text}`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.1,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Kimi AI analysis error:', error);
      throw error;
    }
  }

  async generateRegulatoryContent(prompt, documentType = 'CMC', requirements = {}) {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || 'moonshot-v1-32k',
        messages: [
          {
            role: 'system',
            content: `You are an expert regulatory writer specializing in ${documentType} documentation. 
            Generate professional, compliant content following FDA, ICH, and EMA guidelines.
            Requirements: ${JSON.stringify(requirements)}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Kimi AI content generation error:', error);
      throw error;
    }
  }

  async enhanceRegulatoryText(text, improvements = []) {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || 'moonshot-v1-32k',
        messages: [
          {
            role: 'system',
            content: `You are a regulatory writing expert. Enhance the provided text by addressing these improvements: ${improvements.join(', ')}. 
            Maintain regulatory compliance and professional tone. Return only the enhanced text.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Kimi AI text enhancement error:', error);
      throw error;
    }
  }
}

export default new OpenAIService();
