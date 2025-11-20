/**
 * Enhanced Inspection Portal API Routes
 *
 * These routes handle the enhanced inspector read-only portal functionality:
 * - Advanced redaction with configurable patterns
 * - Document watermarking
 * - Enhanced audit logging
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.js';
import { inspectorAuth } from '../middleware/inspectorAuth.js';
import { supabase } from '../lib/supabaseClient.js';
import { storage } from '../lib/storageClient.js';
import { logEvent } from '../middleware/ledgerLog.js';
import { logger } from '../utils/logger.js';
import redactionService from '../services/redactionService.js';
import watermarkService from '../services/watermarkService.js';

const router = Router();

/**
 * @route GET /api/inspection/v2/meta/:token
 * @description Get enhanced submission metadata for inspector view
 * @access Private (Inspector with valid token)
 */
router.get('/meta/:token', inspectorAuth, async (req, res) => {
  try {
    const { submission_id } = req.inspector;

    // Get enhanced submission information
    const { data, error } = await supabase
      .from('ind_wizards')
      .select(
        `
        id, 
        product_name, 
        region, 
        sponsor_name, 
        indication, 
        status,
        created_at,
        updated_at,
        modules_completed,
        submissions(id, status, version, submitted_at, authority)
      `
      )
      .eq('id', submission_id)
      .single();

    if (error || !data) {
      logger.error(`Error retrieving submission for inspection: ${error?.message}`);
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'view-enhanced-metadata',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        submission_id,
      },
    });

    // Return enhanced metadata
    res.json({
      id: data.id,
      product_name: data.product_name,
      region: data.region,
      sponsor_name: data.sponsor_name,
      indication: data.indication,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      modules_completed: data.modules_completed,
      submissions: data.submissions,
    });
  } catch (err) {
    logger.error(`Error getting enhanced submission metadata: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/v2/documents/:token
 * @description Get list of available documents with enhanced metadata
 * @access Private (Inspector with valid token)
 */
router.get('/documents/:token', inspectorAuth, async (req, res) => {
  try {
    const { submission_id } = req.inspector;

    // Get documents with their latest versions and type information
    const { data, error } = await supabase
      .from('documents')
      .select(
        `
        id,
        name,
        description,
        status,
        created_at,
        updated_at,
        document_type_id,
        document_subtype_id,
        document_types(name, icon, color),
        document_subtypes(name, lifecycle_id, requires_training),
        latest_version_id,
        latest_version_number,
        version_count
      `
      )
      .eq('submission_id', submission_id)
      .order('name', { ascending: true });

    if (error) {
      logger.error(`Error retrieving documents for inspection: ${error.message}`, error);
      return res.status(500).json({ message: 'Error retrieving documents' });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'list-documents',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        submission_id,
        document_count: data?.length || 0,
      },
    });

    // Return the documents with security-sanitized metadata
    const sanitizedDocuments = data.map(doc => ({
      id: doc.id,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      document_type: doc.document_types?.name || 'Unknown',
      document_subtype: doc.document_subtypes?.name || 'Unknown',
      version_count: doc.version_count || 1,
      latest_version: doc.latest_version_number || 1,
      icon: doc.document_types?.icon || 'file',
      color: doc.document_types?.color || '#cccccc',
    }));

    res.json(sanitizedDocuments);
  } catch (err) {
    logger.error(`Error in list documents: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/v2/document/:token/:documentId
 * @description Get redacted document content
 * @access Private (Inspector with valid token)
 */
router.get('/document/:token/:documentId', inspectorAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const inspectorToken = req.inspector;

    // Get document info
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select(
        `
        id,
        name,
        content,
        blocks,
        mime_type,
        tenant_id,
        document_type_id,
        document_subtype_id,
        file_path,
        latest_version_id
      `
      )
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      logger.error(`Error retrieving document for inspection: ${docError?.message}`);
      return res.status(404).json({ message: 'Document not found' });
    }

    // Define response type
    const isStructuredContent = !!document.blocks;
    const isFileContent = !!document.file_path;

    // Log this document view
    await supabase.from('inspector_audit').insert({
      token_id: inspectorToken.id,
      action: 'view-document',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        document_id: documentId,
        document_name: document.name,
        is_structured: isStructuredContent,
        is_file: isFileContent,
        mime_type: document.mime_type,
      },
    });

    // Handle structured content (blocks)
    if (isStructuredContent) {
      // Process blocks with the redaction service
      const redactedBlocks = [];

      for (const block of document.blocks) {
        // Only redact text-based content in blocks
        if (block.type === 'paragraph' || block.type === 'heading') {
          const { redactedText } = await redactionService.redactText(
            block.content.text,
            await redactionService.getRedactionPatterns(
              document.id,
              document.document_type_id,
              document.document_subtype_id,
              document.tenant_id
            )
          );

          // Create a redacted copy of the block
          redactedBlocks.push({
            ...block,
            content: {
              ...block.content,
              text: redactedText,
            },
          });
        } else if (block.type === 'markdown') {
          const { redactedText } = await redactionService.redactText(
            block.content.markdown,
            await redactionService.getRedactionPatterns(
              document.id,
              document.document_type_id,
              document.document_subtype_id,
              document.tenant_id
            )
          );

          redactedBlocks.push({
            ...block,
            content: {
              ...block.content,
              markdown: redactedText,
            },
          });
        } else if (block.type === 'table' && block.content.rows) {
          // For tables, we need to redact each cell
          const redactedRows = [];
          const patterns = await redactionService.getRedactionPatterns(
            document.id,
            document.document_type_id,
            document.document_subtype_id,
            document.tenant_id
          );

          for (const row of block.content.rows) {
            const redactedRow = [];

            for (const cell of row) {
              if (typeof cell === 'string') {
                const { redactedText } = await redactionService.redactText(cell, patterns);
                redactedRow.push(redactedText);
              } else {
                redactedRow.push(cell);
              }
            }

            redactedRows.push(redactedRow);
          }

          redactedBlocks.push({
            ...block,
            content: {
              ...block.content,
              rows: redactedRows,
            },
          });
        } else {
          // Other block types pass through unchanged
          redactedBlocks.push(block);
        }
      }

      // Return redacted blocks
      return res.json({
        id: document.id,
        name: document.name,
        blocks: redactedBlocks,
        mime_type: document.mime_type,
        redacted: true,
        content_type: 'blocks',
      });
    }

    // Handle file-based content
    if (isFileContent) {
      try {
        // Get file from storage
        const fileBuffer = await storage.downloadFile(document.file_path);

        // Apply redaction based on mime type
        const { buffer, matchesFound, contentType } = await redactionService.redactDocument(
          fileBuffer,
          document.mime_type,
          document,
          inspectorToken.id,
          req.ip,
          req.headers['user-agent']
        );

        // Apply watermarking
        const watermarkedBuffer = await watermarkService.watermarkDocument(
          buffer,
          contentType || document.mime_type,
          inspectorToken,
          document
        );

        // Log watermarking activity
        await watermarkService.logWatermarkActivity(
          inspectorToken,
          document,
          contentType || document.mime_type
        );

        // Set response headers and return the file
        res.setHeader('Content-Type', contentType || document.mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${document.name}"`);
        res.setHeader('X-Redacted', 'true');
        res.setHeader('X-Watermarked', 'true');
        res.setHeader('X-Matches-Found', matchesFound.toString());

        return res.send(watermarkedBuffer);
      } catch (fileError) {
        logger.error(`Error processing file for inspection: ${fileError.message}`, fileError);
        return res.status(500).json({ message: 'Error processing document file' });
      }
    }

    // Handle plain text content
    if (document.content) {
      // Apply redaction to text content
      const patterns = await redactionService.getRedactionPatterns(
        document.id,
        document.document_type_id,
        document.document_subtype_id,
        document.tenant_id
      );

      const { redactedText, matchesFound } = await redactionService.redactText(
        document.content,
        patterns
      );

      // Log redaction activity
      await redactionService.logRedactionActivity(
        document.id,
        document.latest_version_id,
        inspectorToken.id,
        patterns.length,
        matchesFound,
        0,
        req.ip,
        req.headers['user-agent']
      );

      return res.json({
        id: document.id,
        name: document.name,
        content: redactedText,
        mime_type: document.mime_type,
        redacted: true,
        matches_found: matchesFound,
        content_type: 'text',
      });
    }

    // No content found
    return res.status(404).json({ message: 'No content available for this document' });
  } catch (err) {
    logger.error(`Error retrieving redacted document: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/v2/redaction-rules/:token
 * @description Get redaction rules info for the inspector
 * @access Private (Inspector with valid token)
 */
router.get('/redaction-rules/:token', inspectorAuth, async (req, res) => {
  try {
    // Get redaction patterns information (without the actual patterns)
    const { data, error } = await supabase
      .from('redaction_patterns')
      .select('id, name, description, priority, is_regex, is_global, case_sensitive')
      .order('priority', { ascending: true });

    if (error) {
      logger.error(`Error retrieving redaction rules: ${error.message}`, error);
      return res.status(500).json({ message: 'Error retrieving redaction rules' });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'view-redaction-rules',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        rule_count: data?.length || 0,
      },
    });

    // Return sanitized rule info
    res.json({
      rules: data,
      count: data?.length || 0,
      message: 'These redaction rules are applied to protect sensitive information',
    });
  } catch (err) {
    logger.error(`Error retrieving redaction rules: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/v2/watermark-info/:token
 * @description Get watermarking info for the inspector
 * @access Private (Inspector with valid token)
 */
router.get('/watermark-info/:token', inspectorAuth, async (req, res) => {
  try {
    // Get inspector information
    const inspectorToken = req.inspector;

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: inspectorToken.id,
      action: 'view-watermark-info',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    // Return watermarking policy info
    res.json({
      watermark_policy: {
        visible: true,
        invisible: true,
        includes_inspector_id: true,
        includes_timestamp: true,
        includes_expiry: true,
        tracking_enabled: true,
      },
      inspector_info: {
        email: inspectorToken.inspector_email,
        token_id: inspectorToken.id.substring(0, 8) + '...',
        expires_at: inspectorToken.expires_at,
      },
      message:
        'All documents are watermarked to ensure traceability and prevent unauthorized distribution',
    });
  } catch (err) {
    logger.error(`Error retrieving watermark info: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/v2/activity/:token
 * @description Get inspector activity log
 * @access Private (Inspector with valid token)
 */
router.get('/activity/:token', inspectorAuth, async (req, res) => {
  try {
    const inspectorToken = req.inspector;

    // Get activity log
    const { data, error } = await supabase
      .from('inspector_audit')
      .select('*')
      .eq('token_id', inspectorToken.id)
      .order('ts', { ascending: false })
      .limit(100);

    if (error) {
      logger.error(`Error retrieving inspector activity: ${error.message}`, error);
      return res.status(500).json({ message: 'Error retrieving activity log' });
    }

    // Log this activity itself
    await supabase.from('inspector_audit').insert({
      token_id: inspectorToken.id,
      action: 'view-activity-log',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        activity_count: data?.length || 0,
      },
    });

    // Return activity log
    res.json({
      activities: data,
      count: data?.length || 0,
    });
  } catch (err) {
    logger.error(`Error retrieving inspector activity: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/inspection/v2/revoke-access/:adminToken
 * @description Admin route to revoke inspector access
 * @access Private (Admin)
 */
router.post('/revoke-access/:adminToken', verifyJwt, async (req, res) => {
  try {
    const { inspectorTokenId, reason } = req.body;

    if (!inspectorTokenId) {
      return res.status(400).json({ message: 'Inspector token ID is required' });
    }

    // Get the token info first
    const { data: token, error: tokenError } = await supabase
      .from('inspector_tokens')
      .select('*')
      .eq('id', inspectorTokenId)
      .single();

    if (tokenError || !token) {
      return res.status(404).json({ message: 'Inspector token not found' });
    }

    // Delete the token
    const { error } = await supabase.from('inspector_tokens').delete().eq('id', inspectorTokenId);

    if (error) {
      logger.error(`Error revoking inspector access: ${error.message}`, error);
      return res.status(500).json({ message: 'Error revoking access' });
    }

    // Log this action
    await logEvent({
      type: 'INSPECTOR_ACCESS_REVOKED',
      userId: req.user.id,
      details: {
        inspector_email: token.inspector_email,
        token_id: token.id,
        reason,
        submission_id: token.submission_id,
      },
    });

    res.json({
      success: true,
      message: 'Inspector access revoked successfully',
    });
  } catch (err) {
    logger.error(`Error in revoke inspector access: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
