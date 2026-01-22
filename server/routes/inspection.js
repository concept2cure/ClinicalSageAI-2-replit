/**
 * Inspection Portal API Routes
 *
 * These routes handle the inspector read-only portal functionality:
 * - Creating inspector access tokens (admin only)
 * - Retrieving submission metadata
 * - Listing documents for inspection
 * - Auditing inspector activities
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.cjs';
import { inspectorAuth } from '../middleware/inspectorAuth.js';
import { supabase } from '../lib/supabaseClient.js';
import { logEvent } from '../middleware/ledgerLog.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @route POST /api/inspection/invite
 * @description Admin creates an inspector invite with time-boxed access
 * @access Private (Admin)
 */
router.post('/invite', verifyJwt, async (req, res) => {
  try {
    const { submissionId, email, days = 7, notes } = req.body;

    // Validate input
    if (!submissionId) {
      return res.status(400).json({ message: 'Submission ID is required' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Inspector email is required' });
    }

    // Calculate expiration date
    const expires = new Date(Date.now() + days * 86400000); // days to milliseconds

    // Create token in database
    const { data, error } = await supabase
      .from('inspector_tokens')
      .insert({
        submission_id: submissionId,
        inspector_email: email,
        expires_at: expires,
        created_by: req.user.id,
      })
      .select('*')
      .single();

    if (error) {
      logger.error(`Error creating inspector token: ${error.message}`, error);
      return res.status(400).json({ message: error.message });
    }

    // Log the token creation to the audit system
    await logEvent({
      type: 'INSPECTOR_TOKEN_CREATED',
      userId: req.user.id,
      submissionId: submissionId,
      details: {
        inspector_email: email,
        token_id: data.id,
        expires_at: expires,
        days_valid: days,
      },
    });

    // Generate access link
    const inspectionLink = `${process.env.FRONTEND_URL || 'https://trialsage.com'}/inspect?token=${data.id}`;

    // TODO: Send email to inspector with link

    res.status(201).json({
      message: 'Inspector invite created successfully',
      token: data.id,
      link: inspectionLink,
      expires,
      email,
    });
  } catch (err) {
    logger.error(`Error in create inspector invite: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/meta/:token
 * @description Get submission metadata for inspector view
 * @access Private (Inspector with valid token)
 */
router.get('/meta/:token', inspectorAuth, async (req, res) => {
  try {
    const { submission_id } = req.inspector;

    // Get basic submission information
    const { data, error } = await supabase
      .from('ind_wizards')
      .select('id, product_name, region, sponsor_name, indication, status')
      .eq('id', submission_id)
      .single();

    if (error || !data) {
      logger.error(`Error retrieving submission for inspection: ${error?.message}`);
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'view-metadata',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        submission_id,
      },
    });

    // Return sanitized metadata
    res.json({
      id: data.id,
      product_name: data.product_name,
      region: data.region,
      sponsor_name: data.sponsor_name,
      indication: data.indication,
      status: data.status,
    });
  } catch (err) {
    logger.error(`Error getting submission metadata: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/docs/:token
 * @description Get documents for inspector view with PHI redaction
 * @access Private (Inspector with valid token)
 */
router.get('/docs/:token', inspectorAuth, async (req, res) => {
  try {
    const { submission_id } = req.inspector;

    // Get submission blocks
    const { data, error } = await supabase
      .from('ind_blocks')
      .select('id, section_code, section_title, block_type, content, status')
      .eq('submission_id', submission_id)
      .eq('status', 'Effective') // Only show approved/effective blocks
      .order('section_code', { ascending: true });

    if (error) {
      logger.error(`Error retrieving documents for inspection: ${error.message}`);
      return res.status(400).json({ message: error.message });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'list-documents',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        document_count: data.length,
        submission_id,
      },
    });

    // TODO: Apply PHI redaction to content here
    // This would integrate with a de-identification service
    // For now we'll implement a placeholder function
    const redactedData = data.map(block => {
      return {
        ...block,
        content: redactPHI(block.content, block.block_type),
      };
    });

    res.json(redactedData);
  } catch (err) {
    logger.error(`Error getting documents: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/block/:token/:blockId
 * @description Get a specific block for inspector view
 * @access Private (Inspector with valid token)
 */
router.get('/block/:token/:blockId', inspectorAuth, async (req, res) => {
  try {
    const { submission_id } = req.inspector;
    const { blockId } = req.params;

    // Get the specific block
    const { data, error } = await supabase
      .from('ind_blocks')
      .select('id, section_code, section_title, block_type, content, status')
      .eq('id', blockId)
      .eq('submission_id', submission_id)
      .eq('status', 'Effective')
      .single();

    if (error || !data) {
      logger.error(`Error retrieving block for inspection: ${error?.message}`);
      return res.status(404).json({ message: 'Block not found' });
    }

    // Log this activity
    await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action: 'view-block',
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        block_id: blockId,
        section_code: data.section_code,
        submission_id,
      },
    });

    // Apply PHI redaction
    const redactedBlock = {
      ...data,
      content: redactPHI(data.content, data.block_type),
    };

    res.json(redactedBlock);
  } catch (err) {
    logger.error(`Error getting block: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/inspection/audit/:token
 * @description Log inspector activity for audit purposes
 * @access Private (Inspector with valid token)
 */
router.post('/audit/:token', inspectorAuth, async (req, res) => {
  try {
    const { action, meta = {} } = req.body;

    if (!action) {
      return res.status(400).json({ message: 'Action is required' });
    }

    // Add contextual information to metadata
    const enrichedMeta = {
      ...meta,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    };

    // Log to audit table
    const { error } = await supabase.from('inspector_audit').insert({
      token_id: req.inspector.id,
      action,
      metadata: enrichedMeta,
    });

    if (error) {
      logger.error(`Error inserting audit record: ${error.message}`);
      return res.status(400).json({ message: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`Error logging audit: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/inspection/token-status/:token
 * @description Check if a token is valid and return expiry information
 * @access Public (used for inspector portal validity check)
 */
router.get('/token-status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: 'Token is required',
      });
    }

    // Check token in database
    const { data, error } = await supabase
      .from('inspector_tokens')
      .select('expires_at, inspector_email, submission_id')
      .eq('id', token)
      .single();

    if (error || !data) {
      return res.json({
        valid: false,
        message: 'Invalid inspector token',
      });
    }

    // Check if token is expired
    const now = new Date();
    const expiryDate = new Date(data.expires_at);
    const isExpired = expiryDate < now;

    // Calculate days remaining if not expired
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = isExpired ? 0 : Math.ceil((expiryDate - now) / msPerDay);

    return res.json({
      valid: !isExpired,
      expires_at: data.expires_at,
      days_remaining: daysRemaining,
      email: data.inspector_email,
      message: isExpired ? 'Token has expired' : 'Token is valid',
    });
  } catch (err) {
    logger.error(`Error checking token status: ${err.message}`, err);
    res.status(500).json({
      valid: false,
      message: 'Error checking token status',
    });
  }
});

/**
 * Token cleanup cron function (to be called via scheduler)
 * Deletes expired tokens older than 30 days to keep the database clean
 */
export async function cleanupExpiredTokens() {
  try {
    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete tokens that expired more than 30 days ago
    const { data, error } = await supabase
      .from('inspector_tokens')
      .delete()
      .lt('expires_at', thirtyDaysAgo.toISOString())
      .select();

    if (error) {
      logger.error(`Error cleaning up expired tokens: ${error.message}`);
      return { success: false, error: error.message };
    }

    logger.info(`Cleaned up ${data?.length || 0} expired inspector tokens`);
    return { success: true, tokens_removed: data?.length || 0 };
  } catch (err) {
    logger.error(`Error in token cleanup: ${err.message}`, err);
    return { success: false, error: err.message };
  }
}

// Helper function for PHI redaction
// This is a placeholder function that should be replaced with a real de-identification service
function redactPHI(content, blockType) {
  // If null content, return as is
  if (!content) return content;

  if (blockType === 'markdown' && content.markdown) {
    // Example simple redaction patterns (in production would use a dedicated library)
    const redactPatterns = [
      // US Social Security Number
      { pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, replacement: '[REDACTED-SSN]' },
      // US Phone Number
      { pattern: /\b\(\d{3}\)\s?\d{3}[-]?\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
      { pattern: /\b\d{3}[-]?\d{3}[-]?\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
      // Email
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        replacement: '[REDACTED-EMAIL]',
      },
      // Names pattern (simplified, would use NER in production)
      { pattern: /Dr\.\s[A-Z][a-z]+ [A-Z][a-z]+/g, replacement: '[REDACTED-NAME]' },
      { pattern: /Patient ID: [A-Z0-9-]+/g, replacement: 'Patient ID: [REDACTED-ID]' },
    ];

    let redactedMarkdown = content.markdown;
    for (const { pattern, replacement } of redactPatterns) {
      redactedMarkdown = redactedMarkdown.replace(pattern, replacement);
    }

    return { ...content, markdown: redactedMarkdown };
  } else if (blockType === 'table' && content.rows) {
    // For tables, we need to iterate through each cell
    const redactedRows = content.rows.map(row => {
      return row.map(cell => {
        if (typeof cell === 'string') {
          // Apply same redaction patterns to cell content
          let redactedCell = cell;

          // SSN
          redactedCell = redactedCell.replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[REDACTED-SSN]');
          // Phone
          redactedCell = redactedCell.replace(
            /\b\(\d{3}\)\s?\d{3}[-]?\d{4}\b/g,
            '[REDACTED-PHONE]'
          );
          redactedCell = redactedCell.replace(/\b\d{3}[-]?\d{3}[-]?\d{4}\b/g, '[REDACTED-PHONE]');
          // Email
          redactedCell = redactedCell.replace(
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
            '[REDACTED-EMAIL]'
          );
          // Names (simplified)
          redactedCell = redactedCell.replace(/Dr\.\s[A-Z][a-z]+ [A-Z][a-z]+/g, '[REDACTED-NAME]');
          redactedCell = redactedCell.replace(
            /Patient ID: [A-Z0-9-]+/g,
            'Patient ID: [REDACTED-ID]'
          );

          return redactedCell;
        }
        return cell;
      });
    });

    return { ...content, rows: redactedRows };
  }

  // For other block types, return content as is
  return content;
}

export default router;
