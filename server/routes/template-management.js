import express from 'express';
import { getAllTemplates } from '../utils/templateRegistry.js';
import { getPool } from '../db/pool.js';

const router = express.Router();

// Get database pool
const pool = getPool();

// GET /api/templates - List all templates
router.get('/templates', async (req, res) => {
  try {
    const { category, source = 'all' } = req.query;
    
    let templates = [];
    
    // Get code-based templates (588+ IND templates)
    if (source === 'all' || source === 'code') {
      const codeTemplates = getAllTemplates();
      templates = templates.concat(codeTemplates.map(t => ({
        ...t,
        source: 'code'
      })));
    }
    
    // Get database templates
    if (source === 'all' || source === 'db') {
      const result = await pool.query(
        'SELECT * FROM document_templates WHERE is_active = true'
      );
      templates = templates.concat(result.rows.map(t => ({
        ...t,
        source: 'db'
      })));
    }
    
    // Filter by category if specified
    if (category) {
      templates = templates.filter(t => 
        t.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/templates/:id - Get single template with preview data
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let foundTemplate = null;
    
    // First check code templates
    const codeTemplates = getAllTemplates();
    foundTemplate = codeTemplates.find(t => t.id === id);
    
    if (!foundTemplate) {
      // Then check database
      const result = await pool.query(
        'SELECT * FROM document_templates WHERE id = $1',
        [id]
      );
      
      if (result.rows.length > 0) {
        foundTemplate = result.rows[0];
      }
    }
    
    if (!foundTemplate) {
      return res.status(404).json({ 
        success: false, 
        error: 'Template not found' 
      });
    }
    
    // Generate default sections if not provided
    const defaultSections = [
      { title: 'Executive Summary', content: 'This section provides a high-level overview of the key findings and recommendations.' },
      { title: 'Clinical Overview', content: 'Detailed clinical data and study results are presented in this section.' },
      { title: 'Quality Information', content: 'Quality control and assurance information is documented here.' },
      { title: 'Safety Assessment', content: 'Comprehensive safety data and risk evaluation are included in this section.' },
      { title: 'Regulatory Compliance', content: 'Documentation of regulatory requirements and compliance status.' }
    ];
    
    // Return template with preview data in expected format
    res.json({
      success: true,
      template: {
        id: foundTemplate.id,
        templateName: foundTemplate.name || foundTemplate.templateName || `Template ${id}`,
        description: foundTemplate.description || 'Professional regulatory template for document generation',
        content: foundTemplate.content || foundTemplate.structure || '<p>Template content will be displayed here.</p>',
        sections: foundTemplate.sections || defaultSections,
        category: foundTemplate.category || 'General',
        tags: foundTemplate.tags || [],
        agency: foundTemplate.agency || 'FDA',
        format: foundTemplate.format || 'html',
        source: foundTemplate.source || 'code',
        metadata: {
          createdAt: foundTemplate.created_at || foundTemplate.createdAt || new Date().toISOString(),
          updatedAt: foundTemplate.updated_at || foundTemplate.updatedAt || new Date().toISOString(),
          version: foundTemplate.version || '1.0.0',
          status: foundTemplate.status || 'active'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while fetching template' 
    });
  }
});

// POST /api/templates/:id/use - Create document from template
router.post('/templates/:id/use', async (req, res) => {
  try {
    const { title, folderId, moduleOrigin } = req.body;
    
    // Get the template
    const codeTemplates = getAllTemplates();
    let template = codeTemplates.find(t => t.id === req.params.id);
    
    if (!template) {
      // Check database if not found in code templates
      const result = await pool.query(
        'SELECT * FROM document_templates WHERE id = $1',
        [req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      template = result.rows[0];
    }
    
    // Create document from template
    const result = await pool.query(
      `INSERT INTO documents (title, content, content_format, folder_id, template_id, status, module_origin, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title || template.name,
        template.content,
        template.format || 'html',
        folderId || null,
        req.params.id,
        'draft',
        moduleOrigin || null,
        'system',
        'system'
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating document from template:', error);
    res.status(500).json({ error: 'Failed to create document from template' });
  }
});

export default router;