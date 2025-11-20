/**
 * Reference Model API Routes
 *
 * These routes handle the reference model functionality for document management:
 * - Document types and subtypes
 * - Folder structure
 * - Document CRUD operations
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.js';
import { supabase } from '../lib/supabaseClient.js';
import { storage } from '../lib/storageClient.js';
import { logger } from '../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route GET /api/reference-model/types
 * @description Get document types
 * @access Private
 */
router.get('/types', verifyJwt, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get document types: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve document types' });
  }
});

/**
 * @route GET /api/reference-model/subtypes
 * @description Get document subtypes
 * @access Private
 */
router.get('/subtypes', verifyJwt, async (req, res) => {
  try {
    const { typeId } = req.query;

    let query = supabase.from('document_subtypes').select('*');

    if (typeId) {
      query = query.eq('type_id', typeId);
    }

    const { data, error } = await query.order('display_order', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get document subtypes: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve document subtypes' });
  }
});

/**
 * @route GET /api/reference-model/folders
 * @description Get folder structure
 * @access Private
 */
router.get('/folders', verifyJwt, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('folder_templates')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get folder structure: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve folder structure' });
  }
});

/**
 * @route GET /api/reference-model/documents
 * @description Get documents
 * @access Private
 */
router.get('/documents', verifyJwt, async (req, res) => {
  try {
    const { search, type, subtype, status, folder } = req.query;

    let query = supabase.from('documents').select(`
        id,
        name,
        description,
        document_type_id,
        document_subtype_id,
        status,
        version_count,
        created_at,
        updated_at,
        periodic_review_date,
        archive_date,
        delete_date,
        business_unit,
        tenant_id,
        latest_version_id,
        latest_version_number
      `);

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (type) {
      query = query.eq('document_type_id', type);
    }

    if (subtype) {
      query = query.eq('document_subtype_id', subtype);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (folder) {
      query = query.eq('folder_id', folder);
    }

    // User's tenant ID
    query = query.eq('tenant_id', req.user.tenant_id);

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get documents: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve documents' });
  }
});

/**
 * @route GET /api/reference-model/documents/:id
 * @description Get document by ID
 * @access Private
 */
router.get('/documents/:id', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select(
        `
        *,
        document_types:document_type_id(name, icon, color),
        document_subtypes:document_subtype_id(name, lifecycle_id, requires_training, review_interval, archive_after, delete_after, business_unit)
      `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get document: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve document' });
  }
});

/**
 * @route POST /api/reference-model/documents
 * @description Create a new document
 * @access Private
 */
router.post('/documents', verifyJwt, upload.single('file'), async (req, res) => {
  try {
    const {
      name,
      description,
      documentTypeId,
      documentSubtypeId,
      folderId,
      status = 'Draft',
    } = req.body;

    if (!name || !documentTypeId || !documentSubtypeId) {
      return res.status(400).json({
        message: 'Name, document type, and document subtype are required',
      });
    }

    // Process file if provided
    let filePath = null;
    if (req.file) {
      // Generate unique file path
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExt}`;
      filePath = `documents/${req.user.tenant_id}/${fileName}`;

      // Upload file to storage
      await storage.uploadFile(filePath, req.file.buffer, req.file.mimetype);
    }

    // Get document subtype for lifecycle info
    const { data: subtype } = await supabase
      .from('document_subtypes')
      .select('lifecycle_id, review_interval')
      .eq('id', documentSubtypeId)
      .single();

    // Calculate review date if applicable
    let periodicReviewDate = null;
    if (subtype?.review_interval) {
      const reviewDate = new Date();
      reviewDate.setMonth(reviewDate.getMonth() + subtype.review_interval);
      periodicReviewDate = reviewDate.toISOString();
    }

    // Create document record
    const { data, error } = await supabase
      .from('documents')
      .insert({
        name,
        description,
        document_type_id: documentTypeId,
        document_subtype_id: documentSubtypeId,
        status,
        folder_id: folderId || null,
        file_path: filePath,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id,
        periodic_review_date: periodicReviewDate,
        version_count: 1,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // If file was uploaded, create initial version
    if (filePath && req.file) {
      await supabase.from('document_versions').insert({
        document_id: data.id,
        version_number: 1,
        file_path: filePath,
        file_hash: '',
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        created_by: req.user.id,
        status: 'DRAFT',
      });

      // Update document with latest version info
      await supabase
        .from('documents')
        .update({
          latest_version_number: 1,
        })
        .eq('id', data.id);
    }

    res.status(201).json(data);
  } catch (err) {
    logger.error(`Error in create document: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to create document' });
  }
});

