import express from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';

const router = express.Router();

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

// In-memory fallback for demo / NO_DB mode
const memoryStore = {
  documents: new Map(),
  nextId: 1,
};

let warnedDbUnavailable = false;

function isDbConnectivityError(error) {
  if (!error) return false;

  const code = error.code || error.errno;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return true;

  // pg-pool can surface AggregateError with nested connection errors
  const nested = error.errors || error.cause?.errors;
  if (Array.isArray(nested) && nested.some(isDbConnectivityError)) return true;

  const message = (error && (error.message || String(error))) || '';
  return (
    message.includes('ECONNREFUSED') ||
    message.includes('connect ECONNREFUSED') ||
    message.includes('Database not available') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT')
  );
}

function warnDbUnavailableOnce(error) {
  if (warnedDbUnavailable) return;
  warnedDbUnavailable = true;
  console.warn('[documents] DB unavailable; using in-memory fallback');
  if (error && !isDbConnectivityError(error)) {
    console.warn('[documents] Non-connectivity error:', error);
  }
}

function ensureSeedDocuments() {
  if (memoryStore.documents.size > 0) return;
  const now = new Date().toISOString();
  const seed = [
    {
      name: 'eCTD Co-Author Demo — Module 2.5 Clinical Overview',
      description: 'Demo document (no DB mode).',
      type: 'document',
      status: 'draft',
      tags: ['ectd', 'demo', 'module-2.5'],
      content: {
        title: 'Module 2.5 Clinical Overview',
        body: 'This is a demo document generated in NO_DB mode.',
      },
      metadata: {
        module: '2.5',
        region: 'US',
      },
      folder_id: null,
      organization_id: 1,
      created_by_id: 1,
    },
    {
      name: 'eCTD Co-Author Demo — Module 3.2.S.4 Control of Drug Substance',
      description: 'Demo document (no DB mode).',
      type: 'document',
      status: 'draft',
      tags: ['ectd', 'demo', 'module-3'],
      content: {
        title: '3.2.S.4 Control of Drug Substance',
        body: 'NO_DB demo content — replace with real data when DB is configured.',
      },
      metadata: {
        module: '3.2.S.4',
        region: 'US',
      },
      folder_id: null,
      organization_id: 1,
      created_by_id: 1,
    },
  ];

  seed.forEach(doc => {
    const id = memoryStore.nextId++;
    memoryStore.documents.set(String(id), {
      id,
      version: 1,
      created_at: now,
      updated_at: now,
      ...doc,
    });
  });
}

function listMemoryDocuments(limit) {
  ensureSeedDocuments();
  const docs = Array.from(memoryStore.documents.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return typeof limit === 'number' && Number.isFinite(limit) ? docs.slice(0, limit) : docs;
}

function getDbPoolOrNull() {
  if (!HAS_DATABASE_URL) return null;
  try {
    return getPool();
  } catch (_e) {
    return null;
  }
}

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
    if (!HAS_DATABASE_URL) {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      return res.json(listMemoryDocuments(limit));
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      return res.json(listMemoryDocuments(limit));
    }

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
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error listing documents:', error);
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(listMemoryDocuments(limit));
  }
});

