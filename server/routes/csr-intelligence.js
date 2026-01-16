/**
 * CSR INTELLIGENCE LIBRARY ROUTES - HARD-WIRED DATA GOVERNANCE
 *
 * This module provides the canonical API endpoints for CSR Intelligence Library operations.
 * All CSR-related ingestion, querying, and management flows through these routes.
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { csrIntelligenceLibrary } from '../services/CSRIntelligenceLibrary.js';
import { db } from '../../lib/database.js';
// Simple tenant context extraction function
function extractTenantContext(req) {
  return {
    organizationId: req.headers['x-tenant-id'] || req.headers['x-org-id'] || 'default',
    clientWorkspaceId: req.headers['x-client-id'] || null,
    module: req.headers['x-module'] || null,
  };
}

const router = express.Router();

// Real CSR Intelligence routes (DB-backed)

// Configure multer for CSR file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for CSR documents
  },
  fileFilter: (req, file, cb) => {
    // Accept CSR-related file types
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. CSR Intelligence Library accepts PDF, DOCX, DOC, and TXT files.'
        ),
        false
      );
    }
  },
});

/**
 * POST /api/csr-intelligence/ingest
 * MAIN ENTRY POINT: Hard-wired CSR document ingestion
 */
router.post('/ingest', upload.single('csrDocument'), async (req, res) => {
  try {
    const tenantContext = extractTenantContext(req);
    const { organizationId } = tenantContext;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSR document file provided',
      });
    }

    const { buffer, originalname, mimetype } = req.file;
    const { context, userId } = req.body;

    console.log(`[CSR Intelligence Library] Processing CSR ingestion: ${originalname}`);

    // Call the hard-wired CSR ingestion pipeline
    const result = await csrIntelligenceLibrary.ingestCSRDocument({
      fileName: originalname,
      fileBuffer: buffer,
      mimeType: mimetype,
      tenantId: organizationId || 'default',
      userId: userId || 'system',
      module: 'csr',
      context: context || 'CSR Intelligence Library Direct Upload',
    });

    res.json({
      success: true,
      message: 'CSR document successfully ingested into Intelligence Library',
      data: result,
    });
  } catch (error) {
    console.error('[CSR Intelligence Library] Ingestion failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CSR Intelligence Library ingestion failed',
    });
  }
});

/**
 * GET /api/csr-intelligence/query
 * Query CSR Intelligence Library with filters
 */
router.get('/query', async (req, res) => {
  try {
    const { indication, phase, sponsor, limit, offset } = req.query;

    const results = await csrIntelligenceLibrary.queryCSRIntelligenceLibrary({
      indication,
      phase,
      sponsor,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });

    res.json({
      success: true,
      data: results,
      count: results.length,
      filters: { indication, phase, sponsor },
    });
  } catch (error) {
    console.error('[CSR Intelligence Library] Query failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CSR Intelligence Library query failed',
    });
  }
});

/**
 * GET /api/csr-intelligence/stats
 * Get CSR Intelligence Library statistics
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('[CSR Intelligence Library] Fetching stats using CSR Analytics Service');
    const overviewResult = await db.query(`
      SELECT
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT regulatory_agency) as unique_agencies,
        COUNT(DISTINCT status) as unique_statuses
      FROM csr_reports
    `);

    const statusDistribution = await db.query(`
      SELECT status, COUNT(*) as count
      FROM csr_reports
      GROUP BY status
      ORDER BY count DESC
    `);

    const agencyDistribution = await db.query(`
      SELECT regulatory_agency, COUNT(*) as count
      FROM csr_reports
      WHERE regulatory_agency IS NOT NULL
      GROUP BY regulatory_agency
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        overview: overviewResult.rows[0] || {},
        statusDistribution: statusDistribution.rows,
        agencyDistribution: agencyDistribution.rows,
        lastUpdated: new Date().toISOString(),
        source: 'database',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CSR Intelligence Library] Stats query failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CSR Intelligence Library query failed',
    });
  }
});

/**
 * GET /api/csr-intelligence/search
 * Search CSR Intelligence Library
 */
router.get('/search', async (req, res) => {
  try {
    const { q, indication, phase, sponsor, limit } = req.query;

    if (!q || q.trim() === '') {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No search query provided',
      });
    }

    console.log(`[CSR Intelligence] Searching for: "${q}"`);

    const searchTerm = `%${q.trim()}%`;
    const result = await db.query(
      `
      SELECT id, report_id, report_title, report_type, study_id, status, upload_date, regulatory_agency
      FROM csr_reports
      WHERE report_title ILIKE $1
         OR report_id ILIKE $1
         OR content::text ILIKE $1
      ORDER BY updated_at DESC
      LIMIT $2
      `,
      [searchTerm, parseInt(limit) || 20]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      query: q,
      filters: { indication, phase, sponsor },
    });
  } catch (error) {
    console.error('[CSR Intelligence] Search failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CSR Intelligence search failed',
    });
  }
});

/**
 * GET /api/csr-intelligence/report/:id
 * Get specific CSR report with details
 */
router.get('/report/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('SELECT * FROM csr_reports WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'CSR report not found',
        message: `CSR report with ID ${id} not found in Intelligence Library`,
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[CSR Intelligence Library] Report query failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'CSR Intelligence Library report query failed',
    });
  }
});

/**
 * GET /api/csr-intelligence/health
 * CSR Intelligence Library health check
 */
router.get('/health', async (req, res) => {
  try {
    const healthQuery = 'SELECT COUNT(*) as count FROM csr_reports LIMIT 1';
    const result = await db.query(healthQuery);

    res.json({
      success: true,
      status: 'healthy',
      data: {
        database: 'connected',
        csrReportsTable: 'accessible',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[CSR Intelligence Library] Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

/**
 * GET /api/csr-intelligence/analytics
 * Get advanced CSR analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const overviewResult = await db.query(`
      SELECT
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT regulatory_agency) as unique_agencies,
        COUNT(DISTINCT status) as unique_statuses
      FROM csr_reports
    `);

    res.json({
      success: true,
      data: { overview: overviewResult.rows[0] || {} },
      type: 'database',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching CSR analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch CSR analytics',
      details: error.message,
    });
  }
});

/**
 * POST /api/csr-intelligence/predict
 * Predict trial success based on study parameters
 */
router.post('/predict', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Predictive analytics not yet configured for production.',
    });
  } catch (error) {
    console.error('Error predicting trial success:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to predict trial success',
      details: error.message,
    });
  }
});

/**
 * GET /api/csr-intelligence/search-analytics
 * Advanced search with analytics
 */
router.get('/search-analytics', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Search analytics not yet configured for production.',
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform advanced search',
      details: error.message,
    });
  }
});


// Get factual business insights based on verified CSR data
router.get('/factual-insights', async (req, res) => {
  try {
    const overviewResult = await db.query(`
      SELECT
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT regulatory_agency) as unique_agencies
      FROM csr_reports
    `);

    res.json({
      success: true,
      data: {
        overview: overviewResult.rows[0] || {},
        dataSource: 'csr_reports',
        lastUpdated: new Date().toISOString(),
      },
      metadata: {
        dataSource: 'csr_reports',
        lastUpdated: new Date().toISOString(),
        disclaimer: 'All metrics calculated from CSR reports in the database',
      },
    });
  } catch (error) {
    console.error('Factual insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
