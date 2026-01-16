// CERV2 510(k) Section Editor API routes
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

function isMissingRelationError(error) {
  // Postgres: undefined_table
  return Boolean(
    error &&
      (
        error.code === '42P01' ||
        error.code === 'NO_DB' ||
        String(error.message || '').includes('does not exist') ||
        String(error.message || '').includes('DATABASE_URL environment variable not set')
      )
  );
}

function emptySectionsResponse(res, extra = {}) {
  return res.json({
    success: true,
    sections: [],
    warning: 'Sections table not initialized. Run `npm run db:push` to enable persistent dossier sections.',
    ...extra,
  });
}

function buildTreeFromFlatSections(flatSections) {
  const sectionMap = new Map();
  const tree = [];

  flatSections.forEach((section) => {
    sectionMap.set(section.id, { ...section, children: [] });
  });

  flatSections.forEach((section) => {
    const node = sectionMap.get(section.id);
    if (section.parent_section_id) {
      const parent = sectionMap.get(section.parent_section_id);
      if (parent) parent.children.push(node);
      else tree.push(node);
    } else {
      tree.push(node);
    }
  });

  return tree;
}

function demoSectionsFlat({ organizationId, documentId = null }) {
  // Minimal, FDA-flavored 510(k) structure to satisfy demo/journey scripts.
  // Uses pseudo-IDs that won't collide with DB serials.
  const rows = [
    {
      id: -101,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '1',
      section_title: 'Administrative Information',
      parent_section_id: null,
      level: 1,
      display_order: 1,
      status: 'todo',
      completion_percentage: 15,
      content: '',
    },
    {
      id: -102,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '2',
      section_title: 'Device Description',
      parent_section_id: null,
      level: 1,
      display_order: 2,
      status: 'drafting',
      completion_percentage: 45,
      content: '',
    },
    {
      id: -103,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '3',
      section_title: 'Substantial Equivalence',
      parent_section_id: null,
      level: 1,
      display_order: 3,
      status: 'drafting',
      completion_percentage: 55,
      content: '',
    },
    {
      id: -104,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '4',
      section_title: 'Performance Testing',
      parent_section_id: null,
      level: 1,
      display_order: 4,
      status: 'todo',
      completion_percentage: 25,
      content: '',
    },
    {
      id: -105,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '5',
      section_title: 'Labeling',
      parent_section_id: null,
      level: 1,
      display_order: 5,
      status: 'todo',
      completion_percentage: 10,
      content: '',
    },
    {
      id: -106,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '6',
      section_title: 'Sterilization / Biocompatibility (if applicable)',
      parent_section_id: null,
      level: 1,
      display_order: 6,
      status: 'todo',
      completion_percentage: 0,
      content: '',
    },
    {
      id: -107,
      organization_id: organizationId,
      document_id: documentId,
      section_number: '7',
      section_title: 'Software Documentation (if applicable)',
      parent_section_id: null,
      level: 1,
      display_order: 7,
      status: 'todo',
      completion_percentage: 0,
      content: '',
    },
  ];

  const sorted = [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const pageById = new Map();
  sorted.forEach((s, idx) => pageById.set(s.id, idx + 1));

  return rows.map((s) => {
    const status = String(s.status || '').toLowerCase();
    const completion = Number.isFinite(s.completion_percentage) ? s.completion_percentage : null;
    const icon = status === 'validated' ? 'CheckCircle' : status === 'drafting' ? 'Edit3' : 'Circle';
    return {
      ...s,
      pageNumber: pageById.get(s.id) || null,
      completionIcon: icon,
      completionStatus: status || 'todo',
      completionPercentage: completion,
    };
  });
}

// GET /api/cerv2-sections - Get all sections as tree structure
router.get('/', async (req, res) => {
  try {
    const { document_id, projectId, flat } = req.query;

    const projectIdStr = projectId != null ? String(projectId) : null;
    const isDemoProject = projectIdStr ? projectIdStr.toLowerCase() === 'demo' : false;

    // Allow projectId as a compatibility alias used by UI/journey scripts.
    const docIdRaw = document_id ?? projectId;
    const docId = docIdRaw ? parseInt(String(docIdRaw), 10) : NaN;

    let conditions = [sql`organization_id = ${req.organizationId}`];
    
    if (Number.isFinite(docId)) {
      conditions.push(sql`document_id = ${docId}`);
    }

    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT * FROM cerv2_510k_sections 
      ${whereClause}
      ORDER BY display_order ASC
    `);

    const sections = Array.isArray(result) ? result : result.rows || [];

    // Journey-script friendly behavior: if demo has no rows yet, return a usable skeleton.
    if (isDemoProject && sections.length === 0) {
      const flatDemo = demoSectionsFlat({ organizationId: req.organizationId, documentId: Number.isFinite(docId) ? docId : null });
      return res.json({
        success: true,
        sections: flat === 'true' ? flatDemo : buildTreeFromFlatSections(flatDemo),
        warning: 'Demo dossier structure returned (no persisted sections found for this tenant/project yet).',
      });
    }

    // Add UX helper fields (page numbers + completion icon hints) without altering storage.
    const sorted = [...sections].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const pageById = new Map();
    sorted.forEach((s, idx) => pageById.set(s.id, idx + 1));

    const withUx = sections.map((s) => {
      const status = String(s.status || '').toLowerCase();
      const completion = Number.isFinite(s.completion_percentage) ? s.completion_percentage : null;
      const icon =
        status === 'validated' ? 'CheckCircle' :
        status === 'drafting' ? 'Edit3' :
        'Circle';
      return {
        ...s,
        pageNumber: pageById.get(s.id) || null,
        completionIcon: icon,
        completionStatus: status || 'todo',
        completionPercentage: completion,
      };
    });

    // If flat=true, return as flat array
    if (flat === 'true') {
      return res.json({
        success: true,
        sections: withUx
      });
    }

    res.json({
      success: true,
      sections: buildTreeFromFlatSections(withUx)
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      const projectIdStr = req.query?.projectId != null ? String(req.query.projectId) : null;
      const isDemoProject = projectIdStr ? projectIdStr.toLowerCase() === 'demo' : false;
      if (isDemoProject) {
        const flatDemo = demoSectionsFlat({ organizationId: req.organizationId, documentId: null });
        return emptySectionsResponse(res, {
          sections: buildTreeFromFlatSections(flatDemo),
          warning: 'Demo dossier structure returned (sections table not initialized).',
        });
      }
      return emptySectionsResponse(res);
    }
    console.error('[CERV2 Sections] Error getting sections:', error);
    res.status(500).json({ error: 'Failed to get sections' });
  }
});

// GET /api/cerv2-sections/:id - Get single section
router.get('/:id', async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);

    const result = await db.execute(sql`
      SELECT * FROM cerv2_510k_sections 
      WHERE id = ${sectionId} AND organization_id = ${req.organizationId}
    `);

    const sections = Array.isArray(result) ? result : result.rows || [];

    if (sections.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json({
      success: true,
      section: sections[0]
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return res.status(404).json({ error: 'Section not found (sections table not initialized)' });
    }
    console.error('[CERV2 Sections] Error getting section:', error);
    res.status(500).json({ error: 'Failed to get section' });
  }
});

// POST /api/cerv2-sections - Create a new section
router.post('/', async (req, res) => {
  try {
    const {
      document_id,
      section_number,
      section_title,
      parent_section_id,
      level = 1,
      display_order = 0,
      status = 'todo',
      content = '',
      compliance_notes = '',
      sources = [],
      assigned_to,
      reviewer,
      due_date,
      metadata = {}
    } = req.body;

    if (!section_number || !section_title) {
      return res.status(400).json({ 
        error: 'Missing required fields: section_number, section_title' 
      });
    }

    const result = await db.execute(sql`
      INSERT INTO cerv2_510k_sections (
        organization_id,
        document_id,
        section_number,
        section_title,
        parent_section_id,
        level,
        display_order,
        status,
        content,
        compliance_notes,
        sources,
        metadata,
        assigned_to,
        reviewer,
        due_date
      ) VALUES (
        ${req.organizationId},
        ${document_id || null},
        ${section_number},
        ${section_title},
        ${parent_section_id || null},
        ${level},
        ${display_order},
        ${status},
        ${content},
        ${compliance_notes},
        ${JSON.stringify(sources)}::jsonb,
        ${JSON.stringify(metadata)}::jsonb,
        ${assigned_to || null},
        ${reviewer || null},
        ${due_date || null}
      )
      RETURNING *
    `);

    const insertedRows = Array.isArray(result) ? result : result.rows || [];

    res.json({
      success: true,
      section: insertedRows[0]
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Sections storage not initialized. Run `npm run db:push` to enable dossier persistence.',
      });
    }
    console.error('[CERV2 Sections] Error creating section:', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/cerv2-sections/:id - Update section
router.patch('/:id', async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);
    const {
      section_title,
      status,
      content,
      compliance_notes,
      sources,
      assigned_to,
      reviewer,
      due_date,
      metadata
    } = req.body;

    let updates = [];
    
    if (section_title !== undefined) updates.push(sql`section_title = ${section_title}`);
    if (status !== undefined) {
      updates.push(sql`status = ${status}`);
      // Track completion timestamps
      if (status === 'validated') {
        updates.push(sql`validated_at = CURRENT_TIMESTAMP`);
        updates.push(sql`completed_at = CURRENT_TIMESTAMP`);
      } else if (status === 'drafting' && !updates.includes('completed_at')) {
        updates.push(sql`completed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (content !== undefined) updates.push(sql`content = ${content}`);
    if (compliance_notes !== undefined) updates.push(sql`compliance_notes = ${compliance_notes}`);
    if (sources !== undefined) updates.push(sql`sources = ${JSON.stringify(sources)}::jsonb`);
    if (assigned_to !== undefined) updates.push(sql`assigned_to = ${assigned_to}`);
    if (reviewer !== undefined) updates.push(sql`reviewer = ${reviewer}`);
    if (due_date !== undefined) updates.push(sql`due_date = ${due_date}`);
    if (metadata !== undefined) updates.push(sql`metadata = ${JSON.stringify(metadata)}::jsonb`);
    
    updates.push(sql`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await db.execute(sql`
      UPDATE cerv2_510k_sections 
      SET ${sql.join(updates, sql`, `)}
      WHERE id = ${sectionId} AND organization_id = ${req.organizationId}
      RETURNING *
    `);

    const updatedRows = Array.isArray(result) ? result : result.rows || [];

    if (updatedRows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json({
      success: true,
      section: updatedRows[0]
    });
  } catch (error) {
    console.error('[CERV2 Sections] Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/cerv2-sections/:id - Delete section
router.delete('/:id', async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);
    
    const result = await db.execute(sql`
      DELETE FROM cerv2_510k_sections 
      WHERE id = ${sectionId} AND organization_id = ${req.organizationId}
      RETURNING section_title
    `);

    const deletedRows = Array.isArray(result) ? result : result.rows || [];

    if (deletedRows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json({
      success: true,
      message: `Section "${deletedRows[0].section_title}" deleted successfully`
    });
  } catch (error) {
    console.error('[CERV2 Sections] Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// GET /api/cerv2-sections/stats - Get section statistics
router.get('/api/stats', async (req, res) => {
  try {
    const { document_id } = req.query;

    let conditions = [sql`organization_id = ${req.organizationId}`];
    
    if (document_id) {
      conditions.push(sql`document_id = ${parseInt(document_id)}`);
    }

    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_sections,
        COUNT(CASE WHEN status = 'todo' THEN 1 END) as todo_count,
        COUNT(CASE WHEN status = 'drafting' THEN 1 END) as drafting_count,
        COUNT(CASE WHEN status = 'validated' THEN 1 END) as validated_count,
        COUNT(CASE WHEN assigned_to IS NOT NULL THEN 1 END) as assigned_count,
        ROUND(
          (COUNT(CASE WHEN status = 'validated' THEN 1 END)::float / 
           NULLIF(COUNT(*)::float, 0)) * 100, 
          1
        ) as completion_percentage
      FROM cerv2_510k_sections 
      ${whereClause}
    `);

    const statsRows = Array.isArray(stats) ? stats : stats.rows || [];

    res.json({
      success: true,
      stats: statsRows[0] || {
        total_sections: 0,
        todo_count: 0,
        drafting_count: 0,
        validated_count: 0,
        assigned_count: 0,
        completion_percentage: 0
      }
    });
  } catch (error) {
    console.error('[CERV2 Sections] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

export default router;