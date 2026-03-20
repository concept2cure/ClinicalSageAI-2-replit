/**
 * Literature Service
 *
 * This service handles retrieval, analysis, and management of scientific literature
 * for Clinical Evaluation Reports. It includes integration with PubMed API
 * and AI-enhanced text analysis.
 */

import axios from 'axios';
import { storage } from '../storage.js';
import { ai } from '../lib/unified-ai-client';

// Initialize OpenAI with API key from environment variable
/**
 * Search PubMed for scientific literature
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {Object} params.filters - Optional search filters
 * @param {number} params.filters.yearFrom - Start year for publication date filter
 * @param {number} params.filters.yearTo - End year for publication date filter
 * @param {string} params.filters.journalType - Journal type filter
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<Array>} - Array of literature items
 */
async function searchPubMed(params) {
  try {
    const { query, filters = {}, limit = 20 } = params;

    // Construct filter string
    let filterString = '';
    if (filters.yearFrom && filters.yearTo) {
      filterString += `&mindate=${filters.yearFrom}&maxdate=${filters.yearTo}`;
    }

    // Use PubMed API to search for papers
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}${filterString}&retmode=json&retmax=${limit}`;

    const searchResponse = await axios.get(searchUrl);
    const ids = searchResponse.data.esearchresult.idlist || [];

    if (ids.length === 0) {
      return [];
    }

    // Fetch details for each paper
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const detailsResponse = await axios.get(fetchUrl);
    const details = detailsResponse.data.result || {};

    // Process papers
    const results = [];
    for (const id of ids) {
      const paper = details[id];
      if (!paper) continue;

      results.push({
        id: id,
        title: paper.title || '',
        authors: paper.authors?.map(a => `${a.name}`) || [],
        journal: paper.fulljournalname || paper.source || '',
        publicationDate: paper.pubdate || '',
        abstractText: paper.abstracttext || '',
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        relevanceScore: 0, // Will be scored later
        keywords: paper.keywords || [],
      });
    }

    return results;
  } catch (error) {
    console.error('Error searching PubMed:', error);
    return [];
  }
}

/**
 * Score papers for relevance to a specific device
 * @param {Array} papers - Array of papers to score
 * @param {Object} deviceInfo - Device information for context
 * @returns {Promise<Array>} - Scored papers
 */
async function scorePapersForRelevance(papers, deviceInfo) {
  try {
    if (!papers || papers.length === 0) {
      return [];
    }

    // Prepare batch of papers for scoring
    const paperBatch = papers.map(paper => ({
      id: paper.id,
      title: paper.title,
      journal: paper.journal,
      abstractText: paper.abstractText,
      publicationDate: paper.publicationDate,
    }));

    // Generate relevance scores with GPT-4o
    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert in evaluating scientific literature relevance for Clinical Evaluation Reports. 
          You will be given a list of scientific papers and must evaluate their relevance to a specific medical device.
          
          Rate each paper on a scale of 0-10 where:
          - 10: Extremely relevant (directly studies this exact device)
          - 7-9: Highly relevant (studies this device or very similar devices)
          - 4-6: Moderately relevant (studies similar devices or relevant outcomes)
          - 1-3: Minimally relevant (tangentially related to the device or clinical area)
          - 0: Not relevant
          
          Respond with JSON containing an array of objects with paper ID and relevance score.`,
        },
        {
          role: 'user',
          content: `I need you to score these papers for relevance to a CER about this medical device:
          
          Device: ${deviceInfo.name || 'Unknown device'}
          Type: ${deviceInfo.type || 'Medical device'}
          Manufacturer: ${deviceInfo.manufacturer || 'Unknown manufacturer'}
          ${deviceInfo.intendedUse ? `Intended Use: ${deviceInfo.intendedUse}` : ''}
          
          Papers to evaluate:
          ${JSON.stringify(paperBatch, null, 2)}
          
          Score each paper for relevance to this device. Return JSON with format:
          { "scores": [ { "id": "paperID", "relevanceScore": 7 }, ... ] }`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    // Parse the response
    const content = aiResult.content;
    const scoreData = JSON.parse(content);

    // Apply scores to papers
    if (scoreData.scores && Array.isArray(scoreData.scores)) {
      const scoreMap = {};
      scoreData.scores.forEach(item => {
        scoreMap[item.id] = item.relevanceScore;
      });

      // Update papers with scores
      papers.forEach(paper => {
        paper.relevanceScore = scoreMap[paper.id] || 0;
      });

      // Sort by relevance score (descending)
      papers.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    return papers;
  } catch (error) {
    console.error('Error scoring papers for relevance:', error);
    return papers;
  }
}

