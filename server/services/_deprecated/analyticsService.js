/**
 * Analytics Service for IND Wizard
 *
 * This service collects, processes, and aggregates analytics data for:
 * - Submission metrics and timelines
 * - Regulatory performance
 * - User productivity and activity
 * - Content quality and completeness
 * - System performance and usage
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../events/eventBus.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize event listeners
function initEventListeners() {
  // Listen for events that should trigger analytics updates
  eventBus.subscribe({ type: 'block_insert' }, event => {
    trackBlockActivity(
      event.payload.submission_id,
      event.payload.block_id,
      'created',
      event.payload.user_id
    );
  });

  eventBus.subscribe({ type: 'block_update' }, event => {
    trackBlockActivity(
      event.payload.submission_id,
      event.payload.block_id,
      'updated',
      event.payload.user_id
    );
  });

  eventBus.subscribe({ type: 'document_harvested' }, event => {
    trackHarvesterUsage(event.payload.submission_id, event.payload.document_id);
  });

  eventBus.subscribe({ type: 'esg_submission_created' }, event => {
    trackRegulatory(event.payload.submission_id, 'submission_created', event.payload);
  });

  eventBus.subscribe({ type: 'user_activity' }, event => {
    trackUserActivity(
      event.payload.user_id,
      event.payload.submission_id,
      event.payload.activity_type,
      event.payload
    );
  });

  logger.info('Analytics event listeners initialized');
}

/**
 * Track block activity (create, update, delete)
 *
 * @param {string} submissionId - Submission ID
 * @param {string} blockId - Block ID
 * @param {string} actionType - Action type (created, updated, deleted)
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function trackBlockActivity(submissionId, blockId, actionType, userId) {
  try {
    // Get today's date ID
    const today = new Date().toISOString().split('T')[0];
    const { data: dateId } = await supabase
      .from('analytics_dimensions_time')
      .select('id')
      .eq('date_actual', today)
      .single();

    if (!dateId || !dateId.id) {
      logger.error(`Failed to find date ID for ${today}`);
      return;
    }

    // Update user activity record
    const activityUpdates = {};
    switch (actionType) {
      case 'created':
        activityUpdates.blocks_created = 1;
        break;
      case 'updated':
        activityUpdates.blocks_edited = 1;
        break;
      case 'deleted':
        activityUpdates.blocks_deleted = 1;
        break;
    }

    // Get existing user activity record or create a new one
    const { data: existingActivity } = await supabase
      .from('analytics_user_activity')
      .select('id')
      .eq('date_id', dateId.id)
      .eq('user_id', userId)
      .eq('submission_id', submissionId)
      .single();

    if (existingActivity) {
      // Update existing activity record
      await supabase
        .from('analytics_user_activity')
        .update({
          ...activityUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingActivity.id);
    } else {
      // Create new activity record
      await supabase.from('analytics_user_activity').insert({
        date_id: dateId.id,
        user_id: userId,
        submission_id: submissionId,
        ...activityUpdates,
      });
    }

    // Update section completeness
    await updateSectionCompleteness(submissionId);

    // Update submission metrics
    await updateSubmissionMetrics(submissionId);
  } catch (error) {
    logger.error(`Error tracking block activity: ${error.message}`, error);
  }
}

/**
 * Track harvester usage
 *
 * @param {string} submissionId - Submission ID
 * @param {string} documentId - Document ID
 * @returns {Promise<void>}
 */
