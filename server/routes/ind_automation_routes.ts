import express from 'express';
import { indAutomationService, Module3Data, ProjectMetadata } from '../ind-automation-service';
import logger from '../utils/logger';
import axios from 'axios';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// User preferences file path
const PREFERENCES_DIR = path.join(process.cwd(), 'data');
const PREFERENCES_FILE = path.join(PREFERENCES_DIR, 'alert_preferences.json');

// Helper function to ensure data directory exists
const ensureDataDirectory = () => {
  if (!fs.existsSync(PREFERENCES_DIR)) {
    fs.mkdirSync(PREFERENCES_DIR, { recursive: true });
  }
};

// Create HTTP clients with longer timeout
const httpClient = axios.create({
  httpAgent: new http.Agent({ timeout: 60000 }),
  httpsAgent: new https.Agent({ timeout: 60000 }),
  timeout: 60000, // 60 seconds timeout
});

const sendModuleDocument = async (
  moduleNumber: 1 | 2 | 3 | 4 | 5,
  req: express.Request,
  res: express.Response,
  defaultName: string
) => {
  try {
    const data = req.body as ProjectMetadata;
    const documentBytes = await indAutomationService.generateModuleDocument(moduleNumber, data);
    const safeDrugName = (data.drug_name || defaultName).replace(/\s+/g, '_');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Module${moduleNumber}_${safeDrugName}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating Module ${moduleNumber} document: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: `Failed to generate Module ${moduleNumber} document: ${error.message}`,
    });
  }
};

/**
 * GET /api/ind-automation/status
 * Check if the IND Automation service is running
 */
router.get('/status', async (req, res) => {
  try {
    const isRunning = await indAutomationService.isServiceRunning();
    if (isRunning) {
      res.json({ status: 'operational', message: 'IND Automation service is running' });
    } else {
      // Try to start the service
      const started = await indAutomationService.startService();
      if (started) {
        res.json({ status: 'starting', message: 'IND Automation service has been started' });
      } else {
        res
          .status(503)
          .json({ status: 'error', message: 'Failed to start IND Automation service' });
      }
    }
  } catch (error) {
    logger.error(`Error checking IND Automation service status: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to check service status' });
  }
});

/**
 * GET /api/ind-automation/info
 * Get information about the IND Automation service
 */
router.get('/info', async (req, res) => {
  try {
    const info = await indAutomationService.getServiceInfo();
    res.json(info);
  } catch (error) {
    logger.error(`Error getting IND Automation service info: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to get service information' });
  }
});

/**
 * GET /api/ind-automation/projects
 * List available projects from Benchling
 */
router.get('/projects', async (req, res) => {
  try {
    const projects = await indAutomationService.listProjects();
    res.json({ projects });
  } catch (error) {
    logger.error(`Error listing projects: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to list projects' });
  }
});

/**
 * GET /api/ind-automation/:projectId/module3
 * Generate and download a Module 3 document for a project
 */
router.get('/:projectId/module3', async (req, res) => {
  try {
    const { projectId } = req.params;
    logger.info(`Generating Module 3 document for project ${projectId}`);

    // Get the document URL from the service
    const documentUrl = await indAutomationService.generateModule3Document(projectId);

    // Proxy the request to the Python service
    try {
      const response = await httpClient.get(documentUrl, {
        responseType: 'stream',
      });

      // Forward the headers and stream the response
      res.set(response.headers);
      response.data.pipe(res);
    } catch (error) {
      if (error.response) {
        // The service returned an error response
        const status = error.response.status;
        const message = error.response.data ? error.response.data.message : error.message;
        res.status(status).json({ status: 'error', message });
      } else {
        // Network error or other issue
        logger.error(`Error downloading Module 3 document: ${error.message}`);
        res.status(500).json({ status: 'error', message: 'Failed to download document' });
      }
    }
  } catch (error) {
    logger.error(`Error generating Module 3 document: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate document: ${error.message}` });
  }
});

/**
 * POST /api/ind-automation/generate/module3
 * Generate a Module 3 document from provided data
 */
router.post('/generate/module3', async (req, res) => {
  try {
    const data = req.body as Module3Data;

    if (
      !data.drug_name ||
      !data.manufacturing_site ||
      !data.batch_number ||
      !data.specifications ||
      !data.stability_data
    ) {
      return res.status(400).json({
        status: 'error',
        message:
          'Missing required fields. Please provide drug_name, manufacturing_site, batch_number, specifications, and stability_data.',
      });
    }

    logger.info(`Generating Module 3 document for drug ${data.drug_name}`);

    // Generate the document
    const documentBytes = await indAutomationService.generateModule3FromData(data);

    // Set headers and send response
    const filename = data.drug_name.replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Module3_CMC_${filename}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating Module 3 document from data: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate document: ${error.message}` });
  }
});

