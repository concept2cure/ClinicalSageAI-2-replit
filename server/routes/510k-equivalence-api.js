/**
 * 510(k) Equivalence API Routes
 *
 * This module handles the server-side API endpoints for the 510(k) substantial
 * equivalence analysis feature, including predicate device search, detailed
 * predicate device information, and AI-powered draft generation.
 *
 * CRITICAL WORKFLOW COMPONENT: This API is part of the 510k workflow transition system
 * and must be stable for proper tab navigation between Predicates and Equivalence steps.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateJWT, requireSameOrganization } = require('../middleware/auth.cjs');
const { OpenAI } = require('openai');
const { handleApiError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Utility function to check if a user has access to an organization.
 * Replaces the missing organization access control functionality.
 */
function checkOrganizationAccess(req, organizationId) {
  if (!req.user) return false;
  return req.user.organizationId === organizationId || req.user.roles?.includes('admin');
}

/**
 * Search for predicate devices from FDA 510(k) database
 * @route POST /510k/predicate-devices
 */
router.post('/predicate-devices', authenticateJWT, async (req, res) => {
  try {
    const { searchData, organizationId } = req.body;

    if (!searchData || !searchData.query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    const limit = searchData.limit || 10;

    // Build FDA API query
    let fdaQuery = `search=(device_name:"${searchData.query}" OR k_number:"${searchData.query}")`;

    // Add product code filter if provided
    if (searchData.productCode) {
      fdaQuery += `+AND+product_code:"${searchData.productCode}"`;
    }

    // Call FDA API
    const fdaResponse = await axios.get(
      `https://api.fda.gov/device/510k.json?${fdaQuery}&limit=${limit}`
    );

    // Transform FDA response to our API format
    const predicates = fdaResponse.data.results.map(result => ({
      predicateId: result.k_number,
      kNumber: result.k_number,
      deviceName: result.device_name,
      decisionDate: result.decision_date,
      productCode: result.product_code,
      applicant: result.applicant,
      deviceClass: result.device_class || 'unknown',
    }));

    logger.info(`Found ${predicates.length} predicate devices for query: ${searchData.query}`);

    return res.json({
      predicates,
      searchQuery: searchData.query,
    });
  } catch (error) {
    logger.error('Error in predicate device search: ' + error.message);
    return handleApiError(res, error, 'Failed to search for predicate devices');
  }
});

/**
 * Get detailed information about a specific predicate device
 * @route GET /510k/predicate-devices/:predicateId
 */

/**
 * Check equivalence analysis status
 * @route GET /510k/equivalence-status/:deviceId
 *
 * This endpoint is critical for workflow transitions between Predicate and Equivalence steps.
 * It returns the status of the equivalence analysis for a specific device,
 * allowing the frontend to determine if it's safe to perform a workflow step transition.
 */
router.get('/equivalence-status/:deviceId', authenticateJWT, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { organizationId } = req.query;

    // Log request for debugging
    logger.info(
      `Checking equivalence status for device ID: ${deviceId}, org: ${organizationId || 'none'}`
    );

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    try {
      // Perform real database queries to check if the device exists and
      // has the required data available for the equivalence analysis step
      // This is a critical check for workflow transition stability

      // Use the database pool for these queries
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });

      // Log the database check
      logger.info(`[Equivalence Status] Checking device ${deviceId} in database`);

      // First check if the device exists
      const deviceResult = await pool.query(
        'SELECT id, device_name, manufacturer, device_class FROM device_profiles WHERE id = $1',
        [deviceId]
      );

      const deviceExists = deviceResult.rows.length > 0;

      // If device exists, check if it has predicate data
      let hasRequiredData = false;
      let predicateDataStatus = 'missing';

      if (deviceExists) {
        const predicateResult = await pool.query(
          'SELECT COUNT(*) FROM predicate_selections WHERE device_id = $1',
          [deviceId]
        );

        hasRequiredData = parseInt(predicateResult.rows[0].count) > 0;
        predicateDataStatus = hasRequiredData ? 'available' : 'missing';

        logger.info(
          `[Equivalence Status] Device ${deviceId} exists in DB, predicate data: ${predicateDataStatus}`
        );
      } else {
        logger.warn(`[Equivalence Status] Device ${deviceId} not found in database`);
      }

      if (!deviceExists) {
        logger.warn(`Equivalence status check failed - device not found: ${deviceId}`);
        return res.status(404).json({
          deviceId: deviceId,
          status: 'not_found',
          message: 'Device not found in database',
          timestamp: new Date().toISOString(),
          apiStatus: 'operational',
          canProceed: false,
        });
      }

      // Device exists but may not have predicate data
      if (!hasRequiredData) {
        logger.warn(
          `Equivalence status check failed - missing predicate data for device: ${deviceId}`
        );
        return res.json({
          deviceId: deviceId,
          status: 'missing_data',
          message: 'Device found but missing required predicate data for equivalence analysis',
          deviceName: deviceResult.rows[0].device_name,
          manufacturer: deviceResult.rows[0].manufacturer,
          deviceClass: deviceResult.rows[0].device_class,
          timestamp: new Date().toISOString(),
          apiStatus: 'operational',
          canProceed: false,
          requiredAction:
            'Select at least one predicate device before proceeding to equivalence analysis',
        });
      }

      // Device exists and has required predicate data
      logger.info(`Equivalence status check passed for device: ${deviceId}`);
      return res.json({
        deviceId: deviceId,
        status: 'ready',
        message: 'Equivalence analysis is ready to start',
        deviceName: deviceResult.rows[0].device_name,
        manufacturer: deviceResult.rows[0].manufacturer,
        deviceClass: deviceResult.rows[0].device_class,
        timestamp: new Date().toISOString(),
        apiStatus: 'operational',
        canProceed: true,
      });
    } catch (error) {
      // This additional error handling is important for workflow stability
      logger.error(`Equivalence status check error for device ${deviceId}: ${error.message}`);

      // Even in error cases, we need to provide a clear response with the canProceed flag
      return res.status(500).json({
        deviceId: deviceId,
        status: 'error',
        message: 'Error checking equivalence status',
        timestamp: new Date().toISOString(),
        apiStatus: 'degraded',
        canProceed: false,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error('Error checking equivalence status: ' + error.message);
    return handleApiError(res, error, 'Failed to check equivalence status');
  }
});

