import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';

const router = express.Router();

// Ensure cmc_documents table exists
async function ensureCmcDocumentsTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cmc_documents (
      id SERIAL PRIMARY KEY,
      project_id UUID,
      organization_id INTEGER DEFAULT 1,
      document_type TEXT NOT NULL DEFAULT 'general',
      module_section TEXT,
      title TEXT NOT NULL,
      content TEXT,
      section TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      version TEXT DEFAULT '1.0',
      file_path TEXT,
      metadata JSONB,
      compliance_score INTEGER,
      compliance_metrics JSONB,
      drug_candidate_id TEXT,
      study_id TEXT,
      tenant_id TEXT,
      created_by TEXT,
      last_modified_by TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  // Ensure version tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cmc_document_versions (
      id SERIAL PRIMARY KEY,
      document_id INTEGER REFERENCES cmc_documents(id) ON DELETE CASCADE,
      version_number TEXT NOT NULL,
      content TEXT,
      changes TEXT,
      author TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  // Ensure links table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cmc_document_links (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL,
      linked_document_id INTEGER NOT NULL,
      link_type TEXT DEFAULT 'reference',
      context TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  // Ensure collaborators table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cmc_document_collaborators (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL,
      user_id TEXT,
      role TEXT DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
}

// Validation schemas
const createDocumentSchema = z.object({
  module_section: z.string().min(1, 'Module section is required'),
  title: z.string().min(1, 'Title is required'),
  content: z.string().optional().default(''),
  status: z.string().optional().default('draft'),
  version: z.string().optional().default('1.0'),
  drug_candidate_id: z.string().optional(),
  study_id: z.string().optional(),
  created_by: z.string().optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  version: z.string().optional(),
  updated_by: z.string().optional(),
});

const linkDocumentSchema = z.object({
  linked_document_id: z.number().int().positive(),
  link_type: z.string().optional().default('reference'),
  context: z.string().optional(),
});

