/**
 * Kimi AI Service (Moonshot AI)
 * 
 * Chinese AI provider using moonshot.cn API.
 * Uses OpenAI-compatible SDK with custom base URL.
 * 
 * @module server/services/kimiAIService
 * @version 1.0.0
 * @since 2025-01-14
 * 
 * Previously named: openaiService.js (INCORRECT - this was never OpenAI)
 * Actual Provider: Kimi AI / Moonshot (https://www.moonshot.cn)
 * API Base: https://api.moonshot.cn/v1
 * 
 * Environment Variables Required:
 * - KIMI_API_KEY: API key from moonshot.cn
 * - KIMI_MODEL: Model name (default: moonshot-v1-32k)
 * - KIMI_BASE_URL: API endpoint (default: https://api.moonshot.cn/v1)
 */

import OpenAI from 'openai';

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-32k';

/**
 * Kimi AI Service for regulatory document analysis and content generation.
 * Uses Moonshot AI (Chinese AI provider) via OpenAI-compatible SDK.
 */
class KimiAIService {
  constructor() {
    const apiKey = process.env.KIMI_API_KEY;
    this.isAvailable = !!apiKey;
    this.provider = 'kimi';
    this.providerName = 'Moonshot AI (Kimi)';
    
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: KIMI_BASE_URL,
      });
    } else {
      this.client = null;
      console.warn('[KimiAIService] KIMI_API_KEY not set - service disabled');
    }
  }

  /**
   * Get service status and provider information
   */
  getStatus() {
    return {
      provider: this.provider,
      providerName: this.providerName,
      isAvailable: this.isAvailable,
      baseUrl: KIMI_BASE_URL,
      model: process.env.KIMI_MODEL || KIMI_DEFAULT_MODEL
    };
  }

  /**
   * Analyze regulatory document for compliance issues
   * @param {string} text - Document text to analyze
   * @param {string} documentType - Type of document (CMC, CER, IND, etc.)
   * @returns {Promise<Object>} Analysis results with suggestions and scores
   */
  async analyzeRegulatoryDocument(text, documentType = 'CMC') {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || KIMI_DEFAULT_MODEL,
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
      console.error('[KimiAIService] Analysis error:', error);
      throw error;
    }
  }

  /**
   * Generate regulatory content based on prompt
   * @param {string} prompt - Generation prompt
   * @param {string} documentType - Type of document
   * @param {Object} requirements - Additional requirements
   * @returns {Promise<string>} Generated content
   */
  async generateRegulatoryContent(prompt, documentType = 'CMC', requirements = {}) {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || KIMI_DEFAULT_MODEL,
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
      console.error('[KimiAIService] Content generation error:', error);
      throw error;
    }
  }

  /**
   * Enhance existing regulatory text with improvements
   * @param {string} text - Text to enhance
   * @param {string[]} improvements - List of improvements to apply
   * @returns {Promise<string>} Enhanced text
   */
  async enhanceRegulatoryText(text, improvements = []) {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.KIMI_MODEL || KIMI_DEFAULT_MODEL,
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
      console.error('[KimiAIService] Text enhancement error:', error);
      throw error;
    }
  }

  /**
   * Generic chat completion for flexible use
   * @param {Array} messages - Chat messages array
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Response content
   */
  async chat(messages, options = {}) {
    if (!this.isAvailable) {
      throw new Error('Kimi AI API key not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || process.env.KIMI_MODEL || KIMI_DEFAULT_MODEL,
        messages,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.3,
        ...(options.responseFormat && { response_format: options.responseFormat })
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('[KimiAIService] Chat error:', error);
      throw error;
    }
  }
}

// Singleton instance
const kimiAIService = new KimiAIService();

export default kimiAIService;
export { KimiAIService };