async function trackHarvesterUsage(submissionId, documentId) {
  try {
    // Get today's date ID
    const today = new Date().toISOString().split('T')[0];
    const { data: dateId } = await supabase
      .from('analytics_dimensions_time')
      .select('id')
      .eq('date_actual', today)
      .single();

    if (!dateId || !dateId.id) {
      logger.error(`Failed to find date ID for ${today}`);
      return;
    }

    // Update system usage record
    const { data: existingUsage } = await supabase
      .from('analytics_system_usage')
      .select('id, harvester_calls')
      .eq('date_id', dateId.id)
      .single();

    if (existingUsage) {
      // Update existing usage record
      await supabase
        .from('analytics_system_usage')
        .update({
          harvester_calls: (existingUsage.harvester_calls || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUsage.id);
    } else {
      // Create new usage record
      await supabase.from('analytics_system_usage').insert({
        date_id: dateId.id,
        harvester_calls: 1,
        active_submissions: 1,
      });
    }
  } catch (error) {
    logger.error(`Error tracking harvester usage: ${error.message}`, error);
  }
}

/**
 * Track regulatory events
 *
 * @param {string} submissionId - Submission ID
 * @param {string} eventType - Event type
 * @param {Object} details - Event details
 * @returns {Promise<void>}
 */
async function trackRegulatory(submissionId, eventType, details = {}) {
  try {
    // Get or create regulatory metrics record
    const { data: existingMetrics } = await supabase
      .from('analytics_regulatory_metrics')
      .select('id')
      .eq('submission_id', submissionId)
      .single();

    const updates = {};

    // Set metrics based on event type
    switch (eventType) {
      case 'submission_created':
        updates.submission_date = new Date().toISOString();
        break;
      case 'ack1_received':
        updates.ack1_date = new Date().toISOString();
        // Calculate time to ACK1 if submission date exists
        if (existingMetrics && existingMetrics.submission_date) {
          const submissionTime = new Date(existingMetrics.submission_date).getTime();
          const ack1Time = new Date().getTime();
          updates.time_to_ack1 = Math.floor((ack1Time - submissionTime) / (1000 * 60)); // minutes
        }
        break;
      case 'ack2_received':
        updates.ack2_date = new Date().toISOString();
        if (existingMetrics && existingMetrics.submission_date) {
          const submissionTime = new Date(existingMetrics.submission_date).getTime();
          const ack2Time = new Date().getTime();
          updates.time_to_ack2 = Math.floor((ack2Time - submissionTime) / (1000 * 60)); // minutes
        }
        break;
      case 'ack3_received':
        updates.ack3_date = new Date().toISOString();
        if (existingMetrics && existingMetrics.submission_date) {
          const submissionTime = new Date(existingMetrics.submission_date).getTime();
          const ack3Time = new Date().getTime();
          updates.time_to_ack3 = Math.floor((ack3Time - submissionTime) / (1000 * 60)); // minutes
        }
        break;
      case 'validation_completed':
        updates.validation_date = new Date().toISOString();
        updates.validation_count = (existingMetrics?.validation_count || 0) + 1;
        updates.error_count = details.error_count || 0;
        updates.warning_count = details.warning_count || 0;
        break;
      case 'review_completed':
        updates.review_complete_date = new Date().toISOString();
        updates.reviewer_name = details.reviewer_name;
        updates.review_outcome = details.outcome;
        updates.reviewer_questions = details.questions_count || 0;
        updates.deficiency_count = details.deficiency_count || 0;
        break;
    }

    if (existingMetrics) {
      // Update existing record
      await supabase
        .from('analytics_regulatory_metrics')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMetrics.id);
    } else {
      // Create new record
      await supabase.from('analytics_regulatory_metrics').insert({
        submission_id: submissionId,
        ...updates,
      });
    }

    // Track system usage for ESG submissions
    if (eventType === 'submission_created') {
      // Get today's date ID
      const today = new Date().toISOString().split('T')[0];
      const { data: dateId } = await supabase
        .from('analytics_dimensions_time')
        .select('id')
        .eq('date_actual', today)
        .single();

      if (dateId && dateId.id) {
        // Update system usage count
        const { data: existingUsage } = await supabase
          .from('analytics_system_usage')
          .select('id, esg_submissions')
          .eq('date_id', dateId.id)
          .single();

        if (existingUsage) {
          await supabase
            .from('analytics_system_usage')
            .update({
              esg_submissions: (existingUsage.esg_submissions || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingUsage.id);
        } else {
          await supabase.from('analytics_system_usage').insert({
            date_id: dateId.id,
            esg_submissions: 1,
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Error tracking regulatory event: ${error.message}`, error);
  }
}

/**
 * Track user activity
 *
 * @param {string} userId - User ID
 * @param {string} submissionId - Submission ID
 * @param {string} activityType - Activity type
 * @param {Object} details - Activity details
 * @returns {Promise<void>}
 */
async function trackUserActivity(userId, submissionId, activityType, details = {}) {
  try {
    // Get today's date ID
    const today = new Date().toISOString().split('T')[0];
    const { data: dateId } = await supabase
      .from('analytics_dimensions_time')
      .select('id')
      .eq('date_actual', today)
      .single();

    if (!dateId || !dateId.id) {
      logger.error(`Failed to find date ID for ${today}`);
      return;
    }

    // Prepare updates based on activity type
    const updates = {};

    switch (activityType) {
      case 'login':
        updates.login_count = 1;
        break;
      case 'section_edit':
        updates.sections_edited = 1;
        break;
      case 'comment_add':
        updates.comments_added = 1;
        break;
      case 'comment_resolve':
        updates.comments_resolved = 1;
        break;
      case 'signature_add':
        updates.signatures_added = 1;
        break;
      case 'active_time':
        updates.active_minutes = details.minutes || 1;
        break;
    }

    // Get existing user activity record or create a new one
    const { data: existingActivity } = await supabase
      .from('analytics_user_activity')
      .select('id')
      .eq('date_id', dateId.id)
      .eq('user_id', userId)
      .eq('submission_id', submissionId)
      .single();

    if (existingActivity) {
      // Update existing activity record
      await supabase
        .from('analytics_user_activity')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingActivity.id);
    } else {
      // Create new activity record
      await supabase.from('analytics_user_activity').insert({
        date_id: dateId.id,
        user_id: userId,
        submission_id: submissionId,
        ...updates,
      });
    }

    // Update active users count in system usage
    const { data: existingUsage } = await supabase
      .from('analytics_system_usage')
      .select('id, active_users')
      .eq('date_id', dateId.id)
      .single();

    if (existingUsage) {
      // Check if this is a new user for today
      const { data: uniqueUserCount } = await supabase
        .from('analytics_user_activity')
        .select('user_id')
        .eq('date_id', dateId.id)
        .limit(1000); // Arbitrary limit

      const uniqueUsers = new Set();
      if (uniqueUserCount) {
        uniqueUserCount.forEach(row => uniqueUsers.add(row.user_id));
      }

      await supabase
        .from('analytics_system_usage')
        .update({
          active_users: uniqueUsers.size,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUsage.id);
    } else {
      await supabase.from('analytics_system_usage').insert({
        date_id: dateId.id,
        active_users: 1,
      });
    }
  } catch (error) {
    logger.error(`Error tracking user activity: ${error.message}`, error);
  }
}

/**
 * Update section completeness metrics
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<void>}
 */
async function updateSectionCompleteness(submissionId) {
  try {
    // Get all blocks for this submission
    const { data: blocks } = await supabase
      .from('ind_blocks')
      .select('*')
      .eq('submission_id', submissionId);

    if (!blocks || blocks.length === 0) {
      return;
    }

    // Group blocks by section_code
    const sectionBlocks = {};
    blocks.forEach(block => {
      if (!sectionBlocks[block.section_code]) {
        sectionBlocks[block.section_code] = [];
      }
      sectionBlocks[block.section_code].push(block);
    });

    // Process each section
    for (const [sectionCode, sectionBlocks] of Object.entries(sectionBlocks)) {
      // Calculate metrics
      const wordCount = sectionBlocks
        .filter(b => b.block_type === 'markdown')
        .reduce((total, block) => {
          const content = block.content?.markdown || '';
          return total + (content.match(/\S+/g) || []).length;
        }, 0);

      const tableCount = sectionBlocks.filter(b => b.block_type === 'table').length;
      const figureCount = sectionBlocks.filter(b => b.block_type === 'figure').length;

      // Calculate citation count (approximate)
      const citationCount = sectionBlocks
        .filter(b => b.block_type === 'markdown')
        .reduce((total, block) => {
          const content = block.content?.markdown || '';
          return total + (content.match(/\[\d+\]|\[[A-Za-z]+,\s+\d{4}\]/g) || []).length;
        }, 0);

      // Determine completeness score (simple calculation)
      // A more sophisticated algorithm would consider section requirements
      let completenessScore = 0;
      if (wordCount > 0) completenessScore += 25;
      if (wordCount > 100) completenessScore += 25;
      if (tableCount > 0) completenessScore += 25;
      if (figureCount > 0 || citationCount > 0) completenessScore += 25;

      // Get most recent editor and edit time
      let lastEditedAt = null;
      let lastEditedBy = null;

      if (sectionBlocks.length > 0) {
        const sortedBlocks = [...sectionBlocks].sort(
          (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
        );

        lastEditedAt = sortedBlocks[0].updated_at;
        lastEditedBy = sortedBlocks[0].created_by;
      }

      // Update or create section completeness record
      const { data: existingRecord } = await supabase
        .from('analytics_section_completeness')
        .select('id')
        .eq('submission_id', submissionId)
        .eq('section_code', sectionCode)
        .single();

      if (existingRecord) {
        await supabase
          .from('analytics_section_completeness')
          .update({
            has_content: sectionBlocks.length > 0,
            word_count: wordCount,
            table_count: tableCount,
            figure_count: figureCount,
            citation_count: citationCount,
            completeness_score: completenessScore,
            last_edited_at: lastEditedAt,
            last_edited_by: lastEditedBy,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRecord.id);
      } else {
        await supabase.from('analytics_section_completeness').insert({
          submission_id: submissionId,
          section_code: sectionCode,
          has_content: sectionBlocks.length > 0,
          word_count: wordCount,
          table_count: tableCount,
          figure_count: figureCount,
          citation_count: citationCount,
          completeness_score: completenessScore,
          last_edited_at: lastEditedAt,
          last_edited_by: lastEditedBy,
        });
      }
    }
  } catch (error) {
    logger.error(`Error updating section completeness: ${error.message}`, error);
  }
}

/**
 * Update submission metrics
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<void>}
 */
async function updateSubmissionMetrics(submissionId) {
  try {
    // Get today's date ID
    const today = new Date().toISOString().split('T')[0];
    const { data: dateId } = await supabase
      .from('analytics_dimensions_time')
      .select('id')
      .eq('date_actual', today)
      .single();

    if (!dateId || !dateId.id) {
      logger.error(`Failed to find date ID for ${today}`);
      return;
    }

    // Get all blocks for this submission
    const { data: blocks } = await supabase
      .from('ind_blocks')
      .select('*')
      .eq('submission_id', submissionId);

    // Get section completeness records
    const { data: sectionCompleteness } = await supabase
      .from('analytics_section_completeness')
      .select('*')
      .eq('submission_id', submissionId);

    // Get comments count
    const { data: comments, error: commentsError } = await supabase
      .from('ind_comments')
      .select('id, resolved')
      .eq('submission_id', submissionId);

    if (commentsError) {
      logger.warn(`Error fetching comments: ${commentsError.message}`);
    }

    // Calculate metrics
    const sectionsCount = new Set(blocks.map(b => b.section_code)).size;
    const blocksCount = blocks.length;

    // Approximate page count (more accurate calculation would come from PDF generator)
    const pagesCount = Math.ceil(blocks.length / 3);

    const tablesCount = blocks.filter(b => b.block_type === 'table').length;
    const figuresCount = blocks.filter(b => b.block_type === 'figure').length;

    const referencesCount = blocks
      .filter(b => b.block_type === 'markdown')
      .reduce((total, block) => {
        const content = block.content?.markdown || '';
        return total + (content.match(/\[\d+\]|\[[A-Za-z]+,\s+\d{4}\]/g) || []).length;
      }, 0);

    const commentsCount = comments?.length || 0;
    const resolvedCommentsCount = comments?.filter(c => c.resolved)?.length || 0;

    // Calculate overall completion percentage
    let totalScore = 0;
    let possibleScore = 0;

    if (sectionCompleteness && sectionCompleteness.length > 0) {
      sectionCompleteness.forEach(section => {
        totalScore += section.completeness_score;
        possibleScore += 100; // Max score per section
      });
    }

    const completionPercentage = possibleScore > 0 ? (totalScore / possibleScore) * 100 : 0;

    // Get active editors
    const { data: activeEditors } = await supabase
      .from('analytics_user_activity')
      .select('user_id')
      .eq('date_id', dateId.id)
      .eq('submission_id', submissionId);

    const activeEditorsCount = activeEditors ? new Set(activeEditors.map(a => a.user_id)).size : 0;

    // Update or create metrics record
    const { data: existingMetrics } = await supabase
      .from('analytics_submission_metrics_daily')
      .select('id')
      .eq('date_id', dateId.id)
      .eq('submission_id', submissionId)
      .single();

    if (existingMetrics) {
      await supabase
        .from('analytics_submission_metrics_daily')
        .update({
          sections_count: sectionsCount,
          blocks_count: blocksCount,
          pages_count: pagesCount,
          tables_count: tablesCount,
          figures_count: figuresCount,
          references_count: referencesCount,
          comments_count: commentsCount,
          resolved_comments_count: resolvedCommentsCount,
          completion_percentage: completionPercentage,
          active_editors_count: activeEditorsCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMetrics.id);
    } else {
      await supabase.from('analytics_submission_metrics_daily').insert({
        date_id: dateId.id,
        submission_id: submissionId,
        sections_count: sectionsCount,
        blocks_count: blocksCount,
        pages_count: pagesCount,
        tables_count: tablesCount,
        figures_count: figuresCount,
        references_count: referencesCount,
        comments_count: commentsCount,
        resolved_comments_count: resolvedCommentsCount,
        completion_percentage: completionPercentage,
        active_editors_count: activeEditorsCount,
      });
    }

    // Ensure submission is in the dimension table
    const { data: submissionData } = await supabase
      .from('ind_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (submissionData) {
      await supabase
        .from('analytics_dimensions_submission')
        .insert({
          id: submissionData.id,
          submission_type: submissionData.submission_type || 'original',
          sponsor_name: submissionData.sponsor_name || 'Unknown',
          ind_number: submissionData.ind_number,
          target_authority: submissionData.target_authority || 'FDA',
          first_created_at: submissionData.created_at,
          last_updated_at: submissionData.updated_at,
        })
        .on_conflict('id')
        .merge();
    }
  } catch (error) {
    logger.error(`Error updating submission metrics: ${error.message}`, error);
  }
}

/**
 * Get submission analytics
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<Object>} - Submission analytics
 */
export async function getSubmissionAnalytics(submissionId) {
  try {
    // Get submission metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('analytics_submission_metrics_daily')
      .select('*')
      .eq('submission_id', submissionId)
      .order('date_id', { ascending: false })
      .limit(30);

    if (metricsError) {
      throw new Error(`Error fetching metrics: ${metricsError.message}`);
    }

    // Get section completeness
    const { data: sectionCompleteness, error: sectionError } = await supabase
      .from('analytics_section_completeness')
      .select('*')
      .eq('submission_id', submissionId);

    if (sectionError) {
      throw new Error(`Error fetching section completeness: ${sectionError.message}`);
    }

    // Get regulatory metrics
    const { data: regulatoryMetrics, error: regulatoryError } = await supabase
      .from('analytics_regulatory_metrics')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (regulatoryError && regulatoryError.code !== 'PGRST116') {
      // Not found
      throw new Error(`Error fetching regulatory metrics: ${regulatoryError.message}`);
    }

    // Get user activity
    const { data: userActivity, error: userError } = await supabase
      .from('analytics_user_activity')
      .select('*')
      .eq('submission_id', submissionId)
      .order('date_id', { ascending: false })
      .limit(100);

    if (userError) {
      throw new Error(`Error fetching user activity: ${userError.message}`);
    }

    // Calculate recent progress
    let progressData = {};

    if (metrics && metrics.length >= 2) {
      const latest = metrics[0];
      const previous = metrics[metrics.length - 1];

      progressData = {
        blocks_delta: latest.blocks_count - previous.blocks_count,
        sections_delta: latest.sections_count - previous.sections_count,
        completion_delta: latest.completion_percentage - previous.completion_percentage,
        days_tracked: metrics.length,
      };
    }

    return {
      metrics: metrics || [],
      section_completeness: sectionCompleteness || [],
      regulatory: regulatoryMetrics || {},
      user_activity: userActivity || [],
      progress: progressData,
      completion_percentage: metrics && metrics.length > 0 ? metrics[0].completion_percentage : 0,
    };
  } catch (error) {
    logger.error(`Error getting submission analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get user analytics
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - User analytics
 */
export async function getUserAnalytics(userId) {
  try {
    // Get user activity
    const { data: activity, error: activityError } = await supabase
      .from('analytics_user_activity')
      .select('*')
      .eq('user_id', userId)
      .order('date_id', { ascending: false })
      .limit(90); // Last 90 days

    if (activityError) {
      throw new Error(`Error fetching user activity: ${activityError.message}`);
    }

    // Group by submission
    const submissionActivity = {};
    if (activity) {
      activity.forEach(item => {
        if (!submissionActivity[item.submission_id]) {
          submissionActivity[item.submission_id] = [];
        }
        submissionActivity[item.submission_id].push(item);
      });
    }

    // Get submissions user has worked on
    const submissionIds = Object.keys(submissionActivity);
    let submissions = [];

    if (submissionIds.length > 0) {
      const { data: submissionData } = await supabase
        .from('ind_submissions')
        .select('id, title, sponsor_name, ind_number, submission_status')
        .in('id', submissionIds)
        .limit(20);

      submissions = submissionData || [];
    }

    // Calculate productivity metrics
    const productivityByDay = {};
    if (activity) {
      activity.forEach(item => {
        const dateId = item.date_id;
        if (!productivityByDay[dateId]) {
          productivityByDay[dateId] = {
            date_id: dateId,
            blocks_created: 0,
            blocks_edited: 0,
            comments_added: 0,
            comments_resolved: 0,
            signatures_added: 0,
            sections_edited: 0,
          };
        }

        productivityByDay[dateId].blocks_created += item.blocks_created || 0;
        productivityByDay[dateId].blocks_edited += item.blocks_edited || 0;
        productivityByDay[dateId].comments_added += item.comments_added || 0;
        productivityByDay[dateId].comments_resolved += item.comments_resolved || 0;
        productivityByDay[dateId].signatures_added += item.signatures_added || 0;
        productivityByDay[dateId].sections_edited += item.sections_edited || 0;
      });
    }

    // Get date labels for the productivity chart
    const dateLabels = [];
    if (activity && activity.length > 0) {
      const dateIds = [...new Set(activity.map(a => a.date_id))].sort();

      if (dateIds.length > 0) {
        const { data: dates } = await supabase
          .from('analytics_dimensions_time')
          .select('id, date_actual')
          .in('id', dateIds)
          .order('date_actual');

        if (dates) {
          // Create a mapping of date_id to date_actual
          const dateMap = {};
          dates.forEach(d => {
            dateMap[d.id] = d.date_actual;
          });

          // Sort productivity by date
          const sortedProductivity = Object.values(productivityByDay)
            .map(p => ({
              ...p,
              date: dateMap[p.date_id],
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          return {
            activity: activity || [],
            submissions,
            productivity: sortedProductivity,
            submission_count: submissions.length,
            total_blocks_created: activity
              ? activity.reduce((sum, a) => sum + (a.blocks_created || 0), 0)
              : 0,
            total_blocks_edited: activity
              ? activity.reduce((sum, a) => sum + (a.blocks_edited || 0), 0)
              : 0,
            total_comments: activity
              ? activity.reduce((sum, a) => sum + (a.comments_added || 0), 0)
              : 0,
            active_days: new Set(activity ? activity.map(a => a.date_id) : []).size,
          };
        }
      }
    }

    return {
      activity: activity || [],
      submissions,
      productivity: Object.values(productivityByDay),
      submission_count: submissions.length,
      total_blocks_created: activity
        ? activity.reduce((sum, a) => sum + (a.blocks_created || 0), 0)
        : 0,
      total_blocks_edited: activity
        ? activity.reduce((sum, a) => sum + (a.blocks_edited || 0), 0)
        : 0,
      total_comments: activity ? activity.reduce((sum, a) => sum + (a.comments_added || 0), 0) : 0,
      active_days: new Set(activity ? activity.map(a => a.date_id) : []).size,
    };
  } catch (error) {
    logger.error(`Error getting user analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get system analytics
 *
 * @param {number} days - Number of days to include
 * @returns {Promise<Object>} - System analytics
 */
export async function getSystemAnalytics(days = 30) {
  try {
    // Get system usage data
    const { data: usage, error: usageError } = await supabase
      .from('analytics_system_usage')
      .select('*, analytics_dimensions_time!inner(date_actual)')
      .order('date_id', { ascending: false })
      .limit(days);

    if (usageError) {
      throw new Error(`Error fetching system usage: ${usageError.message}`);
    }

    // Get submissions created in this period
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: submissions, error: submissionsError } = await supabase
      .from('ind_submissions')
      .select('id, created_at, submission_status')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (submissionsError) {
      throw new Error(`Error fetching submissions: ${submissionsError.message}`);
    }

    // Get regulatory metrics for the period
    const { data: regulatory, error: regulatoryError } = await supabase
      .from('analytics_regulatory_metrics')
      .select('*')
      .gte('updated_at', startDate.toISOString())
      .order('updated_at', { ascending: false });

    if (regulatoryError) {
      throw new Error(`Error fetching regulatory metrics: ${regulatoryError.message}`);
    }

    // Format usage data for charts
    const usageData = usage
      ? usage
          .map(u => ({
            date: u.analytics_dimensions_time.date_actual,
            active_users: u.active_users || 0,
            active_submissions: u.active_submissions || 0,
            new_submissions: u.new_submissions || 0,
            harvester_calls: u.harvester_calls || 0,
            ai_copilot_calls: u.ai_copilot_calls || 0,
            pdf_generations: u.pdf_generations || 0,
            esg_submissions: u.esg_submissions || 0,
          }))
          .reverse()
      : []; // Reverse to get chronological order

    // Summary metrics
    const totalActiveUsers = usageData.reduce((max, u) => Math.max(max, u.active_users || 0), 0);
    const totalSubmissions = submissions ? submissions.length : 0;
    const completedSubmissions = submissions
      ? submissions.filter(
          s => s.submission_status === 'submitted' || s.submission_status === 'approved'
        ).length
      : 0;
    const totalEsgSubmissions = usageData.reduce((sum, u) => sum + (u.esg_submissions || 0), 0);

    // Average acknowledgment times
    let avgAck1Time = 0;
    let avgAck3Time = 0;
    let ack1Count = 0;
    let ack3Count = 0;

    if (regulatory) {
      regulatory.forEach(r => {
        if (r.time_to_ack1) {
          avgAck1Time += r.time_to_ack1;
          ack1Count++;
        }
        if (r.time_to_ack3) {
          avgAck3Time += r.time_to_ack3;
          ack3Count++;
        }
      });
    }

    if (ack1Count > 0) avgAck1Time = Math.round(avgAck1Time / ack1Count);
    if (ack3Count > 0) avgAck3Time = Math.round(avgAck3Time / ack3Count);

    return {
      usage: usageData,
      summary: {
        total_active_users: totalActiveUsers,
        total_submissions: totalSubmissions,
        completed_submissions: completedSubmissions,
        total_esg_submissions: totalEsgSubmissions,
        avg_ack1_time: avgAck1Time,
        avg_ack3_time: avgAck3Time,
        period_days: days,
      },
      submissions: submissions || [],
      regulatory: regulatory || [],
    };
  } catch (error) {
    logger.error(`Error getting system analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Initialize analytics service
 */
export function initAnalytics() {
  // Initialize event listeners
  initEventListeners();

  // Schedule regular metrics updates
  scheduleMetricsUpdates();

  logger.info('Analytics service initialized');
}

/**
 * Schedule regular metrics updates
 */
function scheduleMetricsUpdates() {
  // This would ideally use a proper scheduler like node-cron
  // For now, just set up an interval

  // Daily refresh at midnight
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

  const msUntilMidnight = midnight.getTime() - now.getTime();

  // Set timeout for first run at midnight
  setTimeout(() => {
    refreshDailyMetrics();

    // Then set interval for every 24 hours
    setInterval(refreshDailyMetrics, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  logger.info(`Scheduled daily metrics refresh for ${midnight.toISOString()}`);
}

/**
 * Refresh daily metrics
 */
async function refreshDailyMetrics() {
  try {
    logger.info('Starting daily metrics refresh');

    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Run the refresh_analytics_dimensions_submission function
    await supabase.rpc('refresh_analytics_dimensions_submission');

    // Run the refresh_analytics_submission_metrics_daily function
    await supabase.rpc('refresh_analytics_submission_metrics_daily', { p_date: yesterdayStr });

    logger.info('Daily metrics refresh completed');
  } catch (error) {
    logger.error(`Error in daily metrics refresh: ${error.message}`, error);
  }
}

/**
 * Save dashboard preference
 *
 * @param {string} userId - User ID
 * @param {Object} dashboard - Dashboard configuration
 * @returns {Promise<Object>} - Saved dashboard
 */
export async function saveDashboardPreference(userId, dashboard) {
  try {
    const { data, error } = await supabase
      .from('analytics_dashboard_preferences')
      .upsert(
        {
          user_id: userId,
          dashboard_type: dashboard.type,
          dashboard_name: dashboard.name,
          widgets: dashboard.widgets,
          layout: dashboard.layout,
          theme: dashboard.theme,
          is_default: dashboard.is_default || false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id, dashboard_name',
        }
      )
      .select('*')
      .single();

    if (error) {
      throw new Error(`Error saving dashboard: ${error.message}`);
    }

    // If marked as default, unmark other dashboards
    if (dashboard.is_default) {
      await supabase
        .from('analytics_dashboard_preferences')
        .update({ is_default: false })
        .eq('user_id', userId)
        .neq('id', data.id);
    }

    return data;
  } catch (error) {
    logger.error(`Error saving dashboard preference: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get dashboard preferences
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Dashboard preferences
 */
export async function getDashboardPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('analytics_dashboard_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Error fetching dashboards: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    logger.error(`Error getting dashboard preferences: ${error.message}`, error);
    throw error;
  }
}

export default {
  initAnalytics,
  getSubmissionAnalytics,
  getUserAnalytics,
  getSystemAnalytics,
  saveDashboardPreference,
  getDashboardPreferences,
  trackBlockActivity,
  trackUserActivity,
  trackRegulatory,
  trackHarvesterUsage,
};
