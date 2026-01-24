/**
 * AI Utilities Service
 *
 * This service provides helper functions for AI-powered features
 * using OpenAI's API for natural language processing tasks.
 */

/**
 * Process text with OpenAI
 *
 * @param {string} text - The text to process
 * @param {string} instruction - The instruction for processing
 * @returns {Promise<string>} - The processed text
 */
export async function processWithOpenAI(text, instruction) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: instruction,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error processing with OpenAI:', error);
    return `Error processing with AI: ${error.message}`;
  }
}

/**
 * Process text with OpenAI and get JSON response
 *
 * @param {string} text - The text to process
 * @param {string} instruction - The instruction for processing
 * @param {object} jsonStructure - The expected JSON structure
 * @returns {Promise<object>} - The processed JSON
 */
export async function processWithOpenAIJson(text, instruction, jsonStructure) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured');
      return {
        error: 'OpenAI API key not configured. AI processing unavailable.',
      };
    }

    const jsonInstruction = `${instruction}\n\nRespond with a JSON object that follows this structure: ${JSON.stringify(jsonStructure)}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: jsonInstruction,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error('Error processing with OpenAI JSON:', error);
    return {
      error: `Error processing with AI: ${error.message}`,
    };
  }
}

/**
 * Generate a summary for a document
 *
 * @param {string} text - The document text
 * @param {number} maxLength - Maximum summary length in characters
 * @returns {Promise<string>} - The generated summary
 */
export async function generateDocumentSummary(text, maxLength = 300) {
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;
  const instruction = `You are an AI assistant that specializes in summarizing complex regulatory and medical documents. 
  Generate a clear, concise, and accurate summary of the provided document text.
  The summary should be comprehensive yet brief (${maxLength} characters max).
  Focus on the key points, objectives, and findings.`;

  return processWithOpenAI(truncatedText, instruction);
}

/**
 * Extract keywords from a document
 *
 * @param {string} text - The document text
 * @param {number} count - Number of keywords to extract
 * @returns {Promise<string[]>} - Array of extracted keywords
 */
export async function extractKeywords(text, count = 10) {
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;
  const instruction = `You are an AI assistant that specializes in analyzing regulatory and medical documents.
  Extract the ${count} most important keywords or phrases from the provided document text.
  The keywords should reflect the main topics, technical terms, and significant concepts in the document.
  Respond with a JSON array of keywords.`;

  const jsonStructure = { keywords: ['keyword1', 'keyword2'] };

  const result = await processWithOpenAIJson(truncatedText, instruction, jsonStructure);
  return result.keywords || [];
}

/**
 * Analyze document to identify its type and regulatory context
 *
 * @param {string} text - The document text
 * @param {string} fileName - The document file name
 * @returns {Promise<object>} - Document type and context information
 */
export async function analyzeDocumentType(text, fileName) {
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;
  const instruction = `You are an AI assistant that specializes in regulatory document analysis.
  Analyze the provided document text and file name to determine:
  1. The document type (e.g., CSR, protocol, IND, CTA, etc.)
  2. The regulatory context (FDA, EMA, PMDA, etc.)
  3. The therapeutic area or indication
  4. The document's likely purpose in the regulatory process
  
  Respond with a JSON object containing your analysis.`;

  const jsonStructure = {
    documentType: 'string',
    regulatoryContext: 'string',
    therapeuticArea: 'string',
    purpose: 'string',
  };

  const result = await processWithOpenAIJson(
    truncatedText + '\n\nFile name: ' + fileName,
    instruction,
    jsonStructure
  );
  return result;
}

/**
 * Generate document insights
 *
 * @param {string} text - The document text
 * @returns {Promise<object>} - Generated insights
 */
export async function generateDocumentInsights(text) {
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;
  const instruction = `You are an AI assistant that specializes in providing insights for regulatory and medical documents.
  Analyze the provided document text and provide:
  1. Key findings or conclusions
  2. Potential challenges or issues
  3. Recommendations or next steps
  
  Respond with a JSON object containing your analysis.`;

  const jsonStructure = {
    findings: ['finding1', 'finding2'],
    challenges: ['challenge1', 'challenge2'],
    recommendations: ['recommendation1', 'recommendation2'],
  };

  const result = await processWithOpenAIJson(truncatedText, instruction, jsonStructure);
  return result;
}

/**
 * Generate text embeddings for semantic search
 *
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - Vector embedding of the text
 */
export async function embed(text) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }

    const truncatedText = text.length > 8000 ? text.substring(0, 8000) + '...' : text;

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: truncatedText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error; // No fallbacks - propagate the error to be handled by UI components
  }
}

export default {
  processWithOpenAI,
  processWithOpenAIJson,
  generateDocumentSummary,
  extractKeywords,
  analyzeDocumentType,
  generateDocumentInsights,
  embed,
};
