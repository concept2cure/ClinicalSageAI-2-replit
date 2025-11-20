/**
 * CER Data Retrieval Routes
 *
 * This module provides API routes for fetching literature and FAERS data for CER reports,
 * as well as triggering the autonomous data retrieval process.
 */

import express from 'express';
import {
  retrieveAllData,
  fetchLiterature,
  fetchFaersData,
} from '../services/cerDataRetrievalService.js';
import { storage } from '../storage.js';
import {
  searchPubMed,
  scorePapersForRelevance,
  generateLiteratureReview,
  analyzePaper,
  generateCitations,
} from '../services/literatureService.js';
import { fetchFaersAnalysis } from '../services/enhancedFaersService.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = express.Router();

/**
 * POST /api/cer-data/retrieve/:reportId
 * Trigger autonomous data retrieval for a CER report
 */
router.post('/retrieve/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Check if the report exists
    const report = await storage.getCerReport(reportId);
    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }

    // Start the data retrieval process asynchronously
    retrieveAllData(reportId)
      .then(result => {
        console.log(`Data retrieval for report ${reportId} completed:`, result);
      })
      .catch(error => {
        console.error(`Data retrieval for report ${reportId} failed:`, error);
      });

    // Return immediately with a status indicating the process has been started
    res.json({
      message: 'Data retrieval process initiated',
      reportId,
      status: 'pending',
    });
  } catch (error) {
    console.error('Error initiating data retrieval:', error);
    res.status(500).json({ error: 'Failed to initiate data retrieval' });
  }
});

/**
 * GET /api/cer-data/status/:reportId
 * Get the status of the data retrieval process for a CER report
 */
router.get('/status/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Get the report and workflow
    const report = await storage.getCerReport(reportId);
    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }

    const workflow = await storage.getCerWorkflowByReportId(reportId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found for this report' });
    }

    // Get the literature and FAERS data count
    const literature = await storage.getCerLiterature(reportId);
    const faersData = await storage.getCerFaersData(reportId);

    // Return the status
    res.json({
      reportId,
      workflowId: workflow.id,
      status: workflow.status,
      currentStep: workflow.currentStep,
      progress: workflow.progress,
      error: workflow.error,
      dataStats: {
        literatureCount: literature?.length || 0,
        faersDataAvailable: !!faersData,
        faersReportCount: faersData?.reportCount || 0,
      },
      lastUpdated: workflow.lastUpdated,
    });
  } catch (error) {
    console.error('Error fetching data retrieval status:', error);
    res.status(500).json({ error: 'Failed to fetch data retrieval status' });
  }
});

/**
 * POST /api/cer-data/literature/search
 * Search for scientific literature
 */
router.post('/literature/search', async (req, res) => {
  try {
    const { query, deviceInfo, filters, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Perform the search
    const searchResults = await searchPubMed({ query, filters, limit });

    // Score the results for relevance if deviceInfo is provided
    let scoredResults = searchResults;
    if (deviceInfo) {
      scoredResults = await scorePapersForRelevance(searchResults, deviceInfo);
    }

    res.json({
      query,
      results: scoredResults,
      count: scoredResults.length,
    });
  } catch (error) {
    console.error('Error searching literature:', error);
    res.status(500).json({ error: 'Failed to search literature' });
  }
});

/**
 * POST /api/cer-data/literature/generate-review
 * Generate a literature review from selected papers
 */
router.post('/literature/generate-review', async (req, res) => {
  try {
    const { papers, context, options } = req.body;

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return res.status(400).json({ error: 'Papers array is required' });
    }

    if (!context) {
      return res.status(400).json({ error: 'Context information is required' });
    }

    // Generate the literature review
    const review = await generateLiteratureReview(papers, context, options);

    res.json(review);
  } catch (error) {
    console.error('Error generating literature review:', error);
    res.status(500).json({ error: 'Failed to generate literature review' });
  }
});

/**
 * POST /api/cer-data/literature/analyze-pdf
 * Analyze a PDF paper
 */
router.post('/literature/analyze-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const context = req.body.context ? JSON.parse(req.body.context) : {};

    // Read the file content
    const filePath = req.file.path;
    const text = fs.readFileSync(filePath, 'utf8');

    // Analyze the paper
    const analysis = await analyzePaper(text, context);

    // Clean up the temporary file
    fs.unlinkSync(filePath);

    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    res.status(500).json({ error: 'Failed to analyze PDF' });
  }
});

/**
 * POST /api/cer-data/literature/generate-citations
 * Generate formatted citations for papers
 */
router.post('/literature/generate-citations', async (req, res) => {
  try {
    const { papers, format, numbered } = req.body;

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return res.status(400).json({ error: 'Papers array is required' });
    }

    // Generate citations
    const citations = await generateCitations(papers, format, numbered);

    res.json(citations);
  } catch (error) {
    console.error('Error generating citations:', error);
    res.status(500).json({ error: 'Failed to generate citations' });
  }
});

/**
 * POST /api/cer-data/faers/fetch
 * Fetch FAERS data for a product
 */
router.post('/faers/fetch', async (req, res) => {
  try {
    const { productName, reportId } = req.body;

    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    // Fetch FAERS data
    const faersData = await fetchFaersAnalysis(productName, reportId);

    // If reportId is provided, store the data in the database
    if (reportId) {
      await storage.saveCerFaersData(reportId, faersData);
    }

    res.json(faersData);
  } catch (error) {
    console.error('Error fetching FAERS data:', error);
    res.status(500).json({ error: 'Failed to fetch FAERS data' });
  }
});

/**
 * GET /api/cer-data/literature/:reportId
 * Get literature items for a CER report
 */
router.get('/literature/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Check if the report exists
    const report = await storage.getCerReport(reportId);
    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }

    // Get the literature items
    const literature = await storage.getCerLiterature(reportId);

    res.json({
      reportId,
      literature: literature || [],
      count: literature ? literature.length : 0,
    });
  } catch (error) {
    console.error(`Error fetching literature for report ${req.params.reportId}:`, error);
    res.status(500).json({ error: 'Failed to fetch literature data' });
  }
});

/**
 * GET /api/cer-data/faers/:reportId
 * Get FAERS data for a CER report
 */
router.get('/faers/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Check if the report exists
    const report = await storage.getCerReport(reportId);
    if (!report) {
      return res.status(404).json({ error: 'CER report not found' });
    }

    // Get the FAERS data
    const faersData = await storage.getCerFaersData(reportId);

    if (!faersData) {
      return res.status(404).json({ error: 'FAERS data not found for this report' });
    }

    res.json(faersData);
  } catch (error) {
    console.error(`Error fetching FAERS data for report ${req.params.reportId}:`, error);
    res.status(500).json({ error: 'Failed to fetch FAERS data' });
  }
});

export default router;
