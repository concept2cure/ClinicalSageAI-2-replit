/**
 * Document Version Control API Routes
 *
 * These routes handle all aspects of document version management:
 * - Creating new versions
 * - Retrieving version history
 * - Comparing document versions
 * - Managing version approvals
 * - Tracking version views
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.js';
import { supabase } from '../lib/supabaseClient.js';
import { storage } from '../lib/storageClient.js';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { logEvent } from '../middleware/ledgerLog.js';
import { logger } from '../utils/logger.js';
import DiffChecker from '../services/diffChecker.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// Helper to compute file hash
async function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * @route GET /api/versions/:documentId
 * @description Get version history for a document
 * @access Private
 */
router.get('/:documentId', verifyJwt, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get the document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, status, document_subtype_id, tenant_id')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Get versions
    const { data: versions, error } = await supabase
      .from('document_versions')
      .select(
        `
        id, 
        version_number, 
        created_at, 
        created_by, 
        comments, 
        change_summary, 
        change_type,
        status,
        file_size,
        reviewed_by,
        reviewed_at,
        profiles(name, email, avatar_url)
      `
      )
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (error) {
      logger.error(`Error retrieving versions: ${error.message}`, error);
      return res.status(500).json({ message: 'Error retrieving document versions' });
    }

    // Track this view
    await supabase.from('document_version_views').insert({
      version_id: document.latest_version_id,
      user_id: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      context: 'version_history',
    });

    res.json({
      document,
      versions,
    });
  } catch (err) {
    logger.error(`Error in get document versions: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/versions/:versionId/download
 * @description Download a specific document version
 * @access Private
 */
router.get('/:versionId/download', verifyJwt, async (req, res) => {
  try {
    const { versionId } = req.params;

    // Get version info
    const { data: version, error } = await supabase
      .from('document_versions')
      .select(
        `
        id, 
        document_id,
        version_number, 
        file_path,
        file_size,
        mime_type,
        documents(name)
      `
      )
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    // Track this download
    await supabase.from('document_version_views').insert({
      version_id: version.id,
      user_id: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      context: 'download',
    });

    // Get file from storage
    const filePath = version.file_path;
    const fileName = `${version.documents.name}_v${version.version_number}${path.extname(filePath)}`;

    // Stream file to response
    const fileStream = storage.getFileStream(filePath);

    res.setHeader('Content-Type', version.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', version.file_size);

    fileStream.pipe(res);
  } catch (err) {
    logger.error(`Error in download version: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/versions/:documentId
 * @description Create a new document version
 * @access Private
 */
router.post('/:documentId', verifyJwt, upload.single('file'), async (req, res) => {
  try {
    const { documentId } = req.params;
    const { comments, changeSummary, changeType = 'MINOR' } = req.body;

    // Validate input
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    // Get the document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, latest_version_number')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if document is locked
    const { data: lock } = await supabase
      .from('document_version_locks')
      .select('locked_by, locked_at, expires_at')
      .eq('document_id', documentId)
      .single();

    if (lock) {
      // Check if lock has expired
      if (new Date(lock.expires_at) > new Date()) {
        // If lock exists and not expired, check if current user holds the lock
        if (lock.locked_by !== req.user.id) {
          return res.status(423).json({
            message: 'Document is locked by another user',
            lock,
          });
        }
      } else {
        // Lock expired, delete it
        await supabase.from('document_version_locks').delete().eq('document_id', documentId);
      }
    }

    // Compute next version number
    const nextVersionNumber = (document.latest_version_number || 0) + 1;

    // Compute file hash
    const fileBuffer = req.file.buffer;
    const fileHash = await computeFileHash(fileBuffer);

    // Set up storage path
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${document.id}_v${nextVersionNumber}_${Date.now()}${fileExt}`;
    const filePath = `documents/${document.id}/versions/${fileName}`;

    // Upload file to storage
    await storage.uploadFile(filePath, fileBuffer, req.file.mimetype);

    // Create version record
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
        change_summary: changeSummary,
        change_type: changeType,
        status: 'DRAFT',
        metadata: {
          original_filename: req.file.originalname,
          uploaded_from_ip: req.ip,
        },
      })
      .select('*')
      .single();

    if (error) {
      logger.error(`Error creating version: ${error.message}`, error);
      return res.status(500).json({ message: 'Error creating document version' });
    }

    // If there was a lock, release it
    if (lock && lock.locked_by === req.user.id) {
      await supabase.from('document_version_locks').delete().eq('document_id', documentId);
    }

    // Log this activity
    await logEvent({
      type: 'DOCUMENT_VERSION_CREATED',
      userId: req.user.id,
      details: {
        document_id: document.id,
        document_name: document.name,
        version_number: nextVersionNumber,
        version_id: version.id,
        change_type: changeType,
      },
    });

    res.status(201).json({
      success: true,
      version,
      message: `Version ${nextVersionNumber} created successfully`,
    });
  } catch (err) {
    logger.error(`Error in create document version: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/versions/:documentId/lock
 * @description Lock a document for editing
 * @access Private
 */
router.post('/:documentId/lock', verifyJwt, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { reason, durationMinutes = 30 } = req.body;

    // Get the document to make sure it exists
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if document is already locked
    const { data: existingLock } = await supabase
      .from('document_version_locks')
      .select('locked_by, locked_at, expires_at')
      .eq('document_id', documentId)
      .single();

    if (existingLock) {
      // Check if lock is expired
      if (new Date(existingLock.expires_at) > new Date()) {
        // If current user doesn't own the lock
        if (existingLock.locked_by !== req.user.id) {
          return res.status(423).json({
            message: 'Document is already locked by another user',
            lock: existingLock,
          });
        } else {
          // User already owns the lock, extend it
          const newExpiry = new Date();
          newExpiry.setMinutes(newExpiry.getMinutes() + durationMinutes);

          await supabase
            .from('document_version_locks')
            .update({
              expires_at: newExpiry,
              reason: reason || existingLock.reason,
            })
            .eq('document_id', documentId);

          return res.json({
            message: 'Lock extended successfully',
            lock: {
              ...existingLock,
              expires_at: newExpiry,
              reason: reason || existingLock.reason,
            },
          });
        }
      } else {
        // Lock expired, delete it and create a new one
        await supabase.from('document_version_locks').delete().eq('document_id', documentId);
      }
    }

    // Create lock expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

    // Create the lock
    const { data: lock, error } = await supabase
      .from('document_version_locks')
      .insert({
        document_id: documentId,
        locked_by: req.user.id,
        expires_at: expiresAt,
        reason,
      })
      .select('*')
      .single();

    if (error) {
      logger.error(`Error creating document lock: ${error.message}`, error);
      return res.status(500).json({ message: 'Error locking document' });
    }

    // Log this activity
    await logEvent({
      type: 'DOCUMENT_LOCKED',
      userId: req.user.id,
      details: {
        document_id: document.id,
        document_name: document.name,
        lock_id: lock.id,
        expires_at: expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      lock,
      message: 'Document locked successfully',
    });
  } catch (err) {
    logger.error(`Error in lock document: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route DELETE /api/versions/:documentId/lock
 * @description Unlock a document
 * @access Private
 */
router.delete('/:documentId/lock', verifyJwt, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get current lock
    const { data: lock } = await supabase
      .from('document_version_locks')
      .select('locked_by')
      .eq('document_id', documentId)
      .single();

    if (!lock) {
      return res.status(404).json({ message: 'Document is not locked' });
    }

    // Verify user owns the lock or is an admin
    if (lock.locked_by !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'You do not own this lock' });
    }

    // Delete the lock
    await supabase.from('document_version_locks').delete().eq('document_id', documentId);

    // Log this activity
    await logEvent({
      type: 'DOCUMENT_UNLOCKED',
      userId: req.user.id,
      details: {
        document_id: documentId,
      },
    });

    res.json({
      success: true,
      message: 'Document unlocked successfully',
    });
  } catch (err) {
    logger.error(`Error in unlock document: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/versions/:versionId/approve
 * @description Approve or reject a document version
 * @access Private
 */
router.post('/:versionId/approve', verifyJwt, async (req, res) => {
  try {
    const { versionId } = req.params;
    const { approved, comments } = req.body;

    // Get the version
    const { data: version, error } = await supabase
      .from('document_versions')
      .select('id, document_id, version_number, status, documents(name)')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    // Check if version can be approved
    if (version.status !== 'IN_REVIEW') {
      return res.status(400).json({
        message: `Version cannot be approved/rejected from ${version.status} status`,
      });
    }

    // Update version status
    const newStatus = approved ? 'APPROVED' : 'REJECTED';
    const { error: updateError } = await supabase
      .from('document_versions')
      .update({
        status: newStatus,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        review_comments: comments,
      })
      .eq('id', versionId);

    if (updateError) {
      logger.error(`Error updating version status: ${updateError.message}`, updateError);
      return res.status(500).json({ message: 'Error updating version status' });
    }

    // If approved, update document status if needed
    if (approved) {
      await supabase
        .from('documents')
        .update({
          status: 'Current',
        })
        .eq('id', version.document_id);

      // Mark any previous versions as superseded
      await supabase
        .from('document_versions')
        .update({
          status: 'SUPERSEDED',
        })
        .eq('document_id', version.document_id)
        .neq('id', versionId)
        .eq('status', 'APPROVED');
    }

    // Log this activity
    await logEvent({
      type: approved ? 'VERSION_APPROVED' : 'VERSION_REJECTED',
      userId: req.user.id,
      details: {
        document_id: version.document_id,
        document_name: version.documents.name,
        version_id: version.id,
        version_number: version.version_number,
        comments,
      },
    });

    res.json({
      success: true,
      message: `Version ${approved ? 'approved' : 'rejected'} successfully`,
      status: newStatus,
    });
  } catch (err) {
    logger.error(`Error in approve/reject version: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/versions/:versionId/submit
 * @description Submit a document version for review
 * @access Private
 */
router.post('/:versionId/submit', verifyJwt, async (req, res) => {
  try {
    const { versionId } = req.params;
    const { approvers } = req.body;

    // Get the version
    const { data: version, error } = await supabase
      .from('document_versions')
      .select('id, document_id, version_number, status, documents(name)')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    // Check if version can be submitted
    if (version.status !== 'DRAFT') {
      return res.status(400).json({
        message: `Version cannot be submitted from ${version.status} status`,
      });
    }

    // Update version status
    const { error: updateError } = await supabase
      .from('document_versions')
      .update({
        status: 'IN_REVIEW',
      })
      .eq('id', versionId);

    if (updateError) {
      logger.error(`Error submitting version: ${updateError.message}`, updateError);
      return res.status(500).json({ message: 'Error submitting version for review' });
    }

    // If approvers specified, set up approval workflow
    if (Array.isArray(approvers) && approvers.length > 0) {
      const approvalRecords = approvers.map((approver, index) => ({
        version_id: versionId,
        approver_id: approver.id,
        status: 'PENDING',
        order_index: index,
        required: approver.required !== false, // default to true
        notification_sent: false,
      }));

      await supabase.from('document_approvals').insert(approvalRecords);

      // TODO: Send notifications to approvers
    }

    // Log this activity
    await logEvent({
      type: 'VERSION_SUBMITTED_FOR_REVIEW',
      userId: req.user.id,
      details: {
        document_id: version.document_id,
        document_name: version.documents.name,
        version_id: version.id,
        version_number: version.version_number,
        approver_count: approvers?.length || 0,
      },
    });

    res.json({
      success: true,
      message: 'Version submitted for review successfully',
      status: 'IN_REVIEW',
    });
  } catch (err) {
    logger.error(`Error in submit version: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/versions/compare
 * @description Compare two document versions
 * @access Private
 */
router.get('/compare', verifyJwt, async (req, res) => {
  try {
    const { baseVersionId, compareVersionId } = req.query;

    if (!baseVersionId || !compareVersionId) {
      return res.status(400).json({ message: 'Both version IDs are required' });
    }

    // Check if diff already exists
    const { data: existingDiff } = await supabase
      .from('document_diffs')
      .select('*')
      .eq('base_version_id', baseVersionId)
      .eq('compare_version_id', compareVersionId)
      .single();

    if (existingDiff) {
      return res.json({
        diff: existingDiff.diff_data,
        cached: true,
      });
    }

    // Get both versions
    const { data: baseVersion, error: baseError } = await supabase
      .from('document_versions')
      .select('id, document_id, file_path, mime_type')
      .eq('id', baseVersionId)
      .single();

    if (baseError || !baseVersion) {
      return res.status(404).json({ message: 'Base version not found' });
    }

    const { data: compareVersion, error: compareError } = await supabase
      .from('document_versions')
      .select('id, document_id, file_path, mime_type')
      .eq('id', compareVersionId)
      .single();

    if (compareError || !compareVersion) {
      return res.status(404).json({ message: 'Compare version not found' });
    }

    // Make sure versions are for the same document
    if (baseVersion.document_id !== compareVersion.document_id) {
      return res.status(400).json({ message: 'Versions must be for the same document' });
    }

    // Get both files from storage
    const baseFilePath = baseVersion.file_path;
    const compareFilePath = compareVersion.file_path;

    // Download the files
    const baseFileBuffer = await storage.downloadFile(baseFilePath);
    const compareFileBuffer = await storage.downloadFile(compareFilePath);

    // Create diff based on file type
    const diffChecker = new DiffChecker(baseVersion.mime_type, compareVersion.mime_type);

    const diff = await diffChecker.generateDiff(baseFileBuffer, compareFileBuffer);

    // Save diff to database
    await supabase.from('document_diffs').insert({
      base_version_id: baseVersionId,
      compare_version_id: compareVersionId,
      diff_data: diff,
    });

    // Track this comparison
    await supabase.from('document_version_views').insert([
      {
        version_id: baseVersionId,
        user_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        context: 'compare',
      },
      {
        version_id: compareVersionId,
        user_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        context: 'compare',
      },
    ]);

    res.json({
      diff,
      cached: false,
    });
  } catch (err) {
    logger.error(`Error in compare versions: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
