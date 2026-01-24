/**
 * FDA Integration API Routes
 * 
 * Production-ready endpoints for FDA electronic submissions and data retrieval
 * Supports 510(k), PMA, De Novo, and other regulatory submissions
 */

import express from 'express';
import fdaIntegrationService from '../services/fdaIntegrationService.js';
import medicalDeviceService from '../services/medicalDeviceService.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure file upload for submission documents
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/fda-submissions/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.xml', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  }
});

/**
 * Validate FDA credentials and certificates
 */
router.post('/validate-credentials', async (req, res) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    const validation = await fdaIntegrationService.validateCredentials(organizationId);
    
    res.json(validation);
  } catch (error) {
    console.error('Error validating FDA credentials:', error);
    res.status(500).json({ 
      error: 'Failed to validate FDA credentials',
      message: error.message 
    });
  }
});

/**
 * Search openFDA for device information
 */
router.get('/search/device', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Search query required' 
      });
    }

    const results = await fdaIntegrationService.searchDevice(query, parseInt(limit));
    
    res.json(results);
  } catch (error) {
    console.error('Error searching openFDA:', error);
    res.status(500).json({ 
      error: 'Failed to search openFDA',
      message: error.message 
    });
  }
});

/**
 * Get UDI information from FDA Global UDI Database
 */
router.get('/udi/:udi', async (req, res) => {
  try {
    const { udi } = req.params;
    
    const udiInfo = await fdaIntegrationService.getUDIInformation(udi);
    
    res.json(udiInfo);
  } catch (error) {
    console.error('Error retrieving UDI information:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve UDI information',
      message: error.message 
    });
  }
});

/**
 * Get predicate devices for 510(k) submission
 */
router.get('/predicates/:productCode', async (req, res) => {
  try {
    const { productCode } = req.params;
    const { limit = 5 } = req.query;
    
    const predicates = await fdaIntegrationService.getPredicateDevices(
      productCode, 
      parseInt(limit)
    );
    
    res.json(predicates);
  } catch (error) {
    console.error('Error retrieving predicate devices:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve predicate devices',
      message: error.message 
    });
  }
});

/**
 * Package 510(k) submission for FDA ESG
 */
router.post('/package/510k/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    const submissionPackage = await fdaIntegrationService.package510kSubmission(
      parseInt(submissionId), 
      parseInt(organizationId)
    );
    
    res.json(submissionPackage);
  } catch (error) {
    console.error('Error packaging 510(k) submission:', error);
    res.status(500).json({ 
      error: 'Failed to package 510(k) submission',
      message: error.message 
    });
  }
});

/**
 * Package PMA submission for FDA ESG
 */
router.post('/package/pma/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    // Use similar logic as 510(k) but with PMA-specific requirements
    const submissionPackage = await fdaIntegrationService.packagePMASubmission(
      parseInt(submissionId), 
      parseInt(organizationId)
    );
    
    res.json(submissionPackage);
  } catch (error) {
    console.error('Error packaging PMA submission:', error);
    res.status(500).json({ 
      error: 'Failed to package PMA submission',
      message: error.message 
    });
  }
});

/**
 * Submit package to FDA Electronic Submission Gateway
 */
router.post('/submit', async (req, res) => {
  try {
    const { submissionPackage } = req.body;
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    if (!submissionPackage) {
      return res.status(400).json({ 
        error: 'Submission package required' 
      });
    }

    const result = await fdaIntegrationService.submitToFDA(
      submissionPackage, 
      parseInt(organizationId)
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error submitting to FDA:', error);
    res.status(500).json({ 
      error: 'Failed to submit to FDA',
      message: error.message 
    });
  }
});

/**
 * Check submission status
 */
router.get('/status/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    const status = await fdaIntegrationService.checkSubmissionStatus(
      trackingId, 
      parseInt(organizationId)
    );
    
    res.json(status);
  } catch (error) {
    console.error('Error checking submission status:', error);
    res.status(500).json({ 
      error: 'Failed to check submission status',
      message: error.message 
    });
  }
});

/**
 * Upload submission documents
 */
router.post('/documents/upload', upload.array('documents', 50), async (req, res) => {
  try {
    const { submissionId, submissionType } = req.body;
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId;
    const userId = req.headers['x-user-id'] || req.body.userId || 'system';
    
    if (!organizationId || !submissionId || !submissionType) {
      return res.status(400).json({ 
        error: 'Organization ID, submission ID, and submission type required' 
      });
    }

    const uploadedDocs = [];
    for (const file of req.files) {
      const doc = await medicalDeviceService.addSubmissionDocument({
        submissionId: parseInt(submissionId),
        submissionType,
        documentType: req.body.documentType || 'supporting',
        title: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        checksum: null, // Calculate if needed
        uploadedBy: userId,
        organizationId: parseInt(organizationId)
      });
      uploadedDocs.push(doc);
    }
    
    res.json({
      success: true,
      message: `${uploadedDocs.length} documents uploaded successfully`,
      documents: uploadedDocs
    });
  } catch (error) {
    console.error('Error uploading submission documents:', error);
    res.status(500).json({ 
      error: 'Failed to upload submission documents',
      message: error.message 
    });
  }
});

/**
 * Generate 510(k) submission report
 */
router.get('/report/510k/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    // Get submission data
    const submission = await medicalDeviceService.get510kSubmission(
      parseInt(submissionId), 
      parseInt(organizationId)
    );

    if (!submission) {
      return res.status(404).json({ 
        error: '510(k) submission not found' 
      });
    }

    // Generate comprehensive report
    const report = {
      submissionNumber: submission.submissionNumber,
      status: submission.submissionStatus,
      device: submission.deviceInfo,
      applicant: submission.applicantInfo,
      predicates: submission.predicateDevices,
      testingResults: submission.testingResults,
      clearanceDate: submission.clearanceDate,
      fdaComments: submission.fdaComments,
      timeline: {
        created: submission.createdAt,
        submitted: submission.submittedAt,
        lastUpdated: submission.updatedAt
      }
    };
    
    res.json(report);
  } catch (error) {
    console.error('Error generating 510(k) report:', error);
    res.status(500).json({ 
      error: 'Failed to generate 510(k) report',
      message: error.message 
    });
  }
});

/**
 * Test FDA connectivity
 */
router.get('/test/connectivity', async (req, res) => {
  try {
    const test = await fdaIntegrationService.testFDAConnectivity();
    res.json(test);
  } catch (error) {
    console.error('Error testing FDA connectivity:', error);
    res.status(500).json({ 
      error: 'Failed to test FDA connectivity',
      message: error.message 
    });
  }
});

/**
 * Get FDA integration logs
 */
router.get('/logs', async (req, res) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    const { limit = 100, offset = 0 } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'Organization ID required' 
      });
    }

    const logs = await medicalDeviceService.getIntegrationLogs(
      parseInt(organizationId),
      parseInt(limit),
      parseInt(offset)
    );
    
    res.json(logs);
  } catch (error) {
    console.error('Error retrieving FDA integration logs:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve FDA integration logs',
      message: error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'FDA Integration Service',
    version: '1.0.0',
    endpoints: [
      '/validate-credentials',
      '/search/device',
      '/udi/:udi',
      '/predicates/:productCode',
      '/package/510k/:submissionId',
      '/package/pma/:submissionId',
      '/submit',
      '/status/:trackingId',
      '/documents/upload',
      '/report/510k/:submissionId',
      '/test/connectivity',
      '/logs'
    ]
  });
});

export default router;