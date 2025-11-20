/**
 * Periodic Review Scheduler
 *
 * This job runs as a cron task to check for documents that are due for periodic review.
 * When documents are identified as due for review:
 * 1. A review task is created or updated in the periodic_review_tasks table
 * 2. Email notifications are sent to document owners
 * 3. Dashboard notifications are created for relevant users
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Check for documents due for periodic review
 * Runs daily at 2:00 AM
 */
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Starting periodic review check');

    // Find tasks that are open and have due dates today or earlier
    const { data: tasks, error: tasksError } = await supabase
      .from('periodic_review_tasks')
      .select(
        `
        id, 
        document_id, 
        tenant_id, 
        owner_id, 
        due_date,
        documents:document_id (
          id,
          title,
          filename,
          document_subtype_id,
          document_subtypes:document_subtype_id (name)
        )
      `
      )
      .eq('status', 'Open')
      .lte('due_date', new Date().toISOString().split('T')[0]); // Today or earlier

    if (tasksError) throw tasksError;

    logger.info(`Found ${tasks?.length || 0} documents due for review`);

    // Process each task
    for (const task of tasks || []) {
      try {
        // Update task status to Due
        const { error: updateError } = await supabase
          .from('periodic_review_tasks')
          .update({
            status: 'Due',
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        if (updateError) throw updateError;

        // Send notification to document owner (in a real implementation, this would send an email)
        logger.info(
          {
            ownerId: task.owner_id,
            documentId: task.document_id,
            documentTitle: task.documents?.title || 'Unknown document',
            documentType: task.documents?.document_subtypes?.name || 'Unknown type',
            dueDate: task.due_date,
          },
          'Document due for periodic review'
        );

        // Create a notification in the notifications table (if it exists)
        const notificationData = {
          tenant_id: task.tenant_id,
          user_id: task.owner_id,
          type: 'periodic_review',
          title: 'Document Due for Review',
          message: `${task.documents?.title || 'A document'} is due for periodic review.`,
          resource_type: 'document',
          resource_id: task.document_id,
          is_read: false,
          created_at: new Date().toISOString(),
        };

        try {
          await supabase.from('notifications').insert(notificationData);
        } catch (notificationError) {
          // Notifications table might not exist, or there might be other errors
          // Just log it and continue
          logger.warn({ err: notificationError }, 'Error creating notification');
        }

        // Schedule the next review (if applicable)
        // This would create a new task with a future due date based on review_interval
        // But only after the current review is completed, which is handled elsewhere
      } catch (taskError) {
        logger.error({ err: taskError, taskId: task.id }, 'Error processing periodic review task');
        // Continue with other tasks
      }
    }

    logger.info('Completed periodic review check');
  } catch (error) {
    logger.error({ err: error }, 'Error in periodic review scheduler');
  }
});

/**
 * Clean up old completed review tasks
 * Runs weekly on Sunday at 3:00 AM
 */
cron.schedule('0 3 * * 0', async () => {
  try {
    // Calculate date 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Delete completed tasks older than 90 days
    const { data, error } = await supabase
      .from('periodic_review_tasks')
      .delete()
      .eq('status', 'Completed')
      .lt('updated_at', ninetyDaysAgo.toISOString());

    if (error) throw error;

    logger.info(`Cleaned up ${data?.length || 0} old completed review tasks`);
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up old review tasks');
  }
});

/**
 * Generate a new task when reviews are completed
 * This function should be called when a document's review is completed
 *
 * @param {number} documentId - ID of the document
 * @param {string} subtypeId - Document subtype ID
 * @param {number} ownerId - Document owner user ID
 * @param {string} tenantId - Tenant ID
 */
export async function scheduleNextReview(documentId, subtypeId, ownerId, tenantId) {
  try {
    // Get the review interval for this document type
    const { data: subtype, error: subtypeError } = await supabase
      .from('document_subtypes')
      .select('review_interval')
      .eq('id', subtypeId)
      .single();

    if (subtypeError) throw subtypeError;

    // Only schedule if a review interval exists
    if (subtype && subtype.review_interval) {
      // Calculate next review date
      const nextReviewDate = new Date();
      nextReviewDate.setMonth(nextReviewDate.getMonth() + subtype.review_interval);

      // Create a new task
      const { error: insertError } = await supabase.from('periodic_review_tasks').insert({
        document_id: documentId,
        tenant_id: tenantId,
        owner_id: ownerId,
        due_date: nextReviewDate.toISOString().split('T')[0],
        status: 'Open',
      });

      if (insertError) throw insertError;

      // Update document's periodic_review_date
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          periodic_review_date: nextReviewDate.toISOString(),
        })
        .eq('id', documentId);

      if (updateError) throw updateError;

      logger.info(
        {
          documentId,
          subtypeId,
          nextReviewDate: nextReviewDate.toISOString(),
        },
        'Scheduled next periodic review'
      );

      return true;
    }

    return false;
  } catch (error) {
    logger.error({ err: error, documentId, subtypeId }, 'Error scheduling next review');
    throw error;
  }
}

// Export the scheduler functions for use elsewhere
export default {
  scheduleNextReview,
};
