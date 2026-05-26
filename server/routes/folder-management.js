import express from 'express';
import { z } from 'zod';
import { pool as folderPool } from '../db.js';
const getPool = () => folderPool;
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get database pool
const pool = getPool();

// Validation schema for folder creation
const createFolderBody = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional().nullable(),
});

// GET /api/folders - Get folder tree or list
router.get(
  '/folders',
  asyncHandler(async (req, res) => {
    const { tree } = req.query;
    // Org from the JWT only — never from req.query (which also defaulted to
    // org 1), which let a caller list any tenant's folder tree.
    const organizationId = req.user?.organizationId ?? req.tenantContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    const result = await pool.query(
      'SELECT id, name, parent_id, organization_id, created_at, updated_at FROM document_folders WHERE organization_id = $1 ORDER BY name',
      [organizationId]
    );

    if (tree === 'true') {
      // Build hierarchical tree
      const folderMap = new Map();
      const treeData = [];

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
          treeData.push(folderMap.get(folder.id));
        }
      });

      res.json(treeData);
    } else {
      res.json(result.rows);
    }
  })
);

// POST /api/folders - Create new folder
router.post(
  '/folders',
  asyncHandler(async (req, res) => {
    const validated = createFolderBody.parse(req.body);
    // SECURITY: JWT-bound. Pre-fix, body.organizationId was used as
    // the new folder's tenant — a caller could create folders inside
    // any tenant they named.
    const organizationId = req.user?.organizationId ?? req.tenantContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    const result = await pool.query(
      `INSERT INTO document_folders (name, parent_id, organization_id, created_by_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, parent_id, organization_id, created_by_id, created_at, updated_at`,
      [validated.name, validated.parentId || null, organizationId, 1]
    );

    res.status(201).json(result.rows[0]);
  })
);

// PATCH /api/folders/:id - Rename folder
router.patch(
  '/folders/:id',
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const organizationId = req.user?.organizationId ?? req.tenantContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    const result = await pool.query(
      'UPDATE document_folders SET name = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 RETURNING id, name, parent_id, organization_id, created_at, updated_at',
      [name, req.params.id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(result.rows[0]);
  })
);

// DELETE /api/folders/:id - Delete folder (only if empty)
router.delete(
  '/folders/:id',
  asyncHandler(async (req, res) => {
    const organizationId = req.user?.organizationId ?? req.tenantContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    // Verify ownership first so a foreign folder 404s rather than leaking its
    // existence (and document/subfolder counts) through the guards below.
    const owned = await pool.query(
      'SELECT id FROM document_folders WHERE id = $1 AND organization_id = $2',
      [req.params.id, organizationId]
    );
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

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
      'DELETE FROM document_folders WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ success: true, id: result.rows[0].id });
  })
);

export default router;