router.get('/predicate-devices/:predicateId', authenticateJWT, async (req, res) => {
  try {
    const { predicateId } = req.params;
    const { organizationId } = req.query;

    // Enhanced logging for predicate device lookup
    logger.info(`Looking up predicate device: ${predicateId}, org: ${organizationId || 'none'}`);

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    if (!predicateId) {
      return res.status(400).json({ error: 'Predicate device ID is required' });
    }

    // Call FDA API for specific 510(k) record
    const fdaResponse = await axios.get(
      `https://api.fda.gov/device/510k.json?search=k_number:"${predicateId}"&limit=1`
    );

    if (!fdaResponse.data.results || fdaResponse.data.results.length === 0) {
      return res.status(404).json({ error: 'Predicate device not found' });
    }

    const fdaDevice = fdaResponse.data.results[0];

    // Enhance with additional details from other FDA APIs if available
    const enhancedDetails = await enhancePredicateDetails(fdaDevice);

    logger.info(`Retrieved detailed information for predicate device: ${predicateId}`);

    return res.json({
      predicateDetails: enhancedDetails,
    });
  } catch (error) {
    logger.error('Error in predicate device details: ' + error.message);
    return handleApiError(res, error, 'Failed to retrieve predicate device details');
  }
});

/**
 * Generate substantial equivalence draft
 * @route POST /510k/draft-equivalence
 */
router.post('/draft-equivalence', authenticateJWT, async (req, res) => {
  try {
    const { deviceProfile, predicateProfile, equivalenceData, organizationId } = req.body;

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    if (!deviceProfile || !predicateProfile || !equivalenceData) {
      return res.status(400).json({
        error: 'Device profile, predicate profile, and equivalence data are required',
      });
    }

    // Generate draft using OpenAI
    const draftText = await generateEquivalenceDraft(
      deviceProfile,
      predicateProfile,
      equivalenceData
    );

    logger.info(`Generated substantial equivalence draft for device: ${deviceProfile.deviceName}`);

    return res.json({ draftText });
  } catch (error) {
    logger.error('Error in draft equivalence generation: ' + error.message);
    return handleApiError(res, error, 'Failed to generate substantial equivalence draft');
  }
});

