import express from 'express';
import { db } from '../db';
import { ectdTemplates, indDocuments, indApplications } from '../../shared/schema.ts';
import { eq, and, or, like, sql, inArray } from 'drizzle-orm';
import OpenAI from 'openai';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

// Initialize OpenAI if API key is available
let openai = null;
const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
if (apiKey) {
  openai = new OpenAI({ apiKey });
}

/**
 * Get all templates from catalog with filtering options
 * GET /api/templates/catalog
 */
router.get('/templates/catalog', async (req, res) => {
  try {
    const { category, region, module, search, tags } = req.query;
    const organizationId = Number(req.organizationId);
    
    let conditions = [
      eq(ectdTemplates.organizationId, organizationId),
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
 * Get templates by regulatory region
 * GET /api/templates/by-region/:region
 */
router.get('/templates/by-region/:region', async (req, res) => {
  try {
    const { region } = req.params;
    const { organizationId = 6 } = req.query;
    
    // Get all active templates
    const templates = await db
      .select()
      .from(ectdTemplates)
      .where(and(
        eq(ectdTemplates.organizationId, parseInt(organizationId)),
        eq(ectdTemplates.isActive, true)
      ));
    
    // Filter by region tag
    const regionTemplates = templates.filter(t => 
      t.tags && t.tags.includes(region.toLowerCase())
    );
    
    // Group by module for organization
    const byModule = {};
    regionTemplates.forEach(template => {
      const module = template.moduleNumber || 'other';
      if (!byModule[module]) {
        byModule[module] = [];
      }
      byModule[module].push(template);
    });
    
    res.json({
      success: true,
      data: {
        region,
        count: regionTemplates.length,
        templates: regionTemplates,
        byModule
      }
    });
  } catch (error) {
    console.error('Error fetching templates by region:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates by region',
      error: error.message
    });
  }
});

/**
 * Get templates by CTD module
 * GET /api/templates/by-module/:module
 */
router.get('/templates/by-module/:module', async (req, res) => {
  try {
    const { module } = req.params;
    const { organizationId = 6 } = req.query;
    
    const templates = await db
      .select()
      .from(ectdTemplates)
      .where(and(
        eq(ectdTemplates.organizationId, parseInt(organizationId)),
        eq(ectdTemplates.isActive, true),
        like(ectdTemplates.moduleNumber, `${module}%`)
      ));
    
    // Group by category
    const byCategory = {};
    templates.forEach(template => {
      const category = template.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(template);
    });
    
    res.json({
      success: true,
      data: {
        module,
        count: templates.length,
        templates,
        byCategory
      }
    });
  } catch (error) {
    console.error('Error fetching templates by module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates by module',
      error: error.message
    });
  }
});

/**
 * Apply selected template to IND application
 * POST /api/ind/:id/apply-template
 */
router.post('/ind/:id/apply-template', async (req, res) => {
  try {
    // Handle both numeric IDs and string draft IDs like 'draft-1'
    const rawId = req.params.id;
    let indId;
    
    if (typeof rawId === 'string' && rawId.startsWith('draft-')) {
      // Extract numeric ID from draft string
      const parts = rawId.split('-');
      indId = parseInt(parts[1]) || 1;
      console.log('Processing draft ID:', rawId, 'extracted numeric ID:', indId);
    } else {
      indId = parseInt(rawId);
    }
    
    // Check if ID is valid
    if (isNaN(indId)) {
      console.error('Invalid IND ID received:', rawId);
      return res.status(400).json({
        success: false,
        message: `Invalid IND ID: ${rawId}`
      });
    }
    
    const { templateId, userData = {} } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }
    
    // Parse and validate templateId
    const parsedTemplateId = parseInt(templateId);
    if (isNaN(parsedTemplateId)) {
      console.error('Invalid template ID received:', templateId);
      return res.status(400).json({
        success: false,
        message: `Invalid template ID: ${templateId}`
      });
    }
    
    console.log('Applying template ID:', parsedTemplateId, 'to IND ID:', indId);
    
    // Get the template using validated ID
    const templates = await db
      .select()
      .from(ectdTemplates)
      .where(eq(ectdTemplates.id, parsedTemplateId))
      .limit(1);
    
    if (!templates || templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    const template = templates[0];
    
    // Get IND application data
    const indApps = await db
      .select()
      .from(indApplications)
      .where(eq(indApplications.id, indId))
      .limit(1);
    
    if (!indApps || indApps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IND application not found'
      });
    }
    
    const indData = indApps[0];
    
    // Merge IND data with user data
    const data = {
      ...indData,
      ...userData,
      // Add common fields
      submission_date: new Date().toISOString().split('T')[0],
      ind_number: indData.indNumber || `IND-${indId}`,
      sponsor_name: indData.sponsorName || userData.sponsor_name || '',
      drug_name: indData.drugName || userData.drug_name || '',
      indication: indData.indication || userData.indication || ''
    };
    
    // Replace placeholders in template content
    let content = template.content;
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    
    content = content.replace(placeholderRegex, (match, key) => {
      // Try different key formats
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      const value = data[key] || data[snakeKey] || data[key.toLowerCase()];
      
      if (value !== undefined && value !== null) {
        return value;
      }
      
      // Return empty string for missing data
      return '';
    });
    
    const organizationId = Number(req.organizationId);
    
    // Create a new document from the template
    const newDocument = await db
      .insert(indDocuments)
      .values({
        indApplicationId: indId,
        organizationId: organizationId,
        title: template.templateName,
        documentType: template.category,
        moduleNumber: template.moduleNumber,
        content: content,
        templateId: template.id,
        status: 'draft',
        version: '1.0',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Update template usage count
    await db
      .update(ectdTemplates)
      .set({
        usageCount: sql`${ectdTemplates.usageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(ectdTemplates.id, template.id));
    
    res.json({
      success: true,
      data: {
        documentId: newDocument[0].id,
        title: newDocument[0].title,
        content: content,
        templateUsed: template.templateName
      },
      message: 'Template applied successfully'
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply template',
      error: error.message
    });
  }
});

/**
 * Generate document from template with AI enhancement
 * POST /api/ind/:id/generate-from-template
 */
router.post('/ind/:id/generate-from-template', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    const { templateId, userData = {}, enhanceWithAI = true } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }
    
    // Get the template
    const templates = await db
      .select()
      .from(ectdTemplates)
      .where(eq(ectdTemplates.id, parseInt(templateId)))
      .limit(1);
    
    if (!templates || templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    const template = templates[0];
    
    // Get IND application data
    const indApps = await db
      .select()
      .from(indApplications)
      .where(eq(indApplications.id, indId))
      .limit(1);
    
    if (!indApps || indApps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'IND application not found'
      });
    }
    
    const indData = indApps[0];
    
    // Merge all data sources
    const data = {
      ...indData,
      ...userData,
      submission_date: new Date().toISOString().split('T')[0],
      ind_number: indData.indNumber || `IND-${indId}`,
      sponsor_name: indData.sponsorName || userData.sponsor_name || '',
      drug_name: indData.drugName || userData.drug_name || '',
      indication: indData.indication || userData.indication || ''
    };
    
    // Replace placeholders
    let content = template.content;
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    
    content = content.replace(placeholderRegex, (match, key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      const value = data[key] || data[snakeKey] || data[key.toLowerCase()];
      
      return value !== undefined && value !== null ? value : '';
    });
    
    // Enhance with AI if requested and OpenAI is available
    let enhancedContent = content;
    let aiEnhancements = null;
    
    if (enhanceWithAI && openai) {
      try {
        const prompt = `You are a regulatory expert helping to complete an FDA IND submission document.
        
Document Type: ${template.templateName}
Module: ${template.moduleNumber}
Category: ${template.category}

Current Content (with some fields filled):
${content}

Drug Information:
- Name: ${data.drug_name}
- Indication: ${data.indication}
- Phase: ${data.phase || 'Phase 1'}

Please enhance this document by:
1. Adding appropriate scientific rationale where placeholders are empty
2. Ensuring regulatory compliance with FDA guidelines
3. Adding standard language for common sections
4. Maintaining professional regulatory writing style

Return the enhanced document content. Keep all existing filled data intact.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are an expert regulatory affairs professional specializing in FDA IND submissions."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 3000
        });
        
        enhancedContent = completion.choices[0].message.content;
        aiEnhancements = {
          enhanced: true,
          model: "gpt-4",
          timestamp: new Date()
        };
      } catch (aiError) {
        console.error('AI enhancement failed:', aiError);
        // Continue with non-enhanced content
        aiEnhancements = {
          enhanced: false,
          error: aiError.message
        };
      }
    }
    
    // Create the document
    const newDocument = await db
      .insert(indDocuments)
      .values({
        indApplicationId: indId,
        title: template.templateName,
        documentType: template.category,
        moduleNumber: template.moduleNumber,
        content: enhancedContent,
        templateId: template.id,
        status: 'draft',
        version: '1.0',
        metadata: aiEnhancements ? { aiEnhancements } : null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Update template usage count
    await db
      .update(ectdTemplates)
      .set({
        usageCount: sql`${ectdTemplates.usageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(ectdTemplates.id, template.id));
    
    res.json({
      success: true,
      data: {
        documentId: newDocument[0].id,
        title: newDocument[0].title,
        content: enhancedContent,
        templateUsed: template.templateName,
        aiEnhanced: aiEnhancements ? aiEnhancements.enhanced : false
      },
      message: 'Document generated successfully from template'
    });
  } catch (error) {
    console.error('Error generating document from template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate document from template',
      error: error.message
    });
  }
});

/**
 * Get template statistics
 * GET /api/templates/stats
 */
router.get('/templates/stats', async (req, res) => {
  try {
    const { organizationId = 6 } = req.query;
    
    // Get all templates for the organization
    const templates = await db
      .select()
      .from(ectdTemplates)
      .where(eq(ectdTemplates.organizationId, parseInt(organizationId)));
    
    // Calculate statistics
    const stats = {
      total: templates.length,
      active: templates.filter(t => t.isActive).length,
      byCategory: {},
      byModule: {},
      byRegion: {
        fda: 0,
        ema: 0,
        pmda: 0,
        ich: 0,
        other: 0
      },
      mostUsed: templates
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 10)
        .map(t => ({
          id: t.id,
          name: t.templateName,
          usageCount: t.usageCount || 0
        }))
    };
    
    // Count by category and module
    templates.forEach(template => {
      // Category count
      const category = template.category || 'other';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      
      // Module count
      const module = template.moduleNumber ? template.moduleNumber.split('.')[0] : 'other';
      stats.byModule[module] = (stats.byModule[module] || 0) + 1;
      
      // Region count (based on tags)
      const tags = template.tags || [];
      if (tags.includes('fda')) stats.byRegion.fda++;
      else if (tags.includes('ema')) stats.byRegion.ema++;
      else if (tags.includes('pmda')) stats.byRegion.pmda++;
      else if (tags.includes('ich')) stats.byRegion.ich++;
      else stats.byRegion.other++;
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching template statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template statistics',
      error: error.message
    });
  }
});

/**
 * Search templates with advanced filtering
 * POST /api/templates/search
 */
router.post('/templates/search', async (req, res) => {
  try {
    const {
      query = '',
      categories = [],
      regions = [],
      modules = [],
      tags = [],
      organizationId = 6
    } = req.body;
    
    // Build base conditions
    let conditions = [
      eq(ectdTemplates.organizationId, parseInt(organizationId)),
      eq(ectdTemplates.isActive, true)
    ];
    
    // Add search condition
    if (query) {
      conditions.push(
        or(
          like(ectdTemplates.templateName, `%${query}%`),
          like(ectdTemplates.content, `%${query}%`),
          like(ectdTemplates.ichGuidance, `%${query}%`)
        )
      );
    }
    
    // Add category filter
    if (categories.length > 0) {
      conditions.push(inArray(ectdTemplates.category, categories));
    }
    
    // Add module filter
    if (modules.length > 0) {
      const moduleConditions = modules.map(m => 
        like(ectdTemplates.moduleNumber, `${m}%`)
      );
      conditions.push(or(...moduleConditions));
    }
    
    // Get templates
    let templates = await db
      .select()
      .from(ectdTemplates)
      .where(and(...conditions));
    
    // Filter by regions (in tags)
    if (regions.length > 0) {
      templates = templates.filter(t => 
        t.tags && regions.some(region => 
          t.tags.includes(region.toLowerCase())
        )
      );
    }
    
    // Filter by additional tags
    if (tags.length > 0) {
      templates = templates.filter(t => 
        t.tags && tags.some(tag => t.tags.includes(tag))
      );
    }
    
    // Sort by relevance (usage count)
    templates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    
    res.json({
      success: true,
      data: {
        count: templates.length,
        templates
      }
    });
  } catch (error) {
    console.error('Error searching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search templates',
      error: error.message
    });
  }
});

export default router;