// GET /api/cmc/documents - List all documents for a tenant/study/drug
router.get('/', async (req, res) => {
  try {
    const { drug_candidate_id, study_id } = req.query;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    let query = `
      SELECT
        d.*,
        COUNT(DISTINCT v.id) as version_count,
        COUNT(DISTINCT l.id) as link_count,
        COUNT(DISTINCT c.id) as collaborator_count
      FROM cmc_documents d
      LEFT JOIN cmc_document_versions v ON d.id = v.document_id
      LEFT JOIN cmc_document_links l ON d.id = l.document_id
      LEFT JOIN cmc_document_collaborators c ON d.id = c.document_id
      WHERE d.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (drug_candidate_id) {
      query += ` AND d.drug_candidate_id = $${paramIndex}`;
      params.push(drug_candidate_id);
      paramIndex++;
    }

    if (study_id) {
      query += ` AND d.study_id = $${paramIndex}`;
      params.push(study_id);
      paramIndex++;
    }

    query += ` GROUP BY d.id ORDER BY d.module_section, d.created_at DESC`;

    const result = await pool.query(query, params);

    console.log(`[CMC Documents] Fetched ${result.rows.length} documents for tenant ${tenantId}`);

    res.json({
      success: true,
      documents: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/cmc/documents/module/:moduleSection - Get documents by module section
router.get('/module/:moduleSection', async (req, res) => {
  try {
    const { moduleSection } = req.params;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    const query = `
      SELECT
        d.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', v.id,
              'version_number', v.version_number,
              'author', v.author,
              'changes', v.changes,
              'created_at', v.created_at
            )
          ) FILTER (WHERE v.id IS NOT NULL),
          '[]'::json
        ) as versions
      FROM cmc_documents d
      LEFT JOIN cmc_document_versions v ON d.id = v.document_id
      WHERE d.tenant_id = $1 AND d.module_section = $2
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `;

    const result = await pool.query(query, [tenantId, moduleSection]);

    console.log(
      `[CMC Documents] Fetched ${result.rows.length} documents for module ${moduleSection}`
    );

    res.json({
      success: true,
      documents: result.rows,
      module: moduleSection,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error fetching module documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch module documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/cmc/documents/:id - Get specific document with version history
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    // Get main document
    const documentQuery = `
      SELECT * FROM cmc_documents
      WHERE id = $1 AND tenant_id = $2
    `;

    const documentResult = await pool.query(documentQuery, [id, tenantId]);

    if (documentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const document = documentResult.rows[0];

    // Get version history
    const versionsQuery = `
      SELECT * FROM cmc_document_versions
      WHERE document_id = $1
      ORDER BY created_at DESC
    `;

    const versionsResult = await pool.query(versionsQuery, [id]);

    // Get linked documents
    const linksQuery = `
      SELECT
        l.*,
        d.title as linked_title,
        d.module_section as linked_module
      FROM cmc_document_links l
      JOIN cmc_documents d ON l.linked_document_id = d.id
      WHERE l.document_id = $1
    `;

    const linksResult = await pool.query(linksQuery, [id]);

    // Get collaborators
    const collaboratorsQuery = `
      SELECT * FROM cmc_document_collaborators
      WHERE document_id = $1
    `;

    const collaboratorsResult = await pool.query(collaboratorsQuery, [id]);

    console.log(
      `[CMC Documents] Fetched document ${id} with ${versionsResult.rows.length} versions`
    );

    res.json({
      success: true,
      document: {
        ...document,
        versions: versionsResult.rows,
        links: linksResult.rows,
        collaborators: collaboratorsResult.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error fetching document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/cmc/documents - Create new document
router.post('/', async (req, res) => {
  try {
    const validationResult = createDocumentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    // Insert new document
    const insertQuery = `
      INSERT INTO cmc_documents (
        module_section, title, content, status, version,
        drug_candidate_id, study_id, tenant_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.module_section,
      data.title,
      data.content || '',
      data.status || 'draft',
      data.version || '1.0',
      data.drug_candidate_id || null,
      data.study_id || null,
      tenantId,
      data.created_by || 'system',
    ];

    const result = await pool.query(insertQuery, values);
    const newDocument = result.rows[0];

    // Create initial version
    const versionQuery = `
      INSERT INTO cmc_document_versions (
        document_id, version_number, content, changes, author
      ) VALUES ($1, $2, $3, $4, $5)
    `;

    await pool.query(versionQuery, [
      newDocument.id,
      '1.0',
      data.content || '',
      'Initial version',
      data.created_by || 'system',
    ]);

    console.log(
      `[CMC Documents] Created new document ${newDocument.id} for module ${data.module_section}`
    );

    res.status(201).json({
      success: true,
      document: newDocument,
      message: 'Document created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error creating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PUT /api/cmc/documents/:id - Update document (auto-creates version)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateDocumentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    // Get current document
    const currentQuery = `
      SELECT * FROM cmc_documents
      WHERE id = $1 AND tenant_id = $2
    `;

    const currentResult = await pool.query(currentQuery, [id, tenantId]);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const currentDocument = currentResult.rows[0];

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(data.content);
      paramIndex++;
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(data.status);
      paramIndex++;
    }

    if (data.version !== undefined) {
      updates.push(`version = $${paramIndex}`);
      values.push(data.version);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided',
      });
    }

    values.push(id, tenantId);

    const updateQuery = `
      UPDATE cmc_documents
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedDocument = updateResult.rows[0];

    // Create version history entry
    const newVersion = data.version || (parseFloat(currentDocument.version) + 0.1).toFixed(1);

    const versionQuery = `
      INSERT INTO cmc_document_versions (
        document_id, version_number, content, changes, author
      ) VALUES ($1, $2, $3, $4, $5)
    `;

    const changes = [];
    if (data.title && data.title !== currentDocument.title) {
      changes.push(`Title changed from "${currentDocument.title}" to "${data.title}"`);
    }
    if (data.status && data.status !== currentDocument.status) {
      changes.push(`Status changed from "${currentDocument.status}" to "${data.status}"`);
    }
    if (data.content && data.content !== currentDocument.content) {
      changes.push('Content updated');
    }

    await pool.query(versionQuery, [
      id,
      newVersion,
      data.content || currentDocument.content,
      changes.join('; ') || 'Updated',
      data.updated_by || 'system',
    ]);

    console.log(`[CMC Documents] Updated document ${id} to version ${newVersion}`);

    res.json({
      success: true,
      document: updatedDocument,
      version: newVersion,
      message: 'Document updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error updating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/cmc/documents/:id/link - Link documents across studies
router.post('/:id/link', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = linkDocumentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    // Verify both documents exist and belong to the tenant
    const verifyQuery = `
      SELECT id FROM cmc_documents
      WHERE id IN ($1, $2) AND tenant_id = $3
    `;

    const verifyResult = await pool.query(verifyQuery, [id, data.linked_document_id, tenantId]);

    if (verifyResult.rows.length !== 2) {
      return res.status(404).json({
        success: false,
        error: 'One or both documents not found',
      });
    }

    // Create the link
    const linkQuery = `
      INSERT INTO cmc_document_links (
        document_id, linked_document_id, link_type, context
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const linkResult = await pool.query(linkQuery, [
      id,
      data.linked_document_id,
      data.link_type || 'reference',
      data.context || null,
    ]);

    const newLink = linkResult.rows[0];

    console.log(
      `[CMC Documents] Created link between documents ${id} and ${data.linked_document_id}`
    );

    res.status(201).json({
      success: true,
      link: newLink,
      message: 'Documents linked successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error linking documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/cmc/documents/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'] || '7';
    const pool = getPool();

    await ensureCmcDocumentsTable();

    const deleteQuery = `
      DELETE FROM cmc_documents
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, title
    `;

    const result = await pool.query(deleteQuery, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    console.log(`[CMC Documents] Deleted document ${id}: ${result.rows[0].title}`);

    res.json({
      success: true,
      message: 'Document deleted successfully',
      deleted: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Documents] Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