router.post('/generate/module1', async (req, res) => {
  await sendModuleDocument(1, req, res, 'IND_Admin');
});

router.post('/generate/module2', async (req, res) => {
  await sendModuleDocument(2, req, res, 'IND_Summaries');
});

router.post('/generate/module4', async (req, res) => {
  await sendModuleDocument(4, req, res, 'IND_Nonclinical');
});

router.post('/generate/module5', async (req, res) => {
  await sendModuleDocument(5, req, res, 'IND_Clinical');
});

/**
 * POST /api/ind-automation/batch/module3
 * Generate multiple Module 3 documents in batch mode
 */
router.post('/batch/module3', async (req, res) => {
  try {
    const { projectIds } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide an array of project IDs',
      });
    }

    logger.info(`Processing batch request for ${projectIds.length} documents`);

    // Process the batch
    const results = await indAutomationService.batchGenerateModule3(projectIds);

    res.json(results);
  } catch (error) {
    logger.error(`Error processing batch request: ${error.message}`);
    res.status(500).json({ status: 'error', message: `Failed to process batch: ${error.message}` });
  }
});

/**
 * POST /api/ind-automation/generate/form1571
 * Generate FDA Form 1571 (Investigational New Drug Application)
 */
router.post('/generate/form1571', async (req, res) => {
  try {
    const data = req.body as ProjectMetadata;

    if (!data.sponsor_name || !data.drug_name || !data.phase) {
      return res.status(400).json({
        status: 'error',
        message:
          'Missing required fields. Please provide at minimum sponsor_name, drug_name, and phase.',
      });
    }

    logger.info(`Generating FDA Form 1571 for drug ${data.drug_name}`);

    // Generate the document
    const documentBytes = await indAutomationService.generateForm1571(data);

    // Set headers and send response
    const filename = data.drug_name.replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="FDA_Form_1571_${filename}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating FDA Form 1571: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate Form 1571: ${error.message}` });
  }
});

/**
 * POST /api/ind-automation/generate/form1572
 * Generate FDA Form 1572 (Statement of Investigator)
 */
router.post('/generate/form1572', async (req, res) => {
  try {
    const data = req.body as ProjectMetadata;

    if (!data.principal_investigator_name || !data.drug_name || !data.protocol_number) {
      return res.status(400).json({
        status: 'error',
        message:
          'Missing required fields. Please provide at minimum principal_investigator_name, drug_name, and protocol_number.',
      });
    }

    logger.info(`Generating FDA Form 1572 for investigator ${data.principal_investigator_name}`);

    // Generate the document
    const documentBytes = await indAutomationService.generateForm1572(data);

    // Set headers and send response
    const filename = (data.principal_investigator_name || data.drug_name).replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="FDA_Form_1572_${filename}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating FDA Form 1572: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate Form 1572: ${error.message}` });
  }
});

/**
 * POST /api/ind-automation/generate/form3674
 * Generate FDA Form 3674 (Certification of Compliance with ClinicalTrials.gov)
 */
router.post('/generate/form3674', async (req, res) => {
  try {
    const data = req.body as ProjectMetadata;

    if (!data.drug_name || !data.sponsor_name) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields. Please provide at minimum drug_name and sponsor_name.',
      });
    }

    logger.info(`Generating FDA Form 3674 for drug ${data.drug_name}`);

    // Generate the document
    const documentBytes = await indAutomationService.generateForm3674(data);

    // Set headers and send response
    const filename = data.drug_name.replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="FDA_Form_3674_${filename}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating FDA Form 3674: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate Form 3674: ${error.message}` });
  }
});

/**
 * POST /api/ind-automation/generate/cover-letter
 * Generate a cover letter for IND submission
 */
router.post('/generate/cover-letter', async (req, res) => {
  try {
    const data = req.body as ProjectMetadata;

    if (!data.sponsor_name || !data.drug_name) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields. Please provide at minimum sponsor_name and drug_name.',
      });
    }

    logger.info(`Generating cover letter for drug ${data.drug_name}`);

    // Generate the document
    const documentBytes = await indAutomationService.generateCoverLetter(data);

    // Set headers and send response
    const filename = data.drug_name.replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Cover_Letter_${filename}.docx"`,
      'Content-Length': documentBytes.length,
    });

    res.send(documentBytes);
  } catch (error) {
    logger.error(`Error generating cover letter: ${error.message}`);
    res
      .status(500)
      .json({ status: 'error', message: `Failed to generate cover letter: ${error.message}` });
  }
});

