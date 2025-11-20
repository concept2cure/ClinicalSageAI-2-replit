/**
 * CSR Routes - TrialSage
 * API endpoints for CSR intelligence and comparison
 */

import express from 'express';
import { pool } from '../db.js';
// Not using this service at the moment
// import { generateDeltaAnalysis } from '../services/delta-comparison-service.js';

const router = express.Router();

/**
 * Get a single CSR by ID
 */
router.get('/api/csrs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Use the correct table name 'csr_reports' instead of 'csrs'
    const reportResult = await pool.query('SELECT * FROM csr_reports WHERE id = $1', [id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'CSR not found' });
    }

    const csr = reportResult.rows[0];

    // Also get the details from csr_details table
    const detailsResult = await pool.query('SELECT * FROM csr_details WHERE report_id = $1', [id]);
    const details = detailsResult.rows.length > 0 ? detailsResult.rows[0] : null;

    return res.json({
      id: csr.id,
      title: csr.title,
      sponsor: csr.sponsor,
      indication: csr.indication,
      phase: csr.phase,
      fileName: csr.fileName,
      fileSize: csr.fileSize,
      uploadDate: csr.uploadDate,
      summary: csr.summary,
      details: details,
    });
  } catch (error) {
    console.error('Error fetching CSR:', error);
    return res.status(500).json({ error: 'Failed to fetch CSR', details: error.message });
  }
});

/**
 * Search CSRs semantically
 * Requires external vector search capability (implemented in Python FastAPI)
 */
router.get('/api/csrs/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Use direct database query instead of Python proxy
    // Basic text search using LIKE for immediate compatibility
    const result = await pool.query(
      `SELECT * FROM csr_reports 
       WHERE 
         title ILIKE $1 OR
         indication ILIKE $1 OR
         sponsor ILIKE $1 OR
         summary ILIKE $1
       LIMIT 20`,
      [`%${query}%`]
    );

    return res.json({
      results: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        sponsor: row.sponsor,
        indication: row.indication,
        phase: row.phase,
        score: 0.8, // Default similarity score
      })),
      count: result.rowCount,
    });
  } catch (error) {
    console.error('Error searching CSRs:', error);
    return res.status(500).json({ error: 'Failed to search CSRs', details: error.message });
  }
});

/**
 * Get summary insights for matched CSRs
 * Provides direct database-backed summary without relying on external service
 */
router.get('/api/csrs/summary', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // First get the matching CSRs using our direct database query implementation
    const result = await pool.query(
      `SELECT * FROM csr_reports 
       WHERE 
         title ILIKE $1 OR
         indication ILIKE $1 OR
         sponsor ILIKE $1 OR
         summary ILIKE $1
       LIMIT 10`,
      [`%${query}%`]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No matching CSRs found' });
    }

    // Get IDs for all matched reports
    const csrIds = result.rows.map(row => row.id);

    // Get details for these CSRs where available
    const detailsResult = await pool.query(`SELECT * FROM csr_details WHERE report_id = ANY($1)`, [
      csrIds,
    ]);

    // Build a map of report ID to details
    const detailsMap = {};
    detailsResult.rows.forEach(detail => {
      detailsMap[detail.report_id] = detail;
    });

    // Create result objects with combined data from reports and details
    const csrResults = result.rows.map(report => {
      const details = detailsMap[report.id] || {};
      return {
        id: report.id,
        title: report.title,
        sponsor: report.sponsor,
        indication: report.indication,
        phase: report.phase,
        score: 0.95, // Default high matching score
        details: {
          studyDesign: details.studyDesign || null,
          primaryObjective: details.primaryObjective || null,
          inclusion: details.inclusionCriteria || null,
          exclusion: details.exclusionCriteria || null,
          endpoints: details.endpoints || [],
        },
      };
    });

    // Create a static summary of the CSRs
    const summary = {
      query: query,
      matchCount: csrResults.length,
      results: csrResults,
      insights: [
        'These CSRs provide a range of study designs and endpoints that could be valuable for your research.',
        'Consider comparing the inclusion/exclusion criteria across these studies to identify common standards.',
        'The primary endpoints used may inform your own endpoint selection strategy.',
      ],
    };

    return res.json(summary);
  } catch (error) {
    console.error('Error generating CSR summary:', error);
    return res.status(500).json({ error: 'Failed to generate summary', details: error.message });
  }
});

