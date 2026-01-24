/**
 * CER Data Retrieval Service
 *
 * This service handles autonomous data retrieval for the CER generation process.
 * It orchestrates fetching data from multiple sources including:
 * - FDA FAERS for adverse event data
 * - PubMed and scientific literature databases
 * - FDA MAUDE for medical device reports
 * - EU EUDAMED for European device data
 */

import { EnhancedFAERSClient, fetchFaersAnalysis } from './enhancedFaersService.js';
import { storage } from '../storage.js';
import OpenAI from 'openai';
import axios from 'axios';

// Initialize OpenAI with API key from environment variable
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Perform intelligent literature search for a medical device based on device details
 * @param {Object} deviceInfo - Device information
 * @param {string} deviceInfo.name - Name of the device
 * @param {string} deviceInfo.type - Type of the device
 * @param {string} deviceInfo.manufacturer - Manufacturer name
 * @param {string} [deviceInfo.intendedUse] - Intended use of the device
 * @param {string} [deviceInfo.classification] - Device classification
 * @returns {Promise<Array>} - Array of relevant literature items
 */
async function fetchLiterature(deviceInfo) {
  try {
    console.log(`Fetching literature for device: ${deviceInfo.name}`);

    // Generate optimized search queries for the device using AI
    const searchQueries = await generateSearchQueries(deviceInfo);

    // Fetch literature from PubMed using the optimized queries
    const literatureItems = await searchPubMed(searchQueries, deviceInfo);

    return literatureItems;
  } catch (error) {
    console.error('Error in fetchLiterature:', error);
    return [];
  }
}

/**
 * Generate optimized search queries using GPT-4o
 * @param {Object} deviceInfo - Device information
 * @returns {Promise<Array<string>>} - Array of search queries
 */
async function generateSearchQueries(deviceInfo) {
  try {
    // Prepare context from device info
    const deviceContext = `
      Device Name: ${deviceInfo.name}
      Device Type: ${deviceInfo.type}
      Manufacturer: ${deviceInfo.manufacturer}
      ${deviceInfo.intendedUse ? `Intended Use: ${deviceInfo.intendedUse}` : ''}
      ${deviceInfo.classification ? `Classification: ${deviceInfo.classification}` : ''}
    `;

    // Generate search queries with GPT-4o
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert in medical literature searching. Your task is to create precise, effective search queries for finding scientific evidence about a medical device for a Clinical Evaluation Report (CER). 
          
          Generate 5 different search queries, each focused on different aspects:
          1. Safety profile and adverse events
          2. Clinical efficacy and outcomes
          3. Comparative studies with similar devices
          4. Long-term performance and durability
          5. Post-market surveillance data
          
          Format as JSON with a 'queries' array containing the 5 search strings.`,
        },
        {
          role: 'user',
          content: `I need to find scientific literature for a CER about this medical device:\n${deviceContext}\n\nPlease generate 5 optimized search queries.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    // Parse the response
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    return parsed.queries || [];
  } catch (error) {
    console.error('Error generating search queries:', error);
    // Fallback to basic queries if AI generation fails
    return [
      `"${deviceInfo.name}" safety adverse events`,
      `"${deviceInfo.name}" clinical efficacy outcomes`,
      `"${deviceInfo.name}" comparison similar devices`,
      `"${deviceInfo.name}" long-term performance`,
      `"${deviceInfo.name}" post-market surveillance`,
    ];
  }
}

/**
 * Search PubMed for scientific literature
 * @param {Array<string>} queries - Search queries
 * @param {Object} deviceInfo - Device information for contextual filtering
 * @returns {Promise<Array>} - Array of literature items
 */
