/**
 * Template Routes - Server-side API routes for Template Management
 */

import express from 'express';
import * as templateService from '../services/templateService.js';
import { db } from '../db';
import { ectdTemplates } from '../../shared/schema.ts';
import { eq, and, or, like, sql } from 'drizzle-orm';

const router = express.Router();

/**
 * Get all templates
 * 
 * @route GET /api/templates
 * @param {string} req.query.category - Filter by category (optional)
 * @param {string} req.query.search - Search keyword (optional)
 * @param {string} req.query.module - Filter by CTD module (optional)
 * @param {string} req.query.region - Filter by regulatory region (optional)
 * @returns {Object} - List of templates
 */
router.get('/', async (req, res) => {
  try {
    const { category, search, module, region } = req.query;
    
    let templates;
    
    if (category) {
      templates = await templateService.getTemplatesByCategory(category);
    } else if (search) {
      templates = await templateService.searchTemplates(search);
    } else if (module) {
      templates = await templateService.getTemplatesByModule(module);
    } else if (region) {
      templates = await templateService.getTemplatesByRegion(region);
    } else {
      templates = await templateService.getAllTemplates();
    }
    
    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get templates'
    });
  }
});

/**
 * Get all templates from catalog with filtering options
 * 
 * @route GET /api/templates/catalog
 * @param {string} req.query.category - Filter by category (optional)
 * @param {string} req.query.region - Filter by region (optional)
 * @param {string} req.query.module - Filter by CTD module (optional)
 * @param {string} req.query.search - Search keyword (optional)
 * @param {string} req.query.tags - Filter by tags (optional)
 * @param {string} req.query.organizationId - Organization ID (defaults to 6)
 * @returns {Object} - Categorized templates with counts
 */
router.get('/catalog', async (req, res) => {
  try {
    const { 
      category, 
      region, 
      module, 
      search, 
      tags,
      organizationId = 6 
    } = req.query;
    
    let conditions = [
      eq(ectdTemplates.organizationId, parseInt(organizationId)),
      eq(ectdTemplates.isActive, true)
    ];
    
    // Add category filter
    if (category) {
      conditions.push(eq(ectdTemplates.category, category));
    }
    
    // Add module filter
    if (module) {
      conditions.push(like(ectdTemplates.moduleNumber, `${module}%`));
    }
    
    // Add search filter
    if (search) {
      conditions.push(
        or(
          like(ectdTemplates.templateName, `%${search}%`),
          like(ectdTemplates.content, `%${search}%`)
        )
      );
    }
    
    // Get all templates matching base conditions
    let templates = await db
      .select()
      .from(ectdTemplates)
      .where(and(...conditions));
    
    // Filter by region (stored in tags)
    if (region) {
      templates = templates.filter(t => 
        t.tags && t.tags.includes(region.toLowerCase())
      );
    }
    
    // Filter by specific tags
    if (tags) {
      const tagArray = tags.split(',');
      templates = templates.filter(t => 
        t.tags && tagArray.some(tag => t.tags.includes(tag))
      );
    }
    
    // Group templates by category for better organization
    const categorized = {
      fda: [],
      ema: [],
      pmda: [],
      ich: [],
      therapeutic: [],
      'clinical-ops': [],
      'patient-materials': [],
      modality: [],
      quality: [],
      regulatory: [],
      other: []
    };
    
    // Categorize templates based on tags
    templates.forEach(template => {
      const tags = template.tags || [];
      
      if (tags.includes('fda')) {
        categorized.fda.push(template);
      } else if (tags.includes('ema')) {
        categorized.ema.push(template);
      } else if (tags.includes('pmda')) {
        categorized.pmda.push(template);
      } else if (tags.includes('ich')) {
        categorized.ich.push(template);
      } else if (tags.includes('therapeutic')) {
        categorized.therapeutic.push(template);
      } else if (tags.includes('clinical-ops')) {
        categorized['clinical-ops'].push(template);
      } else if (tags.includes('patient-materials')) {
        categorized['patient-materials'].push(template);
      } else if (tags.includes('modality')) {
        categorized.modality.push(template);
      } else if (tags.includes('quality')) {
        categorized.quality.push(template);
      } else if (tags.includes('regulatory')) {
        categorized.regulatory.push(template);
      } else {
        categorized.other.push(template);
      }
    });
    
    // Calculate counts
    const counts = {
      total: templates.length,
      fda: categorized.fda.length,
      ema: categorized.ema.length,
      pmda: categorized.pmda.length,
      ich: categorized.ich.length,
      therapeutic: categorized.therapeutic.length,
      clinicalOps: categorized['clinical-ops'].length,
      patientMaterials: categorized['patient-materials'].length,
      modality: categorized.modality.length,
      quality: categorized.quality.length,
      regulatory: categorized.regulatory.length
    };
    
    res.json({
      success: true,
      data: {
        templates,
        categorized,
        counts
      }
    });
  } catch (error) {
    console.error('Error fetching template catalog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template catalog',
      error: error.message
    });
  }
});

