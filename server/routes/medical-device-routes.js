/**
 * Medical Device API Routes
 *
 * Production-ready endpoints for medical device regulatory submissions
 */

import express from 'express';
import medicalDeviceService from '../services/medicalDeviceService';
import quotaService from '../services/quotaEnforcementService.js';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { authenticateJWT } from '../middleware/auth.js';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';

const router = express.Router();

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/medical-devices');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Middleware to extract organization ID and user ID
const requireOrganization = (req, res, next) => {
  // Ensure user is authenticated first
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get organization ID from authenticated context
  const organizationId =
    req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  // Verify user belongs to the organization (unless admin)
  if (req.user.organizationId && parseInt(req.user.organizationId) !== parseInt(organizationId)) {
    if (!req.user.roles?.includes('admin') && req.user.role !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Access denied: resource belongs to a different organization' });
    }
  }

  req.organizationId = parseInt(organizationId);
  req.userId = req.user.id; // Always use authenticated user ID
  next();
};

// ==================== DEVICE ENDPOINTS ====================

/**
 * Create a new medical device
 */
router.post('/devices', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const device = await medicalDeviceService.createDevice(
      req.organizationId,
      req.body,
      req.userId
    );
    res.json({ success: true, device });
  } catch (error) {
    console.error('Error creating device:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all medical devices
 */
router.get('/devices', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const devices = await medicalDeviceService.getDevices(req.organizationId);
    res.json({ success: true, devices });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a specific medical device
 */
router.get('/devices/:deviceId', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const device = await medicalDeviceService.getDevice(
      req.organizationId,
      parseInt(req.params.deviceId)
    );
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ success: true, device });
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a medical device
 */
router.put('/devices/:deviceId', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const device = await medicalDeviceService.updateDevice(
      req.organizationId,
      parseInt(req.params.deviceId),
      req.body,
      req.userId
    );
    res.json({ success: true, device });
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 510(k) ENDPOINTS ====================

/**
 * Create a new 510(k) submission
 * PRODUCTION: Enforces license submission quotas atomically
 */
router.post('/510k', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    // Use atomic submission creation with quota enforcement
    const { atomicCreateSubmission } = await import('../services/atomicQuotaService.js');
    const result = await atomicCreateSubmission(req.organizationId, {
      type: '510k',
      deviceName: req.body.deviceName || req.body.device_name,
      regulatoryBody: 'FDA',
      status: 'draft',
      metadata: req.body,
    });

    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details,
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    // Now create the actual 510k submission with the reserved quota
    const submission = await medicalDeviceService.create510kSubmission(
      req.organizationId,
      req.body,
      req.userId
    );

    // Include quota usage in response
    res.json({
      success: true,
      submission,
      quotaUsage: result.quotaInfo,
    });
  } catch (error) {
    console.error('Error creating 510(k) submission:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all 510(k) submissions
 */
router.get('/510k', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const submissions = await medicalDeviceService.get510kSubmissions(req.organizationId);
    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Error fetching 510(k) submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a specific 510(k) submission with all details
 */
router.get('/510k/:submissionId', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const submission = await medicalDeviceService.get510kSubmission(
      req.organizationId,
      parseInt(req.params.submissionId)
    );
    if (!submission) {
      return res.status(404).json({ error: '510(k) submission not found' });
    }
    res.json({ success: true, submission });
  } catch (error) {
    console.error('Error fetching 510(k) submission:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a 510(k) submission
 */
router.put('/510k/:submissionId', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const submission = await medicalDeviceService.update510kSubmission(
      req.organizationId,
      parseInt(req.params.submissionId),
      req.body,
      req.userId
    );
    res.json({ success: true, submission });
  } catch (error) {
    console.error('Error updating 510(k) submission:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Validate + sign a 510(k) package. Despite the route name this performs NO
 * transmission to FDA — see medicalDeviceService.submit510kToFDA. The response
 * carries `transmitted: false` and a message saying so; do not present it as a
 * completed agency submission. Real transmission is the gateway path
 * (server/services/submission-gateways), surfaced as Gateway Transmittals.
 */
router.post(
  '/510k/:submissionId/submit',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const result = await medicalDeviceService.submit510kToFDA(
        req.organizationId,
        parseInt(req.params.submissionId),
        req.userId
      );
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error submitting 510(k) to FDA:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== PMA ENDPOINTS ====================

/**
 * Create a new PMA submission
 * PRODUCTION: Enforces license submission quotas atomically
 */
router.post('/pma', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    // Use atomic submission creation with quota enforcement
    const { atomicCreateSubmission } = await import('../services/atomicQuotaService.js');
    const result = await atomicCreateSubmission(req.organizationId, {
      type: 'pma',
      deviceName: req.body.deviceName || req.body.device_name,
      regulatoryBody: 'FDA',
      status: 'draft',
      metadata: req.body,
    });

    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details,
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    // Now create the actual PMA submission with the reserved quota
    const submission = await medicalDeviceService.createPMASubmission(
      req.organizationId,
      req.body,
      req.userId
    );

    // Include quota usage in response
    res.json({
      success: true,
      submission,
      quotaUsage: result.quotaInfo,
    });
  } catch (error) {
    console.error('Error creating PMA submission:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all PMA submissions
 */
router.get('/pma', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const submissions = await medicalDeviceService.getPMASubmissions(req.organizationId);
    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Error fetching PMA submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DOCUMENT ENDPOINTS ====================

/**
 * Upload document for submission
 */
router.post(
  '/:submissionType/:submissionId/documents',
  authenticateJWT,
  requireOrganization,
  upload.single('document'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // SECURITY: magic-byte signature verification + AV scan on the
      // persisted bytes (fail-closed in production). Unlink the temp
      // file on rejection so a rejected upload doesn't linger on disk.
      try {
        await assertUploadSafe(req.file.path, req.file.mimetype, req.file.originalname);
      } catch (safetyErr) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          /* best-effort cleanup */
        }
        if (safetyErr instanceof UploadSafetyError) {
          return res.status(safetyErr.status).json(safetyErr.body);
        }
        throw safetyErr;
      }

      const documentData = {
        documentType: req.body.documentType || 'general',
        documentTitle: req.body.documentTitle || req.file.originalname,
        documentVersion: req.body.documentVersion || '1.0',
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        isRequired: req.body.isRequired === 'true',
      };

      const document = await medicalDeviceService.addSubmissionDocument(
        req.organizationId,
        req.params.submissionType,
        parseInt(req.params.submissionId),
        documentData,
        req.userId
      );

      res.json({ success: true, document });
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get documents for a submission
 */
router.get(
  '/:submissionType/:submissionId/documents',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const documents = await medicalDeviceService.getSubmissionDocuments(
        req.organizationId,
        req.params.submissionType,
        parseInt(req.params.submissionId)
      );
      res.json({ success: true, documents });
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== WORKFLOW ENDPOINTS ====================

/**
 * Get workflow for a submission
 */
router.get(
  '/:submissionType/:submissionId/workflow',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const workflow = await medicalDeviceService.getWorkflow(
        req.organizationId,
        req.params.submissionType,
        parseInt(req.params.submissionId)
      );

      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json({ success: true, workflow });
    } catch (error) {
      console.error('Error fetching workflow:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Update workflow status
 */
router.put(
  '/:submissionType/:submissionId/workflow',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const workflow = await medicalDeviceService.updateWorkflowStatus(
        req.organizationId,
        req.params.submissionType,
        parseInt(req.params.submissionId),
        req.body.status,
        req.userId
      );

      res.json({ success: true, workflow });
    } catch (error) {
      console.error('Error updating workflow:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== CER INTEGRATION ====================

/**
 * Link CER project to medical device
 */
router.post(
  '/devices/:deviceId/cer/:cerProjectId',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const result = await medicalDeviceService.linkCERToDevice(
        req.organizationId,
        parseInt(req.params.cerProjectId),
        parseInt(req.params.deviceId),
        req.userId
      );
      res.json({ success: true, result });
    } catch (error) {
      console.error('Error linking CER to device:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get CER projects for a device
 */
router.get('/devices/:deviceId/cer', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const projects = await medicalDeviceService.getCERProjectsForDevice(
      req.organizationId,
      parseInt(req.params.deviceId)
    );
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching CER projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DOCUMENT GENERATION ====================

/**
 * Generate 510(k) submission document
 */
router.post(
  '/510k/:submissionId/generate',
  authenticateJWT,
  requireOrganization,
  async (req, res) => {
    try {
      const { format = 'PDF' } = req.body;
      const submissionId = parseInt(req.params.submissionId);

      // Import the document generator
      const generator = (await import('../services/fda510kDocumentGenerator.js')).default;

      const result = await generator.generate510kPackage(submissionId, req.organizationId, format);

      res.json({
        success: true,
        message: `510(k) document generated successfully in ${format} format`,
        result,
      });
    } catch (error) {
      console.error('Error generating 510(k) document:', error);
      res.status(500).json({
        error: 'Failed to generate 510(k) document',
        details: error.message,
      });
    }
  }
);

/**
 * LEGACY: Submit 510(k) to FDA — permanently disabled (410 Gone).
 *
 * This handler used to FABRICATE an FDA agency response: it minted a synthetic
 * `ACK<timestamp>` identifier and a synthetic K-number, reported a fabricated
 * "received" status with a 90-day review estimate, answered
 * "510(k) submitted to FDA successfully", and wrote submissionStatus
 * 'submitted' to the database — all with no gateway transport and no
 * environment gate. Every transmit path in this platform fails closed instead
 * (see server/services/ESGSubmissionService.ts), so the fabrication is gone,
 * with NO simulation branch: no environment may hand a user a fake agency
 * receipt. Nothing is sent to FDA here and no submission status is changed.
 *
 * NOTE (zero-duplication, later phase): this same path is also registered
 * earlier in this file (validate + e-sign only, `transmitted: false`), and
 * Express dispatches to that earlier registration. This 410 replaces the
 * fabricating handler so the fabrication cannot reactivate if the earlier
 * registration is ever removed; consolidating the duplicate registration is
 * deferred to the route-cleanup phase.
 *
 * To track a real eSTAR filing honestly, use the eSTAR filing tracker
 * (POST /api/510k/estar/submissions): it records the lifecycle of a filing
 * you make to FDA through official channels — it does not transmit either.
 */
router.post(
  '/510k/:submissionId/submit',
  authenticateJWT,
  requireOrganization,
  (req, res) => {
    return res.status(410).json({
      error: 'FDA_TRANSMISSION_NOT_AVAILABLE',
      message:
        'Direct FDA transmission is not available on this legacy route, in any environment. ' +
        'It previously returned a fabricated FDA agency response without transmitting anything; ' +
        'that behavior has been removed with no simulation fallback. Nothing was sent to FDA ' +
        'and no submission status was changed.',
      transmitted: false,
      trackFilingsAt: 'POST /api/510k/estar/submissions',
      detail:
        'The eSTAR filing tracker records the lifecycle of a filing made to FDA through ' +
        'official channels; it does not transmit to FDA.',
    });
  }
);

// ==================== ANALYTICS ENDPOINTS ====================

/**
 * Get submission statistics for organization
 */
router.get('/analytics/summary', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const [devices, submissions510k, submissionsPMA] = await Promise.all([
      medicalDeviceService.getDevices(req.organizationId),
      medicalDeviceService.get510kSubmissions(req.organizationId),
      medicalDeviceService.getPMASubmissions(req.organizationId),
    ]);

    const summary = {
      totalDevices: devices.length,
      devicesInDevelopment: devices.filter(d => d.regulatoryStatus === 'development').length,
      devicesCleared: devices.filter(d => d.regulatoryStatus === 'cleared').length,
      devicesApproved: devices.filter(d => d.regulatoryStatus === 'approved').length,
      total510k: submissions510k.length,
      active510k: submissions510k.filter(
        s =>
          s.submission.submissionStatus === 'draft' || s.submission.submissionStatus === 'in_review'
      ).length,
      submitted510k: submissions510k.filter(s => s.submission.submissionStatus === 'submitted')
        .length,
      cleared510k: submissions510k.filter(s => s.submission.submissionStatus === 'cleared').length,
      totalPMA: submissionsPMA.length,
      activePMA: submissionsPMA.filter(s => s.submission.submissionStatus === 'draft').length,
      submittedPMA: submissionsPMA.filter(s => s.submission.submissionStatus === 'submitted')
        .length,
    };

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get quota usage statistics for organization
 * PRODUCTION: Real-time license quota tracking
 */
router.get('/analytics/quota-usage', authenticateJWT, requireOrganization, async (req, res) => {
  try {
    const usageStats = await quotaService.getUsageStatistics(req.organizationId);

    if (!usageStats) {
      return res.status(404).json({
        success: false,
        error: 'No active license found for this organization',
      });
    }

    res.json({ success: true, usage: usageStats });
  } catch (error) {
    console.error('Error fetching quota usage:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