/**
 * Generate a literature review from a set of papers
 * @param {Array} papers - Array of paper objects
 * @param {Object} context - Context information for the review
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Generated literature review
 */
async function generateLiteratureReview(papers, context, options = {}) {
  try {
    if (!papers || papers.length === 0) {
      throw new Error('No papers provided for literature review generation');
    }

    // Format papers for the prompt
    const paperSummaries = papers
      .map((paper, index) => {
        return `Paper ${index + 1}: "${paper.title}" (${paper.publicationDate})
Authors: ${paper.authors.join(', ')}
Journal: ${paper.journal}
Abstract: ${paper.abstractText}
Relevance: ${paper.relevanceScore}/10
URL: ${paper.url}
------`;
      })
      .join('\n\n');

    // Determine focus areas based on options
    const focus = options.focus || 'both';
    let focusText = 'both safety and efficacy';
    if (focus === 'safety') {
      focusText = 'safety and adverse events';
    } else if (focus === 'efficacy') {
      focusText = 'efficacy and performance';
    }

    // Generate literature review with GPT-4o
    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert medical writer specializing in Clinical Evaluation Reports for medical devices.
          Your task is to create a comprehensive, evidence-based literature review section based on the provided scientific papers.
          
          Follow these guidelines:
          1. Structure the review according to MEDDEV 2.7/1 Rev 4 guidance
          2. Focus on ${focusText}
          3. Critically evaluate the strength and quality of evidence
          4. Compare and contrast findings from different studies
          5. Identify gaps in the current literature
          6. Provide proper in-text citations using Vancouver style [1,2]
          7. Format using markdown with clear headings and structure
          8. Use professional, scientific language appropriate for regulatory submissions
          9. Length should be ${options.format === 'concise' ? 'concise (800-1200 words)' : 'comprehensive (1500-2500 words)'}`,
        },
        {
          role: 'user',
          content: `Please generate a literature review section for a Clinical Evaluation Report about:
          
          Device: ${context.deviceName || 'Unknown device'}
          Type: ${context.deviceType || 'Medical device'}
          Manufacturer: ${context.manufacturer || 'Unknown manufacturer'}
          ${context.intendedUse ? `Intended Use: ${context.intendedUse}` : ''}
          ${context.classification ? `Classification: ${context.classification}` : ''}
          
          Use the following ${papers.length} papers as the basis for the review:
          
          ${paperSummaries}
          
          Focus on ${focusText}. Generate a ${options.format === 'concise' ? 'concise' : 'comprehensive'} literature review section suitable for inclusion in a formal CER.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = aiResult.content;

    return {
      title: 'Literature Review',
      content: content,
      papers: papers.map(p => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        publicationDate: p.publicationDate,
        url: p.url,
        relevanceScore: p.relevanceScore,
      })),
      generatedAt: new Date().toISOString(),
      wordCount: content.split(/\s+/).length,
      metadata: {
        paperCount: papers.length,
        averageRelevance: papers.reduce((sum, p) => sum + p.relevanceScore, 0) / papers.length,
        focusArea: focus,
        format: options.format || 'comprehensive',
      },
    };
  } catch (error) {
    console.error('Error generating literature review:', error);
    throw error;
  }
}

/**
 * Analyze a scientific paper with AI for relevant information
 * @param {string} text - Paper text content
 * @param {Object} context - Context about the device
 * @returns {Promise<Object>} - Analysis results
 */