/**
 * GET /api/ind-automation/alert-preferences
 * Get alert preferences for the current user
 */
router.get('/alert-preferences', (req, res) => {
  try {
    ensureDataDirectory();

    // Default preferences if file doesn't exist
    const defaultPreferences = {
      email: true,
      teams: false,
      warning_alerts: true,
      error_alerts: true,
      userId: 'default',
      lastUpdated: new Date().toISOString(),
    };

    // Check if preferences file exists
    if (!fs.existsSync(PREFERENCES_FILE)) {
      fs.writeFileSync(
        PREFERENCES_FILE,
        JSON.stringify(
          {
            users: { default: defaultPreferences },
          },
          null,
          2
        )
      );
      return res.json(defaultPreferences);
    }

    // Read and return preferences
    const fileContent = fs.readFileSync(PREFERENCES_FILE, 'utf8');
    const preferences = JSON.parse(fileContent);
    const userId = 'default';

    if (!preferences.users[userId]) {
      preferences.users[userId] = defaultPreferences;
      fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));
    }

    res.json(preferences.users[userId]);
  } catch (error) {
    logger.error(`Error retrieving alert preferences: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve alert preferences' });
  }
});

/**
 * POST /api/ind-automation/alert-preferences
 * Update alert preferences for the current user
 */
router.post('/alert-preferences', (req, res) => {
  try {
    ensureDataDirectory();

    const { email, teams, warning_alerts, error_alerts } = req.body;
    const userId = req.user?.id || 'default';

    // Validate input
    if (
      typeof email !== 'boolean' ||
      typeof teams !== 'boolean' ||
      typeof warning_alerts !== 'boolean' ||
      typeof error_alerts !== 'boolean'
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid preferences format. All fields must be boolean values.',
      });
    }

    // Create or update preferences
    let preferences = { users: {} };

    if (fs.existsSync(PREFERENCES_FILE)) {
      const fileContent = fs.readFileSync(PREFERENCES_FILE, 'utf8');
      preferences = JSON.parse(fileContent);
    }

    preferences.users[userId] = {
      email,
      teams,
      warning_alerts,
      error_alerts,
      userId,
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));

    // Send updated preferences to Python service for real-time updates
    try {
      httpClient.post('/api/alerter/update-preferences', preferences.users[userId]);
      logger.info(`Alert preferences updated for user ${userId}`);
    } catch (apiError) {
      logger.warn(`Failed to sync preferences with Python service: ${apiError.message}`);
      // Continue anyway - file-based preferences are primary
    }

    res.json({
      status: 'success',
      message: 'Alert preferences updated successfully',
      preferences: preferences.users[userId],
    });
  } catch (error) {
    logger.error(`Error updating alert preferences: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to update alert preferences' });
  }
});

/**
 * POST /api/ind-automation/alert-test
 * Send a test alert to verify alert channels
 */
router.post('/alert-test', async (req, res) => {
  try {
    const userId = req.user?.id || 'default';
    logger.info(`Sending test alert for user ${userId}`);

    // Read preferences
    let preferences = { email: true, teams: false };

    if (fs.existsSync(PREFERENCES_FILE)) {
      const fileContent = fs.readFileSync(PREFERENCES_FILE, 'utf8');
      const preferencesData = JSON.parse(fileContent);
      if (preferencesData.users && preferencesData.users[userId]) {
        preferences = preferencesData.users[userId];
      }
    }

    // Send test alert
    try {
      await httpClient.post('/api/alerter/send-test', {
        userId,
        message: 'This is a test alert from LumenTrialGuide.AI',
        preferences,
      });

      res.json({
        status: 'success',
        message: 'Test alert sent successfully',
      });
    } catch (apiError) {
      logger.error(`Failed to send test alert: ${apiError.message}`);
      res.status(500).json({
        status: 'error',
        message: `Failed to send test alert: ${apiError.response?.data?.message || apiError.message}`,
      });
    }
  } catch (error) {
    logger.error(`Error in alert test: ${error.message}`);
    res.status(500).json({ status: 'error', message: 'Failed to send test alert' });
  }
});

export default router;
