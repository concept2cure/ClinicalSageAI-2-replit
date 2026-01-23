/**
 * AI-CMC Blueprint Generator API Routes
 *
 * These routes handle the Chemistry, Manufacturing, and Controls (CMC)
 * blueprint generation and management functionality.
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.cjs';
import { supabase } from '../lib/supabaseClient.js';
import { storage } from '../lib/storageClient.js';
import { logger } from '../utils/logger.js';
import cmcBlueprintService from '../services/cmcBlueprintService.js';

const router = Router();

/**
 * @route GET /api/cmc/templates
 * @description Get available CMC document templates
 * @access Private
 */
router.get('/templates', verifyJwt, async (req, res) => {
  try {
    const { region, category } = req.query;

    const templates = await cmcBlueprintService.listTemplates(region, category);

    res.json(templates);
  } catch (err) {
    logger.error(`Error in list templates: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve templates' });
  }
});

/**
 * @route GET /api/cmc/templates/:id
 * @description Get template by ID
 * @access Private
 */
router.get('/templates/:id', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: template, error } = await supabase
      .from('cmc_blueprint_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (err) {
    logger.error(`Error in get template: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve template' });
  }
});

/**
 * @route POST /api/cmc/blueprints
 * @description Create a new CMC blueprint
 * @access Private
 */
router.post('/blueprints', verifyJwt, async (req, res) => {
  try {
    const { name, description, templateId, productName, projectId } = req.body;

    if (!name || !templateId) {
      return res.status(400).json({ message: 'Name and template ID are required' });
    }

    const blueprint = await cmcBlueprintService.createBlueprint(
      name,
      description,
      templateId,
      productName,
      req.user.tenant_id,
      projectId,
      req.user.id
    );

    res.status(201).json(blueprint);
  } catch (err) {
    logger.error(`Error in create blueprint: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to create blueprint' });
  }
});

/**
 * @route GET /api/cmc/blueprints
 * @description List user's CMC blueprints
 * @access Private
 */
router.get('/blueprints', verifyJwt, async (req, res) => {
  try {
    const { projectId, status } = req.query;

    let query = supabase
      .from('cmc_blueprints')
      .select(
        `
        id,
        name,
        description,
        product_name,
        status,
        version,
        created_at,
        updated_at,
        is_locked,
        template:template_id(id, name, region, category),
        created_by_user:created_by(name, email)
      `
      )
      .eq('tenant_id', req.user.tenant_id);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in list blueprints: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve blueprints' });
  }
});

/**
 * @route GET /api/cmc/blueprints/:id
 * @description Get CMC blueprint by ID
 * @access Private
 */
router.get('/blueprints/:id', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const blueprint = await cmcBlueprintService.getBlueprint(id);

    res.json(blueprint);
  } catch (err) {
    logger.error(`Error in get blueprint: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    res.status(500).json({ message: 'Failed to retrieve blueprint' });
  }
});

/**
 * @route PUT /api/cmc/blueprints/:id
 * @description Update CMC blueprint
 * @access Private
 */
router.put('/blueprints/:id', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check that the user isn't trying to update restricted fields
    const allowedUpdates = [
      'name',
      'description',
      'product_name',
      'structure',
      'content',
      'status',
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    const blueprint = await cmcBlueprintService.updateBlueprint(id, updateData, req.user.id);

    res.json(blueprint);
  } catch (err) {
    logger.error(`Error in update blueprint: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    if (err.message.includes('locked')) {
      return res.status(423).json({ message: err.message });
    }

    res.status(500).json({ message: 'Failed to update blueprint' });
  }
});

/**
 * @route POST /api/cmc/blueprints/:id/lock
 * @description Lock a blueprint for editing
 * @access Private
 */
router.post('/blueprints/:id/lock', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const lockStatus = await cmcBlueprintService.lockBlueprint(id, req.user.id);

    res.json(lockStatus);
  } catch (err) {
    logger.error(`Error in lock blueprint: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    if (err.message.includes('already locked')) {
      return res.status(423).json({ message: err.message });
    }

    res.status(500).json({ message: 'Failed to lock blueprint' });
  }
});

/**
 * @route POST /api/cmc/blueprints/:id/unlock
 * @description Unlock a blueprint
 * @access Private
 */
router.post('/blueprints/:id/unlock', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const lockStatus = await cmcBlueprintService.unlockBlueprint(id, req.user.id);

    res.json(lockStatus);
  } catch (err) {
    logger.error(`Error in unlock blueprint: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    if (err.message.includes('locked by another user')) {
      return res.status(403).json({ message: err.message });
    }

    res.status(500).json({ message: 'Failed to unlock blueprint' });
  }
});

/**
 * @route POST /api/cmc/blueprints/:id/generate/:sectionPath
 * @description Generate content for a specific section
 * @access Private
 */
router.post('/blueprints/:id/generate/:sectionPath', verifyJwt, async (req, res) => {
  try {
    const { id, sectionPath } = req.params;
    const context = req.body;

    const result = await cmcBlueprintService.generateSectionContent(
      id,
      sectionPath,
      context,
      req.user.id
    );

    res.json(result);
  } catch (err) {
    logger.error(`Error in generate section: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    res.status(500).json({
      message: 'Failed to generate section content',
      error: err.message,
    });
  }
});

/**
 * @route POST /api/cmc/blueprints/:id/generate-all
 * @description Generate content for all sections
 * @access Private
 */
router.post('/blueprints/:id/generate-all', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const context = req.body;

    // Start the generation process
    // This can take a while, so we'll return immediately
    res.json({
      message: 'Generation started',
      blueprint_id: id,
      status: 'PROCESSING',
    });

    // Process in the background
    cmcBlueprintService.generateCompleteBlueprint(id, context, req.user.id).catch(err => {
      logger.error(`Background generation error: ${err.message}`, err);
    });
  } catch (err) {
    logger.error(`Error in generate all: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    res.status(500).json({
      message: 'Failed to start generation process',
      error: err.message,
    });
  }
});

/**
 * @route GET /api/cmc/library
 * @description Get section library items
 * @access Private
 */
router.get('/library', verifyJwt, async (req, res) => {
  try {
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    const items = await cmcBlueprintService.getSectionLibraryItems(category, req.user.tenant_id);

    res.json(items);
  } catch (err) {
    logger.error(`Error in get library: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve library items' });
  }
});