/**
 * Enhance predicate device details with additional information
 */
async function enhancePredicateDetails(fdaDevice) {
  try {
    // Start with basic FDA data
    const enhancedDetails = {
      predicateId: fdaDevice.k_number,
      kNumber: fdaDevice.k_number,
      deviceName: fdaDevice.device_name,
      decisionDate: fdaDevice.decision_date,
      productCode: fdaDevice.product_code,
      applicant: fdaDevice.applicant,
      deviceClass: fdaDevice.device_class || 'unknown',
      address_1: fdaDevice.address_1,
      address_2: fdaDevice.address_2,
      clearanceType: fdaDevice.clearance_type,
      dateReceived: fdaDevice.date_received,
      decision: fdaDevice.decision,
      reviewAdviseCommittee: fdaDevice.review_advisory_committee,
      stateOrProvince: fdaDevice.state_or_province,
      thirdPartyFlag: fdaDevice.third_party_flag === 'Y',
      zipCode: fdaDevice.zip_code,
      country: fdaDevice.country_code,
    };

    // Structured fields for equivalence comparison
    enhancedDetails.indications = extractIndicationsFromDevice(fdaDevice);
    enhancedDetails.targetPopulation = extractTargetPopulation(fdaDevice);
    enhancedDetails.anatomicalSites = extractAnatomicalSites(fdaDevice);
    enhancedDetails.operatingPrinciple = extractOperatingPrinciple(fdaDevice);
    enhancedDetails.mechanism = extractMechanism(fdaDevice);
    enhancedDetails.energyType = extractEnergyType(fdaDevice);
    enhancedDetails.patientContactMaterials = extractPatientContactMaterials(fdaDevice);
    enhancedDetails.coatings = extractCoatings(fdaDevice);
    enhancedDetails.sterilization = extractSterilization(fdaDevice);
    enhancedDetails.accuracy = extractAccuracy(fdaDevice);
    enhancedDetails.sensitivity = extractSensitivity(fdaDevice);
    enhancedDetails.performanceSpecs = extractPerformanceSpecs(fdaDevice);
    enhancedDetails.safetyFeatures = extractSafetyFeatures(fdaDevice);
    enhancedDetails.riskControls = extractRiskControls(fdaDevice);
    enhancedDetails.warnings = extractWarnings(fdaDevice);

    return enhancedDetails;
  } catch (error) {
    logger.error('Error enhancing predicate details: ' + error.message);
    // Return basic FDA data if enhancement fails
    return {
      predicateId: fdaDevice.k_number,
      kNumber: fdaDevice.k_number,
      deviceName: fdaDevice.device_name,
      decisionDate: fdaDevice.decision_date,
      productCode: fdaDevice.product_code,
      applicant: fdaDevice.applicant,
      deviceClass: fdaDevice.device_class || 'unknown',
    };
  }
}

/**
 * Extract indications for use from FDA device data
 */
function extractIndicationsFromDevice(fdaDevice) {
  // In a real implementation, this would contain more sophisticated logic
  // to extract the indications for use from various FDA data fields
  return fdaDevice.device_name || 'Not specified';
}

/**
 * Extract target population from FDA device data
 */
function extractTargetPopulation(fdaDevice) {
  // This would contain logic to determine the target population
  return 'General patient population';
}

/**
 * Extract anatomical sites from FDA device data
 */
function extractAnatomicalSites(fdaDevice) {
  // This would contain logic to determine the anatomical sites
  return 'Multiple sites depending on use case';
}

/**
 * Extract operating principle from FDA device data
 */
function extractOperatingPrinciple(fdaDevice) {
  // This would contain logic to determine the operating principle
  return 'Standard medical device operation';
}

/**
 * Extract mechanism from FDA device data
 */
function extractMechanism(fdaDevice) {
  // This would contain logic to determine the mechanism of action
  return 'Mechanical action';
}

