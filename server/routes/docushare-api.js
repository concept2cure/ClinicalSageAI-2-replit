import express from 'express';
import multer from 'multer';
import { authenticateDocuShare, validateTenantAccess } from '../middleware/docushareAuth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// DocuShare Configuration Endpoint
router.get('/config', async (req, res) => {
  try {
    const config = {
      apiUrl: process.env.DOCUSHARE_API_URL,
      version: process.env.DOCUSHARE_API_VERSION,
      features: {
        versioning: process.env.DOCUSHARE_VERSIONING_ENABLED === 'true',
        workflow: process.env.DOCUSHARE_WORKFLOW_ENABLED === 'true',
        encryption: !!process.env.DOCUSHARE_ENCRYPTION_KEY,
        audit: process.env.DOCUSHARE_AUDIT_ENABLED === 'true',
      },
      limits: {
        maxFileSize: parseInt(process.env.DOCUSHARE_MAX_FILE_SIZE || '104857600'),
        allowedExtensions: process.env.DOCUSHARE_ALLOWED_EXTENSIONS?.split(',') || [],
      },
    };

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Configuration retrieval failed' });
  }
});

// Document Upload with OEM Integration
router.post('/upload', upload.single('file'), validateTenantAccess, async (req, res) => {
  try {
    const { file } = req;
    const metadata = JSON.parse(req.body.metadata || '{}');
    const tenantId = req.headers['x-tenant-id'];

    // Validate file
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // DocuShare OEM Upload
    const docuShareResult = await req.app.locals.vaultDmsService.uploadDocument(file, {
      ...metadata,
      tenantId: tenantId,
      uploadedBy: req.user?.id,
      uploadDate: new Date().toISOString(),
    });

    // Store in local database with DocuShare reference
    const dbResult = await req.app.locals.vaultDmsService.createDocumentRecord({
      docuShareId: docuShareResult.docId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      tenantId: tenantId,
      metadata: metadata,
      version: 1,
      status: 'active',
      createdBy: req.user?.id,
    });

    res.json({
      success: true,
      document: {
        id: dbResult.id,
        docuShareId: docuShareResult.docId,
        filename: file.originalname,
        url: docuShareResult.url,
        version: docuShareResult.version,
        metadata: metadata,
      },
    });
  } catch (error) {
    console.error('DocuShare upload error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// Document Search with Tenant Isolation
router.get('/search', validateTenantAccess, async (req, res) => {
  try {
    const { query, limit = 50, sortBy = 'title' } = req.query;
    const tenantId = req.headers['x-tenant-id'];

    const results = await req.app.locals.vaultDmsService.searchDocuments(query, {
      tenantId: tenantId,
      limit: parseInt(limit),
      sortBy: sortBy,
    });

    res.json({
      documents: results,
      totalCount: results.length,
      query: query,
    });
  } catch (error) {
    console.error('DocuShare search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Document Version Management
router.post(
  '/documents/:id/version',
  upload.single('file'),
  validateTenantAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { file } = req;
      const { versionNote } = req.body;

      const versionResult = await req.app.locals.vaultDmsService.createVersion(
        id,
        file,
        versionNote
      );

      res.json({
        success: true,
        version: versionResult,
      });
    } catch (error) {
      console.error('Version creation error:', error);
      res.status(500).json({ error: 'Version creation failed' });
    }
  }
);

// Workflow Management
router.post('/documents/:id/workflow', validateTenantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { workflowType, participants } = req.body;

    const workflowResult = await req.app.locals.vaultDmsService.initiateWorkflow(
      id,
      workflowType,
      participants
    );

    res.json({
      success: true,
      workflow: workflowResult,
    });
  } catch (error) {
    console.error('Workflow initiation error:', error);
    res.status(500).json({ error: 'Workflow initiation failed' });
  }
});

// Audit Logging
router.post('/audit', validateTenantAccess, async (req, res) => {
  try {
    const auditEntry = {
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    };

    await req.app.locals.vaultDmsService.logAuditEntry(auditEntry);

    res.json({ success: true });
  } catch (error) {
    console.error('Audit logging error:', error);
    res.status(500).json({ error: 'Audit logging failed' });
  }
});

export default router;
