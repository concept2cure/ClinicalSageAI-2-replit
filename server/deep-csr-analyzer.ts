/**
 * Deep CSR Analyzer - Integration between Express server and Python deep CSR analysis service
 *
 * This module provides a bridge between the JavaScript/TypeScript Express server
 * and the Python-based deep CSR semantic analysis system.
 */

import { exec } from 'child_process';
import { writeFile } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Define interfaces for the module
export interface CSRReference {
  csr_id: string;
  title?: string;
  citation_type?: 'explicit' | 'semantic';
  relevance?: 'high' | 'medium' | 'low';
  context?: string;
  metadata?: Record<string, any>;
}

interface SearchOptions {
  topK?: number;
  filterByCsr?: string;
  searchType?: string;
}

interface StudyDesignParams {
  indication: string;
  phase: string;
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];
  population?: string;
  context?: string;
}

// Helper function to check if OpenAI API Key is available
export function isOpenAIApiKeyAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Extract CSR references from text using the deep semantic analysis system
 *
 * @param text Text to analyze for CSR references
 * @returns Array of CSR references
 */
export async function extractCsrReferences(text: string): Promise<CSRReference[]> {
  try {
    // Check if Python bridge is available
    if (!fs.existsSync(path.join(process.cwd(), 'trialsage', 'extract_references.py'))) {
      console.warn('Python bridge not found, using fallback reference extraction');
      return extractBasicReferences(text);
    }

    // Create a temporary file with the text to analyze
    const tempFile = path.join(os.tmpdir(), `csr_text_${uuidv4()}.json`);
    await writeFile(tempFile, JSON.stringify({ text }), 'utf8');

    // Execute the Python script to extract references
    return new Promise((resolve, reject) => {
      exec(
        `python3 ${path.join(process.cwd(), 'trialsage', 'extract_references.py')} ${tempFile}`,
        { maxBuffer: 5 * 1024 * 1024 }, // 5MB buffer for large responses
        (error, stdout, stderr) => {
          try {
            // Clean up the temporary file
            fs.unlinkSync(tempFile);

            if (error) {
              console.error('Error extracting CSR references:', error);
              console.error('STDERR:', stderr);
              // Fallback to simple extraction on error
              return resolve(extractBasicReferences(text));
            }

            // Parse the JSON output from the Python script
            const result = JSON.parse(stdout);

            if (result.error) {
              console.error('Python script returned error:', result.error);
              // Fallback to simple extraction on error
              return resolve(extractBasicReferences(text));
            }

            return resolve(result.references);
          } catch (e) {
            console.error('Error processing CSR references:', e);
            // Fallback to simple extraction on error
            return resolve(extractBasicReferences(text));
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in extractCsrReferences:', error);
    return extractBasicReferences(text);
  }
}

/**
 * Simple pattern-based CSR reference extraction as fallback
 *
 * @param text Text to analyze
 * @returns Array of basic CSR references
 */
function extractBasicReferences(text: string): CSRReference[] {
  const references: CSRReference[] = [];

  // Simple pattern matching for CSR IDs - only a basic fallback
  const csrPatterns = [
    /CSR-\d{5,7}/g,
    /CSR\s+\d{5,7}/g,
    /Clinical Study Report \d{5,7}/g,
    /Study Report \d{5,7}/g,
  ];

  for (const pattern of csrPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const matchText = match[0];
      const csr_id = matchText
        .replace('CSR-', '')
        .replace('CSR ', '')
        .replace('Clinical Study Report ', '')
        .replace('Study Report ', '');

      // Get some context around the match
      const contextStart = Math.max(0, match.index - 100);
      const contextEnd = Math.min(text.length, match.index + matchText.length + 100);
      const context = text.substring(contextStart, contextEnd);

      references.push({
        csr_id,
        citation_type: 'explicit',
        relevance: 'medium',
        context,
        metadata: {
          extraction_method: 'pattern_match',
          fallback: true,
        },
      });
    }
  }

  return references;
}

/**
 * Perform deep semantic search against the CSR knowledge base
 *
 * @param query Search query
 * @param options Search options
 * @returns Search results
 */
export async function performDeepCsrSearch(
  query: string,
  options: SearchOptions = {}
): Promise<any> {
  try {
    // Check if Python bridge is available
    if (!fs.existsSync(path.join(process.cwd(), 'trialsage', 'semantic_search.py'))) {
      console.warn('Python bridge not found, cannot perform deep semantic search');
      return {
        error: 'Deep semantic search not available',
        results: [],
      };
    }

    // Prepare search parameters
    const searchParams = {
      query,
      topK: options.topK || 5,
      filterByCsr: options.filterByCsr,
      searchType: options.searchType || 'general',
    };

    // Create a temporary file with the search parameters
    const tempFile = path.join(os.tmpdir(), `search_params_${uuidv4()}.json`);
    await writeFile(tempFile, JSON.stringify(searchParams), 'utf8');

    // Execute the Python script to perform the search
    return new Promise((resolve, reject) => {
      exec(
        `python3 ${path.join(process.cwd(), 'trialsage', 'semantic_search.py')} ${tempFile}`,
        { maxBuffer: 5 * 1024 * 1024 }, // 5MB buffer for large responses
        (error, stdout, stderr) => {
          try {
            // Clean up the temporary file
            fs.unlinkSync(tempFile);

            if (error) {
              console.error('Error performing semantic search:', error);
              console.error('STDERR:', stderr);
              return resolve({
                error: `Failed to perform search: ${error.message}`,
                results: [],
              });
            }

            // Parse the JSON output from the Python script
            const result = JSON.parse(stdout);

            if (result.error) {
              console.error('Python script returned error:', result.error);
              return resolve({
                error: result.error,
                results: result.results || [],
              });
            }

            return resolve(result);
          } catch (e) {
            console.error('Error processing semantic search results:', e);
            return resolve({
              error: `Failed to process search results: ${e.message}`,
              results: [],
            });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in performDeepCsrSearch:', error);
    return {
      error: `Error performing semantic search: ${error.message}`,
      results: [],
    };
  }
}

/**
 * Generate evidence-based recommendations for study design using deep CSR analysis
 *
 * @param params Parameters for design recommendations
 * @returns Design recommendations
 */
export async function generateStudyDesignRecommendations(params: StudyDesignParams): Promise<any> {
  try {
    // Check if Python bridge is available
    if (!fs.existsSync(path.join(process.cwd(), 'trialsage', 'design_recommendations.py'))) {
      console.warn('Python bridge not found, cannot generate study design recommendations');
      return {
        error: 'Study design recommendations not available',
        recommendations: [],
      };
    }

    // Create a temporary file with the design parameters
    const tempFile = path.join(os.tmpdir(), `design_params_${uuidv4()}.json`);
    await writeFile(tempFile, JSON.stringify(params), 'utf8');

    // Execute the Python script to generate recommendations
    return new Promise((resolve, reject) => {
      exec(
        `python3 ${path.join(process.cwd(), 'trialsage', 'design_recommendations.py')} ${tempFile}`,
        { maxBuffer: 5 * 1024 * 1024 }, // 5MB buffer for large responses
        (error, stdout, stderr) => {
          try {
            // Clean up the temporary file
            fs.unlinkSync(tempFile);

            if (error) {
              console.error('Error generating study design recommendations:', error);
              console.error('STDERR:', stderr);
              return resolve({
                error: `Failed to generate recommendations: ${error.message}`,
                recommendations: [],
              });
            }

            // Parse the JSON output from the Python script
            const result = JSON.parse(stdout);

            if (result.error) {
              console.error('Python script returned error:', result.error);
              return resolve({
                error: result.error,
                recommendations: result.recommendations || [],
              });
            }

            return resolve(result);
          } catch (e) {
            console.error('Error processing study design recommendations:', e);
            return resolve({
              error: `Failed to process recommendations: ${e.message}`,
              recommendations: [],
            });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in generateStudyDesignRecommendations:', error);
    return {
      error: `Error generating recommendations: ${error.message}`,
      recommendations: [],
    };
  }
}
