/**
 * Citation Routes - Server-side API routes for Citation Manager
 */

import express from 'express';

const router = express.Router();

/**
 * Search for citations
 *
 * @route GET /api/citation/search
 * @param {string} req.query.query - Search query
 * @param {string} req.query.source - Source to search (pubmed, crossref, etc.)
 * @param {number} req.query.limit - Maximum number of results to return
 * @returns {Object} - Search results
 */
router.get('/search', async (req, res) => {
  try {
    const { query, source = 'pubmed', limit = 10 } = req.query;

    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 3 characters',
      });
    }

    console.log(`Searching citations with query: "${query}", source: ${source}, limit: ${limit}`);

    // Mock search results based on the source
    let results = [];

    if (source === 'pubmed') {
      results = [
        {
          id: 'pmid:34567890',
          title: 'Clinical Outcomes in Phase 3 Studies of Monoclonal Antibodies',
          authors: [
            { lastName: 'Smith', firstName: 'J', initials: 'J' },
            { lastName: 'Johnson', firstName: 'R', initials: 'R' },
          ],
          journal: 'Journal of Clinical Research',
          year: 2024,
          volume: '45',
          issue: '2',
          pages: '123-145',
          doi: '10.1234/jcr.2024.45.2.123',
        },
        {
          id: 'pmid:34567891',
          title: 'Meta-analysis of Efficacy Endpoints in Oncology Trials',
          authors: [
            { lastName: 'Williams', firstName: 'L', initials: 'L' },
            { lastName: 'Brown', firstName: 'T', initials: 'T' },
            { lastName: 'Davis', firstName: 'M', initials: 'M' },
          ],
          journal: 'Clinical Oncology Research',
          year: 2023,
          volume: '32',
          issue: '4',
          pages: '345-359',
          doi: '10.5678/cor.2023.32.4.345',
        },
      ];
    } else if (source === 'crossref') {
      results = [
        {
          id: 'doi:10.9876/reg.2024.12.3.456',
          title: 'Regulatory Frameworks for Advanced Therapy Medicinal Products',
          authors: [
            { lastName: 'Taylor', firstName: 'S', initials: 'S' },
            { lastName: 'Martinez', firstName: 'C', initials: 'C' },
          ],
          journal: 'Regulatory Science',
          year: 2024,
          volume: '12',
          issue: '3',
          pages: '456-470',
          doi: '10.9876/reg.2024.12.3.456',
        },
      ];
    }

    res.json({
      success: true,
      query,
      source,
      results,
      total: results.length,
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error searching citations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search citations',
    });
  }
});

/**
 * Save citation to library
 *
 * @route POST /api/citation/save
 * @param {Object} req.body - Citation data
 * @returns {Object} - Saved citation
 */
router.post('/save', async (req, res) => {
  try {
    console.log('Saving citation:', JSON.stringify(req.body, null, 2));

    // Add ID and timestamp to the citation
    const savedCitation = {
      ...req.body,
      id: req.body.id || `citation-${Date.now()}`,
      savedAt: new Date().toISOString(),
      folders: req.body.folders || ['Uncategorized'],
    };

    res.json({
      success: true,
      citation: savedCitation,
      message: 'Citation saved successfully',
    });
  } catch (error) {
    console.error('Error saving citation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save citation',
    });
  }
});

/**
 * Get user's citation library
 *
 * @route GET /api/citation/library
 * @param {string} req.query.folder - Filter by folder (optional)
 * @param {string} req.query.sortBy - Sort field (optional)
 * @param {string} req.query.order - Sort order (asc/desc)
 * @returns {Object} - User's citation library
 */
