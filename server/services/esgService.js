/**
 * ESG Service
 *
 * This service handles FDA Electronic Submissions Gateway operations:
 * - Creating and validating submission packages
 * - Submitting packages to FDA
 * - Processing acknowledgments
 * - Managing ESG configuration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { logger } from '../utils/logger.js';
import { eventBus } from '../events/eventBus.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize XML parser and builder
const parser = new XMLParser();
const builder = new XMLBuilder();

/**
 * Create a new ESG submission entry
 *
 * @param {string} submissionId - IND submission ID
 * @param {Object} options - Submission options
 * @param {string} options.userId - User ID creating the submission
 * @param {string} options.submissionType - Type of submission (Original, Amendment, etc.)
 * @param {string} options.sequenceNumber - Submission sequence number
 * @param {string} options.center - FDA Center (CDER, CBER, etc.)
 * @param {string} options.format - Submission format (eCTD, NeeS, etc.)
 * @param {string} options.environment - Target environment (Test, Production)
 * @returns {Promise<Object>} Created ESG submission
 */
export async function createEsgSubmission(submissionId, options) {
  const { userId, submissionType, sequenceNumber, center, format, environment } = options;

  // Create submission entry in database
  const { data, error } = await supabase
    .from('esg_submissions')
    .insert({
      submission_id: submissionId,
      created_by: userId,
      submission_type: submissionType,
      sequence_number: sequenceNumber,
      center: center || 'CDER',
      format: format || 'eCTD',
      environment: environment || 'Test',
      status: 'Created',
    })
    .select('*')
    .single();

  if (error) {
    logger.error(`Error creating ESG submission: ${error.message}`, error);
    throw new Error(`Error creating ESG submission: ${error.message}`);
  }

  // Log event
  eventBus.publish({
    type: 'esg_submission_created',
    payload: {
      submission_id: submissionId,
      esg_submission_id: data.id,
      user_id: userId,
      submission_type: submissionType,
      center: center,
    },
  });

  return data;
}

/**
 * Generate a submission package for FDA ESG
 *
 * @param {string} esgSubmissionId - ESG submission ID
 * @param {Object} options - Package options
 * @param {string} options.userId - User ID generating the package
 * @returns {Promise<Object>} Generated package info
 */