/**
 * Get template by ID
 * 
 * @route GET /api/templates/:templateId
 * @param {string} req.params.templateId - Template ID
 * @returns {Object} - Template data
 */
router.get('/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const template = await templateService.getTemplateById(templateId);
    
    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error(`Error getting template ${req.params.templateId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to get template'
    });
  }
});

/**
 * Create a new template
 * 
 * @route POST /api/templates
 * @param {Object} req.body - Template data
 * @returns {Object} - Created template
 */
router.post('/', async (req, res) => {
  try {
    console.log('Creating new template with data:', JSON.stringify(req.body, null, 2));
    
    const template = await templateService.saveTemplate(req.body);
    
    res.status(201).json({
      success: true,
      template,
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create template'
    });
  }
});

/**
 * Update a template
 * 
 * @route PUT /api/templates/:templateId
 * @param {string} req.params.templateId - Template ID
 * @param {Object} req.body - Updated template data
 * @returns {Object} - Updated template
 */
router.put('/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    
    console.log(`Updating template ${templateId} with data:`, JSON.stringify(req.body, null, 2));
    
    const template = await templateService.updateTemplate(templateId, req.body);
    
    res.json({
      success: true,
      template,
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error(`Error updating template ${req.params.templateId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message || 'Failed to update template'
    });
  }
});

/**
 * Delete a template
 * 
 * @route DELETE /api/templates/:templateId
 * @param {string} req.params.templateId - Template ID
 * @returns {Object} - Success message
 */