/**
 * @route PUT /api/reference-model/documents/:id
 * @description Update a document
 * @access Private
 */
router.put('/documents/:id', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if document exists and belongs to user's tenant
    const { data: existing, error: existingError } = await supabase
      .from('documents')
      .select('id, tenant_id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (existing.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Prepare updates
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    };

    // If document subtype is changing, recalculate periodic review date
    if (updates.document_subtype_id) {
      const { data: subtype } = await supabase
        .from('document_subtypes')
        .select('review_interval')
        .eq('id', updates.document_subtype_id)
        .single();

      if (subtype && subtype.review_interval) {
        const reviewDate = new Date();
        reviewDate.setMonth(reviewDate.getMonth() + subtype.review_interval);
        updateData.periodic_review_date = reviewDate.toISOString();
      }
    }

    // Update the document
    const { data, error } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in update document: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to update document' });
  }
});

/**
 * @route POST /api/reference-model/documents/:id/upload
 * @description Upload a new version of a document
 * @access Private
 */
router.post('/documents/:id/upload', verifyJwt, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { comments, changeType = 'MINOR' } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    // Check if document exists and belongs to user's tenant
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, tenant_id, latest_version_number')
      .eq('id', id)
      .single();

    if (docError || !document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate file path
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${document.id}_v${(document.latest_version_number || 0) + 1}${fileExt}`;
    const filePath = `documents/${req.user.tenant_id}/${fileName}`;

    // Upload file to storage
    await storage.uploadFile(filePath, req.file.buffer, req.file.mimetype);

    // Calculate file hash
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // Create version record
    const nextVersionNumber = (document.latest_version_number || 0) + 1;
    const { data: version, error } = await supabase
      .from('document_versions')
      .insert({
        document_id: document.id,
        version_number: nextVersionNumber,
        file_path: filePath,
        file_hash: fileHash,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        created_by: req.user.id,
        comments,
        change_type: changeType,
        status: 'DRAFT',
      })
      .select('*')
      .single();

    if (error) {
      logger.error(`Error creating version: ${error.message}`, error);
      return res.status(500).json({ message: 'Error creating document version' });
    }

    // Update document record
    await supabase
      .from('documents')
      .update({
        latest_version_id: version.id,
        latest_version_number: nextVersionNumber,
        version_count: supabase.rpc('increment', { row_id: document.id }),
        updated_at: new Date().toISOString(),
        updated_by: req.user.id,
        file_path: filePath,
      })
      .eq('id', document.id);

    res.status(201).json({
      success: true,
      version,
      message: `Version ${nextVersionNumber} created successfully`,
    });
  } catch (err) {
    logger.error(`Error in upload document version: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to upload document version' });
  }
});

/**
 * @route GET /api/reference-model/lifecycles
 * @description Get document lifecycles
 * @access Private
 */
router.get('/lifecycles', verifyJwt, async (req, res) => {
  try {
    const { data, error } = await supabase.from('lifecycles').select('*');

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get lifecycles: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve lifecycles' });
  }
});

/**
 * @route GET /api/reference-model/retention
 * @description Get retention rules
 * @access Private
 */
router.get('/retention', verifyJwt, async (req, res) => {
  try {
    // Get tenant-specific and global retention rules
    const { data, error } = await supabase
      .from('retention_rules')
      .select(
        `
        tenant_id,
        document_subtype_id,
        archive_after,
        delete_after,
        document_subtypes:document_subtype_id(name, type_id)
      `
      )
      .or(`tenant_id.eq.${req.user.tenant_id},tenant_id.is.null`);

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get retention rules: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve retention rules' });
  }
});

/**
 * @route GET /api/reference-model/documents/:id/reviews
 * @description Get document review tasks
 * @access Private
 */
router.get('/documents/:id/reviews', verifyJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('periodic_review_tasks')
      .select('*')
      .eq('document_id', id)
      .order('due_date', { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get document reviews: ${err.message}`, err);
    res.status(500).json({ message: 'Failed to retrieve document reviews' });
  }
});

export default router;
