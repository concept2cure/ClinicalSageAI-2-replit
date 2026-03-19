/**
 * Document Retention Job
 *
 * This module implements the scheduled job that enforces document retention policies.
 * It identifies documents that have expired according to their retention policies,
 * archives them if configured, and deletes them when required.
 *
 * The job includes robust error handling, detailed logging, and notification capabilities.
 */

import nodemailer from 'nodemailer';
import { logSystemEvent, logAction } from '../utils/audit-logger.js';
import { pool } from '../db.js';

// Use the same Neon PostgreSQL pool as the rest of the application
// (Previously used Supabase client which caused a database mismatch)

// Configure email transport for notifications
const emailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Send notification emails to administrators about retention actions
 *
 * @param {string} subject - Email subject
 * @param {string} message - Email message body
 * @param {Array} recipients - List of email recipients
 */
async function sendNotification(subject, message, recipients) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.log('[RETENTION] Email notifications disabled: SMTP credentials not configured');
      return;
    }

    await emailTransport.sendMail({
      from: process.env.EMAIL_FROM || 'Concept2Cure Vault <no-reply@trialsage.ai>',
      to: recipients.join(', '),
      subject,
      html: message,
    });

    console.log(`[RETENTION] Notification sent to ${recipients.length} recipients`);
  } catch (error) {
    console.error('[RETENTION] Failed to send notification:', error.message);
    logSystemEvent({
      event: 'notification_failure',
      component: 'retention_job',
      severity: 'warning',
      details: {
        error: error.message,
        subject,
        recipients: recipients.length,
      },
    });
  }
}

/**
 * Archive a document before deletion
 *
 * @param {Object} document - Document to archive
 * @returns {boolean} - Success status
 */
async function archiveDocument(document) {
  try {
    console.log(`[RETENTION] Archiving document: ${document.id} - ${document.name}`);

    // Copy the document to the archive table
    const { data: archivedDoc, error: archiveError } = await supabase
      .from('document_archives')
      .insert({
        original_id: document.id,
        document_data: document,
        archived_at: new Date().toISOString(),
        archived_by: 'system',
        archive_reason: 'retention_policy',
      });

    if (archiveError) {
      throw new Error(`Archive error: ${archiveError.message}`);
    }

    logAction({
      action: 'document.archive',
      userId: 'system',
      username: 'system',
      entityType: 'document',
      entityId: document.id,
      details: {
        document_name: document.name,
        policy_id: document.retention_policy_id,
        archive_id: archivedDoc?.id,
      },
    });

    return true;
  } catch (error) {
    console.error(`[RETENTION] Failed to archive document ${document.id}:`, error.message);
    logSystemEvent({
      event: 'archive_failure',
      component: 'retention_job',
      severity: 'warning',
      details: {
        document_id: document.id,
        document_name: document.name,
        error: error.message,
      },
    });
    return false;
  }
}

/**
 * Delete a document from storage and database
 *
 * @param {Object} document - Document to delete
 * @param {boolean} wasArchived - Whether the document was archived first
 * @returns {boolean} - Success status
 */
async function deleteDocument(document, wasArchived) {
  try {
    console.log(`[RETENTION] Deleting document: ${document.id} - ${document.name}`);

    // First delete the file from storage (filesystem-based since we use Neon, not Supabase storage)
    if (document.storage_path) {
      const fs = await import('fs/promises');
      try {
        await fs.unlink(document.storage_path);
      } catch (fsErr) {
        console.warn(`[RETENTION] File not found on disk: ${document.storage_path}`, fsErr.message);
      }
    }

    // Then delete the database record using the shared Neon pool
    await pool.query('DELETE FROM documents WHERE id = $1', [document.id]);

    logAction({
      action: 'document.delete',
      userId: 'system',
      username: 'system',
      entityType: 'document',
      entityId: document.id,
      details: {
        document_name: document.name,
        policy_id: document.retention_policy_id,
        was_archived: wasArchived,
      },
    });

    return true;
  } catch (error) {
    console.error(`[RETENTION] Failed to delete document ${document.id}:`, error.message);
    logSystemEvent({
      event: 'delete_failure',
      component: 'retention_job',
      severity: 'warning',
      details: {
        document_id: document.id,
        document_name: document.name,
        error: error.message,
      },
    });
    return false;
  }
}

/**
 * Get all active retention policies
 *
 * @returns {Array} - List of active retention policies
 */
