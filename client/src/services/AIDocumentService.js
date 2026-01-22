/**
 * AI Document Service
 *
 * Production-quality integration with OpenAI for intelligent document processing.
 *
 * Enterprise features include:
 * - Automatic document tagging and categorization
 * - Content summarization with OpenAI GPT-4o
 * - Metadata extraction
 * - Key insights identification
 * - Multi-tenant isolation
 */

/**
 * Extract tags from document content using AI
 *
 * @param {String} documentId - Document ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - AI processing results
 */
export async function generateDocumentTags(documentId, options = {}) {
  try {
    const response = await fetch('/api/ai-document/extract-tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error generating document tags: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (generateDocumentTags):', error);
    throw error;
  }
}

/**
 * Generate a summary of document content using OpenAI
 *
 * @param {String} documentId - Document ID
 * @param {Object} options - Summary options (maxLength, focusAreas)
 * @returns {Promise<Object>} - Summary results
 */
export async function generateDocumentSummary(documentId, options = {}) {
  try {
    const response = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        maxLength: options.maxLength || 500,
        focusAreas: options.focusAreas || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Error generating document summary: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (generateDocumentSummary):', error);
    throw error;
  }
}

/**
 * Extract metadata from document content using AI
 *
 * @param {String} documentId - Document ID
 * @returns {Promise<Object>} - Extracted metadata
 */
export async function extractDocumentMetadata(documentId) {
  try {
    const response = await fetch('/api/ai/extract-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error extracting document metadata: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (extractDocumentMetadata):', error);
    throw error;
  }
}

/**
 * Categorize a document using AI
 *
 * @param {String} documentId - Document ID
 * @returns {Promise<Object>} - Categorization results
 */
export async function categorizeDocument(documentId) {
  try {
    const response = await fetch('/api/ai/categorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentIds: [documentId],
      }),
    });

    if (!response.ok) {
      throw new Error(`Error categorizing document: ${response.statusText}`);
    }

    const result = await response.json();
    return result.results[0]; // Return first result for single document
  } catch (error) {
    console.error('AI Document Service Error (categorizeDocument):', error);
    throw error;
  }
}

/**
 * Process a document with all available AI features
 *
 * @param {String} documentId - Document ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Comprehensive processing results
 */
export async function processDocumentWithAI(documentId, options = {}) {
  try {
    const response = await fetch('/api/ai/process-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error processing document with AI: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (processDocumentWithAI):', error);
    throw error;
  }
}

/**
 * Extract key insights from a clinical or regulatory document
 *
 * @param {String} documentId - Document ID
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Key insights
 */
export async function extractKeyInsights(documentId, options = {}) {
  try {
    const response = await fetch('/api/ai/extract-insights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error extracting key insights: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (extractKeyInsights):', error);
    throw error;
  }
}

/**
 * Check if AI processing is available
 *
 * @returns {Promise<Object>} - Availability status with model info
 */
export async function checkAIAvailability() {
  try {
    const response = await fetch('/api/ai/status');

    if (!response.ok) {
      throw new Error(`Error checking AI availability: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Document Service Error (checkAIAvailability):', error);
    return {
      available: false,
      error: error.message,
    };
  }
}