/**
 * Extract energy type from FDA device data
 */
function extractEnergyType(fdaDevice) {
  // This would contain logic to determine the energy type
  return 'Manual operation';
}

/**
 * Extract patient contact materials from FDA device data
 */
function extractPatientContactMaterials(fdaDevice) {
  // This would contain logic to determine the patient contact materials
  return 'Medical grade materials';
}

/**
 * Extract coatings from FDA device data
 */
function extractCoatings(fdaDevice) {
  // This would contain logic to determine coatings
  return 'No special coatings';
}

/**
 * Extract sterilization from FDA device data
 */
function extractSterilization(fdaDevice) {
  // This would contain logic to determine sterilization method
  return 'Standard sterilization methods';
}

/**
 * Extract accuracy from FDA device data
 */
function extractAccuracy(fdaDevice) {
  // This would contain logic to determine accuracy
  return 'Industry standard accuracy';
}

/**
 * Extract sensitivity from FDA device data
 */
function extractSensitivity(fdaDevice) {
  // This would contain logic to determine sensitivity
  return 'Industry standard sensitivity';
}

/**
 * Extract performance specs from FDA device data
 */
function extractPerformanceSpecs(fdaDevice) {
  // This would contain logic to determine performance specs
  return 'Meets industry performance standards';
}

/**
 * Extract safety features from FDA device data
 */
function extractSafetyFeatures(fdaDevice) {
  // This would contain logic to determine safety features
  return 'Standard safety features';
}

/**
 * Extract risk controls from FDA device data
 */
function extractRiskControls(fdaDevice) {
  // This would contain logic to determine risk controls
  return 'Standard risk mitigation measures';
}

/**
 * Extract warnings from FDA device data
 */
function extractWarnings(fdaDevice) {
  // This would contain logic to determine warnings
  return 'Standard medical device warnings';
}

/**
 * Generate substantial equivalence draft using OpenAI
 */
async function generateEquivalenceDraft(deviceProfile, predicateProfile, equivalenceData) {
  try {
    // Format the device profiles and equivalence data for the AI prompt
    const prompt = formatPromptForEquivalenceDraft(
      deviceProfile,
      predicateProfile,
      equivalenceData
    );

    // Call OpenAI API to generate draft
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in 510(k) substantial equivalence documentation. Write in a professional, regulatory-compliant style appropriate for FDA submissions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    logger.error('Error generating equivalence draft: ' + error.message);
    throw new Error('Failed to generate substantial equivalence draft');
  }
}

/**
 * Format the prompt for equivalence draft generation
 */
function formatPromptForEquivalenceDraft(deviceProfile, predicateProfile, equivalenceData) {
  // Extract important fields and format them for the prompt
  const subjectDeviceName = deviceProfile.deviceName || 'Subject Device';
  const predicateDeviceName = predicateProfile.deviceName || 'Predicate Device';
  const predicateKNumber = predicateProfile.kNumber || 'Unknown K-Number';

  // Format the equivalence data
  let comparisonDetails = '';
  equivalenceData.forEach(category => {
    comparisonDetails += `\n${category.category}:\n`;

    category.fields.forEach(field => {
      const deviationMarker = field.hasMajorDeviation ? ' [MAJOR DEVIATION]' : '';
      comparisonDetails += `- ${field.label}${deviationMarker}:\n`;
      comparisonDetails += `  * Subject Device: ${field.subjectValue}\n`;
      comparisonDetails += `  * Predicate Device: ${field.predicateValue}\n`;
    });
  });

  // Count major deviations
  const majorDeviations = equivalenceData.reduce((count, category) => {
    return count + category.fields.filter(field => field.hasMajorDeviation).length;
  }, 0);

  // Craft the prompt
  return `
Please write a comprehensive Substantial Equivalence section for a 510(k) submission. 
Use the following information:

Subject Device: ${subjectDeviceName}
Predicate Device: ${predicateDeviceName} (${predicateKNumber})

Comparison Details:
${comparisonDetails}

Note: There are ${majorDeviations} major deviation(s) identified in the comparison.

Please write a well-structured Substantial Equivalence section that:
1. Introduces both devices
2. Compares them across all relevant categories
3. Addresses any deviations identified between the devices
4. Provides a clear conclusion about substantial equivalence
5. Uses appropriate regulatory language and format for a 510(k) submission
6. Includes appropriate headers and sections
7. Maintains a professional, objective tone

The section should be comprehensive and ready to include in a 510(k) submission.
`;
}

