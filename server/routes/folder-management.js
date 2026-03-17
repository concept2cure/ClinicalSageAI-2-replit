import express from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';

const router = express.Router();

// Get database pool
const pool = getPool();

// Validation schema for folder creation
const createFolderBody = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional().nullable(),
});

// GET /api/folders - Get folder tree or list
router.get('/folders', async (req, res) => {
  try {
    const { tree, organizationId = 1 } = req.query;
    
    const result = await pool.query(
      'SELECT id, name, parent_id, organization_id, created_at, updated_at FROM document_folders WHERE organization_id = $1 ORDER BY name',
      [organizationId]
    );
    
    if (tree === 'true') {
      // Build hierarchical tree
      const folderMap = new Map();
      const tree = [];
      
      result.rows.forEach(folder => {
        folderMap.set(folder.id, { ...folder, children: [] });
      });
      
      result.rows.forEach(folder => {
        if (folder.parent_id) {
          const parent = folderMap.get(folder.parent_id);
          if (parent) {
            parent.children.push(folderMap.get(folder.id));
          }
        } else {
          tree.push(folderMap.get(folder.id));
        }
      });
      
      res.json(tree);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// POST /api/folders - Create new folder
router.post('/folders', async (req, res) => {
  try {
    const validated = createFolderBody.parse(req.body);
    const organizationId = req.body.organizationId || 1;
    
    const result = await pool.query(
      `INSERT INTO document_folders (name, parent_id, organization_id, created_by_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [validated.name, validated.parentId || null, organizationId, 1]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PATCH /api/folders/:id - Rename folder
router.patch('/folders/:id', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await pool.query(
      'UPDATE document_folders SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// DELETE /api/folders/:id - Delete folder (only if empty)
router.delete('/folders/:id', async (req, res) => {
  try {
    // Check if folder has documents
    const docCheck = await pool.query(
      'SELECT COUNT(*) as count FROM documents WHERE folder_id = $1',
      [req.params.id]
    );
    
    if (parseInt(docCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete folder with documents' });
    }
    
    // Check if folder has subfolders
    const folderCheck = await pool.query(
      'SELECT COUNT(*) as count FROM document_folders WHERE parent_id = $1',
      [req.params.id]
    );
    
    if (parseInt(folderCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete folder with subfolders' });
    }
    
    const result = await pool.query(
      'DELETE FROM document_folders WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;