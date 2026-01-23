/**
 * Meta API Routes
 * Handles API endpoints for reference model metadata:
 * - Document types
 * - Document subtypes
 * - Lifecycles
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from '../middleware/auth.cjs';
import { logger } from '../utils/logger.js';

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Apply JWT authentication to all routes
router.use(verifyJwt);

/**
 * Get all document types
 * @route GET /api/meta/types
 */
router.get('/types', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .order('display_order');

    if (error) throw error;

    return res.json(data);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching document types');
    return res.status(500).json({
      error: 'Failed to fetch document types',
      details: error.message,
    });
  }
});

/**
 * Get document subtypes, optionally filtered by type_id
 * @route GET /api/meta/subtypes
 */
router.get('/subtypes', async (req, res) => {
  try {
    const { type_id } = req.query;

    let query = supabase
      .from('document_subtypes')
      .select(
        `
        *,
        document_types:type_id (*),
        lifecycle:lifecycle_id (*)
      `
      )
      .order('display_order');

    // Filter by type_id if provided
    if (type_id) {
      query = query.eq('type_id', type_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json(data);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching document subtypes');
    return res.status(500).json({
      error: 'Failed to fetch document subtypes',
      details: error.message,
    });
  }
});

/**
 * Get all available lifecycles
 * @route GET /api/meta/lifecycles
 */
router.get('/lifecycles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('lifecycles').select('*');

    if (error) throw error;

    return res.json(data);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lifecycles');
    return res.status(500).json({
      error: 'Failed to fetch lifecycles',
      details: error.message,
    });
  }
});

/**
 * Get document retention info for a specific subtype
 * @route GET /api/meta/retention/:subtypeId
 */
router.get('/retention/:subtypeId', async (req, res) => {
  try {
    const { subtypeId } = req.params;
    const tenantId = req.user?.tenant_id || null;

    // First check if there's a tenant-specific rule
    let { data: retentionRule, error: ruleError } = await supabase
      .from('retention_rules')
      .select('*')
      .eq('document_subtype_id', subtypeId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (ruleError) throw ruleError;

    // If no tenant-specific rule, get default from subtype
    if (!retentionRule) {
      const { data: subtype, error: subtypeError } = await supabase
        .from('document_subtypes')
        .select('id, name, archive_after, delete_after')
        .eq('id', subtypeId)
        .single();

      if (subtypeError) throw subtypeError;

      if (!subtype) {
        return res.status(404).json({
          error: 'Subtype not found',
        });
      }

      retentionRule = {
        document_subtype_id: subtype.id,
        archive_after: subtype.archive_after,
        delete_after: subtype.delete_after,
      };
    }

    return res.json(retentionRule);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching retention information');
    return res.status(500).json({
      error: 'Failed to fetch retention information',
      details: error.message,
    });
  }
});

/**
 * Initialize tenant's folder structure from templates
 * @route POST /api/meta/initialize-folders
 */
router.post('/initialize-folders', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({
        error: 'Tenant ID is required',
      });
    }

    // Get all folder templates ordered by type and sort order
    const { data: templates, error: templateError } = await supabase
      .from('folder_templates')
      .select('*')
      .order('document_type_id')
      .order('sort_order');

    if (templateError) throw templateError;

    // Check if folders already exist for this tenant
    const { data: existingFolders, error: folderError } = await supabase
      .from('folders')
      .select('id, name')
      .eq('tenant_id', tenantId);

    if (folderError) throw folderError;

    const existingFolderNames = existingFolders.map(f => f.name);
    const foldersToCreate = templates.filter(t => !existingFolderNames.includes(t.name));

    // Create folders that don't exist yet
    const createdFolders = [];
    for (const template of foldersToCreate) {
      const { data: folder, error: createError } = await supabase
        .from('folders')
        .insert({
          tenant_id: tenantId,
          name: template.name,
          description: template.description,
          document_type_id: template.document_type_id,
          parent_id: template.parent_id
            ? existingFolders.find(
                f => f.name === templates.find(t => t.id === template.parent_id)?.name
              )?.id
            : null,
        })
        .select()
        .single();

      if (createError) {
        logger.error({ err: createError }, `Error creating folder: ${template.name}`);
        continue;
      }

      createdFolders.push(folder);
      existingFolders.push(folder);
    }

    return res.json({
      success: true,
      message: `Created ${createdFolders.length} folders for tenant`,
      total_folders: existingFolders.length,
      new_folders: createdFolders,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing folders');
    return res.status(500).json({
      error: 'Failed to initialize folders',
      details: error.message,
    });
  }
});

/**
 * Get reference model version info
 * @route GET /api/meta/version
 */
router.get('/version', (req, res) => {
  try {
    return res.json({
      name: 'TrialSage Vault Enhanced Reference Model',
      version: '1.0.0',
      features: [
        'Document types hierarchy',
        'Lifecycle management',
        'Periodic reviews',
        'Folder enforcement',
        'Retention policies',
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching version info');
    return res.status(500).json({
      error: 'Failed to fetch version info',
      details: error.message,
    });
  }
});

/**
 * Get all reference model data in a single call for client caching
 * @route GET /api/meta/reference-model-data
 */
router.get('/reference-model-data', async (req, res) => {
  try {
    // Fetch all reference model data in parallel
    const [typesResponse, subtypesResponse, lifecyclesResponse, folderTemplatesResponse] =
      await Promise.all([
        supabase.from('document_types').select('*').order('display_order'),
        supabase.from('document_subtypes').select('*').order('display_order'),
        supabase.from('lifecycles').select('*'),
        supabase.from('folder_templates').select('*').order('sort_order'),
      ]);

    // Check for errors
    if (typesResponse.error) throw typesResponse.error;
    if (subtypesResponse.error) throw subtypesResponse.error;
    if (lifecyclesResponse.error) throw lifecyclesResponse.error;
    if (folderTemplatesResponse.error) throw folderTemplatesResponse.error;

    // Combine all data into a single response
    return res.json({
      types: typesResponse.data,
      subtypes: subtypesResponse.data,
      lifecycles: lifecyclesResponse.data,
      folderTemplates: folderTemplatesResponse.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reference model data');
    return res.status(500).json({
      error: 'Failed to fetch reference model data',
      details: error.message,
    });
  }
});

export default router;
