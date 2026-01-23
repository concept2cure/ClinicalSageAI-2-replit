/**
 * Submission Routes - Server-side API routes for Gateway Submission to FDA ESG and EMA CESP
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { promisify } from 'util';

const router = express.Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

router.use((req, res, next) => {
  if (!isDemoMode()) {
    return res.status(501).json({
      success: false,
      error: 'Submission gateway simulation requires DEMO_MODE=true',
    });
  }
  next();
});

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/submission');

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use original filename with timestamp to avoid collisions
    const filename = `${Date.now()}-${file.originalname}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

/**
 * Submit to FDA Electronic Submissions Gateway (ESG)
 *
 * @route POST /api/submission/esg
 * @param {File} req.file - Submission package file
 * @param {Object} req.body - Submission metadata
 * @returns {Object} - Submission result
 */
router.post('/esg', upload.single('file'), async (req, res) => {
  try {
    console.log('Submitting to FDA ESG');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    console.log(`File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log('Submission metadata:', req.body);

    // In a real implementation, we would call the FDA ESG API
    // For now, we'll simulate submission with a mock response

    // Extract metadata
    const {
      submissionType = 'Original',
      applicationType = 'NDA',
      applicationNumber = '',
      sponsorName = '',
      productName = '',
      contactEmail = '',
    } = req.body;

    // Validate required fields
    if (!sponsorName || !productName || !contactEmail) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required metadata fields: sponsorName, productName, and contactEmail are required',
      });
    }

    // Generate a submission ID
    const submissionId = `ESG-${Date.now()}`;

    // Simulate submission process
    setTimeout(() => {
      console.log(`Simulated FDA ESG submission complete for ${submissionId}`);
    }, 2000);

    res.json({
      success: true,
      submissionId,
      gateway: 'FDA ESG',
      status: 'submitted',
      file: {
        name: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
      },
      metadata: {
        submissionType,
        applicationType,
        applicationNumber,
        sponsorName,
        productName,
        contactEmail,
        submittedAt: new Date().toISOString(),
      },
      trackingInfo: {
        receiptId: `ESG-RCPT-${Math.floor(Math.random() * 1000000)}`,
        estimatedProcessingTime: '24-48 hours',
        statusCheckUrl: `/api/submission/status/${submissionId}`,
      },
    });
  } catch (error) {
    console.error('Error submitting to FDA ESG:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit to FDA ESG',
    });
  }
});

/**
 * Submit to EMA Common European Submission Platform (CESP)
 *
 * @route POST /api/submission/cesp
 * @param {File} req.file - Submission package file
 * @param {Object} req.body - Submission metadata
 * @returns {Object} - Submission result
 */
router.post('/cesp', upload.single('file'), async (req, res) => {
  try {
    console.log('Submitting to EMA CESP');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    console.log(`File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log('Submission metadata:', req.body);

    // In a real implementation, we would call the EMA CESP API
    // For now, we'll simulate submission with a mock response

    // Extract metadata
    const {
      procedureType = 'Centralised',
      procedureNumber = '',
      marketingAuthorizationHolder = '',
      productName = '',
      substanceName = '',
      contactEmail = '',
    } = req.body;

    // Validate required fields
    if (!marketingAuthorizationHolder || !productName || !contactEmail) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required metadata fields: marketingAuthorizationHolder, productName, and contactEmail are required',
      });
    }

    // Generate a submission ID
    const submissionId = `CESP-${Date.now()}`;

    // Simulate submission process
    setTimeout(() => {
      console.log(`Simulated EMA CESP submission complete for ${submissionId}`);
    }, 2000);

    res.json({
      success: true,
      submissionId,
      gateway: 'EMA CESP',
      status: 'submitted',
      file: {
        name: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
      },
      metadata: {
        procedureType,
        procedureNumber,
        marketingAuthorizationHolder,
        productName,
        substanceName,
        contactEmail,
        submittedAt: new Date().toISOString(),
      },
      trackingInfo: {
        deliveryId: `CESP-DEL-${Math.floor(Math.random() * 1000000)}`,
        estimatedProcessingTime: '24 hours',
        statusCheckUrl: `/api/submission/status/${submissionId}`,
      },
    });
  } catch (error) {
    console.error('Error submitting to EMA CESP:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit to EMA CESP',
    });
  }
});

/**
 * Check submission status
 *
 * @route GET /api/submission/status/:submissionId
 * @param {string} req.params.submissionId - Submission ID
 * @returns {Object} - Submission status
 */