async function searchPubMed(queries, deviceInfo) {
  try {
    const allResults = [];
    const seenIds = new Set(); // To track duplicate papers

    for (const query of queries) {
      try {
        // Use PubMed API to search for papers
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmode=json&retmax=20`;

        const searchResponse = await axios.get(searchUrl);
        const ids = searchResponse.data.esearchresult.idlist || [];

        if (ids.length === 0) continue;

        // Fetch details for each paper
        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const detailsResponse = await axios.get(fetchUrl);
        const details = detailsResponse.data.result || {};

        // Process papers
        for (const id of ids) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const paper = details[id];
          if (!paper) continue;

          allResults.push({
            id: id,
            title: paper.title || '',
            authors: paper.authors?.map(a => `${a.name}`) || [],
            journal: paper.fulljournalname || paper.source || '',
            publicationDate: paper.pubdate || '',
            abstractText: paper.abstracttext || '',
            url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
            relevanceScore: 0, // Will be updated in the next step
            keywords: paper.keywords || [],
            searchQuery: query,
          });
        }
      } catch (error) {
        console.error(`Error searching PubMed with query "${query}":`, error);
        continue;
      }
    }

    // Sort and limit results
    if (allResults.length > 0) {
      // Score papers for relevance using AI
      const scoredResults = await scorePaperRelevance(allResults, deviceInfo);
      return scoredResults.slice(0, 15); // Return top 15 most relevant papers
    }

    return allResults;
  } catch (error) {
    console.error('Error in searchPubMed:', error);
    return [];
  }
}

/**
 * Score papers for relevance using AI
 * @param {Array} papers - Literature search results
 * @param {Object} deviceInfo - Device information
 * @returns {Promise<Array>} - Scored papers
 */
async function scorePaperRelevance(papers, deviceInfo) {
  try {
    // Prepare batch of papers for scoring
    const paperBatch = papers.map(paper => ({
      id: paper.id,
      title: paper.title,
      journal: paper.journal,
      abstractText: paper.abstractText,
      publicationDate: paper.publicationDate,
      searchQuery: paper.searchQuery,
    }));

    // Generate relevance scores with GPT-4o
    const response = await openai.chat.completions.create({
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
          
          Device: ${deviceInfo.name}
          Type: ${deviceInfo.type}
          Manufacturer: ${deviceInfo.manufacturer}
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
    const content = response.choices[0].message.content;
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
 * Fetch FDA FAERS data for a device
 * @param {Object} deviceInfo - Device information
 * @returns {Promise<Object>} - FAERS analysis data
 */
async function fetchFaersData(deviceInfo) {
  try {
    console.log(`Fetching FAERS data for device: ${deviceInfo.name}`);

    // Use the enhanced FAERS service to get data
    const faersData = await fetchFaersAnalysis(deviceInfo.name);

    return faersData;
  } catch (error) {
    console.error('Error in fetchFaersData:', error);
    return null;
  }
}

/**
 * Fetch all required data for a CER report and update the database
 * @param {string} reportId - CER report ID
 * @returns {Promise<Object>} - Retrieved data summary
 */
async function retrieveAllData(reportId) {
  try {
    console.log(`Starting autonomous data retrieval for CER report: ${reportId}`);

    // Step 1: Get the report details from the database
    const report = await storage.getCerReport(reportId);
    if (!report) {
      throw new Error(`CER report with ID ${reportId} not found`);
    }

    // Step 2: Get the associated workflow
    const workflow = await storage.getCerWorkflowByReportId(reportId);
    if (!workflow) {
      throw new Error(`Workflow for CER report ${reportId} not found`);
    }

    // Step 3: Update workflow status to indicate data retrieval is in progress
    const updatedWorkflow = {
      ...workflow,
      status: 'data_retrieval',
      currentStep: 'data_preparation',
      progress: 0.1,
      lastUpdated: new Date(),
      steps: workflow.steps.map(step => {
        if (step.id === 'data_preparation') {
          return { ...step, status: 'in_progress', startedAt: new Date() };
        }
        return step;
      }),
    };

    await storage.updateCerWorkflow(workflow.id, updatedWorkflow);

    // Step 4: Create device info object from report data
    const deviceInfo = {
      name: report.deviceName,
      manufacturer: report.manufacturer,
      type: report.deviceType,
      intendedUse: report.metadata?.intendedUse,
      classification: report.metadata?.classification,
    };

    // Step 5: Fetch literature (this may take some time)
    const literatureItems = await fetchLiterature(deviceInfo);
    console.log(`Retrieved ${literatureItems.length} literature items`);

    // Step 6: Update workflow progress after literature retrieval
    const literatureWorkflow = {
      ...updatedWorkflow,
      progress: 0.3,
      lastUpdated: new Date(),
    };
    await storage.updateCerWorkflow(workflow.id, literatureWorkflow);

    // Step 7: Fetch FAERS data
    const faersData = await fetchFaersData(deviceInfo);
    console.log(`Retrieved FAERS data with ${faersData?.reportCount || 0} reports`);

    // Step 8: Store the retrieved data in the database
    await storage.saveCerLiterature(reportId, literatureItems);

    if (faersData) {
      await storage.saveCerFaersData(reportId, faersData);
    }

    // Step 9: Update workflow to indicate data retrieval is complete and analyze step is ready
    const completedWorkflow = {
      ...literatureWorkflow,
      status: 'analysis',
      currentStep: 'data_analysis',
      progress: 0.4,
      lastUpdated: new Date(),
      steps: literatureWorkflow.steps.map(step => {
        if (step.id === 'data_preparation') {
          return { ...step, status: 'completed', completedAt: new Date() };
        }
        if (step.id === 'faers_analysis' || step.id === 'literature_analysis') {
          return { ...step, status: 'in_progress', startedAt: new Date() };
        }
        return step;
      }),
    };

    await storage.updateCerWorkflow(workflow.id, completedWorkflow);

    // Step 10: Update the report status
    const updatedReport = {
      ...report,
      status: 'data_retrieved',
      updatedAt: new Date(),
      metadata: {
        ...report.metadata,
        literatureCount: literatureItems.length,
        faersReportCount: faersData?.reportCount || 0,
        dataRetrievalCompletedAt: new Date().toISOString(),
      },
    };

    await storage.updateCerReport(reportId, updatedReport);

    // Return a summary of the data retrieval process
    return {
      reportId,
      workflowId: workflow.id,
      literatureCount: literatureItems.length,
      faersReportCount: faersData?.reportCount || 0,
      status: 'success',
      message: 'Data retrieval completed successfully',
    };
  } catch (error) {
    console.error(`Error in retrieveAllData for report ${reportId}:`, error);

    // Update workflow to indicate error
    try {
      const workflow = await storage.getCerWorkflowByReportId(reportId);
      if (workflow) {
        const failedWorkflow = {
          ...workflow,
          status: 'error',
          lastUpdated: new Date(),
          error: error.message,
        };
        await storage.updateCerWorkflow(workflow.id, failedWorkflow);
      }

      // Update report status
      const report = await storage.getCerReport(reportId);
      if (report) {
        const failedReport = {
          ...report,
          status: 'error',
          updatedAt: new Date(),
          metadata: {
            ...report.metadata,
            error: error.message,
          },
        };
        await storage.updateCerReport(reportId, failedReport);
      }
    } catch (updateError) {
      console.error('Error updating report/workflow with error status:', updateError);
    }

    throw error;
  }
}

// Export the functions
export { retrieveAllData, fetchLiterature, fetchFaersData };
