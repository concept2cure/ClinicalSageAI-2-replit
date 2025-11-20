/**
 * TrialSage Advanced Analytics Service
 *
 * This service provides enterprise-grade analytics capabilities:
 * - Hypercube dimensional data access
 * - Real-time event processing
 * - Machine learning predictions
 * - Regulatory intelligence insights
 * - Secure multi-tenant analytics
 * - Advanced visualization data preparation
 */

import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { default as fetch } from 'node-fetch';
import { logger } from '../utils/logger.js';
import { createObjectCsvWriter } from 'csv-writer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parse } from 'node-html-parser';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Event processing stream
const eventStream = new EventEmitter();

// Cache for dimension data
const dimensionCache = {
  time: new Map(),
  authority: new Map(),
  submissionType: new Map(),
  therapeuticArea: new Map(),
  status: new Map(),
  section: new Map(),
  lastRefresh: Date.now(),
};

// Machine learning models (to be loaded as needed)
const models = {
  submissionSuccess: null,
  reviewTimeline: null,
  contentQuality: null,
  anomalyDetection: null,
};

// Constants
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const BATCH_SIZE = 100;
const MAX_EMBEDDING_BATCH = 20;
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Initialize the advanced analytics service
 */
export async function initAdvancedAnalytics() {
  try {
    logger.info('Initializing Advanced Analytics Service');

    // Start event listeners
    setupEventListeners();

    // Load dimension caches
    await refreshDimensionCaches();

    // Initialize ML models
    await initializeMachineLearningModels();

    // Set up scheduled tasks
    setupScheduledTasks();

    logger.info('Advanced Analytics Service initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Error initializing Advanced Analytics Service: ${error.message}`, error);
    throw error;
  }
}

/**
 * Set up event listeners for real-time analytics
 */
function setupEventListeners() {
  // Listen for data-changing events
  eventStream.on('submission-created', handleSubmissionCreated);
  eventStream.on('submission-updated', handleSubmissionUpdated);
  eventStream.on('section-updated', handleSectionUpdated);
  eventStream.on('document-quality', handleDocumentQuality);
  eventStream.on('user-activity', handleUserActivity);
  eventStream.on('regulatory-event', handleRegulatoryEvent);

  logger.info('Analytics event listeners initialized');
}

/**
 * Initialize machine learning models
 */
async function initializeMachineLearningModels() {
  try {
    // In a production environment, these would be actual ML models
    // For this implementation, we'll use simple heuristics and OpenAI integration

    models.submissionSuccess = {
      predict: predictSubmissionSuccess,
    };

    models.reviewTimeline = {
      predict: predictReviewTimeline,
    };

    models.contentQuality = {
      analyze: analyzeContentQuality,
    };

    models.anomalyDetection = {
      detect: detectAnomalies,
    };

    logger.info('Machine learning models initialized');
  } catch (error) {
    logger.error(`Error initializing ML models: ${error.message}`, error);
    throw error;
  }
}

/**
 * Set up scheduled tasks
 */
function setupScheduledTasks() {
  // Refresh dimension caches periodically
  setInterval(refreshDimensionCaches, CACHE_TTL);

  // Process analytics event queue
  setInterval(processAnalyticsEventQueue, 60000); // every minute

  // Refresh materialized views
  setInterval(refreshMaterializedViews, 60 * 60 * 1000); // hourly

  // Update regulatory intelligence
  setInterval(updateRegulatoryIntelligence, 6 * 60 * 60 * 1000); // every 6 hours

  logger.info('Scheduled analytics tasks initialized');
}

/**
 * Refresh dimension caches from the database
 */
async function refreshDimensionCaches() {
  try {
    // Fetch time dimension
    const { data: timeDim } = await supabase
      .from('analytics.dim_time')
      .select('time_id, date_value, month_name, year_value')
      .order('date_value', { ascending: false })
      .limit(730); // Approx. 2 years

    if (timeDim) {
      dimensionCache.time.clear();
      timeDim.forEach(t => dimensionCache.time.set(t.date_value, t));
    }

    // Fetch authority dimension
    const { data: authorityDim } = await supabase
      .from('analytics.dim_regulatory_authority')
      .select('authority_id, authority_code, authority_name')
      .eq('is_current', true);

    if (authorityDim) {
      dimensionCache.authority.clear();
      authorityDim.forEach(a => {
        dimensionCache.authority.set(a.authority_code, a);
        dimensionCache.authority.set(a.authority_id, a);
      });
    }

    // Fetch submission type dimension
    const { data: submissionTypeDim } = await supabase
      .from('analytics.dim_submission_type')
      .select('submission_type_id, submission_class, submission_subclass')
      .eq('is_current', true);

    if (submissionTypeDim) {
      dimensionCache.submissionType.clear();
      submissionTypeDim.forEach(s => {
        const key = `${s.submission_class}-${s.submission_subclass || ''}`;
        dimensionCache.submissionType.set(key, s);
        dimensionCache.submissionType.set(s.submission_type_id, s);
      });
    }

    // Fetch therapeutic area dimension
    const { data: therapeuticAreaDim } = await supabase
      .from('analytics.dim_therapeutic_area')
      .select('therapeutic_area_id, soc_name, meddra_soc_code')
      .eq('is_current', true);

    if (therapeuticAreaDim) {
      dimensionCache.therapeuticArea.clear();
      therapeuticAreaDim.forEach(t => {
        dimensionCache.therapeuticArea.set(t.soc_name, t);
        dimensionCache.therapeuticArea.set(t.meddra_soc_code, t);
        dimensionCache.therapeuticArea.set(t.therapeutic_area_id, t);
      });
    }

    // Fetch status dimension
    const { data: statusDim } = await supabase
      .from('analytics.dim_status')
      .select('status_id, status_code, status_name')
      .eq('is_current', true);

    if (statusDim) {
      dimensionCache.status.clear();
      statusDim.forEach(s => {
        dimensionCache.status.set(s.status_code, s);
        dimensionCache.status.set(s.status_name, s);
        dimensionCache.status.set(s.status_id, s);
      });
    }

    // Fetch section dimension
    const { data: sectionDim } = await supabase
      .from('analytics.dim_document_section')
      .select('section_id, section_code, section_title, module_number')
      .eq('is_current', true);

    if (sectionDim) {
      dimensionCache.section.clear();
      sectionDim.forEach(s => {
        dimensionCache.section.set(s.section_code, s);
        dimensionCache.section.set(s.section_id, s);
      });
    }

    dimensionCache.lastRefresh = Date.now();
    logger.info('Dimension caches refreshed successfully');
  } catch (error) {
    logger.error(`Error refreshing dimension caches: ${error.message}`, error);
  }
}

/**
 * Process analytics event queue
 */
async function processAnalyticsEventQueue() {
  try {
    const { data: result } = await supabase.rpc('analytics.process_event_stream');

    if (result && result > 0) {
      logger.info(`Processed ${result} analytics events`);
    }
  } catch (error) {
    logger.error(`Error processing analytics event queue: ${error.message}`, error);
  }
}

/**
 * Refresh materialized views
 */
async function refreshMaterializedViews() {
  try {
    await supabase.rpc('analytics.refresh_materialized_views');
    logger.info('Materialized views refreshed successfully');
  } catch (error) {
    logger.error(`Error refreshing materialized views: ${error.message}`, error);
  }
}

/**
 * Update regulatory intelligence
 */
async function updateRegulatoryIntelligence() {
  try {
    // In production, this would connect to regulatory agency APIs
    // For this implementation, we'll implement a simulated update

    // Track new documents
    let newDocuments = 0;

    // Fetch FDA updates
    const fdaUpdates = await fetchFDAUpdates();
    if (fdaUpdates && fdaUpdates.length > 0) {
      for (const update of fdaUpdates) {
        // Generate embedding for the content
        const embedding = await generateEmbedding(update.title + ' ' + update.summary);

        // Find relevant therapeutic areas and document types
        const taMatches = await findTherapeuticAreaMatches(update.title + ' ' + update.summary);
        const docTypeMatches = await findDocumentTypeMatches(update.title);

        // Store in the database
        const { data, error } = await supabase
          .from('analytics.fact_regulatory_intelligence')
          .insert({
            authority_id: dimensionCache.authority.get('FDA').authority_id,
            therapeutic_area_id: taMatches.length > 0 ? taMatches[0].id : null,
            document_type_id: docTypeMatches.length > 0 ? docTypeMatches[0].id : null,
            publication_date_id: getDimensionId('time', update.date),
            title: update.title,
            summary: update.summary,
            source_url: update.url,
            source_type: update.type,
            impact_level: update.impact || 3,
            relevance_score: 0.85, // Default
            affected_sections: update.affectedSections || null,
            embedding: embedding,
          });

        if (error) {
          logger.error(`Error storing regulatory intelligence: ${error.message}`);
        } else {
          newDocuments++;
        }
      }
    }

    logger.info(`Updated regulatory intelligence with ${newDocuments} new documents`);
  } catch (error) {
    logger.error(`Error updating regulatory intelligence: ${error.message}`, error);
  }
}

/**
 * Fetch FDA updates from the FDA website
 */
async function fetchFDAUpdates() {
  try {
    // In production, this would use actual FDA API
    // For this implementation, return simulated data

    return [
      {
        title: 'Guidance for Industry: Electronic Submissions Gateway',
        summary:
          'Updated requirements for electronic submissions to the FDA through the Electronic Submissions Gateway (ESG).',
        date: new Date().toISOString().split('T')[0],
        url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/electronic-submissions-gateway',
        type: 'Guidance',
        impact: 4,
        affectedSections: ['1.2', '1.3'],
      },
    ];
  } catch (error) {
    logger.error(`Error fetching FDA updates: ${error.message}`, error);
    return [];
  }
}

/**
 * Find matching therapeutic areas for a given text
 */
async function findTherapeuticAreaMatches(text) {
  // In production, this would use NLP/ML to match text to therapeutic areas
  // For this implementation, use a simple keyword match

  const matches = [];
  for (const [key, value] of dimensionCache.therapeuticArea.entries()) {
    if (
      typeof key === 'string' &&
      key !== value.therapeutic_area_id.toString() &&
      key !== value.meddra_soc_code &&
      text.toLowerCase().includes(key.toLowerCase())
    ) {
      matches.push({
        id: value.therapeutic_area_id,
        name: value.soc_name,
        score: 0.9,
      });
      break;
    }
  }

  return matches;
}

/**
 * Find matching document types for a given text
 */
async function findDocumentTypeMatches(text) {
  // In production, this would match to actual document types
  // For this implementation, use simplified logic

  const typeMapping = {
    guidance: 1,
    guideline: 1,
    recommendation: 2,
    protocol: 3,
    submission: 4,
    application: 4,
  };

  const matches = [];
  const lowerText = text.toLowerCase();

  for (const [keyword, typeId] of Object.entries(typeMapping)) {
    if (lowerText.includes(keyword)) {
      matches.push({
        id: typeId,
        name: keyword,
        score: 0.9,
      });
      break;
    }
  }

  return matches;
}

/**
 * Generate embedding for text using OpenAI API
 */
async function generateEmbedding(text) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.substring(0, 8000), // Limit to model's token capacity
      encoding_format: 'float',
    });

    return embeddingResponse.data[0].embedding;
  } catch (error) {
    logger.error(`Error generating embedding: ${error.message}`, error);
    return new Array(EMBEDDING_DIMENSIONS).fill(0); // Fallback
  }
}