router.delete('/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    
    await templateService.deleteTemplate(templateId);
    
    res.json({
      success: true,
      message: `Template ${templateId} deleted successfully`
    });
  } catch (error) {
    console.error(`Error deleting template ${req.params.templateId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to delete template'
    });
  }
});

/**
 * Import template from an external source
 * 
 * @route POST /api/templates/import
 * @param {Object} req.body - Template data to import
 * @returns {Object} - Imported template
 */
router.post('/import', async (req, res) => {
  try {
    console.log('Importing template with data:', JSON.stringify(req.body, null, 2));
    
    // Generate a unique ID if not provided
    const templateData = {
      ...req.body,
      id: req.body.id || `imported-${Date.now()}`
    };
    
    const template = await templateService.saveTemplate(templateData);
    
    res.status(201).json({
      success: true,
      template,
      message: 'Template imported successfully'
    });
  } catch (error) {
    console.error('Error importing template:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to import template'
    });
  }
});

/**
 * Apply template to a document
 * 
 * @route POST /api/templates/:templateId/apply
 * @param {string} req.params.templateId - Template ID
 * @param {Object} req.body - Document data to apply template to
 * @returns {Object} - Document with template applied
 */
router.post('/:templateId/apply', async (req, res) => {
  try {
    const { templateId } = req.params;
    
    console.log(`Applying template ${templateId} to document:`, JSON.stringify(req.body, null, 2));
    
    // Get the template
    const template = await templateService.getTemplateById(templateId);
    
    // Simple template application logic (can be extended for more complex scenarios)
    const document = req.body.document || {};
    
    // Apply template sections to document
    if (template.content && template.content.sections) {
      document.sections = document.sections || [];
      
      // For each template section
      template.content.sections.forEach(templateSection => {
        // Check if section already exists in document
        const existingSection = document.sections.find(
          s => s.id === templateSection.id || s.title === templateSection.title
        );
        
        if (existingSection) {
          // Update existing section
          Object.assign(existingSection, {
            ...templateSection,
            ...existingSection,
            appliedFromTemplate: templateId
          });
        } else {
          // Add new section
          document.sections.push({
            ...templateSection,
            appliedFromTemplate: templateId
          });
        }
      });
    }
    
    // Apply template metadata
    document.metadata = {
      ...document.metadata,
      appliedTemplate: {
        id: template.id,
        name: template.name,
        appliedAt: new Date().toISOString()
      }


/**
 * Bulk create templates
 * 
 * @route POST /api/templates/bulk
 * @param {Array} req.body.templates - Array of template data
 * @returns {Object} - Created templates
 */
router.post('/bulk', async (req, res) => {
  try {
    const { templates } = req.body;
    
    if (!Array.isArray(templates)) {
      return res.status(400).json({
        success: false,
        error: 'Templates must be an array'
      });
    }
    
    const results = await templateService.bulkCreateTemplates(templates);
    
    res.status(201).json({
      success: true,
      templates: results,
      message: `${results.length} templates created successfully`
    });
  } catch (error) {
    console.error('Error bulk creating templates:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create templates'
    });
  }
});

/**
 * Get template categories
 * 
 * @route GET /api/templates/categories
 * @returns {Object} - Available template categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await templateService.getTemplateCategories();
    
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Error getting template categories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get categories'
    });
  }
});

/**
 * Clone a template
 * 
 * @route POST /api/templates/:templateId/clone
 * @param {string} req.params.templateId - Template ID to clone
 * @param {Object} req.body - New template data overrides
 * @returns {Object} - Cloned template
 */
router.post('/:templateId/clone', async (req, res) => {
  try {
    const { templateId } = req.params;
    const overrides = req.body;
    
    const clonedTemplate = await templateService.cloneTemplate(templateId, overrides);
    
    res.status(201).json({
      success: true,
      template: clonedTemplate,
      message: 'Template cloned successfully'
    });
  } catch (error) {
    console.error(`Error cloning template ${req.params.templateId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message || 'Failed to clone template'
    });
  }
});

    };
    
    res.json({
      success: true,
      document,
      template: {
        id: template.id,
        name: template.name
      },
      message: `Template ${template.name} applied successfully`
    });
  } catch (error) {
    console.error(`Error applying template ${req.params.templateId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to apply template'
    });
  }
});

export default router;
router.get('/templates', async (req, res) => {
  try {
    // Return existing templates from database or static templates
    const templates = [
      {
        id: 'clinical-overview',
        name: 'Clinical_Overview',
        title: 'Clinical Overview (Module 2.5)',
        description: 'Comprehensive clinical overview template',
        region: 'ICH',
        type: 'clinical',
        category: 'Standard'
      },
      {
        id: 'safety-summary', 
        name: 'Safety_Summary',
        title: 'Safety Summary',
        description: 'Integrated safety summary template',
        region: 'ICH',
        type: 'safety',
        category: 'Standard'
      },
      {
        id: 'clinical-protocol',
        name: 'Clinical_Protocol', 
        title: 'Clinical Protocol',
        description: 'Phase I/II/III clinical protocol template',
        region: 'ICH',
        type: 'protocol',
        category: 'Standard'
      },
      {
        id: 'investigator-brochure',
        name: 'Investigator_Brochure',
        title: 'Investigator Brochure', 
        description: 'Complete investigator brochure template',
        region: 'ICH',
        type: 'brochure',
        category: 'Standard'
      }
    ];

    res.json({
      success: true,
      templates: templates
    });
  } catch (error) {
    console.error('Error loading templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load templates'
    });
  }
});

module.exports = router;
