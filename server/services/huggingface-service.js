/**
 * Hugging Face Service for Concept2Cure
 * Handles interactions with Hugging Face API for embeddings and text generation
 */

import axios from 'axios';

export class HuggingFaceService {
  constructor() {
    this.apiKey = process.env.HF_API_KEY;

    if (!this.apiKey) {
      console.warn(
        'HF_API_KEY environment variable is not set. Hugging Face API requests will fail.'
      );
    }

    // Embedding model for semantic search
    this.embeddingModel = 'intfloat/e5-large-v2';

    // Text generation model for analysis
    this.textGenerationModel = 'meta-llama/Llama-2-70b-chat-hf';

    // Base URL for Hugging Face API
    this.apiUrl = 'https://api-inference.huggingface.co/models/';

    // Cache for embeddings to avoid recalculating
    this.embeddingCache = new Map();
  }

  /**
   * Get text embedding from Hugging Face
   * @param {string} text - Text to get embedding for
   * @returns {Promise<number[]>} - Embedding vector
   */
  async getTextEmbedding(text) {
    try {
      // Check cache first
      const cacheKey = text.substring(0, 100); // Use first 100 chars as key to avoid memory issues
      if (this.embeddingCache.has(cacheKey)) {
        return this.embeddingCache.get(cacheKey);
      }

      const response = await axios.post(
        `${this.apiUrl}${this.embeddingModel}`,
        {
          inputs: text,
          options: {
            wait_for_model: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // For E5 models, return the pooled sentence embedding
      const embedding = response.data[0].embedding;

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      console.error('Error getting text embedding from Hugging Face:', error.message);

      // If specific error details are available, log them
      if (error.response && error.response.data) {
        console.error('Hugging Face API error details:', error.response.data);
      }

      return null;
    }
  }

  /**
   * Generate study analysis based on conversation
   * @param {Array} conversation - Array of conversation messages
   * @returns {Promise<string>} - Generated analysis
   */
  async generateStudyAnalysis(conversation) {
    try {
      // Format conversation for the LLM
      const formattedMessages = this._formatConversationForHuggingFace(conversation);

      const response = await axios.post(
        `${this.apiUrl}${this.textGenerationModel}`,
        {
          inputs: formattedMessages,
          parameters: {
            max_new_tokens: 800,
            temperature: 0.7,
            top_p: 0.9,
            do_sample: true,
            return_full_text: false,
          },
          options: {
            wait_for_model: true,
            use_cache: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Parse and return the generated text
      if (response.data && response.data.generated_text) {
        return response.data.generated_text.trim();
      }

      // For models that return an array of results
      if (Array.isArray(response.data) && response.data[0] && response.data[0].generated_text) {
        return response.data[0].generated_text.trim();
      }

      throw new Error('Unexpected response format from Hugging Face API');
    } catch (error) {
      console.error('Error generating analysis from Hugging Face:', error.message);

      // If specific error details are available, log them
      if (error.response && error.response.data) {
        console.error('Hugging Face API error details:', error.response.data);
      }

      // Fallback to a basic response
      return "I'm sorry, I encountered an error while generating the analysis. Please try again later.";
    }
  }

  /**
   * Format conversation messages for Hugging Face API
   * @param {Array} conversation - Array of conversation messages
   * @returns {string} - Formatted conversation
   */
  _formatConversationForHuggingFace(conversation) {
    // Different models have different formats, adjust as needed
    let formattedMessages = '';

    // Start with any system message
    const systemMessage = conversation.find(msg => msg.role === 'system');
    if (systemMessage) {
      formattedMessages += `<s>[INST] <<SYS>>\n${systemMessage.content}\n<</SYS>>\n\n`;
    } else {
      formattedMessages += `<s>[INST] `;
    }

    // Add the rest of the conversation
    const userMessages = conversation.filter(msg => msg.role !== 'system');

    userMessages.forEach((message, index) => {
      if (message.role === 'user') {
        if (index > 0 && formattedMessages.endsWith('</s>')) {
          formattedMessages += `<s>[INST] ${message.content} [/INST]`;
        } else {
          formattedMessages += `${message.content} [/INST]`;
        }
      } else if (message.role === 'assistant') {
        formattedMessages += ` ${message.content} </s>`;
      }
    });

    // Ensure the conversation ends with a user message for the model to respond to
    if (!formattedMessages.endsWith('[/INST]')) {
      formattedMessages += ' [/INST]';
    }

    return formattedMessages;
  }
}

export default HuggingFaceService;