/**
 * @route POST /api/cmc/blueprints/:id/export
 * @description Export blueprint to document
 * @access Private
 */
router.post('/blueprints/:id/export', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { format } = req.body;

    if (!format || !['pdf', 'word'].includes(format)) {
      return res.status(400).json({ message: 'Valid format (pdf or word) is required' });
    }

    let buffer;
    let filename;
    let contentType;

    if (format === 'pdf') {
      buffer = await cmcBlueprintService.exportToPdf(id);
      filename = `blueprint_${id}.pdf`;
      contentType = 'application/pdf';
    } else {
      buffer = await cmcBlueprintService.exportToWord(id);
      filename = `blueprint_${id}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error(`Error in export blueprint: ${err.message}`, err);

    if (err.message.includes('not found')) {
      return res.status(404).json({ message: 'Blueprint not found' });
    }

    if (err.message.includes('not yet implemented')) {
      return res.status(501).json({ message: 'Export format not yet implemented' });
    }

    res.status(500).json({ message: 'Failed to export blueprint' });
  }
});

/**
 * @route GET /api/cmc/ai-settings
 * @description Get tenant AI settings
 * @access Private
 */
router.get('/ai-settings', verifyJwt, async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('cmc_ai_settings')
      .select('*')
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned"
      throw error;
    }

    // Return default settings if none found
    const defaultSettings = {
      tenant_id: req.user.tenant_id,
      model_name: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 2000,
      content_style: 'FORMAL',
      citations_required: true,
    };

    res.json(settings || defaultSettings);
  } catch (err) {
    logger.error(`Error in get AI settings: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve AI settings' });
  }
});

/**
 * @route PUT /api/cmc/ai-settings
 * @description Update tenant AI settings
 * @access Private
 */
router.put('/ai-settings', verifyJwt, async (req, res) => {
  try {
    const settings = req.body;

    // Check if settings already exist
    const { data: existing, error: existingError } = await supabase
      .from('cmc_ai_settings')
      .select('id')
      .eq('tenant_id', req.user.tenant_id)
      .single();

    let result;

    if (existing) {
      // Update existing settings
      const { data, error } = await supabase
        .from('cmc_ai_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('cmc_ai_settings')
        .insert({
          tenant_id: req.user.tenant_id,
          ...settings,
          updated_by: req.user.id,
        })
        .select('*')
        .single();

      if (error) throw error;
      result = data;
    }

    res.json(result);
  } catch (err) {
    logger.error(`Error in update AI settings: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to update AI settings' });
  }
});

export default router;
