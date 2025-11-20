import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Generate a summary of document content
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} Summary text
 */
export async function generateSummary(buffer, contentType) {
  if (!openai) {
    console.warn('OpenAI API key not configured. AI summaries disabled.');
    return 'AI summary not available. Please configure OPENAI_API_KEY.';
  }

  try {
    // For POC, we'll just use a portion of the file as text
    // In production, you'd want to use proper extraction based on file type
    // (e.g., pdf-parse for PDFs, docx parser for Word docs)
    const textSample = buffer.toString('utf-8', 0, 3000).replace(/[^\x20-\x7E\n\r\t]/g, ''); // Remove non-ASCII chars

    const prompt = `
      Summarize the following document excerpt in 3-4 sentences. Focus on the most important clinical or regulatory information:
      
      ${textSample}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional medical writer specializing in clinical trial documentation. Generate concise, accurate summaries focusing on the most relevant clinical information.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating document summary:', error);
    return 'Error generating AI summary. Please try again later.';
  }
}

/**
 * Auto-tag a document based on its content
 *
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<string[]>} Array of tags
 */
export async function autoTag(buffer) {
  if (!openai) {
    console.warn('OpenAI API key not configured. AI tagging disabled.');
    return ['document'];
  }

  try {
    // For POC, we'll just use a portion of the file
    const textSample = buffer.toString('utf-8', 0, 5000).replace(/[^\x20-\x7E\n\r\t]/g, ''); // Remove non-ASCII chars

    const prompt = `
      Extract 5 relevant document tags from the following content. 
      Focus on clinical trial aspects like trial ID, phase, therapeutic area, document type, etc.
      Return only a JSON array of tag strings. For example: ["Phase 2", "oncology", "protocol", "NCT12345678", "draft"]
      
      ${textSample}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a document classification specialist for clinical trial documentation. Generate precise metadata tags.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 100,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    try {
      // Parse and extract tags from the JSON response
      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.tags || parsed) ? parsed.tags || parsed : ['document'];
    } catch (parseError) {
      console.error('Error parsing AI tags:', parseError);
      return ['document', 'auto-tagged'];
    }
  } catch (error) {
    console.error('Error auto-tagging document:', error);
    return ['document'];
  }
}

/**
 * Check if OpenAI service is available and configured
 *
 * @returns {boolean} Whether OpenAI service is available
 */
export function isAiAvailable() {
  return !!openai;
}

/**
 * Suggest next steps for missing eCTD modules
 *
 * @param {string[]} missingArray - Array of missing module names
 * @param {string} region - Regulatory region (e.g., 'US', 'EU')
 * @returns {Promise<string>} Suggestion text
 */
export async function suggestMissing(missingArray, region) {
  if (!openai) {
    console.warn('OpenAI API key not configured. AI suggestions disabled.');
    return 'AI suggestions not available. Please configure OPENAI_API_KEY.';
  }

  try {
    const msg = missingArray.join(', ');
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a regulatory submissions assistant.' },
        {
          role: 'user',
          content: `We are preparing an eCTD for region ${region}. Missing modules: ${msg}. Suggest next actions in one sentence.`,
        },
      ],
      max_tokens: 50,
    });
    return resp.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating suggestions for missing modules:', error);
    return 'Consider adding documents to the missing modules based on regulatory requirements.';
  }
}

/**
 * Analyze promotional materials for unsupported claims
 *
 * @param {string} fileUrl - URL of the promotional file
 * @returns {Promise<Array>} Array of claim objects with text, supported status, and reference suggestions
 */
export async function checkClaimsAI(fileUrl) {
  if (!openai) {
    console.warn('OpenAI API key not configured. AI claim checking disabled.');
    return [
      {
        text: 'AI claim analysis not available',
        supported: false,
        referenceSuggestion: 'Configure OPENAI_API_KEY',
      },
    ];
  }

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You review pharmaceutical promotional claims. For each claim, say if it needs reference or is unsupported.',
        },
        {
          role: 'user',
          content: `Analyze promo from url: ${fileUrl}. Return array JSON: [{text, supported, referenceSuggestion}].`,
        },
      ],
      max_tokens: 300,
    });

    try {
      return JSON.parse(resp.choices[0].message.content);
    } catch (parseError) {
      console.error('Error parsing AI claim analysis:', parseError);
      return [
        {
          text: 'Failed to parse claim analysis',
          supported: false,
          referenceSuggestion: 'Check promotional content manually',
        },
      ];
    }
  } catch (error) {
    console.error('Error analyzing claims:', error);
    return [
      {
        text: 'Error during AI claim analysis',
        supported: false,
        referenceSuggestion: 'System error; try again later',
      },
    ];
  }
}
