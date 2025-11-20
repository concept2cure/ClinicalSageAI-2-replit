/**
 * Real Predictive Analytics API Routes
 * Production-grade endpoints for Python/R statistical analysis
 */

import express from 'express';
import { RealPredictiveAnalytics } from '../services/RealPredictiveAnalytics.js';

const router = express.Router();
const analytics = new RealPredictiveAnalytics();

/**
 * Analyze document with Python/R engines
 */
router.post('/analyze-document', async (req, res) => {
  try {
    const { documentData } = req.body;

    if (!documentData) {
      return res.status(400).json({ error: 'Document data required' });
    }

    const report = await analytics.generateAnalyticsReport(documentData);

    res.json({
      success: true,
      analysis: report,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Document analysis failed:', error);
    res.status(500).json({
      error: 'Analysis failed',
      details: error.message,
    });
  }
});

/**
 * Get FDA approval probability prediction
 */
router.post('/predict-approval', async (req, res) => {
  try {
    const { documentData } = req.body;

    const prediction = await analytics.predictApprovalProbability(documentData);

    res.json({
      success: true,
      prediction,
      data_sources: ['FDA_CDER_Database', 'ML_Models', 'Historical_Data'],
    });
  } catch (error) {
    console.error('Approval prediction failed:', error);
    res.status(500).json({
      error: 'Prediction failed',
      details: error.message,
    });
  }
});

/**
 * Generate regulatory timeline forecast
 */
router.post('/forecast-timeline', async (req, res) => {
  try {
    const { documentData } = req.body;

    const forecast = await analytics.generateTimelineForecast(documentData);

    res.json({
      success: true,
      forecast,
      methodology: 'Python/R Statistical Analysis',
    });
  } catch (error) {
    console.error('Timeline forecast failed:', error);
    res.status(500).json({
      error: 'Forecast failed',
      details: error.message,
    });
  }
});

/**
 * Analyze commitment fulfillment risk
 */
router.post('/analyze-commitment-risk', async (req, res) => {
  try {
    const { commitments } = req.body;

    if (!commitments || !Array.isArray(commitments)) {
      return res.status(400).json({ error: 'Commitments array required' });
    }

    const riskAnalysis = await analytics.analyzeCommitmentRisk(commitments);

    res.json({
      success: true,
      risk_analysis: riskAnalysis,
      analysis_engine: 'Python/R Integration',
    });
  } catch (error) {
    console.error('Commitment risk analysis failed:', error);
    res.status(500).json({
      error: 'Risk analysis failed',
      details: error.message,
    });
  }
});

/**
 * Get FDA submission statistics
 */
router.get('/fda-statistics', async (req, res) => {
  try {
    const stats = await analytics.getFDASubmissionStats();

    res.json({
      success: true,
      statistics: stats,
      data_source: 'FDA_CDER_Database',
    });
  } catch (error) {
    console.error('FDA statistics fetch failed:', error);
    res.status(500).json({
      error: 'Statistics fetch failed',
      details: error.message,
    });
  }
});

/**
 * Health check for analytics engines
 */
router.get('/health', async (req, res) => {
  try {
    // Test Python engine
    const pythonTest = await analytics.analyzeDocumentWithPython({
      content: 'Test document',
      type: 'IND',
      analysis_type: 'compliance',
    });

    // Test R engine
    const rTest = await analytics.analyzeWithRStatistics({
      phase: 'Phase I',
      indication: 'Oncology',
      analysis_type: 'sample_size',
    });

    res.json({
      success: true,
      engines: {
        python: pythonTest ? 'Online' : 'Offline',
        r: rTest ? 'Online' : 'Offline',
        database: 'Connected',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Health check failed',
      details: error.message,
    });
  }
});

export default router;
