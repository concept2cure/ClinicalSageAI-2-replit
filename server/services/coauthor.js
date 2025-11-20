/**
 * CoAuthor Service
 *
 * Provides backend services for eCTD Co-Author features:
 * - Context retrieval for regulatory guidelines
 * - Validation of draft content against guidelines
 * - Utility functions for the CoAuthor API endpoints
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Search for relevant context based on the provided terms
 *
 * @param {string} terms - Search query terms for finding relevant regulatory context
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} - Array of context snippets with text and source info
 */
export async function retrieveContext(terms, limit = 5) {
  console.log(`🔎 Searching for context with query: "${terms}"`);

  try {
    // For initial implementation, we'll use OpenAI to simulate the retrieval
    // Later this would be replaced with a proper vector search against documents
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content: `You are an expert in pharmaceutical regulatory guidelines and CTD submissions.
          Based on the user's query, generate ${limit} relevant snippets of guidance that would be found in ICH, FDA, EMA or other regulatory guidelines.
          Each snippet should be something that would authentically appear in official guidance documents.
          
          Format your response as a JSON array where each object has:
          - text: The snippet text (1-3 sentences of actual guidance)
          - source: The source document (e.g., "ICH M4E Guideline", "FDA Guidance for Industry")
          - docId: A realistic document ID (e.g., "ICH-M4E-2016", "FDA-GFI-CTD-2019")
          
          Do not make up regulations that don't exist. Base your response on real guidelines.`,
        },
        {
          role: 'user',
          content: terms,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    // Parse the JSON response
    try {
      const result = JSON.parse(response.choices[0].message.content);
      return result.snippets || [];
    } catch (parseError) {
      console.error('Error parsing context response:', parseError);
      return getDefaultContext(terms);
    }
  } catch (error) {
    console.error('Error retrieving context:', error);
    return getDefaultContext(terms);
  }
}

/**
 * Provides fallback context when the retrieval fails
 */
function getDefaultContext(terms) {
  // Return a few generic but helpful context items related to CTD sections
  return [
    {
      text: 'Section 2.7 should contain a concise critical assessment of the clinical data submitted in the NDA/BLA. The assessment should examine all pertinent data, including unfavorable or inconclusive outcomes, to determine the benefit-risk profile of the drug.',
      source: 'ICH M4E Guideline',
      docId: 'ICH-M4E-2016',
    },
    {
      text: 'Safety data must be presented by appropriate demographic subgroups (e.g., age, sex, race), with careful attention to potential differences in adverse event profiles. Any differences should be discussed in relation to the overall safety profile.',
      source: 'FDA Guidance for Industry',
      docId: 'FDA-GFI-CTD-2019',
    },
    {
      text: 'The Clinical Overview (Module 2.5) should provide a detailed, factual summarization of all clinical findings with references to more detailed information in Module 5. It should not exceed 30 pages in length.',
      source: 'EMA Regulatory Guidelines',
      docId: 'EMA-2023-eCTD',
    },
  ];
}

/**
 * Validates section content against regulatory guidelines
 *
 * @param {string} text - The section content to validate
 * @param {string} moduleId - The CTD module ID
 * @param {string} sectionId - The CTD section ID
 * @returns {Promise<Array>} - Array of validation issues found
 */
export async function validateCompliance(text, moduleId = 'm2', sectionId = '2.7') {
  console.log(`🔍 Validating compliance for ${moduleId}/${sectionId}`);

  if (!text || text.trim().length < 50) {
    return [
      {
        type: 'error',
        message:
          'Section content is too brief for regulatory submission. Detailed information is required.',
        location: 'content-length',
      },
    ];
  }

  try {
    // Use OpenAI to analyze the content for compliance
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content: `You are a regulatory compliance expert specializing in CTD submissions.
          Analyze the provided ${moduleId.toUpperCase()} ${sectionId} content for compliance issues.
          
          Focus on identifying issues such as:
          1. Missing required information or sections
          2. Non-compliant formatting or structure
          3. Scientific or regulatory gaps
          4. Unsupported claims
          5. Inconsistencies with CTD guidelines
          
          Respond with JSON containing an "issues" array. Each issue should have:
          - type: "error" | "warning" | "info"
          - message: Clear explanation of the issue
          - location: Description of where in the document the issue occurs
          
          If no issues are found, return an empty issues array.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    // Parse the response
    try {
      const result = JSON.parse(response.choices[0].message.content);
      return result.issues || [];
    } catch (parseError) {
      console.error('Error parsing validation response:', parseError);
      return basicValidation(text, moduleId, sectionId);
    }
  } catch (error) {
    console.error('Error during validation:', error);
    return basicValidation(text, moduleId, sectionId);
  }
}

/**
 * Basic validation for fallback use
 */
function basicValidation(text, moduleId, sectionId) {
  const issues = [];

  // Check content length
  if (text.length < 300) {
    issues.push({
      type: 'warning',
      message: 'Content appears too brief for a comprehensive regulatory submission.',
      location: 'document-length',
    });
  }

  // Check for standard section headings
  const commonHeadings = ['Introduction', 'Methods', 'Results', 'Discussion', 'Conclusion'];
  const missingHeadings = commonHeadings.filter(
    heading => !text.toLowerCase().includes(heading.toLowerCase())
  );

  if (missingHeadings.length > 2) {
    issues.push({
      type: 'warning',
      message: `Section may be missing standard headings: ${missingHeadings.join(', ')}`,
      location: 'section-structure',
    });
  }

  // Check for references
  if (!text.includes('reference') && !text.includes('study') && text.length > 500) {
    issues.push({
      type: 'warning',
      message:
        'No references to studies or literature detected. Regulatory submissions typically require data substantiation.',
      location: 'references',
    });
  }

  return issues;
}

export default {
  retrieveContext,
  validateCompliance,
};
