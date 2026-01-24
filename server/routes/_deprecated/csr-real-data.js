/**
 * CSR REAL DATA API - Direct connection to processed CSR files
 * This connects the frontend directly to the authentic CSR data
 */

import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const router = express.Router();

// Load all processed CSR files
function loadProcessedCSRs() {
  const csrDir = join(process.cwd(), 'data', 'processed_csrs');
  const files = readdirSync(csrDir).filter(file => file.endsWith('.json'));

  const csrs = files
    .map(file => {
      try {
        const content = readFileSync(join(csrDir, file), 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error reading ${file}:`, error);
        return null;
      }
    })
    .filter(csr => csr !== null);

  return csrs;
}

// Get all CSRs from processed files
router.get('/all', async (req, res) => {
  try {
    const csrs = loadProcessedCSRs();

    res.json({
      success: true,
      data: csrs,
      count: csrs.length,
      source: 'processed_files',
    });
  } catch (error) {
    console.error('Error loading CSRs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load CSR data',
    });
  }
});

// Search CSRs
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 50, indication, phase, sponsor } = req.query;
    let csrs = loadProcessedCSRs();

    // Apply search filters
    if (query) {
      const queryLower = query.toLowerCase();
      csrs = csrs.filter(
        csr =>
          csr.title.toLowerCase().includes(queryLower) ||
          csr.indication.toLowerCase().includes(queryLower) ||
          csr.sponsor.toLowerCase().includes(queryLower) ||
          csr.drugName.toLowerCase().includes(queryLower)
      );
    }

    if (indication) {
      csrs = csrs.filter(csr => csr.indication.toLowerCase().includes(indication.toLowerCase()));
    }

    if (phase) {
      csrs = csrs.filter(csr => csr.phase.toLowerCase().includes(phase.toLowerCase()));
    }

    if (sponsor) {
      csrs = csrs.filter(csr => csr.sponsor.toLowerCase().includes(sponsor.toLowerCase()));
    }

    // Limit results
    const limitedResults = csrs.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: limitedResults,
      count: limitedResults.length,
      total: csrs.length,
      query: query || '',
      source: 'processed_files',
    });
  } catch (error) {
    console.error('Error searching CSRs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search CSR data',
    });
  }
});

// Get single CSR by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const csrs = loadProcessedCSRs();
    const csr = csrs.find(c => c.nctrialId === id || c.csr_id === id);

    if (!csr) {
      return res.status(404).json({
        success: false,
        error: 'CSR not found',
      });
    }

    res.json({
      success: true,
      data: csr,
      source: 'processed_files',
    });
  } catch (error) {
    console.error('Error fetching CSR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch CSR data',
    });
  }
});

// Get statistics
router.get('/stats', async (req, res) => {
  try {
    const csrs = loadProcessedCSRs();

    // Calculate statistics
    const stats = {
      overview: {
        total_reports: csrs.length,
        processed_reports: csrs.length,
        unique_indications: [...new Set(csrs.map(c => c.indication))].length,
        unique_sponsors: [...new Set(csrs.map(c => c.sponsor))].length,
      },
      phaseDistribution: csrs.reduce((acc, csr) => {
        const phase = csr.phase || 'Unknown';
        acc[phase] = (acc[phase] || 0) + 1;
        return acc;
      }, {}),
      topIndications: Object.entries(
        csrs.reduce((acc, csr) => {
          const indication = csr.indication || 'Unknown';
          acc[indication] = (acc[indication] || 0) + 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      topSponsors: Object.entries(
        csrs.reduce((acc, csr) => {
          const sponsor = csr.sponsor || 'Unknown';
          acc[sponsor] = (acc[sponsor] || 0) + 1;
          return acc;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
    };

    res.json({
      success: true,
      data: stats,
      source: 'processed_files',
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate statistics',
    });
  }
});

export default router;