async function analyzePaper(text, context) {
  try {
    // Generate AI analysis
    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert scientific literature analyst for medical devices. 
          You will analyze scientific paper text and extract key information relevant to Clinical Evaluation Reports.
          
          Extract and organize the following information:
          1. Key findings related to safety
          2. Key findings related to efficacy/performance
          3. Study design and methodology
          4. Patient demographics
          5. Adverse events reported
          6. Limitations of the study
          7. Relevance to the specified medical device
          
          Format your response as JSON with these categories.`,
        },
        {
          role: 'user',
          content: `Please analyze this scientific paper in the context of a Clinical Evaluation Report for:
          
          Device: ${context.deviceName || 'Unknown device'}
          Type: ${context.deviceType || 'Medical device'}
          Manufacturer: ${context.manufacturer || 'Unknown manufacturer'}
          
          Paper text:
          ${text.substring(0, 10000)} ${text.length > 10000 ? '... [text truncated]' : ''}
          
          Extract the key information relevant to safety and performance of this device.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysis = JSON.parse(aiResult.content);

    return {
      ...analysis,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error analyzing paper:', error);
    throw error;
  }
}

/**
 * Generate citations in a specified format
 * @param {Array} papers - Array of paper objects
 * @param {string} format - Citation format (vancouverStyle, apa, mla, harvard)
 * @param {boolean} numbered - Whether to use numbered citations
 * @returns {Promise<Object>} - Generated citations
 */
async function generateCitations(papers, format = 'vancouverStyle', numbered = true) {
  try {
    if (!papers || papers.length === 0) {
      return { citations: [] };
    }

    // Format papers for the prompt
    const paperDetails = papers
      .map((paper, index) => {
        return `Paper ${index + 1}:
Title: ${paper.title}
Authors: ${paper.authors.join(', ')}
Journal: ${paper.journal}
Publication Date: ${paper.publicationDate}
URL: ${paper.url}`;
      })
      .join('\n\n');

    // Determine citation style
    let citationStyle = 'Vancouver style with numbered references';
    if (format === 'apa') {
      citationStyle = 'APA (American Psychological Association) style';
    } else if (format === 'mla') {
      citationStyle = 'MLA (Modern Language Association) style';
    } else if (format === 'harvard') {
      citationStyle = 'Harvard referencing style';
    }

    // Generate citations with GPT-4o
    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert in scientific citation formats. Generate properly formatted citations for scientific papers.
          
          Follow these guidelines:
          1. Use ${citationStyle}
          2. Format citations exactly according to the style guide requirements
          3. Include all available information (authors, title, journal, date, URL)
          4. Order citations as presented in the input
          5. Return JSON with an array of formatted citations`,
        },
        {
          role: 'user',
          content: `Please generate citations in ${citationStyle} format for the following papers:
          
          ${paperDetails}
          
          Return as JSON with format:
          {
            "citations": [
              "Formatted citation 1",
              "Formatted citation 2",
              ...
            ]
          }`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const citationData = JSON.parse(aiResult.content);

    return {
      citations: citationData.citations || [],
      format: format,
      numbered: numbered,
      generatedAt: new Date().toISOString(),
      papers: papers.map(p => p.id),
    };
  } catch (error) {
    console.error('Error generating citations:', error);
    return { citations: [] };
  }
}

/**
 * Store literature items in the database for a CER report
 * @param {string} reportId - CER report ID
 * @param {Array} literatureItems - Array of literature items
 * @returns {Promise<boolean>} - Success status
 */
async function storeLiteratureForReport(reportId, literatureItems) {
  try {
    await storage.saveCerLiterature(reportId, literatureItems);
    return true;
  } catch (error) {
    console.error(`Error storing literature for report ${reportId}:`, error);
    return false;
  }
}

/**
 * Retrieve literature items for a CER report
 * @param {string} reportId - CER report ID
 * @returns {Promise<Array>} - Array of literature items
 */
async function getLiteratureForReport(reportId) {
  try {
    const literature = await storage.getCerLiterature(reportId);
    return literature || [];
  } catch (error) {
    console.error(`Error retrieving literature for report ${reportId}:`, error);
    return [];
  }
}

// Export the functions
export {
  searchPubMed,
  scorePapersForRelevance,
  generateLiteratureReview,
  analyzePaper,
  generateCitations,
  storeLiteratureForReport,
  getLiteratureForReport,
};
