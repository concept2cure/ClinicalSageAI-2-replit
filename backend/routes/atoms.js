/**
 * Content Atoms API Routes
 *
 * These routes handle CRUD operations for structured content blocks ("atoms")
 * used in the eCTD Co-Author module. Each atom is a reusable component with
 * metadata about its regulatory compliance, region, module, and section.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');

// Get all content atoms with optional filtering
router.get('/', async (req, res) => {
  try {
    const { region, module, section, type } = req.query;

    // Build the query with potential filters
    let query = `
      SELECT * FROM content_atoms 
      WHERE 1=1
    `;
    const params = [];

    if (region) {
      query += ` AND (region = $${params.length + 1} OR region = 'GLOBAL')`;
      params.push(region);
    }

    if (module) {
      query += ` AND module = $${params.length + 1}`;
      params.push(module);
    }

    if (section) {
      query += ` AND section_code = $${params.length + 1}`;
      params.push(section);
    }

    if (type) {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    // For now, return mock data if the database query fails (during development)
    // In production, this fallback should be removed
    try {
      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (dbError) {
      console.warn('Database query failed, using mock data:', dbError);

      // Return mock data for development
      const mockAtoms = [
        {
          atom_id: 'a1',
          type: 'table',
          region: 'US',
          module: '2',
          section_code: '2.5',
          schema_json: {
            columns: [
              { label: 'Parameter', type: 'string' },
              { label: 'Method', type: 'string' },
              { label: 'Result', type: 'string' },
              { label: 'Acceptance Criteria', type: 'string' },
            ],
            rules: {
              validation: true,
              required_columns: ['Parameter', 'Method'],
            },
          },
          ui_config: {
            title: 'Clinical Overview Table',
          },
        },
        {
          atom_id: 'a2',
          type: 'narrative',
          region: 'GLOBAL',
          module: '2',
          section_code: '2.7.3',
          schema_json: {
            defaultText: 'Insert clinical narrative content here...',
            placeholders: {
              drug_name: '[DRUG NAME]',
              indication: '[INDICATION]',
            },
            rules: {
              validation: true,
              min_length: 200,
            },
          },
          ui_config: {
            title: 'Clinical Efficacy Narrative',
          },
        },
        {
          atom_id: 'a3',
          type: 'figure',
          region: 'EU',
          module: '3',
          section_code: '3.2.S.4.1',
          schema_json: {
            defaultCaption: 'Figure X: [DESCRIPTION]',
            rules: {
              validation: true,
            },
          },
          ui_config: {
            title: 'Drug Substance Specification Figure',
          },
        },
      ];

      return res.json(mockAtoms);
    }
  } catch (error) {
    console.error('Error in atoms route:', error);
    res.status(500).json({ error: 'Failed to retrieve content atoms' });
  }
});

// Get a single content atom by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM content_atoms WHERE atom_id = $1';

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content atom not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching content atom:', error);
    res.status(500).json({ error: 'Failed to retrieve content atom' });
  }
});

// Create a new content atom (admin only)
router.post('/', async (req, res) => {
  try {
    const { type, region, module, section_code, schema_json, ui_config } = req.body;

    // Validate required fields
    if (!type || !region || !module || !section_code || !schema_json) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const query = `
      INSERT INTO content_atoms (type, region, module, section_code, schema_json, ui_config)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      type,
      region,
      module,
      section_code,
      schema_json,
      ui_config || {},
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating content atom:', error);
    res.status(500).json({ error: 'Failed to create content atom' });
  }
});

// Update a content atom (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, region, module, section_code, schema_json, ui_config } = req.body;

    // Validate required fields
    if (!type || !region || !module || !section_code || !schema_json) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const query = `
      UPDATE content_atoms
      SET type = $1, region = $2, module = $3, section_code = $4, 
          schema_json = $5, ui_config = $6, updated_at = NOW()
      WHERE atom_id = $7
      RETURNING *
    `;

    const result = await pool.query(query, [
      type,
      region,
      module,
      section_code,
      schema_json,
      ui_config || {},
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content atom not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating content atom:', error);
    res.status(500).json({ error: 'Failed to update content atom' });
  }
});

// Delete a content atom (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM content_atoms WHERE atom_id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content atom not found' });
    }

    res.json({ message: 'Content atom deleted successfully' });
  } catch (error) {
    console.error('Error deleting content atom:', error);
    res.status(500).json({ error: 'Failed to delete content atom' });
  }
});

module.exports = router;