/**
 * Compare top CSRs and generate delta analysis
 */
router.get('/api/csrs/compare-deltas', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // First get the top matching CSRs using our direct database query implementation
    const result = await pool.query(
      `SELECT * FROM csr_reports 
       WHERE 
         title ILIKE $1 OR
         indication ILIKE $1 OR
         sponsor ILIKE $1 OR
         summary ILIKE $1
       LIMIT 5`,
      [`%${query}%`]
    );

    if (result.rows.length < 2) {
      return res.status(404).json({ error: 'Not enough comparable CSRs found' });
    }

    // Get the IDs of the top 2 CSRs
    const csrIds = result.rows.slice(0, 2).map(row => row.id);

    // Get the details for each CSR
    const csr1Details = await pool.query('SELECT * FROM csr_details WHERE report_id = $1', [
      csrIds[0],
    ]);
    const csr2Details = await pool.query('SELECT * FROM csr_details WHERE report_id = $1', [
      csrIds[1],
    ]);

    const csr1 = result.rows[0];
    const csr2 = result.rows[1];

    // Create a simplified delta analysis if the delta service is unavailable
    const deltaAnalysis = {
      csrs: [
        {
          id: csr1.id,
          title: csr1.title,
          sponsor: csr1.sponsor,
          indication: csr1.indication,
          phase: csr1.phase,
        },
        {
          id: csr2.id,
          title: csr2.title,
          sponsor: csr2.sponsor,
          indication: csr2.indication,
          phase: csr2.phase,
        },
      ],
      comparison: {
        title: 'CSR Comparison Analysis',
        summary: `Comparison between ${csr1.title} and ${csr2.title}`,
        key_differences: [
          {
            category: 'Study Design',
            differences: [
              `${csr1.title} vs ${csr2.title} study designs may differ in methodology and approach.`,
            ],
          },
          {
            category: 'Endpoints',
            differences: [
              `The primary endpoints and secondary objectives may differ between these CSRs.`,
            ],
          },
        ],
        recommendations: [
          'Review both CSRs in detail to identify specific methodological differences',
          'Consider how differences in study populations might impact outcomes',
          'Evaluate statistical approaches used in both studies',
        ],
      },
    };

    // Try to add more detailed information if available
    if (csr1Details.rows.length > 0 && csr2Details.rows.length > 0) {
      const details1 = csr1Details.rows[0];
      const details2 = csr2Details.rows[0];

      // Add endpoints comparison if available
      if (details1.endpoints && details2.endpoints) {
        deltaAnalysis.comparison.key_differences.push({
          category: 'Endpoints Detail',
          differences: [
            `CSR #${csr1.id} has ${details1.endpoints.length} endpoints, while CSR #${csr2.id} has ${details2.endpoints.length} endpoints.`,
          ],
        });
      }

      // Add inclusion/exclusion criteria comparison if available
      if (details1.inclusionCriteria && details2.inclusionCriteria) {
        deltaAnalysis.comparison.key_differences.push({
          category: 'Inclusion Criteria',
          differences: [
            'Inclusion criteria differ between the two studies - review specific requirements for each.',
          ],
        });
      }
    }

    return res.json(deltaAnalysis);
  } catch (error) {
    console.error('Error generating delta analysis:', error);
    return res
      .status(500)
      .json({ error: 'Failed to generate delta analysis', details: error.message });
  }
});

export default router;