/**
 * Get dimension ID from the cache
 *
 * @param {string} dimension - Dimension name (time, authority, etc.)
 * @param {any} value - Value to look up
 * @returns {number|null} - Dimension ID
 */
function getDimensionId(dimension, value) {
  const cache = dimensionCache[dimension];

  if (!cache || !cache.has(value)) {
    return null;
  }

  const entry = cache.get(value);

  // Return appropriate ID based on dimension
  switch (dimension) {
    case 'time':
      return entry.time_id;
    case 'authority':
      return entry.authority_id;
    case 'submissionType':
      return entry.submission_type_id;
    case 'therapeuticArea':
      return entry.therapeutic_area_id;
    case 'status':
      return entry.status_id;
    case 'section':
      return entry.section_id;
    default:
      return null;
  }
}

/**
 * Get dimension entry by ID
 *
 * @param {string} dimension - Dimension name
 * @param {number} id - Dimension ID
 * @returns {object|null} - Dimension entry
 */
function getDimensionById(dimension, id) {
  const cache = dimensionCache[dimension];

  if (!cache || !cache.has(id)) {
    return null;
  }

  return cache.get(id);
}

/**
 * Handle submission created event
 * @param {object} event - Event data
 */
async function handleSubmissionCreated(event) {
  try {
    // Extract relevant data
    const { submissionId, userId, metadata } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // Insert into analytics.fact_submission
    const { data, error } = await supabase.from('analytics.fact_submission').insert({
      submission_id: submissionId,
      submission_name: metadata.title || 'Untitled Submission',
      submission_type_id: getDimensionId('submissionType', metadata.submissionType),
      sponsor_id: metadata.sponsorId,
      product_id: metadata.productId,
      authority_id: getDimensionId('authority', metadata.authority),
      status_id: getDimensionId('status', 'NOT_STARTED'),
      therapeutic_area_id: getDimensionId('therapeuticArea', metadata.therapeuticArea),
      created_date_id: dateId,
      created_by_user_id: userId,
      total_sections: 0,
      complete_sections: 0,
    });

    if (error) {
      throw new Error(`Error inserting submission: ${error.message}`);
    }

    // Log event to stream
    await supabase.from('analytics.event_stream').insert({
      event_type: 'SUBMISSION_CREATED',
      user_id: userId,
      submission_id: submissionId,
      event_data: metadata,
    });

    logger.info(`Analytics: Tracked submission creation for ${submissionId}`);
  } catch (error) {
    logger.error(`Error handling submission created event: ${error.message}`, error);
  }
}

/**
 * Handle submission updated event
 * @param {object} event - Event data
 */
async function handleSubmissionUpdated(event) {
  try {
    // Extract relevant data
    const { submissionId, userId, metadata, newStatus } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // Get current status
    const { data: currentSubmission } = await supabase
      .from('analytics.fact_submission')
      .select('status_id')
      .eq('submission_id', submissionId)
      .single();

    const updateData = {
      last_updated_date_id: dateId,
    };

    // If status changed
    if (newStatus && currentSubmission) {
      const newStatusId = getDimensionId('status', newStatus);

      if (newStatusId) {
        updateData.status_id = newStatusId;

        // If submitted, update submitted date
        if (newStatus === 'SUBMITTED') {
          updateData.submitted_date_id = dateId;
          updateData.submitted_by_user_id = userId;
          updateData.actual_submission_date = new Date().toISOString().split('T')[0];
        }

        // If approved, update approved date
        if (newStatus === 'APPROVED') {
          updateData.approved_date_id = dateId;
        }
      }
    }

    // Update sections counts if provided
    if (metadata.totalSections !== undefined) {
      updateData.total_sections = metadata.totalSections;
    }

    if (metadata.completeSections !== undefined) {
      updateData.complete_sections = metadata.completeSections;
    }

    // Update submission
    const { error } = await supabase
      .from('analytics.fact_submission')
      .update(updateData)
      .eq('submission_id', submissionId);

    if (error) {
      throw new Error(`Error updating submission: ${error.message}`);
    }

    // Log event to stream
    await supabase.from('analytics.event_stream').insert({
      event_type: 'SUBMISSION_STATUS_CHANGE',
      user_id: userId,
      submission_id: submissionId,
      status_id: updateData.status_id,
      event_data: {
        status_before: currentSubmission?.status_id,
        status_after: updateData.status_id,
        ...metadata,
      },
    });

    logger.info(`Analytics: Tracked submission update for ${submissionId}`);
  } catch (error) {
    logger.error(`Error handling submission updated event: ${error.message}`, error);
  }
}

/**
 * Handle section updated event
 * @param {object} event - Event data
 */