export async function generateSubmissionPackage(esgSubmissionId, options) {
  const { userId } = options;

  // Get ESG submission details
  const { data: esgSubmission, error: esgError } = await supabase
    .from('esg_submissions')
    .select('*, ind_submissions(*)')
    .eq('id', esgSubmissionId)
    .single();

  if (esgError) {
    logger.error(`Error fetching ESG submission: ${esgError.message}`, esgError);
    throw new Error(`Error fetching ESG submission: ${esgError.message}`);
  }

  // Get all blocks for the submission
  const { data: blocks, error: blocksError } = await supabase
    .from('ind_blocks')
    .select('*')
    .eq('submission_id', esgSubmission.submission_id);

  if (blocksError) {
    logger.error(`Error fetching submission blocks: ${blocksError.message}`, blocksError);
    throw new Error(`Error fetching submission blocks: ${blocksError.message}`);
  }

  // Get compiled PDF path (assuming it exists)
  const { data: pdfFiles, error: pdfError } = await supabase
    .from('ind_documents')
    .select('*')
    .eq('submission_id', esgSubmission.submission_id)
    .eq('document_type', 'compiled_pdf');

  if (pdfError) {
    logger.error(`Error fetching submission PDF: ${pdfError.message}`, pdfError);
    throw new Error(`Error fetching submission PDF: ${pdfError.message}`);
  }

  if (!pdfFiles || pdfFiles.length === 0) {
    throw new Error('No compiled PDF found for this submission. Generate a PDF first.');
  }

  // Get PDF files from storage
  const { data: pdfData, error: pdfDownloadError } = await supabase.storage
    .from('vault-files')
    .download(pdfFiles[0].file_path);

  if (pdfDownloadError) {
    logger.error(`Error downloading PDF: ${pdfDownloadError.message}`, pdfDownloadError);
    throw new Error(`Error downloading PDF: ${pdfDownloadError.message}`);
  }

  // Create submission package (ZIP file)
  const zip = new AdmZip();
  const submissionDate = new Date().toISOString().split('T')[0];

  // Add PDF to the package
  const pdfArrayBuffer = await pdfData.arrayBuffer();
  const pdfBuffer = Buffer.from(pdfArrayBuffer);

  // Create basic eCTD structure
  zip.addFile(
    `${esgSubmission.sequence_number || '0000'}/index.xml`,
    Buffer.from(generateIndexXml(esgSubmission))
  );
  zip.addFile(
    `${esgSubmission.sequence_number || '0000'}/m1/us/us-regional.xml`,
    Buffer.from(generateRegionalXml(esgSubmission))
  );
  zip.addFile(`${esgSubmission.sequence_number || '0000'}/m1/us/cover-letter.pdf`, pdfBuffer);

  // Create temp file for ZIP
  const tempZipPath = `/tmp/submission_${esgSubmissionId}.zip`;
  zip.writeZip(tempZipPath);

  // Upload ZIP to storage
  const zipBuffer = fs.readFileSync(tempZipPath);
  const zipPath = `esg-packages/${esgSubmissionId}/${Date.now()}_submission.zip`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('vault-files')
    .upload(zipPath, zipBuffer, {
      contentType: 'application/zip',
      upsert: true,
    });

  if (uploadError) {
    logger.error(`Error uploading package: ${uploadError.message}`, uploadError);
    throw new Error(`Error uploading package: ${uploadError.message}`);
  }

  // Clean up temp file
  fs.unlinkSync(tempZipPath);

  // Update ESG submission with package info
  const { data: updatedSubmission, error: updateError } = await supabase
    .from('esg_submissions')
    .update({
      package_path: zipPath,
      status: 'Package_Generated',
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', esgSubmissionId)
    .select('*')
    .single();

  if (updateError) {
    logger.error(`Error updating ESG submission: ${updateError.message}`, updateError);
    throw new Error(`Error updating ESG submission: ${updateError.message}`);
  }

  // Log event
  eventBus.publish({
    type: 'esg_package_generated',
    payload: {
      submission_id: esgSubmission.submission_id,
      esg_submission_id: esgSubmissionId,
      user_id: userId,
      package_path: zipPath,
    },
  });

  return {
    submission_id: esgSubmission.submission_id,
    esg_submission_id: esgSubmissionId,
    package_path: zipPath,
    status: 'Package_Generated',
  };
}

/**
 * Generate eCTD index.xml file
 *
 * @param {Object} submission - ESG submission details
 * @returns {string} XML string
 */
function generateIndexXml(submission) {
  // Simplified example - in production would need full eCTD structure
  const indexData = {
    ectd: {
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      'xmlns:ectd': 'http://www.ich.org/ectd',
      xmlns: 'http://www.ich.org/ectd',
      'ectd:version': '3.2',
      'content-of-submission': submission.submission_type || 'Original',
      submission: {
        'submission-unit': submission.sequence_number || '0000',
        'submission-type': submission.submission_type || 'Original',
        'submission-mode': 'ectd',
        'ectd-submission-id': submission.id,
        'applicant-info': {
          'applicant-name': submission.ind_submissions?.sponsor_name || 'Sponsor',
        },
        'application-set': {
          application: {
            'application-type': 'ind',
            'application-number': submission.ind_submissions?.ind_number || 'TBD',
            'submission-sub-type': 'original',
          },
        },
      },
    },
  };

  return builder.build(indexData);
}

/**
 * Generate eCTD us-regional.xml file
 *
 * @param {Object} submission - ESG submission details
 * @returns {string} XML string
 */
function generateRegionalXml(submission) {
  // Simplified example - in production would need full US Regional structure
  const regionalData = {
    'us-regional': {
      'administrative-info': {
        'application-set': {
          application: {
            'application-information': {
              'application-number': submission.ind_submissions?.ind_number || 'TBD',
              'application-type': 'ind',
            },
          },
        },
      },
    },
  };

  return builder.build(regionalData);
}

/**
 * Validate a submission package
 *
 * @param {string} esgSubmissionId - ESG submission ID
 * @param {Object} options - Validation options
 * @param {string} options.userId - User ID performing validation
 * @param {string} options.validator - Validator to use ('internal', 'lorenz', 'globalsubmit')
 * @returns {Promise<Object>} Validation results
 */
export async function validateSubmissionPackage(esgSubmissionId, options) {
  const { userId, validator = 'internal' } = options;

  // Get ESG submission details
  const { data: esgSubmission, error: esgError } = await supabase
    .from('esg_submissions')
    .select('*')
    .eq('id', esgSubmissionId)
    .single();

  if (esgError) {
    logger.error(`Error fetching ESG submission: ${esgError.message}`, esgError);
    throw new Error(`Error fetching ESG submission: ${esgError.message}`);
  }

  if (!esgSubmission.package_path) {
    throw new Error('No package found for this submission. Generate a package first.');
  }

  // Perform validation (simplified example)
  let validationResults = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // In a real implementation, this would call an actual validation service
  switch (validator) {
    case 'internal':
      validationResults = performInternalValidation(esgSubmission);
      break;
    case 'lorenz':
      validationResults = await performLorenzValidation(esgSubmission);
      break;
    case 'globalsubmit':
      validationResults = await performGlobalSubmitValidation(esgSubmission);
      break;
    default:
      validationResults = performInternalValidation(esgSubmission);
  }

  // Store validation results
  const validationPath = `esg-validations/${esgSubmissionId}/${Date.now()}_validation.json`;

  const { error: uploadError } = await supabase.storage
    .from('vault-files')
    .upload(validationPath, JSON.stringify(validationResults, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) {
    logger.error(`Error uploading validation results: ${uploadError.message}`, uploadError);
    throw new Error(`Error uploading validation results: ${uploadError.message}`);
  }

  // Update ESG submission with validation info
  const newStatus = validationResults.valid ? 'Validated' : 'Validation_Failed';

  const { data: updatedSubmission, error: updateError } = await supabase
    .from('esg_submissions')
    .update({
      validation_path: validationPath,
      status: newStatus,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', esgSubmissionId)
    .select('*')
    .single();

  if (updateError) {
    logger.error(`Error updating ESG submission: ${updateError.message}`, updateError);
    throw new Error(`Error updating ESG submission: ${updateError.message}`);
  }

  // Log event
  eventBus.publish({
    type: 'esg_validation_completed',
    payload: {
      submission_id: esgSubmission.submission_id,
      esg_submission_id: esgSubmissionId,
      user_id: userId,
      validation_path: validationPath,
      valid: validationResults.valid,
      error_count: validationResults.errors.length,
      warning_count: validationResults.warnings.length,
    },
  });

  return {
    ...validationResults,
    submission_id: esgSubmission.submission_id,
    esg_submission_id: esgSubmissionId,
    validation_path: validationPath,
    status: newStatus,
  };
}

/**
 * Perform internal validation
 *
 * @param {Object} submission - ESG submission
 * @returns {Object} Validation results
 */
function performInternalValidation(submission) {
  // Simplified example - in production would perform actual validation
  return {
    valid: true,
    errors: [],
    warnings: [
      {
        code: 'W001',
        message: 'This is a sample warning. Internal validation is limited.',
        path: '/ectd/content-of-submission',
      },
    ],
  };
}

/**
 * Perform validation using Lorenz validator
 *
 * @param {Object} submission - ESG submission
 * @returns {Promise<Object>} Validation results
 */
async function performLorenzValidation(submission) {
  // This would call the Lorenz validation API
  // Simplified mock for demo purposes
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

/**
 * Perform validation using GlobalSubmit validator
 *
 * @param {Object} submission - ESG submission
 * @returns {Promise<Object>} Validation results
 */
async function performGlobalSubmitValidation(submission) {
  // This would call the GlobalSubmit validation API
  // Simplified mock for demo purposes
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

/**
 * Submit package to FDA ESG
 *
 * @param {string} esgSubmissionId - ESG submission ID
 * @param {Object} options - Submission options
 * @param {string} options.userId - User ID submitting
 * @param {string} options.environment - Target environment (Test, Production)
 * @returns {Promise<Object>} Submission results
 */
export async function submitToFda(esgSubmissionId, options) {
  const { userId, environment = 'Test' } = options;

  // Get ESG submission details
  const { data: esgSubmission, error: esgError } = await supabase
    .from('esg_submissions')
    .select('*')
    .eq('id', esgSubmissionId)
    .single();

  if (esgError) {
    logger.error(`Error fetching ESG submission: ${esgError.message}`, esgError);
    throw new Error(`Error fetching ESG submission: ${esgError.message}`);
  }

  if (!esgSubmission.package_path) {
    throw new Error('No package found for this submission. Generate a package first.');
  }

  if (esgSubmission.status !== 'Validated' && esgSubmission.status !== 'Package_Generated') {
    throw new Error(`Submission in invalid state for FDA submission: ${esgSubmission.status}`);
  }

  // Get ESG configuration
  const { data: esgConfig, error: configError } = await supabase
    .from('esg_configuration')
    .select('*')
    .eq('environment', environment)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (configError) {
    logger.error(`Error fetching ESG configuration: ${configError.message}`, configError);
    throw new Error(`Error fetching ESG configuration: ${configError.message}`);
  }

  // Download package from storage
  const { data: packageData, error: packageError } = await supabase.storage
    .from('vault-files')
    .download(esgSubmission.package_path);

  if (packageError) {
    logger.error(`Error downloading package: ${packageError.message}`, packageError);
    throw new Error(`Error downloading package: ${packageError.message}`);
  }

  // In a real implementation, this would call the FDA ESG API
  // For this example, we'll simulate a successful submission

  // Generate a transaction ID for FDA submission
  const transactionId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Update ESG submission with transaction info
  const { data: updatedSubmission, error: updateError } = await supabase
    .from('esg_submissions')
    .update({
      esg_transaction_id: transactionId,
      status: 'Submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: userId,
      submission_environment: environment,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', esgSubmissionId)
    .select('*')
    .single();

  if (updateError) {
    logger.error(`Error updating ESG submission: ${updateError.message}`, updateError);
    throw new Error(`Error updating ESG submission: ${updateError.message}`);
  }

  // Log event
  eventBus.publish({
    type: 'esg_submitted',
    payload: {
      submission_id: esgSubmission.submission_id,
      esg_submission_id: esgSubmissionId,
      transaction_id: transactionId,
      user_id: userId,
      environment,
    },
  });

  return {
    submission_id: esgSubmission.submission_id,
    esg_submission_id: esgSubmissionId,
    transaction_id: transactionId,
    status: 'Submitted',
    environment,
  };
}

/**
 * Get submission events
 *
 * @param {string} esgSubmissionId - ESG submission ID
 * @returns {Promise<Array>} Events list
 */
export async function getSubmissionEvents(esgSubmissionId) {
  // Get ESG submission details
  const { data: esgSubmission, error: esgError } = await supabase
    .from('esg_submissions')
    .select('submission_id')
    .eq('id', esgSubmissionId)
    .single();

  if (esgError) {
    logger.error(`Error fetching ESG submission: ${esgError.message}`, esgError);
    throw new Error(`Error fetching ESG submission: ${esgError.message}`);
  }

  // Get events for this submission
  const { data: events, error: eventsError } = await supabase
    .from('ind_ledger')
    .select('*')
    .eq('payload->submission_id', esgSubmission.submission_id)
    .contains('payload', { esg_submission_id: esgSubmissionId })
    .order('ts', { ascending: false });

  if (eventsError) {
    logger.error(`Error fetching events: ${eventsError.message}`, eventsError);
    throw new Error(`Error fetching events: ${eventsError.message}`);
  }

  return events || [];
}

/**
 * Get submission acknowledgments
 *
 * @param {string} esgSubmissionId - ESG submission ID
 * @returns {Promise<Array>} Acknowledgments list
 */
export async function getSubmissionAcknowledgments(esgSubmissionId) {
  // Get acknowledgments for this submission
  const { data: acks, error: acksError } = await supabase
    .from('esg_acks')
    .select('*')
    .eq('esg_submission_id', esgSubmissionId)
    .order('ts', { ascending: false });

  if (acksError) {
    logger.error(`Error fetching acknowledgments: ${acksError.message}`, acksError);
    throw new Error(`Error fetching acknowledgments: ${acksError.message}`);
  }

  return acks || [];
}

/**
 * Configure ESG connection
 *
 * @param {Object} config - ESG configuration
 * @param {string} config.environment - Environment (Test, Production)
 * @param {string} config.connection_type - Connection type (AS2, SFTP)
 * @param {string} config.sender_id - Sender ID
 * @param {string} config.sender_name - Sender name
 * @param {string} config.fda_receiver_id - FDA receiver ID
 * @param {boolean} config.is_active - Whether this configuration is active
 * @param {string} config.userId - User ID making the change
 * @returns {Promise<Object>} Created configuration
 */
export async function configureEsgConnection(config) {
  const {
    environment,
    connection_type,
    sender_id,
    sender_name,
    fda_receiver_id,
    is_active,
    userId,
  } = config;

  // Create configuration in database
  const { data, error } = await supabase
    .from('esg_configuration')
    .insert({
      environment,
      connection_type,
      sender_id,
      sender_name,
      fda_receiver_id,
      is_active: is_active || true,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) {
    logger.error(`Error creating ESG configuration: ${error.message}`, error);
    throw new Error(`Error creating ESG configuration: ${error.message}`);
  }

  // If this is active, deactivate other configurations for the same environment
  if (is_active) {
    await supabase
      .from('esg_configuration')
      .update({ is_active: false })
      .eq('environment', environment)
      .neq('id', data.id);
  }

  return data;
}