// GET /api/documents/:id - Get single document
router.get('/documents/:id', async (req, res) => {
  try {
    if (!HAS_DATABASE_URL) {
      ensureSeedDocuments();
      const doc = memoryStore.documents.get(String(req.params.id));
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      return res.json(doc);
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      ensureSeedDocuments();
      const doc = memoryStore.documents.get(String(req.params.id));
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      return res.json(doc);
    }

    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error fetching document:', error);
    }
    ensureSeedDocuments();
    const doc = memoryStore.documents.get(String(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  }
});

// POST /api/documents - Create new document
router.post('/documents', async (req, res) => {
  try {
    const validated = createDocumentBody.parse(req.body);
    const organizationId = req.body.organizationId || 1;

    if (!HAS_DATABASE_URL) {
      ensureSeedDocuments();
      const now = new Date().toISOString();
      const id = memoryStore.nextId++;
      const doc = {
        id,
        name: validated.name,
        description: validated.description || '',
        type: validated.type,
        folder_id: validated.folderId || null,
        status: validated.status,
        tags: validated.tags || [],
        content: validated.content || {},
        metadata: validated.metadata || {},
        organization_id: organizationId,
        created_by_id: 1,
        version: 1,
        created_at: now,
        updated_at: now,
      };
      memoryStore.documents.set(String(id), doc);
      return res.status(201).json(doc);
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      ensureSeedDocuments();
      const now = new Date().toISOString();
      const id = memoryStore.nextId++;
      const doc = {
        id,
        name: validated.name,
        description: validated.description || '',
        type: validated.type,
        folder_id: validated.folderId || null,
        status: validated.status,
        tags: validated.tags || [],
        content: validated.content || {},
        metadata: validated.metadata || {},
        organization_id: organizationId,
        created_by_id: 1,
        version: 1,
        created_at: now,
        updated_at: now,
      };
      memoryStore.documents.set(String(id), doc);
      return res.status(201).json(doc);
    }
    
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
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error creating document:', error);
    }
    ensureSeedDocuments();
    const now = new Date().toISOString();
    const id = memoryStore.nextId++;
    const doc = {
      id,
      name: req.body?.name || 'Untitled Document',
      description: req.body?.description || '',
      type: req.body?.type || 'document',
      folder_id: req.body?.folderId || null,
      status: req.body?.status || 'draft',
      tags: req.body?.tags || [],
      content: req.body?.content || {},
      metadata: req.body?.metadata || {},
      organization_id: req.body?.organizationId || 1,
      created_by_id: 1,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    memoryStore.documents.set(String(id), doc);
    res.status(201).json(doc);
  }
});

// PATCH /api/documents/:id - Update document
router.patch('/documents/:id', async (req, res) => {
  try {
    if (!HAS_DATABASE_URL) {
      ensureSeedDocuments();
      const key = String(req.params.id);
      const existing = memoryStore.documents.get(key);
      if (!existing) return res.status(404).json({ error: 'Document not found' });
      const now = new Date().toISOString();
      const allowedFields = ['name', 'description', 'status', 'tags', 'folder_id', 'content', 'metadata'];
      const next = { ...existing };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) next[field] = req.body[field];
      }
      next.updated_at = now;
      next.version = (next.version || 1) + 1;
      memoryStore.documents.set(key, next);
      return res.json(next);
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      ensureSeedDocuments();
      const key = String(req.params.id);
      const existing = memoryStore.documents.get(key);
      if (!existing) return res.status(404).json({ error: 'Document not found' });
      const now = new Date().toISOString();
      const allowedFields = ['name', 'description', 'status', 'tags', 'folder_id', 'content', 'metadata'];
      const next = { ...existing };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) next[field] = req.body[field];
      }
      next.updated_at = now;
      next.version = (next.version || 1) + 1;
      memoryStore.documents.set(key, next);
      return res.json(next);
    }

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
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error updating document:', error);
    }
    ensureSeedDocuments();
    const key = String(req.params.id);
    const existing = memoryStore.documents.get(key);
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    const now = new Date().toISOString();
    const allowedFields = ['name', 'description', 'status', 'tags', 'folder_id', 'content', 'metadata'];
    const next = { ...existing };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) next[field] = req.body[field];
    }
    next.updated_at = now;
    next.version = (next.version || 1) + 1;
    memoryStore.documents.set(key, next);
    res.json(next);
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    if (!HAS_DATABASE_URL) {
      ensureSeedDocuments();
      const existed = memoryStore.documents.delete(String(req.params.id));
      if (!existed) return res.status(404).json({ error: 'Document not found' });
      return res.json({ success: true, id: Number(req.params.id) || req.params.id });
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      ensureSeedDocuments();
      const existed = memoryStore.documents.delete(String(req.params.id));
      if (!existed) return res.status(404).json({ error: 'Document not found' });
      return res.json({ success: true, id: Number(req.params.id) || req.params.id });
    }

    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error deleting document:', error);
    }
    ensureSeedDocuments();
    const existed = memoryStore.documents.delete(String(req.params.id));
    if (!existed) return res.status(404).json({ error: 'Document not found' });
    res.json({ success: true, id: Number(req.params.id) || req.params.id });
  }
});

// POST /api/documents/:id/move - Move document to folder
router.post('/documents/:id/move', async (req, res) => {
  try {
    const { folderId } = req.body;

    if (!HAS_DATABASE_URL) {
      ensureSeedDocuments();
      const key = String(req.params.id);
      const existing = memoryStore.documents.get(key);
      if (!existing) return res.status(404).json({ error: 'Document not found' });
      const now = new Date().toISOString();
      const next = { ...existing, folder_id: folderId || null, updated_at: now, version: (existing.version || 1) + 1 };
      memoryStore.documents.set(key, next);
      return res.json(next);
    }

    const pool = getDbPoolOrNull();
    if (!pool) {
      ensureSeedDocuments();
      const key = String(req.params.id);
      const existing = memoryStore.documents.get(key);
      if (!existing) return res.status(404).json({ error: 'Document not found' });
      const now = new Date().toISOString();
      const next = { ...existing, folder_id: folderId || null, updated_at: now, version: (existing.version || 1) + 1 };
      memoryStore.documents.set(key, next);
      return res.json(next);
    }
    
    const result = await pool.query(
      'UPDATE documents SET folder_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [folderId || null, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    if (isDbConnectivityError(error)) {
      warnDbUnavailableOnce(error);
    } else {
      console.error('Error moving document:', error);
    }
    ensureSeedDocuments();
    const key = String(req.params.id);
    const existing = memoryStore.documents.get(key);
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    const now = new Date().toISOString();
    const next = { ...existing, folder_id: req.body?.folderId || null, updated_at: now, version: (existing.version || 1) + 1 };
    memoryStore.documents.set(key, next);
    res.json(next);
  }
});

export default router;