async function handleSectionUpdated(event) {
  try {
    // Extract relevant data
    const { submissionId, sectionCode, userId, metadata, newStatus } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // Get section dimension ID
    const sectionId = getDimensionId('section', sectionCode);

    if (!sectionId) {
      throw new Error(`Unable to find section dimension ID for ${sectionCode}`);
    }

    // Get status dimension ID
    let statusId = null;
    if (newStatus) {
      statusId = getDimensionId('status', newStatus);

      if (!statusId) {
        throw new Error(`Unable to find status dimension ID for ${newStatus}`);
      }
    }

    // Log event to stream
    await supabase.from('analytics.event_stream').insert({
      event_type: 'SECTION_CONTENT_UPDATE',
      user_id: userId,
      submission_id: submissionId,
      section_id: sectionId,
      status_id: statusId,
      event_data: {
        author_id: userId,
        reviewer_id: metadata.reviewerId,
        word_count: metadata.wordCount,
        page_count: metadata.pageCount,
        table_count: metadata.tableCount,
        figure_count: metadata.figureCount,
        citation_count: metadata.citationCount,
        comment_count: metadata.commentCount,
      },
    });

    logger.info(`Analytics: Tracked section update for ${submissionId} - ${sectionCode}`);
  } catch (error) {
    logger.error(`Error handling section updated event: ${error.message}`, error);
  }
}

/**
 * Handle document quality event
 * @param {object} event - Event data
 */
async function handleDocumentQuality(event) {
  try {
    // Extract relevant data
    const { submissionId, sectionCode, metrics } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // Get section dimension ID
    const sectionId = getDimensionId('section', sectionCode);

    if (!sectionId) {
      throw new Error(`Unable to find section dimension ID for ${sectionCode}`);
    }

    // Insert quality metrics
    const { error } = await supabase.from('analytics.fact_document_quality').insert({
      submission_id: submissionId,
      section_id: sectionId,
      measure_date_id: dateId,
      spelling_error_count: metrics.spellingErrors || 0,
      grammar_error_count: metrics.grammarErrors || 0,
      style_issue_count: metrics.styleIssues || 0,
      broken_reference_count: metrics.brokenReferences || 0,
      missing_citation_count: metrics.missingCitations || 0,
      missing_table_count: metrics.missingTables || 0,
      missing_figure_count: metrics.missingFigures || 0,
      readability_score: metrics.readabilityScore,
      regulatory_compliance_score: metrics.complianceScore,
      overall_quality_score: metrics.overallScore,
    });

    if (error) {
      throw new Error(`Error inserting document quality: ${error.message}`);
    }

    logger.info(`Analytics: Tracked document quality for ${submissionId} - ${sectionCode}`);
  } catch (error) {
    logger.error(`Error handling document quality event: ${error.message}`, error);
  }
}

/**
 * Handle user activity event
 * @param {object} event - Event data
 */
async function handleUserActivity(event) {
  try {
    // Extract relevant data
    const { userId, submissionId, sectionCode, activityType, details } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // Get section dimension ID if provided
    let sectionId = null;
    if (sectionCode) {
      sectionId = getDimensionId('section', sectionCode);

      if (!sectionId) {
        logger.warn(`Unable to find section dimension ID for ${sectionCode}`);
      }
    }

    // Insert user activity
    const { error } = await supabase.from('analytics.fact_user_activity').insert({
      user_id: userId,
      submission_id: submissionId,
      section_id: sectionId,
      activity_date_id: dateId,
      activity_type: activityType,
      activity_details: details,
      session_id: details.sessionId,
      ip_address: details.ipAddress,
      browser_info: details.browserInfo,
      duration_seconds: details.duration || 0,
      items_affected: details.itemsAffected || 1,
      is_mobile: details.isMobile || false,
    });

    if (error) {
      throw new Error(`Error inserting user activity: ${error.message}`);
    }

    // Log event to stream
    await supabase.from('analytics.event_stream').insert({
      event_type: `USER_${activityType.toUpperCase()}`,
      user_id: userId,
      submission_id: submissionId,
      section_id: sectionId,
      event_data: details,
    });

    logger.info(`Analytics: Tracked user activity ${activityType} for user ${userId}`);
  } catch (error) {
    logger.error(`Error handling user activity event: ${error.message}`, error);
  }
}

/**
 * Handle regulatory event
 * @param {object} event - Event data
 */
async function handleRegulatoryEvent(event) {
  try {
    // Extract relevant data
    const { submissionId, eventType, details } = event;

    // Get date dimension ID
    const today = new Date().toISOString().split('T')[0];
    const dateId = getDimensionId('time', today);

    if (!dateId) {
      throw new Error('Unable to find date dimension ID');
    }

    // For ESG transactions
    if (eventType.startsWith('ESG_')) {
      // Find existing transaction
      const { data: existingTransaction } = await supabase
        .from('analytics.fact_esg_transaction')
        .select('transaction_id')
        .eq('submission_id', submissionId)
        .eq('esg_tracking_number', details.trackingNumber)
        .maybeSingle();

      const updateData = {};

      // Set appropriate fields based on event type
      if (eventType === 'ESG_SUBMISSION') {
        updateData.submission_date_id = dateId;
        updateData.status = 'SUBMITTED';
        updateData.submission_format = details.format;
        updateData.submission_size_mb = details.sizeInMb;
        updateData.is_test_submission = details.isTest || false;
        updateData.validation_errors_count = details.validationErrors || 0;
        updateData.validation_warnings_count = details.validationWarnings || 0;
        updateData.transaction_status = 'PENDING';
        updateData.environment = details.environment || 'Production';
      } else if (eventType === 'ESG_ACK1') {
        updateData.ack1_date_id = dateId;
        updateData.status = 'ACK1';
        updateData.time_to_ack1_minutes = details.timeToAck1Minutes;
        updateData.transaction_status = 'IN_PROGRESS';
      } else if (eventType === 'ESG_ACK2') {
        updateData.ack2_date_id = dateId;
        updateData.status = 'ACK2';
        updateData.time_to_ack2_minutes = details.timeToAck2Minutes;
        updateData.transaction_status = 'IN_PROGRESS';
      } else if (eventType === 'ESG_ACK3') {
        updateData.ack3_date_id = dateId;
        updateData.status = 'ACK3';
        updateData.time_to_ack3_minutes = details.timeToAck3Minutes;
        updateData.transaction_status = 'COMPLETE';
      }

      if (existingTransaction) {
        // Update existing transaction
        const { error } = await supabase
          .from('analytics.fact_esg_transaction')
          .update(updateData)
          .eq('transaction_id', existingTransaction.transaction_id);

        if (error) {
          throw new Error(`Error updating ESG transaction: ${error.message}`);
        }
      } else if (eventType === 'ESG_SUBMISSION') {
        // Create new transaction
        const { error } = await supabase.from('analytics.fact_esg_transaction').insert({
          submission_id: submissionId,
          esg_tracking_number: details.trackingNumber,
          ...updateData,
        });

        if (error) {
          throw new Error(`Error inserting ESG transaction: ${error.message}`);
        }
      }
    }

    // Log event to stream
    await supabase.from('analytics.event_stream').insert({
      event_type: eventType,
      submission_id: submissionId,
      event_data: details,
    });

    logger.info(`Analytics: Tracked regulatory event ${eventType} for submission ${submissionId}`);
  } catch (error) {
    logger.error(`Error handling regulatory event: ${error.message}`, error);
  }
}

//----------------------------------------------------------------------
// MACHINE LEARNING & PREDICTIVE ANALYTICS
//----------------------------------------------------------------------

/**
 * Predict submission success probability
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<object>} - Prediction results
 */
