import express from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';

const router = express.Router();

// Get database pool
const pool = getPool();

// Create document validation schema
const createDocumentBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.record(z.any()).optional(),
  folderId: z.number().optional().nullable(),
  type: z.string().default('document'),
  status: z.enum(['draft', 'final']).default('draft'),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// GET /api/documents - List all documents with filters
router.get('/documents', async (req, res) => {
  try {
    const { folderId, status, tags, type, search, organizationId = 1 } = req.query;
    
    let query = 'SELECT * FROM documents WHERE organization_id = $1';
    const params = [organizationId];
    let paramCount = 1;

    if (folderId !== undefined) {
      paramCount++;
      query += ` AND ${folderId === 'null' ? 'folder_id IS NULL' : `folder_id = $${paramCount}`}`;
      if (folderId !== 'null') params.push(folderId);
    }

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (tags && tags.length > 0) {
      paramCount++;
      query += ` AND tags && $${paramCount}::text[]`;
      params.push(Array.isArray(tags) ? tags : [tags]);
    }

    query += ' ORDER BY updated_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// GET /api/documents/:id - Get single document
router.get('/documents/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/documents - Create new document
router.post('/documents', async (req, res) => {
  try {
    const validated = createDocumentBody.parse(req.body);
    const organizationId = req.body.organizationId || 1;
    
    const result = await pool.query(
      `INSERT INTO documents (name, description, type, folder_id, status, tags, content, metadata, organization_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        validated.name,
        validated.description || '',
        validated.type,
        validated.folderId || null,
        validated.status,
        validated.tags || [],
        validated.content || {},
        validated.metadata || {},
        organizationId,
        1 // Default user ID
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// PATCH /api/documents/:id - Update document
router.patch('/documents/:id', async (req, res) => {
  try {
    const updates = [];
    const params = [];
    let paramCount = 0;

    const allowedFields = ['name', 'description', 'status', 'tags', 'folder_id', 'content', 'metadata'];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    updates.push(`version = version + 1`);
    
    params.push(req.params.id);
    
    const result = await pool.query(
      `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// POST /api/documents/:id/move - Move document to folder
router.post('/documents/:id/move', async (req, res) => {
  try {
    const { folderId } = req.body;
    
    const result = await pool.query(
      'UPDATE documents SET folder_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [folderId || null, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error moving document:', error);
    res.status(500).json({ error: 'Failed to move document' });
  }
});

export default router;