/**
 * Check workflow readiness for transitions
 * @route GET /510k/workflow-transition/:fromStep/:toStep
 *
 * Critical endpoint for ensuring safe workflow transitions.
 * Verifies that a transition between workflow steps is valid and can proceed safely.
 * This is especially important for the transition from Predicate Search to Equivalence Analysis.
 */
router.get('/workflow-transition/:fromStep/:toStep', authenticateJWT, async (req, res) => {
  try {
    const { fromStep, toStep } = req.params;
    const { deviceId, organizationId } = req.query;

    // Log request for debugging purposes
    logger.info(
      `Workflow transition check from ${fromStep} to ${toStep} for device ${deviceId}, org: ${organizationId || 'none'}`
    );

    // Ensure user has access to this organization
    if (organizationId && !checkOrganizationAccess(req, organizationId)) {
      return res.status(403).json({ error: 'Unauthorized access to organization data' });
    }

    // Validate parameters
    if (!fromStep || !toStep) {
      return res.status(400).json({ error: 'Both fromStep and toStep parameters are required' });
    }

    // Handle specific transitions
    if (fromStep === 'predicate' && toStep === 'equivalence') {
      // This is the problematic transition we need to fix
      // Check device status before allowing the transition
      try {
        // For a real implementation, we'd query the database to verify
        // that we have all the necessary data for the equivalence step

        // Enhanced logging for debugging this critical transition
        logger.info(`Critical transition check: ${fromStep} → ${toStep} for device ${deviceId}`);

        // Performing a comprehensive database check
        // First verify the device exists and has required profile data
        const { Pool } = require('pg');
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });

        // Log that we're about to query the database
        logger.info(`Querying database for device ${deviceId} validation`);

        // Get device from database
        const deviceResult = await pool.query(
          'SELECT id, device_name, manufacturer, device_class FROM device_profiles WHERE id = $1',
          [deviceId]
        );

        const validDevice = deviceResult.rows.length > 0;
        if (!validDevice) {
          logger.warn(`Device ${deviceId} not found in database`);
        }

        // Check if predicate devices have been selected for this device
        let hasPredicateData = false;
        if (validDevice) {
          const predicateResult = await pool.query(
            'SELECT COUNT(*) FROM predicate_selections WHERE device_id = $1',
            [deviceId]
          );

          hasPredicateData = parseInt(predicateResult.rows[0].count) > 0;
          logger.info(
            `Device ${deviceId} has ${predicateResult.rows[0].count} predicate devices selected`
          );
        }

        if (!validDevice || !hasPredicateData) {
          logger.warn(
            `Transition blocked (${fromStep} → ${toStep}): Invalid device or missing predicate data`
          );
          return res.json({
            canTransition: false,
            message: 'Missing required predicate data for equivalence analysis',
            fromStep,
            toStep,
            deviceId,
            timestamp: new Date().toISOString(),
          });
        }

        // All checks passed, transition can proceed
        logger.info(`Transition approved (${fromStep} → ${toStep}) for device ${deviceId}`);
        return res.json({
          canTransition: true,
          message: 'Ready for transition to equivalence analysis',
          fromStep,
          toStep,
          deviceId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Error checking predicate-to-equivalence transition: ${error.message}`);
        return res.status(500).json({
          canTransition: false,
          message: 'Error checking transition readiness',
          error: error.message,
          fromStep,
          toStep,
          deviceId,
        });
      }
    }

    // For all other transitions, assume they're safe
    return res.json({
      canTransition: true,
      message: 'Transition is allowed',
      fromStep,
      toStep,
      deviceId,
    });
  } catch (error) {
    logger.error(`Workflow transition check error: ${error.message}`);
    return handleApiError(res, error, 'Failed to check workflow transition');
  }
});

module.exports = router;