async function predictSubmissionSuccess(submissionId) {
  try {
    // Get submission data using the analytics function
    const { data, error } = await supabase.rpc('analytics.prepare_submission_success_features', {
      p_submission_id: submissionId,
    });

    if (error) {
      throw new Error(`Error preparing features: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No data available for prediction');
    }

    const submissionData = data[0];

    // In a production environment, this would use an actual ML model
    // For this implementation, use a rule-based approach or OpenAI

    // Option 1: Use the pre-calculated probability from the SQL function
    const probability = submissionData.success_probability;

    // Option 2: Use OpenAI to analyze
    let aiAnalysis = null;

    try {
      const prompt = `
        Analyze this IND submission data and assess the probability of successful FDA acceptance.
        Use a scale of 0.0 to 1.0 where 1.0 is certainty of acceptance.
        
        Submission data:
        - Submission type: ${submissionData.submission_type}
        - Therapeutic area: ${submissionData.therapeutic_area}
        - Target authority: ${submissionData.authority_name}
        - Completeness score: ${submissionData.completeness_score}/100
        - Quality score: ${submissionData.quality_score}/100
        - Total sections: ${submissionData.total_sections}
        - Citations: ${submissionData.citation_count}
        - Tables: ${submissionData.table_count}
        - Figures: ${submissionData.figure_count}
        - QA issues: ${submissionData.qa_issue_count}
        - Spelling errors: ${submissionData.spelling_error_count}
        - Grammar errors: ${submissionData.grammar_error_count}
        
        Provide your assessment as a JSON object with these fields:
        - probability: number between 0 and 1
        - confidence: number between 0 and 1
        - rationale: string explaining your reasoning
        - improvement_areas: array of specific areas that could be improved
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert regulatory analyst specializing in FDA submissions.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      aiAnalysis = JSON.parse(response.choices[0].message.content);
    } catch (aiError) {
      logger.warn(`Could not get AI analysis: ${aiError.message}`);
      // Fall back to rule-based probability
    }

    // Combine results
    return {
      submission_id: submissionId,
      probability: aiAnalysis?.probability || probability,
      confidence: aiAnalysis?.confidence || 0.8,
      rationale: aiAnalysis?.rationale || 'Based on completeness and quality scores',
      improvement_areas: aiAnalysis?.improvement_areas || [],
      feature_importance: {
        completeness_score: 0.35,
        quality_score: 0.25,
        qa_issues: 0.15,
        citations: 0.05,
        tables_figures: 0.1,
        spelling_grammar: 0.1,
      },
      submission_data: submissionData,
    };
  } catch (error) {
    logger.error(`Error predicting submission success: ${error.message}`, error);
    throw error;
  }
}

/**
 * Predict review timeline for a submission
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<object>} - Timeline prediction
 */
async function predictReviewTimeline(submissionId) {
  try {
    // Get submission data
    const { data: submission, error } = await supabase
      .from('analytics.fact_submission')
      .select(
        `
        submission_id,
        submission_name,
        submission_type_id,
        sponsor_id,
        authority_id,
        therapeutic_area_id,
        completeness_score,
        quality_score,
        target_submission_date
      `
      )
      .eq('submission_id', submissionId)
      .single();

    if (error) {
      throw new Error(`Error fetching submission: ${error.message}`);
    }

    // Get corresponding dimension data
    const submissionType = getDimensionById('submissionType', submission.submission_type_id);
    const authority = getDimensionById('authority', submission.authority_id);
    const therapeuticArea = getDimensionById('therapeuticArea', submission.therapeutic_area_id);

    // Get historical data for similar submissions
    const { data: historicalData } = await supabase
      .from('analytics.vw_regulatory_performance')
      .select('*')
      .eq('authority_name', authority?.authority_name)
      .eq('submission_class', submissionType?.submission_class)
      .eq('therapeutic_area', therapeuticArea?.soc_name);

    // Calculate timeline based on historical data or use defaults
    let reviewDays = 0;
    let acknowledgeHours = 0;
    let firstResponseDays = 0;
    let confidenceLevel = 0;

    if (historicalData && historicalData.length > 0) {
      // Use average from historical data
      reviewDays = Math.round(
        historicalData.reduce((sum, item) => sum + item.avg_review_days, 0) / historicalData.length
      );
      confidenceLevel = historicalData.length > 5 ? 0.8 : (historicalData.length / 5) * 0.8;

      // Adjust based on submission quality
      const qualityFactor = submission.quality_score / 100;
      const completenessFactor = submission.completeness_score / 100;

      // Better quality submissions get faster reviews
      reviewDays = Math.round(reviewDays * (1.5 - qualityFactor * 0.5));

      // First response usually comes at about 20% of the total review time
      firstResponseDays = Math.round(reviewDays * 0.2);

      // ESG acknowledgment typically comes within 24-48 hours
      acknowledgeHours = 36;
    } else {
      // Use default values when no historical data is available
      switch (submissionType?.submission_class) {
        case 'IND':
          reviewDays = 30;
          firstResponseDays = 7;
          break;
        case 'NDA':
          reviewDays = 180;
          firstResponseDays = 45;
          break;
        case 'BLA':
          reviewDays = 180;
          firstResponseDays = 45;
          break;
        default:
          reviewDays = 60;
          firstResponseDays = 14;
      }

      acknowledgeHours = 36;
      confidenceLevel = 0.5;
    }

    // Calculate dates
    const submissionDate = submission.target_submission_date
      ? new Date(submission.target_submission_date)
      : new Date();

    // ESG acknowledgment
    const ackDate = new Date(submissionDate);
    ackDate.setHours(ackDate.getHours() + acknowledgeHours);

    // First response
    const firstResponseDate = new Date(submissionDate);
    firstResponseDate.setDate(firstResponseDate.getDate() + firstResponseDays);

    // Review complete
    const reviewCompleteDate = new Date(submissionDate);
    reviewCompleteDate.setDate(reviewCompleteDate.getDate() + reviewDays);

    return {
      submission_id: submissionId,
      estimated_timeline: {
        submission_date: submissionDate.toISOString().split('T')[0],
        esg_ack_date: ackDate.toISOString().split('T')[0],
        first_response_date: firstResponseDate.toISOString().split('T')[0],
        review_complete_date: reviewCompleteDate.toISOString().split('T')[0],
        total_review_days: reviewDays,
      },
      confidence_level: confidenceLevel,
      historical_data_points: historicalData?.length || 0,
      quality_adjustment_factor: submission.quality_score / 100,
      submission_class: submissionType?.submission_class || 'Unknown',
      authority: authority?.authority_name || 'Unknown',
      therapeutic_area: therapeuticArea?.soc_name || 'Unknown',
    };
  } catch (error) {
    logger.error(`Error predicting review timeline: ${error.message}`, error);
    throw error;
  }
}

/**
 * Analyze content quality for a submission section
 *
 * @param {string} submissionId - Submission ID
 * @param {string} sectionCode - Section code
 * @param {string} content - Section content
 * @returns {Promise<object>} - Quality analysis
 */
async function analyzeContentQuality(submissionId, sectionCode, content) {
  try {
    // Get section information
    const section = dimensionCache.section.get(sectionCode);

    if (!section) {
      throw new Error(`Section not found: ${sectionCode}`);
    }

    // In a production environment, this would use specialized NLP models
    // For this implementation, use OpenAI

    const prompt = `
      Analyze this content for an IND submission section ${sectionCode} (${section.section_title}) 
      in Module ${section.module_number}.
      
      Evaluate the following aspects:
      1. Regulatory compliance: Does it meet FDA expectations for this section?
      2. Technical language: Is the level of technical detail appropriate?
      3. Completeness: Does it appear to address all required elements?
      4. Clarity: Is the content clear and well-structured?
      5. References: Are citations and cross-references appropriate?
      
      Identify any issues with:
      - Grammar and spelling
      - Missing information
      - Inconsistent terminology
      - Unsupported claims
      - Citation quality
      
      Content to analyze (truncated if necessary):
      ${content.substring(0, 8000)}
      
      Provide your analysis as a JSON object with these fields:
      - regulatory_compliance_score: number between 0 and 100
      - technical_quality_score: number between 0 and 100
      - completeness_score: number between 0 and 100
      - clarity_score: number between 0 and 100
      - reference_quality_score: number between 0 and 100
      - overall_quality_score: number between 0 and 100
      - issues: array of specific issues found
      - improvement_suggestions: array of specific suggestions
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert regulatory editor specializing in FDA submissions.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const analysis = JSON.parse(response.choices[0].message.content);

    // Store quality metrics
    await handleDocumentQuality({
      submissionId,
      sectionCode,
      metrics: {
        spellingErrors: 0, // Would normally be detected with dedicated spellchecker
        grammarErrors: 0, // Would normally be detected with dedicated grammar checker
        styleIssues: analysis.issues.length,
        brokenReferences: 0,
        missingCitations: 0,
        readabilityScore: analysis.clarity_score,
        complianceScore: analysis.regulatory_compliance_score,
        overallScore: analysis.overall_quality_score,
      },
    });

    return {
      submission_id: submissionId,
      section_code: sectionCode,
      section_title: section.section_title,
      module: section.module_number,
      scores: {
        regulatory_compliance: analysis.regulatory_compliance_score,
        technical_quality: analysis.technical_quality_score,
        completeness: analysis.completeness_score,
        clarity: analysis.clarity_score,
        reference_quality: analysis.reference_quality_score,
        overall_quality: analysis.overall_quality_score,
      },
      issues: analysis.issues,
      improvement_suggestions: analysis.improvement_suggestions,
    };
  } catch (error) {
    logger.error(`Error analyzing content quality: ${error.message}`, error);
    throw error;
  }
}

/**
 * Detect anomalies in submissions or user activity
 *
 * @param {string} entityType - Type of entity ('submission' or 'user')
 * @param {string} entityId - Entity ID
 * @returns {Promise<object>} - Detected anomalies
 */
async function detectAnomalies(entityType, entityId) {
  try {
    let anomalies = [];

    if (entityType === 'submission') {
      // Analyze submission for anomalies

      // 1. Check for unusual section completion patterns
      const { data: sectionCompleteness } = await supabase
        .from('analytics.fact_section_status')
        .select('section_id, completeness_score')
        .eq('submission_id', entityId)
        .eq('is_current', true);

      if (sectionCompleteness && sectionCompleteness.length > 0) {
        // Check for illogical completion patterns (e.g., very complex sections done quickly, simple ones taking long)
        const moduleCompleteness = {};

        sectionCompleteness.forEach(sc => {
          const section = dimensionCache.section.get(sc.section_id);
          if (section) {
            const moduleNum = section.module_number;
            if (!moduleCompleteness[moduleNum]) {
              moduleCompleteness[moduleNum] = {
                sections: 0,
                completedSections: 0,
                avgCompleteness: 0,
              };
            }

            moduleCompleteness[moduleNum].sections++;
            if (sc.completeness_score > 80) {
              moduleCompleteness[moduleNum].completedSections++;
            }
            moduleCompleteness[moduleNum].avgCompleteness += sc.completeness_score;
          }
        });

        // Calculate averages
        Object.keys(moduleCompleteness).forEach(moduleNum => {
          moduleCompleteness[moduleNum].avgCompleteness /= moduleCompleteness[moduleNum].sections;
        });

        // Check for anomalies in module completion
        if (
          moduleCompleteness[2] &&
          moduleCompleteness[3] &&
          moduleCompleteness[2].avgCompleteness < 40 &&
          moduleCompleteness[3].avgCompleteness > 80
        ) {
          anomalies.push({
            type: 'module_completion_anomaly',
            description:
              'Unusual pattern: Module 3 (CMC) is significantly more complete than Module 2 (Summaries)',
            severity: 'medium',
          });
        }
      }

      // 2. Check for unusual activity patterns
      const { data: submissionEvents } = await supabase
        .from('analytics.fact_submission_event')
        .select('event_type_id, event_timestamp')
        .eq('submission_id', entityId)
        .order('event_timestamp', { ascending: true });

      if (submissionEvents && submissionEvents.length > 0) {
        // Check for unusually rapid progress
        const timeSpan =
          new Date(submissionEvents[submissionEvents.length - 1].event_timestamp).getTime() -
          new Date(submissionEvents[0].event_timestamp).getTime();

        const daysSpan = timeSpan / (24 * 60 * 60 * 1000);

        if (submissionEvents.length > 100 && daysSpan < 2) {
          anomalies.push({
            type: 'rapid_activity',
            description: `Unusually high activity rate: ${submissionEvents.length} events in ${daysSpan.toFixed(1)} days`,
            severity: 'high',
          });
        }
      }
    } else if (entityType === 'user') {
      // Analyze user activity for anomalies

      // 1. Check for unusual login patterns
      const { data: userActivity } = await supabase
        .from('analytics.fact_user_activity')
        .select('activity_type, activity_date_id, activity_timestamp, submission_id')
        .eq('user_id', entityId)
        .order('activity_timestamp', { ascending: true });

      if (userActivity && userActivity.length > 0) {
        // Group by day
        const activityByDay = {};

        userActivity.forEach(ua => {
          if (!activityByDay[ua.activity_date_id]) {
            activityByDay[ua.activity_date_id] = {
              activities: 0,
              submissions: new Set(),
            };
          }

          activityByDay[ua.activity_date_id].activities++;
          if (ua.submission_id) {
            activityByDay[ua.activity_date_id].submissions.add(ua.submission_id);
          }
        });

        // Calculate averages
        let totalActivities = 0;
        let totalDays = Object.keys(activityByDay).length;

        Object.values(activityByDay).forEach(day => {
          totalActivities += day.activities;
        });

        const avgActivitiesPerDay = totalActivities / totalDays;

        // Check each day for anomalies
        Object.entries(activityByDay).forEach(([dateId, day]) => {
          if (day.activities > avgActivitiesPerDay * 3 && day.activities > 50) {
            anomalies.push({
              type: 'unusual_activity_volume',
              description: `Unusually high activity volume on date ID ${dateId}: ${day.activities} activities vs average of ${avgActivitiesPerDay.toFixed(1)}`,
              severity: 'medium',
              date_id: dateId,
            });
          }

          if (day.submissions.size > 5) {
            anomalies.push({
              type: 'many_submissions',
              description: `User worked on ${day.submissions.size} different submissions on date ID ${dateId}, which is unusual`,
              severity: 'low',
              date_id: dateId,
            });
          }
        });
      }
    }

    return {
      entity_type: entityType,
      entity_id: entityId,
      anomalies_detected: anomalies.length,
      anomalies: anomalies,
      analysis_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error detecting anomalies: ${error.message}`, error);
    throw error;
  }
}