router.get('/status/:submissionId', (req, res) => {
  try {
    const { submissionId } = req.params;

    console.log(`Checking status for submission ${submissionId}`);

    // In a real implementation, we would check the status with the gateway
    // For now, return a mock status

    // Determine gateway type from submission ID
    const gateway = submissionId.startsWith('ESG') ? 'FDA ESG' : 'EMA CESP';

    // Simulate status check
    const statuses = ['received', 'processing', 'accepted', 'rejected'];
    // Use last digit of submission ID to determine status for consistent responses
    const lastDigit = parseInt(submissionId.slice(-1), 10);
    const statusIndex = lastDigit % statuses.length;
    const status = statuses[statusIndex];

    let details = {};

    if (status === 'accepted') {
      details = {
        acceptanceDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        reviewAssignedDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        acknowledgementId: `ACK-${submissionId}`,
        nextSteps:
          'No further action required. You will be contacted if additional information is needed.',
      };
    } else if (status === 'rejected') {
      details = {
        rejectionDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        rejectionReason: 'Technical validation failed - see validation report',
        validationReport: 'Electronic validation identified issues with section references',
        nextSteps: 'Please correct the issues and resubmit',
      };
    } else if (status === 'processing') {
      details = {
        receivedDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        estimatedCompletionTime: '12 hours',
        currentStage: 'Technical validation',
        progress: '65%',
      };
    } else {
      // received
      details = {
        receivedDate: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        queuePosition: 3,
        estimatedStartTime: '2 hours',
        receiptId: `RCPT-${submissionId}`,
      };
    }

    res.json({
      success: true,
      submissionId,
      gateway,
      status,
      lastUpdated: new Date().toISOString(),
      details,
    });
  } catch (error) {
    console.error(`Error checking status for submission ${req.params.submissionId}:`, error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check submission status',
    });
  }
});

/**
 * Get submission history
 *
 * @route GET /api/submission/history
 * @param {string} req.query.productName - Filter by product name
 * @param {string} req.query.gateway - Filter by gateway (ESG or CESP)
 * @returns {Object} - Submission history
 */
router.get('/history', (req, res) => {
  try {
    const { productName, gateway } = req.query;

    console.log(`Getting submission history: productName=${productName}, gateway=${gateway}`);

    // In a real implementation, we would query the database
    // For now, return a mock history

    // Generate mock submissions
    const mockSubmissions = [
      {
        submissionId: 'ESG-1733591234567',
        gateway: 'FDA ESG',
        status: 'accepted',
        file: {
          name: 'NDA-12345-original-submission.zip',
          size: 256789012,
        },
        metadata: {
          submissionType: 'Original',
          applicationType: 'NDA',
          applicationNumber: '12345',
          sponsorName: 'Acme Pharma',
          productName: 'Acme Drug',
          contactEmail: 'regulatory@acmepharma.com',
          submittedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        },
      },
      {
        submissionId: 'CESP-1733593456789',
        gateway: 'EMA CESP',
        status: 'accepted',
        file: {
          name: 'AcmeDrug-MAA-original.zip',
          size: 198765432,
        },
        metadata: {
          procedureType: 'Centralised',
          procedureNumber: 'EMEA/H/C/123456',
          marketingAuthorizationHolder: 'Acme Pharma Europe',
          productName: 'Acme Drug',
          substanceName: 'Acmecillin',
          contactEmail: 'regulatory.eu@acmepharma.com',
          submittedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
        },
      },
      {
        submissionId: 'ESG-1733596789012',
        gateway: 'FDA ESG',
        status: 'rejected',
        file: {
          name: 'NDA-12345-amendment.zip',
          size: 123456789,
        },
        metadata: {
          submissionType: 'Amendment',
          applicationType: 'NDA',
          applicationNumber: '12345',
          sponsorName: 'Acme Pharma',
          productName: 'Acme Drug',
          contactEmail: 'regulatory@acmepharma.com',
          submittedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
        },
      },
      {
        submissionId: 'ESG-1733597890123',
        gateway: 'FDA ESG',
        status: 'accepted',
        file: {
          name: 'NDA-12345-amendment-corrected.zip',
          size: 134567890,
        },
        metadata: {
          submissionType: 'Amendment',
          applicationType: 'NDA',
          applicationNumber: '12345',
          sponsorName: 'Acme Pharma',
          productName: 'Acme Drug',
          contactEmail: 'regulatory@acmepharma.com',
          submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        },
      },
      {
        submissionId: 'CESP-1733599012345',
        gateway: 'EMA CESP',
        status: 'processing',
        file: {
          name: 'AcmeDrug-Variation-Type2.zip',
          size: 145678901,
        },
        metadata: {
          procedureType: 'Centralised',
          procedureNumber: 'EMEA/H/C/123456/II/0001',
          marketingAuthorizationHolder: 'Acme Pharma Europe',
          productName: 'Acme Drug',
          substanceName: 'Acmecillin',
          contactEmail: 'regulatory.eu@acmepharma.com',
          submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        },
      },
    ];

    // Filter submissions
    let filteredSubmissions = mockSubmissions;

    if (productName) {
      filteredSubmissions = filteredSubmissions.filter(s =>
        s.metadata.productName.toLowerCase().includes(productName.toLowerCase())
      );
    }

    if (gateway) {
      filteredSubmissions = filteredSubmissions.filter(s =>
        s.gateway.toLowerCase().includes(gateway.toLowerCase())
      );
    }

    res.json({
      success: true,
      submissions: filteredSubmissions,
      total: filteredSubmissions.length,
    });
  } catch (error) {
    console.error('Error getting submission history:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get submission history',
    });
  }
});

export default router;
