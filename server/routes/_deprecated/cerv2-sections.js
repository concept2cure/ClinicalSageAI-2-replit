// CERV2 510(k) Section Editor API routes
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = Router();

// Middleware to check for organization ID
router.use((req, res, next) => {
  const organizationId = req.headers['x-organization-id'] || req.headers['X-Organization-Id'];
  if (!organizationId) {
    return res.status(403).json({ error: 'Missing x-organization-id header' });
  }
  req.organizationId = parseInt(organizationId);
  next();
});

// GET /api/cerv2-sections - Get all sections as tree structure
router.get('/', async (req, res) => {
  try {
    const { document_id, flat } = req.query;

    let conditions = [sql`organization_id = ${req.organizationId}`];
    
    if (document_id) {
      conditions.push(sql`document_id = ${parseInt(document_id)}`);
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

    // If flat=true, return as flat array
    if (flat === 'true') {
      return res.json({
        success: true,
        sections: sections
      });
    }

    // Build tree structure
    const sectionMap = new Map();
    const tree = [];

    // First pass: create map
    sections.forEach(section => {
      sectionMap.set(section.id, { ...section, children: [] });
    });

    // Second pass: build tree
    sections.forEach(section => {
      const node = sectionMap.get(section.id);
      if (section.parent_section_id) {
        const parent = sectionMap.get(section.parent_section_id);
        if (parent) {
          parent.children.push(node);
        } else {
          tree.push(node);
        }
      } else {
        tree.push(node);
      }
    });

    res.json({
      success: true,
      sections: tree
    });
  } catch (error) {
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