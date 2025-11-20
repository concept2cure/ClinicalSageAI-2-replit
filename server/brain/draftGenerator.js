/**
 * Draft Generator Service
 *
 * This module provides functionality to generate regulatory document section drafts
 * using AI and any relevant context retrieved from the vault.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieveContext } from './vaultRetriever.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METADATA_DIR = path.join(__dirname, '../data/section-metadata');

// Simple in-memory cache for module section metadata
const sectionMetadataCache = {};

/**
 * Load metadata for a module section
 */
async function loadSectionMetadata(moduleId, sectionId) {
  const cacheKey = `${moduleId}-${sectionId}`;

  if (sectionMetadataCache[cacheKey]) {
    return sectionMetadataCache[cacheKey];
  }

  try {
    const metadataPath = path.join(METADATA_DIR, `${moduleId}-metadata.json`);
    const moduleMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    const sectionMetadata = moduleMetadata.sections?.find(s => s.id === sectionId);

    if (!sectionMetadata) {
      throw new Error(`Section ${sectionId} not found in module ${moduleId}`);
    }

    sectionMetadataCache[cacheKey] = sectionMetadata;
    return sectionMetadata;
  } catch (err) {
    console.warn(
      `Could not load metadata for section ${sectionId} in module ${moduleId}:`,
      err.message
    );

    // Return default metadata if file can't be loaded
    return {
      id: sectionId,
      title: 'Unknown Section',
      description: 'No metadata available',
      regulatoryGuidance: [],
    };
  }
}

/**
 * Build a prompt for draft generation
 */
function buildDraftPrompt(metadata, currentContent, contextChunks, query) {
  // Basic guidelines for all regulatory documents
  const basicGuidelines = [
    'Write in clear, concise, professional regulatory language',
    'Focus on factual, evidence-based statements',
    'Avoid using first person or colloquial language',
    'Use proper technical terminology for regulatory submissions',
    'Maintain consistent formatting and structure',
  ].join('\n- ');

  // Build context section from retrieved chunks
  let contextText = '';
  if (contextChunks && contextChunks.length) {
    contextText =
      'RELEVANT CONTEXT:\n\n' +
      contextChunks
        .map(chunk => `--- From document ${chunk.docId || 'unknown'} ---\n${chunk.text}`)
        .join('\n\n');
  }

  // Build regulatory guidance section
  let guidanceText = '';
  if (metadata.regulatoryGuidance && metadata.regulatoryGuidance.length) {
    guidanceText =
      'REGULATORY GUIDANCE:\n\n' + metadata.regulatoryGuidance.map(g => `- ${g}`).join('\n');
  }

  // Build prompt
  return `
You are an expert regulatory writer helping to draft a section for a regulatory submission.

SECTION DETAILS:
- Title: ${metadata.title || 'Unknown Section'}
- Description: ${metadata.description || 'No description available'}

TASK:
Generate professional regulatory content for this section that is compliant with ICH and FDA expectations.

WRITING GUIDELINES:
- ${basicGuidelines}

${guidanceText ? guidanceText + '\n\n' : ''}
${contextText ? contextText + '\n\n' : ''}
${currentContent ? 'CURRENT DRAFT (expand and improve this content):\n\n' + currentContent + '\n\n' : ''}
${query ? 'SPECIFIC FOCUS: ' + query : ''}

Please generate a well-structured draft for this section with appropriate headings, paragraphs, and formatting.
`;
}

/**
 * Generate a draft for a section
 */
export async function generateDraft({
  moduleId,
  sectionId,
  currentContent = '',
  contextIds = [],
  query = '',
}) {
  try {
    // Load section metadata
    const metadata = await loadSectionMetadata(moduleId, sectionId);

    // Get context chunks if IDs are provided
    let contextChunks = [];
    if (contextIds && contextIds.length > 0) {
      // In a real implementation, we would retrieve these chunks from storage
      // For now, just use the retrieval function directly if query is provided
      if (query) {
        contextChunks = await retrieveContext(query, contextIds.length);
      }
    }

    // For testing without OpenAI, return mock draft
    if (process.env.NODE_ENV === 'test' || !process.env.OPENAI_API_KEY) {
      return generateMockDraft(metadata, currentContent, contextChunks);
    }

    // Build the prompt
    const prompt = buildDraftPrompt(metadata, currentContent, contextChunks, query);

    // TODO: In production, call OpenAI API here with the prompt
    // For now, just return the mock draft
    return generateMockDraft(metadata, currentContent, contextChunks);
  } catch (err) {
    console.error('Error generating draft:', err);
    throw new Error(`Failed to generate draft: ${err.message}`);
  }
}

/**
 * Generate a mock draft for testing
 */
function generateMockDraft(metadata, currentContent, contextChunks) {
  const title = metadata.title || 'Unknown Section';

  // Start with any existing content
  let draft = currentContent || '';

  // If no content, create a basic structure
  if (!draft.trim()) {
    draft = `# ${title}\n\n`;

    // Add a brief introduction
    draft += `## Introduction\n\nThis section provides information about ${title.toLowerCase()} in accordance with regulatory guidelines and submission requirements.\n\n`;

    // Add content based on context chunks if available
    if (contextChunks && contextChunks.length) {
      draft += `## Key Information\n\n`;

      // Include some context from the retrieved chunks
      contextChunks.forEach(chunk => {
        if (chunk.text && chunk.text.length > 100) {
          draft += chunk.text.substring(0, 100) + '...\n\n';
        }
      });
    } else {
      draft += `## Summary\n\nDetailed information for this section will be provided based on regulatory requirements and available data.\n\n`;
    }

    // Add a conclusion
    draft += `## Conclusion\n\nThe ${title.toLowerCase()} has been prepared in accordance with relevant guidelines and contains all necessary information to support the submission.`;
  } else {
    // If content exists, enhance it with a new section
    draft += `\n\n## Additional Considerations\n\nFurther information has been included to address all regulatory requirements related to ${title.toLowerCase()}.`;

    // Add context from chunks if available
    if (contextChunks && contextChunks.length) {
      draft += `\n\nBased on regulatory precedent and guidance:\n\n`;

      // Include some context from the retrieved chunks
      contextChunks.slice(0, 2).forEach(chunk => {
        if (chunk.text && chunk.text.length > 100) {
          draft += '- ' + chunk.text.substring(0, 100) + '...\n';
        }
      });
    }
  }

  return draft;
}

export default {
  generateDraft,
};