async function getActivePolicies() {
  try {
    const { data: policies, error } = await supabase
      .from('retention_policies')
      .select('*')
      .eq('active', true);

    if (error) {
      throw new Error(`Failed to fetch policies: ${error.message}`);
    }

    return policies || [];
  } catch (error) {
    console.error('[RETENTION] Error fetching policies:', error.message);
    logSystemEvent({
      event: 'policy_fetch_failure',
      component: 'retention_job',
      severity: 'error',
      details: {
        error: error.message,
      },
    });
    return [];
  }
}

/**
 * Get administrator email addresses for notifications
 *
 * @returns {Array} - List of admin email addresses
 */
async function getAdminEmails() {
  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin')
      .eq('active', true);

    if (error) {
      throw new Error(`Failed to fetch admin emails: ${error.message}`);
    }

    return admins.map(admin => admin.email);
  } catch (error) {
    console.error('[RETENTION] Error fetching admin emails:', error.message);
    return [];
  }
}

/**
 * Calculate the expiration date based on a retention policy
 *
 * @param {Object} policy - The retention policy
 * @param {Date} documentDate - The document's creation or last modified date
 * @returns {Date} - The expiration date
 */
function calculateExpirationDate(policy, documentDate) {
  const date = new Date(documentDate);

  switch (policy.period_unit) {
    case 'days':
      date.setDate(date.getDate() + policy.retention_period);
      break;
    case 'months':
      date.setMonth(date.getMonth() + policy.retention_period);
      break;
    case 'years':
      date.setFullYear(date.getFullYear() + policy.retention_period);
      break;
    default:
      // Default to years if unit is unrecognized
      date.setFullYear(date.getFullYear() + policy.retention_period);
  }

  return date;
}

/**
 * Process expired documents based on policies
 *
 * @param {Array} policies - Active retention policies
 * @returns {Object} - Statistics about processing
 */
async function processExpiredDocuments(policies) {
  const stats = {
    total: 0,
    archived: 0,
    deleted: 0,
    failed: 0,
  };

  // Process each policy
  for (const policy of policies) {
    console.log(`[RETENTION] Processing policy: ${policy.name}`);

    try {
      // Get documents that match this policy
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('document_type', policy.document_type);

      if (error) {
        throw new Error(`Failed to fetch documents for policy ${policy.id}: ${error.message}`);
      }

      if (!documents || !documents.length) {
        console.log(`[RETENTION] No documents found for policy: ${policy.name}`);
        continue;
      }

      // Process each document
      for (const document of documents) {
        const creationDate = new Date(document.created_at);
        const expirationDate = calculateExpirationDate(policy, creationDate);
        const now = new Date();

        // Skip if document hasn't expired yet
        if (expirationDate > now) {
          continue;
        }

        stats.total++;
        console.log(`[RETENTION] Processing expired document: ${document.id} - ${document.name}`);

        let wasArchived = false;

        // Archive document if policy requires it
        if (policy.archive_before_delete) {
          wasArchived = await archiveDocument(document);
          if (wasArchived) {
            stats.archived++;
          }
        }

        // Delete the document
        const wasDeleted = await deleteDocument(document, wasArchived);
        if (wasDeleted) {
          stats.deleted++;
        } else {
          stats.failed++;
        }
      }
    } catch (error) {
      console.error(`[RETENTION] Error processing policy ${policy.id}:`, error.message);
      logSystemEvent({
        event: 'policy_processing_failure',
        component: 'retention_job',
        severity: 'error',
        details: {
          policy_id: policy.id,
          policy_name: policy.name,
          error: error.message,
        },
      });
    }
  }

  return stats;
}

/**
 * Identify documents approaching expiration for notification
 *
 * @param {Array} policies - Active retention policies
 * @returns {Array} - Documents approaching expiration
 */
async function findDocumentsApproachingExpiration(policies) {
  const approachingExpiration = [];

  for (const policy of policies) {
    if (!policy.notify_before_deletion) {
      continue;
    }

    try {
      // Get documents that match this policy
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('document_type', policy.document_type);

      if (error) {
        throw new Error(`Failed to fetch documents for policy ${policy.id}: ${error.message}`);
      }

      if (!documents || !documents.length) {
        continue;
      }

      // Calculate notification threshold date
      const now = new Date();
      const thresholdDate = new Date();

      switch (policy.notification_unit) {
        case 'days':
          thresholdDate.setDate(thresholdDate.getDate() + policy.notification_period);
          break;
        case 'months':
          thresholdDate.setMonth(thresholdDate.getMonth() + policy.notification_period);
          break;
        case 'years':
          thresholdDate.setFullYear(thresholdDate.getFullYear() + policy.notification_period);
          break;
      }

      // Check each document
      for (const document of documents) {
        const creationDate = new Date(document.created_at);
        const expirationDate = calculateExpirationDate(policy, creationDate);

        // If expiration date is between now and threshold
        if (expirationDate > now && expirationDate <= thresholdDate) {
          approachingExpiration.push({
            document,
            policy,
            expirationDate,
          });
        }
      }
    } catch (error) {
      console.error(
        `[RETENTION] Error finding documents approaching expiration for policy ${policy.id}:`,
        error.message
      );
    }
  }

  return approachingExpiration;
}