router.get('/library', (req, res) => {
  try {
    const { folder, sortBy = 'savedAt', order = 'desc' } = req.query;

    console.log(`Getting citation library: folder=${folder}, sortBy=${sortBy}, order=${order}`);

    // Mock citation library
    const citations = [
      {
        id: 'citation-1234567890',
        title: 'Clinical Outcomes in Phase 3 Studies of Monoclonal Antibodies',
        authors: [
          { lastName: 'Smith', firstName: 'J', initials: 'J' },
          { lastName: 'Johnson', firstName: 'R', initials: 'R' },
        ],
        journal: 'Journal of Clinical Research',
        year: 2024,
        volume: '45',
        issue: '2',
        pages: '123-145',
        doi: '10.1234/jcr.2024.45.2.123',
        savedAt: '2024-04-15T10:30:00Z',
        folders: ['Antibody Research', 'Phase 3 Studies'],
      },
      {
        id: 'citation-1234567891',
        title: 'Meta-analysis of Efficacy Endpoints in Oncology Trials',
        authors: [
          { lastName: 'Williams', firstName: 'L', initials: 'L' },
          { lastName: 'Brown', firstName: 'T', initials: 'T' },
          { lastName: 'Davis', firstName: 'M', initials: 'M' },
        ],
        journal: 'Clinical Oncology Research',
        year: 2023,
        volume: '32',
        issue: '4',
        pages: '345-359',
        doi: '10.5678/cor.2023.32.4.345',
        savedAt: '2024-04-10T14:20:00Z',
        folders: ['Oncology', 'Meta-Analysis'],
      },
      {
        id: 'citation-1234567892',
        title: 'Regulatory Frameworks for Advanced Therapy Medicinal Products',
        authors: [
          { lastName: 'Taylor', firstName: 'S', initials: 'S' },
          { lastName: 'Martinez', firstName: 'C', initials: 'C' },
        ],
        journal: 'Regulatory Science',
        year: 2024,
        volume: '12',
        issue: '3',
        pages: '456-470',
        doi: '10.9876/reg.2024.12.3.456',
        savedAt: '2024-04-20T09:15:00Z',
        folders: ['Regulatory', 'ATMP'],
      },
    ];

    // Filter by folder if provided
    let filteredCitations = citations;
    if (folder) {
      filteredCitations = citations.filter(citation => citation.folders.includes(folder));
    }

    // Sort the citations
    filteredCitations.sort((a, b) => {
      if (order === 'asc') {
        return a[sortBy] > b[sortBy] ? 1 : -1;
      } else {
        return a[sortBy] < b[sortBy] ? 1 : -1;
      }
    });

    res.json({
      success: true,
      citations: filteredCitations,
      total: filteredCitations.length,
      folders: [
        'Uncategorized',
        'Antibody Research',
        'Phase 3 Studies',
        'Oncology',
        'Meta-Analysis',
        'Regulatory',
        'ATMP',
      ],
    });
  } catch (error) {
    console.error('Error retrieving citation library:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve citation library',
    });
  }
});

/**
 * Format citations in various styles
 *
 * @route POST /api/citation/format
 * @param {Array} req.body.citations - List of citation IDs to format
 * @param {string} req.body.style - Citation style (e.g., 'apa', 'mla', 'vancouver')
 * @returns {Object} - Formatted citations
 */
router.post('/format', (req, res) => {
  try {
    const { citations = [], style = 'vancouver' } = req.body;

    console.log(`Formatting ${citations.length} citations in ${style} style`);

    if (citations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No citations provided',
      });
    }

    // Mock formatted citations
    const formattedCitations = [];

    citations.forEach((citationId, index) => {
      let formatted = '';

      if (style === 'vancouver') {
        formatted = `${index + 1}. Smith J, Johnson R. Clinical Outcomes in Phase 3 Studies of Monoclonal Antibodies. J Clin Res. 2024;45(2):123-145. doi:10.1234/jcr.2024.45.2.123`;
      } else if (style === 'apa') {
        formatted = `Smith, J., & Johnson, R. (2024). Clinical Outcomes in Phase 3 Studies of Monoclonal Antibodies. Journal of Clinical Research, 45(2), 123-145. https://doi.org/10.1234/jcr.2024.45.2.123`;
      } else if (style === 'mla') {
        formatted = `Smith, J., and R. Johnson. "Clinical Outcomes in Phase 3 Studies of Monoclonal Antibodies." Journal of Clinical Research, vol. 45, no. 2, 2024, pp. 123-145.`;
      }

      formattedCitations.push({
        id: citationId,
        formatted,
      });
    });

    res.json({
      success: true,
      style,
      citations: formattedCitations,
    });
  } catch (error) {
    console.error('Error formatting citations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to format citations',
    });
  }
});

/**
 * Export citations to file
 *
 * @route POST /api/citation/export
 * @param {Array} req.body.citations - List of citation IDs to export
 * @param {string} req.body.format - Export format (e.g., 'bibtex', 'ris', 'csv')
 * @returns {Object} - Export details and download link
 */
router.post('/export', (req, res) => {
  try {
    const { citations = [], format = 'bibtex' } = req.body;

    console.log(`Exporting ${citations.length} citations in ${format} format`);

    if (citations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No citations provided',
      });
    }

    // Mock export response
    const exportId = `export-${Date.now()}`;
    const fileName = `citations-${Date.now()}.${format === 'bibtex' ? 'bib' : format}`;

    res.json({
      success: true,
      exportId,
      fileName,
      format,
      citationCount: citations.length,
      downloadUrl: `/api/citation/download/${exportId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    });
  } catch (error) {
    console.error('Error exporting citations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export citations',
    });
  }
});

export default router;