//----------------------------------------------------------------------
// PUBLIC API METHODS
//----------------------------------------------------------------------

/**
 * Get submission overview analytics
 *
 * @param {string} submissionId - Submission ID
 * @returns {Promise<object>} - Submission analytics
 */
export async function getSubmissionAnalytics(submissionId) {
  try {
    // Get submission overview
    const { data: submission, error } = await supabase
      .from('analytics.vw_submission_status')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (error) {
      throw new Error(`Error fetching submission: ${error.message}`);
    }

    // Get section completeness
    const { data: sectionCompleteness } = await supabase
      .from('analytics.vw_section_completeness')
      .select('*')
      .eq('submission_id', submissionId);

    // Get regulatory metrics
    const { data: regulatoryMetrics } = await supabase
      .from('analytics.fact_regulatory_metrics')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle();

    // Get ESG transactions
    const { data: esgTransactions } = await supabase
      .from('analytics.fact_esg_transaction')
      .select('*')
      .eq('submission_id', submissionId);

    // Get document quality metrics
    const { data: qualityMetrics } = await supabase
      .from('analytics.fact_document_quality')
      .select('*')
      .eq('submission_id', submissionId);

    // Get recent user activity
    const { data: userActivity } = await supabase
      .from('analytics.fact_user_activity')
      .select(
        `
        user_id,
        activity_type,
        activity_timestamp,
        section_id,
        items_affected,
        duration_seconds
      `
      )
      .eq('submission_id', submissionId)
      .order('activity_timestamp', { ascending: false })
      .limit(50);

    // Get success prediction
    let successPrediction = null;
    try {
      successPrediction = await models.submissionSuccess.predict(submissionId);
    } catch (predictionError) {
      logger.warn(`Could not get success prediction: ${predictionError.message}`);
    }

    // Get timeline prediction
    let timelinePrediction = null;
    try {
      timelinePrediction = await models.reviewTimeline.predict(submissionId);
    } catch (timelineError) {
      logger.warn(`Could not get timeline prediction: ${timelineError.message}`);
    }

    // Convert section IDs to codes
    const sectionActivity = {};
    if (userActivity) {
      userActivity.forEach(ua => {
        if (ua.section_id) {
          const section = getDimensionById('section', ua.section_id);
          if (section) {
            ua.section_code = section.section_code;
            ua.section_title = section.section_title;

            // Track activity by section
            if (!sectionActivity[section.section_code]) {
              sectionActivity[section.section_code] = {
                section_code: section.section_code,
                section_title: section.section_title,
                activity_count: 0,
                user_count: new Set(),
              };
            }

            sectionActivity[section.section_code].activity_count++;
            sectionActivity[section.section_code].user_count.add(ua.user_id);
          }
        }
      });
    }

    // Convert to array and calculate user counts
    const sectionActivityArray = Object.values(sectionActivity).map(sa => ({
      ...sa,
      user_count: sa.user_count.size,
    }));

    // Prepare section status summary
    const sectionStatusSummary = {
      total: sectionCompleteness?.length || 0,
      by_status: {},
      by_module: {},
    };

    if (sectionCompleteness) {
      sectionCompleteness.forEach(sc => {
        // Count by status
        if (!sectionStatusSummary.by_status[sc.status_name]) {
          sectionStatusSummary.by_status[sc.status_name] = 0;
        }
        sectionStatusSummary.by_status[sc.status_name]++;

        // Count by module
        if (!sectionStatusSummary.by_module[sc.module_number]) {
          sectionStatusSummary.by_module[sc.module_number] = {
            total: 0,
            complete: 0,
            in_progress: 0,
            not_started: 0,
          };
        }

        sectionStatusSummary.by_module[sc.module_number].total++;

        if (sc.completeness_score >= 90) {
          sectionStatusSummary.by_module[sc.module_number].complete++;
        } else if (sc.completeness_score > 0) {
          sectionStatusSummary.by_module[sc.module_number].in_progress++;
        } else {
          sectionStatusSummary.by_module[sc.module_number].not_started++;
        }
      });
    }

    return {
      submission_details: submission,
      section_completeness: sectionCompleteness || [],
      section_status_summary: sectionStatusSummary,
      regulatory_metrics: regulatoryMetrics || null,
      esg_transactions: esgTransactions || [],
      quality_metrics: qualityMetrics || [],
      recent_activity: userActivity || [],
      section_activity: sectionActivityArray,
      success_prediction: successPrediction,
      timeline_prediction: timelinePrediction,
      analysis_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error getting submission analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get user productivity analytics
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} - User analytics
 */
export async function getUserProductivityAnalytics(userId) {
  try {
    // Get user productivity
    const { data: productivity, error } = await supabase
      .from('analytics.vw_user_productivity')
      .select('*')
      .eq('user_id', userId)
      .order('date_value', { ascending: false });

    if (error) {
      throw new Error(`Error fetching user productivity: ${error.message}`);
    }

    // Get submissions user has worked on
    const { data: submissionActivity } = await supabase
      .from('analytics.fact_user_activity')
      .select('submission_id, count(*)')
      .eq('user_id', userId)
      .group('submission_id')
      .order('count', { ascending: false });

    // Get submission details
    const submissionIds = submissionActivity?.map(sa => sa.submission_id) || [];
    let submissions = [];

    if (submissionIds.length > 0) {
      const { data: submissionDetails } = await supabase
        .from('analytics.vw_submission_status')
        .select('submission_id, submission_name, status_name, completeness_score, created_date')
        .in('submission_id', submissionIds);

      submissions = submissionDetails || [];
    }

    // Calculate summary metrics
    const summary = {
      total_submissions: submissionIds.length,
      total_edits: 0,
      total_reviews: 0,
      total_approvals: 0,
      total_comments: 0,
      total_hours: 0,
      active_days: productivity?.length || 0,
    };

    if (productivity) {
      productivity.forEach(p => {
        summary.total_edits += p.edit_count || 0;
        summary.total_reviews += p.review_count || 0;
        summary.total_approvals += p.approval_count || 0;
        summary.total_comments += p.comment_count || 0;
        summary.total_hours += p.total_hours || 0;
      });
    }

    // Check for anomalies
    let anomalies = null;
    try {
      anomalies = await models.anomalyDetection.detect('user', userId);
    } catch (anomalyError) {
      logger.warn(`Could not get user anomalies: ${anomalyError.message}`);
    }

    return {
      user_id: userId,
      productivity_by_day: productivity || [],
      submissions_worked: submissions,
      summary_metrics: summary,
      anomalies: anomalies?.anomalies || [],
      analysis_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error getting user analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get regulatory analytics
 *
 * @param {number} days - Number of days to include (default 90)
 * @returns {Promise<object>} - Regulatory analytics
 */
export async function getRegulatoryAnalytics(days = 90) {
  try {
    // Get regulatory performance
    const { data: performance, error } = await supabase
      .from('analytics.vw_regulatory_performance')
      .select('*')
      .order('year_value', { ascending: false })
      .order('quarter_value', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Error fetching regulatory performance: ${error.message}`);
    }

    // Get ESG submission performance
    const { data: esgPerformance } = await supabase
      .from('analytics.vw_esg_performance')
      .select('*')
      .order('year_value', { ascending: false })
      .order('month_name', { ascending: false })
      .limit(12);

    // Get latest regulatory intelligence
    const { data: regulatoryIntelligence } = await supabase
      .from('analytics.fact_regulatory_intelligence')
      .select(
        `
        intelligence_id,
        title,
        summary,
        impact_level,
        publication_date_id,
        relevance_score,
        source_type,
        source_url,
        affected_sections
      `
      )
      .order('publication_date_id', { ascending: false })
      .limit(10);

    // Calculate summary metrics
    const summary = {
      authority_performance: {},
      submission_types: {},
      therapeutic_areas: {},
      avg_review_days: 0,
      first_cycle_approval_rate: 0,
      esg_success_rate: 0,
    };

    if (performance) {
      // Process authority performance
      performance.forEach(p => {
        if (!summary.authority_performance[p.authority_name]) {
          summary.authority_performance[p.authority_name] = {
            approvals: 0,
            avg_review_days: 0,
            first_cycle_percent: 0,
          };
        }

        summary.authority_performance[p.authority_name].approvals += p.approval_count;
        summary.authority_performance[p.authority_name].avg_review_days +=
          p.avg_review_days * p.approval_count;
        summary.authority_performance[p.authority_name].first_cycle_percent +=
          p.first_cycle_percent * p.approval_count;
      });

      // Calculate weighted averages
      Object.keys(summary.authority_performance).forEach(authority => {
        const ap = summary.authority_performance[authority];
        if (ap.approvals > 0) {
          ap.avg_review_days = Math.round(ap.avg_review_days / ap.approvals);
          ap.first_cycle_percent = Math.round(ap.first_cycle_percent / ap.approvals);
        }
      });

      // Calculate overall averages
      let totalApprovals = 0;
      let weightedReviewDays = 0;
      let weightedFirstCycle = 0;

      performance.forEach(p => {
        totalApprovals += p.approval_count;
        weightedReviewDays += p.avg_review_days * p.approval_count;
        weightedFirstCycle += p.first_cycle_percent * p.approval_count;
      });

      if (totalApprovals > 0) {
        summary.avg_review_days = Math.round(weightedReviewDays / totalApprovals);
        summary.first_cycle_approval_rate = Math.round(weightedFirstCycle / totalApprovals);
      }
    }

    if (esgPerformance && esgPerformance.length > 0) {
      // Calculate weighted average success rate
      let totalSubmissions = 0;
      let weightedSuccessRate = 0;

      esgPerformance.forEach(ep => {
        totalSubmissions += ep.submission_count;
        weightedSuccessRate += ep.success_rate * ep.submission_count;
      });

      if (totalSubmissions > 0) {
        summary.esg_success_rate = Math.round(weightedSuccessRate / totalSubmissions);
      }
    }

    return {
      regulatory_performance: performance || [],
      esg_performance: esgPerformance || [],
      regulatory_intelligence: regulatoryIntelligence || [],
      summary_metrics: summary,
      analysis_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error getting regulatory analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get system analytics
 *
 * @param {number} days - Number of days to include (default 30)
 * @returns {Promise<object>} - System analytics
 */
export async function getSystemAnalytics(days = 30) {
  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get dimension IDs for date range
    const { data: dateDims } = await supabase
      .from('analytics.dim_time')
      .select('time_id, date_value')
      .gte('date_value', startDateStr)
      .lte('date_value', endDateStr)
      .order('date_value');

    if (!dateDims || dateDims.length === 0) {
      throw new Error('No date dimensions found for specified range');
    }

    const dateIds = dateDims.map(d => d.time_id);

    // Get system usage data
    const { data: systemUsage, error } = await supabase
      .from('analytics.fact_system_usage')
      .select(
        `
        date_id,
        active_users,
        active_submissions,
        new_submissions,
        completed_submissions,
        submitted_to_fda,
        harvester_calls,
        ai_copilot_calls,
        pdf_generations,
        esg_submissions,
        average_response_time,
        peak_memory_usage
      `
      )
      .in('date_id', dateIds)
      .order('date_id');

    if (error) {
      throw new Error(`Error fetching system usage: ${error.message}`);
    }

    // Add dates to system usage
    const usageWithDates =
      systemUsage?.map(usage => {
        const dateEntry = dateDims.find(d => d.time_id === usage.date_id);
        return {
          ...usage,
          date: dateEntry?.date_value,
        };
      }) || [];

    // Get submission counts
    const { data: submissionCounts } = await supabase
      .from('analytics.fact_submission')
      .select('status_id, count(*)')
      .in('created_date_id', dateIds)
      .group('status_id');

    // Convert status IDs to names
    const submissionCountsByStatus = {};
    if (submissionCounts) {
      submissionCounts.forEach(sc => {
        const status = getDimensionById('status', sc.status_id);
        if (status) {
          submissionCountsByStatus[status.status_name] = sc.count;
        }
      });
    }

    // Get user activity summary
    const { data: userActivity } = await supabase
      .from('analytics.fact_user_activity')
      .select('activity_type, count(*)')
      .in('activity_date_id', dateIds)
      .group('activity_type');

    // Convert to object
    const activityCounts = {};
    if (userActivity) {
      userActivity.forEach(ua => {
        activityCounts[ua.activity_type] = ua.count;
      });
    }

    // Calculate summary metrics
    const summary = {
      total_active_users: Math.max(...usageWithDates.map(u => u.active_users || 0), 0),
      avg_active_users: Math.round(
        usageWithDates.reduce((sum, u) => sum + (u.active_users || 0), 0) / usageWithDates.length
      ),
      total_new_submissions: usageWithDates.reduce((sum, u) => sum + (u.new_submissions || 0), 0),
      total_completed_submissions: usageWithDates.reduce(
        (sum, u) => sum + (u.completed_submissions || 0),
        0
      ),
      total_submitted_to_fda: usageWithDates.reduce((sum, u) => sum + (u.submitted_to_fda || 0), 0),
      total_harvester_calls: usageWithDates.reduce((sum, u) => sum + (u.harvester_calls || 0), 0),
      total_ai_copilot_calls: usageWithDates.reduce((sum, u) => sum + (u.ai_copilot_calls || 0), 0),
      total_pdf_generations: usageWithDates.reduce((sum, u) => sum + (u.pdf_generations || 0), 0),
      total_esg_submissions: usageWithDates.reduce((sum, u) => sum + (u.esg_submissions || 0), 0),
      avg_response_time_ms: Math.round(
        usageWithDates.reduce((sum, u) => sum + (u.average_response_time || 0), 0) /
          usageWithDates.length
      ),
      max_peak_memory_mb: Math.max(...usageWithDates.map(u => u.peak_memory_usage || 0), 0),
      activities_by_type: activityCounts,
      submissions_by_status: submissionCountsByStatus,
    };

    return {
      usage_by_day: usageWithDates,
      summary_metrics: summary,
      date_range: {
        start_date: startDateStr,
        end_date: endDateStr,
        days_count: days,
      },
      analysis_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error getting system analytics: ${error.message}`, error);
    throw error;
  }
}

/**
 * Search regulatory intelligence
 *
 * @param {string} query - Search query
 * @param {object} filters - Optional filters
 * @returns {Promise<object>} - Search results
 */
export async function searchRegulatoryIntelligence(query, filters = {}) {
  try {
    // Generate embedding for the query
    const embedding = await generateEmbedding(query);

    // Build query
    let queryBuilder = supabase
      .from('analytics.fact_regulatory_intelligence')
      .select(
        `
        intelligence_id,
        title,
        summary,
        impact_level,
        relevance_score,
        source_type,
        source_url,
        affected_sections,
        authority_id,
        therapeutic_area_id,
        document_type_id
      `
      )
      .order('publication_date_id', { ascending: false });

    // Apply filters
    if (filters.authority_id) {
      queryBuilder = queryBuilder.eq('authority_id', filters.authority_id);
    }

    if (filters.therapeutic_area_id) {
      queryBuilder = queryBuilder.eq('therapeutic_area_id', filters.therapeutic_area_id);
    }

    if (filters.impact_level) {
      queryBuilder = queryBuilder.gte('impact_level', filters.impact_level);
    }

    if (filters.after_date) {
      const { data: dateId } = await supabase
        .from('analytics.dim_time')
        .select('time_id')
        .gte('date_value', filters.after_date)
        .order('date_value')
        .limit(1)
        .single();

      if (dateId) {
        queryBuilder = queryBuilder.gte('publication_date_id', dateId.time_id);
      }
    }

    // Execute query
    const { data, error } = await queryBuilder.limit(100);

    if (error) {
      throw new Error(`Error searching regulatory intelligence: ${error.message}`);
    }

    // Calculate semantic similarity using the embedding
    let results = data || [];

    if (embedding && results.length > 0) {
      // In a production system, this would use vector search in the database
      // For this implementation, fetch all and calculate similarity here

      const { data: itemsWithEmbeddings } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 10,
      });

      if (itemsWithEmbeddings && itemsWithEmbeddings.length > 0) {
        // Replace results with vector search results
        results = itemsWithEmbeddings;
      }
    }

    // Enrich results with dimension data
    results = results.map(item => {
      const authority = getDimensionById('authority', item.authority_id);
      const therapeuticArea = getDimensionById('therapeuticArea', item.therapeutic_area_id);

      return {
        ...item,
        authority_name: authority?.authority_name,
        therapeutic_area_name: therapeuticArea?.soc_name,
      };
    });

    return {
      query,
      result_count: results.length,
      results,
      filters_applied: Object.keys(filters).length,
      search_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error searching regulatory intelligence: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get dashboard data for a specific user
 *
 * @param {string} userId - User ID
 * @param {string} dashboardType - Dashboard type ('overview', 'submission', 'regulatory', etc.)
 * @returns {Promise<object>} - Dashboard data
 */
export async function getDashboardData(userId, dashboardType) {
  try {
    // Get user preferences
    const { data: preferences } = await supabase
      .from('analytics.analytics_dashboard_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('dashboard_type', dashboardType)
      .eq('is_default', true)
      .maybeSingle();

    // Initialize dashboard config with defaults
    let dashboardConfig = {
      layout: 'grid',
      filters: {},
      widgets: [],
    };

    // Use preferences if available
    if (preferences) {
      dashboardConfig = {
        ...dashboardConfig,
        layout: preferences.layout || dashboardConfig.layout,
        filters: preferences.filters || dashboardConfig.filters,
        widgets: preferences.widgets || dashboardConfig.widgets,
      };
    } else {
      // Use default widgets based on dashboard type
      switch (dashboardType) {
        case 'overview':
          dashboardConfig.widgets = [
            { type: 'submission_status', position: { x: 0, y: 0, w: 4, h: 6 } },
            { type: 'user_activity', position: { x: 4, y: 0, w: 4, h: 6 } },
            { type: 'regulatory_status', position: { x: 8, y: 0, w: 4, h: 6 } },
            { type: 'recent_submissions', position: { x: 0, y: 6, w: 12, h: 6 } },
          ];
          break;
        case 'submission':
          dashboardConfig.widgets = [
            { type: 'completion_status', position: { x: 0, y: 0, w: 4, h: 6 } },
            { type: 'section_matrix', position: { x: 4, y: 0, w: 8, h: 6 } },
            { type: 'content_metrics', position: { x: 0, y: 6, w: 4, h: 6 } },
            { type: 'user_contributions', position: { x: 4, y: 6, w: 4, h: 6 } },
            { type: 'timeline', position: { x: 8, y: 6, w: 4, h: 6 } },
          ];
          break;
        case 'regulatory':
          dashboardConfig.widgets = [
            { type: 'authority_performance', position: { x: 0, y: 0, w: 6, h: 6 } },
            { type: 'esg_performance', position: { x: 6, y: 0, w: 6, h: 6 } },
            { type: 'submission_timeline', position: { x: 0, y: 6, w: 6, h: 6 } },
            { type: 'regulatory_intelligence', position: { x: 6, y: 6, w: 6, h: 6 } },
          ];
          break;
        case 'user':
          dashboardConfig.widgets = [
            { type: 'productivity_summary', position: { x: 0, y: 0, w: 4, h: 6 } },
            { type: 'activity_trend', position: { x: 4, y: 0, w: 8, h: 6 } },
            { type: 'submissions_worked', position: { x: 0, y: 6, w: 12, h: 6 } },
          ];
          break;
        case 'system':
          dashboardConfig.widgets = [
            { type: 'system_usage', position: { x: 0, y: 0, w: 6, h: 6 } },
            { type: 'api_usage', position: { x: 6, y: 0, w: 6, h: 6 } },
            { type: 'user_activity', position: { x: 0, y: 6, w: 6, h: 6 } },
            { type: 'performance_metrics', position: { x: 6, y: 6, w: 6, h: 6 } },
          ];
          break;
      }
    }

    // Get data for each widget
    const widgetData = {};

    // Process widget data in parallel
    await Promise.all(
      dashboardConfig.widgets.map(async widget => {
        try {
          // Get data based on widget type
          switch (widget.type) {
            case 'submission_status':
              // Get submission counts by status
              const { data: submissionCounts } = await supabase
                .from('analytics.fact_submission')
                .select('status_id, count(*)')
                .group('status_id');

              const statusData = [];
              if (submissionCounts) {
                submissionCounts.forEach(sc => {
                  const status = getDimensionById('status', sc.status_id);
                  if (status) {
                    statusData.push({
                      status: status.status_name,
                      count: sc.count,
                    });
                  }
                });
              }

              widgetData[widget.type] = {
                status_counts: statusData,
              };
              break;

            case 'user_activity':
              // Get user activity for current user
              const userAnalytics = await getUserProductivityAnalytics(userId);
              widgetData[widget.type] = {
                summary: userAnalytics.summary_metrics,
                recent_activity: userAnalytics.productivity_by_day.slice(0, 7),
              };
              break;

            case 'regulatory_status':
              // Get regulatory status summary
              const regulatoryAnalytics = await getRegulatoryAnalytics(30);
              widgetData[widget.type] = {
                summary: regulatoryAnalytics.summary_metrics,
                recent_intelligence: regulatoryAnalytics.regulatory_intelligence.slice(0, 3),
              };
              break;

            // Additional widget types would be handled similarly

            default:
              widgetData[widget.type] = {
                message: `Data for widget type ${widget.type} not implemented`,
              };
          }
        } catch (widgetError) {
          logger.warn(`Error getting data for widget ${widget.type}: ${widgetError.message}`);
          widgetData[widget.type] = {
            error: widgetError.message,
          };
        }
      })
    );

    return {
      dashboard_type: dashboardType,
      config: dashboardConfig,
      data: widgetData,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error getting dashboard data: ${error.message}`, error);
    throw error;
  }
}

/**
 * Save dashboard configuration for a user
 *
 * @param {string} userId - User ID
 * @param {object} config - Dashboard configuration
 * @returns {Promise<object>} - Saved configuration
 */
export async function saveDashboardConfiguration(userId, config) {
  try {
    const { dashboardType, name, layout, widgets, filters, isDefault } = config;

    if (!dashboardType || !name) {
      throw new Error('Missing required fields: dashboardType, name');
    }

    // Check if dashboard already exists
    const { data: existingDashboard } = await supabase
      .from('analytics.analytics_dashboard_preferences')
      .select('id')
      .eq('user_id', userId)
      .eq('dashboard_name', name)
      .maybeSingle();

    let dashboardId;

    if (existingDashboard) {
      // Update existing dashboard
      const { data, error } = await supabase
        .from('analytics.analytics_dashboard_preferences')
        .update({
          dashboard_type: dashboardType,
          layout,
          widgets,
          filters,
          is_default: isDefault || false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDashboard.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Error updating dashboard: ${error.message}`);
      }

      dashboardId = data.id;
    } else {
      // Create new dashboard
      const { data, error } = await supabase
        .from('analytics.analytics_dashboard_preferences')
        .insert({
          user_id: userId,
          dashboard_type: dashboardType,
          dashboard_name: name,
          layout,
          widgets,
          filters,
          is_default: isDefault || false,
          theme: config.theme || 'light',
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Error creating dashboard: ${error.message}`);
      }

      dashboardId = data.id;
    }

    // If this is the default dashboard, unset others
    if (isDefault) {
      await supabase
        .from('analytics.analytics_dashboard_preferences')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('dashboard_type', dashboardType)
        .neq('id', dashboardId);
    }

    return {
      dashboard_id: dashboardId,
      message: existingDashboard ? 'Dashboard updated' : 'Dashboard created',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error saving dashboard configuration: ${error.message}`, error);
    throw error;
  }
}

/**
 * Export analytics data to CSV
 *
 * @param {string} dataType - Type of data to export
 * @param {object} filters - Filters to apply
 * @returns {Promise<object>} - Export result with file path
 */
export async function exportAnalyticsData(dataType, filters = {}) {
  try {
    let data = null;
    let headers = [];
    let filename = '';

    // Get data based on type
    switch (dataType) {
      case 'submission_status':
        data = await supabase.from('analytics.vw_submission_status').select('*');

        if (data.error) {
          throw new Error(`Error fetching submission status: ${data.error.message}`);
        }

        headers = [
          'submission_id',
          'submission_name',
          'submission_class',
          'status_name',
          'product_name',
          'sponsor_name',
          'authority_name',
          'therapeutic_area',
          'created_date',
          'submitted_date',
          'completeness_score',
          'quality_score',
          'risk_score',
          'percent_complete',
        ];

        filename = 'submission_status_export.csv';
        break;

      case 'section_completeness':
        if (!filters.submission_id) {
          throw new Error('Missing required filter: submission_id');
        }

        data = await supabase
          .from('analytics.vw_section_completeness')
          .select('*')
          .eq('submission_id', filters.submission_id);

        if (data.error) {
          throw new Error(`Error fetching section completeness: ${data.error.message}`);
        }

        headers = [
          'section_code',
          'section_title',
          'module_number',
          'status_name',
          'author_name',
          'reviewer_name',
          'approver_name',
          'status_date',
          'word_count',
          'page_count',
          'table_count',
          'figure_count',
          'citation_count',
          'comment_count',
          'open_comment_count',
          'qa_issues_count',
          'completeness_score',
          'quality_score',
        ];

        filename = `section_completeness_${filters.submission_id}.csv`;
        break;

      // Additional export types would be handled similarly

      default:
        throw new Error(`Unsupported export data type: ${dataType}`);
    }

    if (!data || !data.data) {
      throw new Error('No data available for export');
    }

    // Export to CSV
    const exportPath = `/tmp/analytics_export_${Date.now()}.csv`;

    const csvWriter = createObjectCsvWriter({
      path: exportPath,
      header: headers.map(header => ({ id: header, title: header })),
    });

    await csvWriter.writeRecords(data.data);

    return {
      file_path: exportPath,
      row_count: data.data.length,
      data_type: dataType,
      filters,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error exporting analytics data: ${error.message}`, error);
    throw error;
  }
}

export default {
  initAdvancedAnalytics,
  getSubmissionAnalytics,
  getUserProductivityAnalytics,
  getRegulatoryAnalytics,
  getSystemAnalytics,
  searchRegulatoryIntelligence,
  getDashboardData,
  saveDashboardConfiguration,
  exportAnalyticsData,

  // Event handling for real-time analytics
  trackEvent: (eventType, payload) => {
    eventStream.emit(eventType, payload);
  },
};