/**
 * Send notifications for documents approaching expiration
 *
 * @param {Array} approachingDocs - Documents approaching expiration
 */
async function sendExpirationNotifications(approachingDocs) {
  if (!approachingDocs.length) {
    return;
  }

  const adminEmails = await getAdminEmails();
  if (!adminEmails.length) {
    console.log('[RETENTION] No admin emails found for notifications');
    return;
  }

  // Group documents by policy for better email organization
  const docsByPolicy = {};
  for (const item of approachingDocs) {
    const policyId = item.policy.id;
    if (!docsByPolicy[policyId]) {
      docsByPolicy[policyId] = {
        policy: item.policy,
        documents: [],
      };
    }
    docsByPolicy[policyId].documents.push({
      document: item.document,
      expirationDate: item.expirationDate,
    });
  }

  // Send email for each policy
  for (const policyId in docsByPolicy) {
    const { policy, documents } = docsByPolicy[policyId];

    const subject = `Concept2Cure Vault: ${documents.length} document(s) approaching retention expiration`;

    let message = `
      <h2>Document Retention Notification</h2>
      <p>The following documents are approaching their retention expiration date according to the <strong>${policy.name}</strong> policy:</p>
      <table border="1" cellpadding="5" style="border-collapse: collapse;">
        <tr>
          <th>Document Name</th>
          <th>Type</th>
          <th>Created</th>
          <th>Expires</th>
        </tr>
    `;

    for (const { document, expirationDate } of documents) {
      message += `
        <tr>
          <td>${document.name}</td>
          <td>${document.document_type}</td>
          <td>${new Date(document.created_at).toLocaleDateString()}</td>
          <td>${expirationDate.toLocaleDateString()}</td>
        </tr>
      `;
    }

    message += `
      </table>
      <p>Please review these documents and take appropriate action if they need to be preserved.</p>
      <p>This is an automated message from Concept2Cure Vault Retention Service.</p>
    `;

    await sendNotification(subject, message, adminEmails);

    logSystemEvent({
      event: 'expiration_notification_sent',
      component: 'retention_job',
      severity: 'info',
      details: {
        policy_id: policy.id,
        policy_name: policy.name,
        document_count: documents.length,
        recipient_count: adminEmails.length,
      },
    });
  }
}

/**
 * Main function to run the retention job
 *
 * @returns {boolean} - Success status
 */
export async function runRetentionJob() {
  console.log('[RETENTION] Starting document retention job...');
  logSystemEvent({
    event: 'job_started',
    component: 'retention_job',
    severity: 'info',
  });

  try {
    // Get active policies
    const policies = await getActivePolicies();
    if (!policies.length) {
      console.log('[RETENTION] No active retention policies found');
      return true;
    }

    console.log(`[RETENTION] Found ${policies.length} active retention policies`);

    // Process expired documents
    const stats = await processExpiredDocuments(policies);
    console.log('[RETENTION] Processing complete:', stats);

    // Find and notify about documents approaching expiration
    const approachingDocs = await findDocumentsApproachingExpiration(policies);
    console.log(`[RETENTION] Found ${approachingDocs.length} documents approaching expiration`);

    if (approachingDocs.length > 0) {
      await sendExpirationNotifications(approachingDocs);
    }

    logSystemEvent({
      event: 'job_completed',
      component: 'retention_job',
      severity: 'info',
      details: stats,
    });

    return true;
  } catch (error) {
    console.error('[RETENTION] Job failed:', error.message);
    logSystemEvent({
      event: 'job_failed',
      component: 'retention_job',
      severity: 'error',
      details: {
        error: error.message,
        stack: error.stack,
      },
    });
    return false;
  }
}

// Export a scheduled function to be used with node-cron
export function scheduleRetentionJob(cron) {
  return cron.schedule('0 1 * * *', async () => {
    // Runs at 1:00 AM daily
    await runRetentionJob();
  });
}

export default {
  runRetentionJob,
  scheduleRetentionJob,
};
