/**
 * @file vault-dms.js
 * @description Unified Vault DMS routes with resilient filesystem fallback.
 *
 * Supports:
 * - User/org scoped listing and search
 * - Project/workflow metadata filters
 * - Upload + orchestration-driven save
 * - Version and audit retrieval
 * - Inline view endpoint for text-based assets
 */
import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });
const FALLBACK_ROOT = path.join(process.cwd(), 'storage', 'vault-fallback');

const ensureDir = async dir => {
  await fs.mkdir(dir, { recursive: true });
};

const safeOrgId = orgId => String(orgId || 1).replace(/[^a-zA-Z0-9_-]/g, '_');
const safeProjectId = projectId => String(projectId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');

const getOrgIndexPath = orgId => path.join(FALLBACK_ROOT, safeOrgId(orgId), 'index.json');

const readOrgIndex = async orgId => {
  const indexPath = getOrgIndexPath(orgId);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.documents) ? parsed : { documents: [] };
  } catch {
    return { documents: [] };
  }
};

const writeOrgIndex = async (orgId, payload) => {
  const indexPath = getOrgIndexPath(orgId);
  await ensureDir(path.dirname(indexPath));
  await fs.writeFile(indexPath, JSON.stringify(payload, null, 2), 'utf8');
};

const contentTypeFromFilename = filename => {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.txt' || ext === '.md') return 'text/plain';
  if (ext === '.json') return 'application/json';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
};

const parseJsonSafe = (raw, fallbackValue = {}) => {
  if (!raw) return fallbackValue;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

const normalizeTags = tags => {
  if (Array.isArray(tags)) return tags.map(tag => String(tag).trim()).filter(Boolean);
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }
  return [];
};

const withAudit = (document, action, userId, details = {}) => ({
  ...document,
  auditTrail: [
    ...(document.auditTrail || []),
    {
      id: crypto.randomUUID(),
      action,
      userId: userId || null,
      at: new Date().toISOString(),
      details,
    },
  ],
});

const fallbackVaultDmsService = {
  async listDocuments(organizationId, filters = {}) {
    const { documents } = await readOrgIndex(organizationId);
    return documents.filter(doc => {
      if (filters.projectId && String(doc.projectId || '') !== String(filters.projectId)) return false;
      if (filters.status && String(doc.status || '') !== String(filters.status)) return false;
      if (filters.workflowRunId && String(doc.workflowRunId || '') !== String(filters.workflowRunId)) {
        return false;
      }
      if (filters.userId && String(doc.userId || '') !== String(filters.userId)) return false;
      return true;
    });
  },

  async searchDocuments(organizationId, term, filters = {}) {
    const all = await this.listDocuments(organizationId, filters);
    const q = String(term || '').toLowerCase();
    return all.filter(doc => {
      const searchable = [
        doc.title,
        doc.name,
        doc.category,
        doc.type,
        doc.status,
        ...(Array.isArray(doc.tags) ? doc.tags : []),
        JSON.stringify(doc.metadata || {}),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
  },

  async getDocumentById(organizationId, id) {
    const { documents } = await readOrgIndex(organizationId);
    return documents.find(doc => Number(doc.id) === Number(id)) || null;
  },

  async createDocument(organizationId, documentData = {}, file) {
    const index = await readOrgIndex(organizationId);
    const now = new Date().toISOString();
    const id = index.documents.length ? Math.max(...index.documents.map(d => Number(d.id) || 0)) + 1 : 1;

    const rawTitle = documentData.title || documentData.name || file?.originalname || `Document ${id}`;
    const title = String(rawTitle);
    const projectId = documentData.projectId || documentData.project_id || 'general';
    const workflowRunId = documentData.workflowRunId || documentData.workflow_run_id || null;

    const fileDir = path.join(FALLBACK_ROOT, safeOrgId(organizationId), safeProjectId(projectId), String(id));
    await ensureDir(fileDir);

    let filePath = null;
    let fileSize = 0;
    let fileType = file?.mimetype || documentData.fileType || contentTypeFromFilename(title);
    let checksum = null;

    if (file?.buffer) {
      const fileName = file.originalname || title;
      filePath = path.join(fileDir, fileName);
      await fs.writeFile(filePath, file.buffer);
      fileSize = file.size || file.buffer.length;
      checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    } else if (documentData.content) {
      const ext = path.extname(title) || '.txt';
      const fileName = `${title.replace(/\s+/g, '_')}${ext.startsWith('.') ? '' : '.'}${ext}`;
      filePath = path.join(fileDir, fileName);
      const contentBuffer = Buffer.from(String(documentData.content), 'utf8');
      await fs.writeFile(filePath, contentBuffer);
      fileSize = contentBuffer.length;
      checksum = crypto.createHash('sha256').update(contentBuffer).digest('hex');
      if (!documentData.fileType) {
        fileType = contentTypeFromFilename(fileName);
      }
    }

    const createdDoc = {
      id,
      organizationId,
      title,
      name: title,
      type: documentData.type || 'vault',
      category: documentData.category || 'regulatory',
      status: documentData.status || 'draft',
      version: documentData.version || '1.0',
      projectId,
      workflowRunId,
      orchestrationStep: documentData.orchestrationStep || null,
      ctdSection: documentData.ctdSection || null,
      sourceModule: documentData.sourceModule || null,
      userId: documentData.userId || null,
      uploadedBy: documentData.userEmail || documentData.userId || 'system',
      tags: Array.isArray(documentData.tags)
        ? documentData.tags
        : normalizeTags(documentData.tags),
      metadata: parseJsonSafe(documentData.metadata, {}),
      createdAt: now,
      updatedAt: now,
      file_path: filePath,
      fileSize,
      fileType,
      checksum,
      versions: [
        {
          version: documentData.version || '1.0',
          createdAt: now,
          userId: documentData.userId || null,
          file_path: filePath,
          checksum,
        },
      ],
      auditTrail: [],
    };

    index.documents.push(withAudit(createdDoc, 'document.created', documentData.userId, { projectId }));
    await writeOrgIndex(organizationId, index);
    return createdDoc;
  },

  async updateDocumentMetadata(organizationId, id, updates = {}) {
    const index = await readOrgIndex(organizationId);
    const target = index.documents.find(doc => Number(doc.id) === Number(id));
    if (!target) return null;

    if (updates.version && updates.version !== target.version) {
      target.versions = [
        ...(target.versions || []),
        {
          version: updates.version,
          createdAt: new Date().toISOString(),
          userId: updates.userId || null,
          file_path: target.file_path,
          checksum: target.checksum || null,
        },
      ];
    }

    Object.assign(target, {
      ...updates,
      metadata: {
        ...(target.metadata || {}),
        ...parseJsonSafe(updates.metadata, {}),
      },
      updatedAt: new Date().toISOString(),
    });

    const audited = withAudit(target, 'document.updated', updates.userId, {
      updatedFields: Object.keys(updates),
    });
    Object.assign(target, audited);

    await writeOrgIndex(organizationId, index);
    return target;
  },

  async deleteDocument(organizationId, id) {
    const index = await readOrgIndex(organizationId);
    const before = index.documents.length;
    index.documents = index.documents.filter(doc => Number(doc.id) !== Number(id));
    if (index.documents.length === before) return false;
    await writeOrgIndex(organizationId, index);
    return true;
  },

  async getVersions(organizationId, id) {
    const doc = await this.getDocumentById(organizationId, id);
    return doc?.versions || [];
  },

  async getAuditTrail(organizationId, id) {
    const doc = await this.getDocumentById(organizationId, id);
    return doc?.auditTrail || [];
  },

  async saveVersion(organizationId, id, versionInput = {}, file) {
    const index = await readOrgIndex(organizationId);
    const target = index.documents.find(doc => Number(doc.id) === Number(id));
    if (!target) return null;

    const now = new Date().toISOString();
    const nextVersion =
      versionInput.version || `${(parseFloat(target.version || '1.0') + 0.1).toFixed(1)}`;
    const projectId = target.projectId || 'general';
    const fileDir = path.join(FALLBACK_ROOT, safeOrgId(organizationId), safeProjectId(projectId), String(id));
    await ensureDir(fileDir);

    let filePath = target.file_path || null;
    let fileType = target.fileType || 'application/octet-stream';
    let checksum = target.checksum || null;
    let fileSize = target.fileSize || 0;

    if (file?.buffer) {
      filePath = path.join(fileDir, file.originalname || target.title || `document-${id}`);
      await fs.writeFile(filePath, file.buffer);
      fileType = file.mimetype || fileType;
      fileSize = file.size || file.buffer.length;
      checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    } else if (versionInput.content || versionInput.base64Content) {
      const fileBuffer = versionInput.base64Content
        ? Buffer.from(versionInput.base64Content, 'base64')
        : Buffer.from(String(versionInput.content), 'utf8');
      const fileName = versionInput.fileName || `${target.title || `document-${id}`}.txt`;
      filePath = path.join(fileDir, fileName);
      await fs.writeFile(filePath, fileBuffer);
      fileType = versionInput.fileType || contentTypeFromFilename(fileName);
      fileSize = fileBuffer.length;
      checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    target.version = nextVersion;
    target.file_path = filePath;
    target.fileType = fileType;
    target.fileSize = fileSize;
    target.checksum = checksum;
    target.updatedAt = now;
    target.versions = [
      ...(target.versions || []),
      {
        version: nextVersion,
        createdAt: now,
        userId: versionInput.userId || null,
        file_path: filePath,
        checksum,
        note: versionInput.note || null,
      },
    ];
    Object.assign(
      target,
      withAudit(target, 'document.version_saved', versionInput.userId, {
        version: nextVersion,
        note: versionInput.note || null,
      })
    );

    await writeOrgIndex(organizationId, index);
    return target;
  },
};

const resolveVaultService = req => req.app.locals.vaultDmsService || fallbackVaultDmsService;

// Middleware to log access and ensure Vault service is available
router.use((req, res, next) => {
  console.log(`[Vault API] Request received for: ${req.method} ${req.originalUrl}`);
  next();
});

// AUTHENTICATION + TENANT CONTEXT MIDDLEWARE
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.organizationId =
        decoded?.organizationId ||
        decoded?.orgId ||
        req.headers['x-organization-id'] ||
        req.query.organizationId ||
        1;
      req.userId = decoded?.userId || decoded?.sub || req.headers['x-user-id'] || null;
      req.userEmail = decoded?.email || null;
      return next();
    } catch (error) {
      console.error('Auth token validation failed:', error.message);
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }
  }

  // Non-Bearer fallback path for integrated internal modules and local development
  req.organizationId =
    req.headers['x-organization-id'] ||
    req.query.organizationId ||
    req.body?.organizationId ||
    req.user?.organizationId ||
    1;
  req.userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId || req.user?.id || null;
  req.userEmail = req.user?.email || req.body?.userEmail || null;

  next();
};

// Apply auth/context to all routes
router.use(authenticate);

const normalizeDocumentInput = (payload = {}) => {
  const title = payload.title || payload.name;
  return {
    ...payload,
    title,
    type: payload.type || 'vault',
    status: payload.status || 'draft',
  };
};

const extractListFilters = req => ({
  projectId: req.query.projectId || req.query.project_id,
  userId: req.query.userId || req.query.user_id,
  status: req.query.status,
  workflowRunId: req.query.workflowRunId || req.query.workflow_run_id,
});

router.get('/health', async (req, res) => {
  const usingFallback = !req.app.locals.vaultDmsService;
  return res.json({
    ok: true,
    mode: usingFallback ? 'fallback-filesystem' : 'service',
    organizationId: req.organizationId,
  });
});

// GET /api/vault - List all documents
router.get('/', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documents = await vaultService.listDocuments(req.organizationId, extractListFilters(req));
    res.status(200).json(documents);
  } catch (error) {
    console.error('[Vault API] Error in GET / route:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// LIST DOCUMENTS (alias)
router.get('/documents', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documents = await vaultService.listDocuments(req.organizationId, extractListFilters(req));
    res.json(documents);
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/vault/search/:term - Search for documents
router.get('/search/:term', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const { term } = req.params;

    if (!term || term.trim().length === 0) {
      return res.status(400).json({ error: 'Search term is required.' });
    }

    const documents = await vaultService.searchDocuments(
      req.organizationId,
      term,
      extractListFilters(req)
    );

    res.status(200).json(documents);
  } catch (error) {
    console.error(`[Vault API] Error in GET /search/${req.params.term} route:`, error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// GET /api/vault/search?q=term - compatibility query search endpoint
router.get('/search', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const term = req.query.q || req.query.query || '';
    if (!String(term).trim()) {
      return res.status(200).json([]);
    }
    const documents = await vaultService.searchDocuments(
      req.organizationId,
      String(term),
      extractListFilters(req)
    );
    return res.status(200).json(documents);
  } catch (error) {
    console.error('Search query endpoint error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/vault/projects/:projectId/documents - project scoped retrieval
router.get('/projects/:projectId/documents', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documents = await vaultService.listDocuments(req.organizationId, {
      ...extractListFilters(req),
      projectId: req.params.projectId,
    });
    return res.status(200).json(documents);
  } catch (error) {
    console.error('Project document retrieval error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/vault/workflows/:workflowRunId/documents - orchestration scoped retrieval
router.get('/workflows/:workflowRunId/documents', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documents = await vaultService.listDocuments(req.organizationId, {
      ...extractListFilters(req),
      workflowRunId: req.params.workflowRunId,
    });
    return res.status(200).json(documents);
  } catch (error) {
    console.error('Workflow document retrieval error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/vault/document/:id - Retrieve a specific document
router.get('/document/:id', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentId = parseInt(req.params.id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID format.' });
    }
    const document = await vaultService.getDocumentById(req.organizationId, documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    res.status(200).json(document);
  } catch (error) {
    console.error(`[Vault API] Error in GET /document/${req.params.id} route:`, error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// GET DOCUMENT (alias)
router.get('/documents/:id', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const document = await vaultService.getDocumentById(req.organizationId, Number(req.params.id));

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/vault/documents/:id/view - Inline view payload for text-like docs
router.get('/documents/:id/view', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const document = await vaultService.getDocumentById(req.organizationId, Number(req.params.id));

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const response = {
      id: document.id,
      title: document.title,
      fileType: document.fileType,
      status: document.status,
      version: document.version,
      projectId: document.projectId,
      workflowRunId: document.workflowRunId,
      metadata: document.metadata || {},
      viewMode: 'binary',
      content: null,
      downloadUrl: `/api/vault/documents/${document.id}/download`,
    };

    if (document.file_path && ['text/plain', 'application/json', 'text/csv'].includes(document.fileType)) {
      const content = await fs.readFile(document.file_path, 'utf8');
      response.viewMode = 'inline';
      response.content = content;
    }

    return res.json(response);
  } catch (error) {
    console.error('View document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/vault/documents/:id/link-context - attach project/workflow/user linkage
router.post('/documents/:id/link-context', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentId = Number(req.params.id);
    const existing = await vaultService.getDocumentById(req.organizationId, documentId);
    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const updates = {
      projectId: req.body.projectId ?? existing.projectId ?? null,
      workflowRunId: req.body.workflowRunId ?? existing.workflowRunId ?? null,
      orchestrationStep: req.body.orchestrationStep ?? existing.orchestrationStep ?? null,
      sourceModule: req.body.sourceModule ?? existing.sourceModule ?? null,
      ctdSection: req.body.ctdSection ?? existing.ctdSection ?? null,
      metadata: {
        ...(existing.metadata || {}),
        ...(parseJsonSafe(req.body.metadata, {})),
      },
    };

    const updated = await vaultService.updateDocumentMetadata(req.organizationId, documentId, {
      ...updates,
      userId: req.userId,
    });

    return res.status(200).json({
      success: true,
      message: 'Document linked to user/project/workflow context',
      document: updated,
    });
  } catch (error) {
    console.error('Link context error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/vault - Create a new document with a file upload
router.post('/', upload.single('document'), async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentData = normalizeDocumentInput({
      ...req.body,
      userId: req.userId,
      userEmail: req.userEmail,
    });
    const newDocument = await vaultService.createDocument(
      req.organizationId,
      documentData,
      req.file
    );
    res.status(201).json(newDocument);
  } catch (error) {
    console.error('[Vault API] Error in POST / route:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// CREATE DOCUMENT (alias)
router.post('/documents', upload.single('document'), async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentData = normalizeDocumentInput({
      ...req.body,
      userId: req.userId,
      userEmail: req.userEmail,
    });
    const result = await vaultService.createDocument(req.organizationId, documentData, req.file);

    res.status(201).json(result);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/vault/orchestration/save - Save generated artifacts directly to Vault
router.post('/orchestration/save', upload.single('document'), async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const {
      title,
      content,
      base64Content,
      projectId,
      workflowRunId,
      orchestrationStep,
      ctdSection,
      sourceModule,
      tags,
      metadata,
      category,
      status,
      fileType,
      fileName,
    } = req.body;

    if (!title && !fileName) {
      return res.status(400).json({ error: 'title or fileName is required' });
    }

    let uploadedFile = req.file;
    if (!uploadedFile && (content || base64Content)) {
      const fileBuffer = base64Content
        ? Buffer.from(base64Content, 'base64')
        : Buffer.from(String(content), 'utf8');
      uploadedFile = {
        buffer: fileBuffer,
        originalname: fileName || `${title || 'orchestrated-document'}.txt`,
        mimetype: fileType || 'text/plain',
        size: fileBuffer.length,
      };
    }

    const normalized = normalizeDocumentInput({
      title: title || fileName,
      category: category || 'orchestrated',
      type: 'orchestration',
      status: status || 'draft',
      projectId,
      workflowRunId,
      orchestrationStep,
      ctdSection,
      sourceModule,
      tags:
        typeof tags === 'string'
          ? tags
              .split(',')
              .map(tag => tag.trim())
              .filter(Boolean)
          : tags,
      metadata: parseJsonSafe(metadata, {}),
      userId: req.userId,
      userEmail: req.userEmail,
    });

    const saved = await vaultService.createDocument(req.organizationId, normalized, uploadedFile);
    return res.status(201).json({
      success: true,
      message: 'Orchestration artifact saved to vault',
      document: saved,
    });
  } catch (error) {
    console.error('Orchestration save error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/vault/documents/:id/save-version - explicit regulated version save
router.post('/documents/:id/save-version', upload.single('document'), async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentId = Number(req.params.id);
    const existing = await vaultService.getDocumentById(req.organizationId, documentId);
    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (typeof vaultService.saveVersion === 'function') {
      const updated = await vaultService.saveVersion(
        req.organizationId,
        documentId,
        {
          version: req.body.version,
          note: req.body.note || req.body.changeDescription,
          content: req.body.content,
          base64Content: req.body.base64Content,
          fileName: req.body.fileName,
          fileType: req.body.fileType,
          userId: req.userId,
        },
        req.file
      );
      return res.status(200).json({ success: true, document: updated });
    }

    const fallbackVersion =
      req.body.version || `${(parseFloat(existing.version || '1.0') + 0.1).toFixed(1)}`;
    const updated = await vaultService.updateDocumentMetadata(req.organizationId, documentId, {
      version: fallbackVersion,
      userId: req.userId,
      metadata: {
        ...(existing.metadata || {}),
        versionNote: req.body.note || req.body.changeDescription || null,
      },
    });
    return res.status(200).json({ success: true, document: updated });
  } catch (error) {
    console.error('Save version error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DOWNLOAD (alias)
router.get('/documents/:id/download', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const document = await vaultService.getDocumentById(req.organizationId, Number(req.params.id));

    if (!document || !document.file_path) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      await fs.access(document.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(document.file_path, document.title || document.name);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// VERSION HISTORY (alias)
router.get('/documents/:id/versions', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const versions = await vaultService.getVersions(req.organizationId, Number(req.params.id));
    res.json(versions);
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AUDIT TRAIL (alias)
router.get('/documents/:id/audit', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const audit = await vaultService.getAuditTrail(req.organizationId, Number(req.params.id));
    res.json(audit);
  } catch (error) {
    console.error('Get audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/vault/document/:id - Update a document's metadata
router.patch('/document/:id', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentId = parseInt(req.params.id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID format.' });
    }

    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No update fields provided.' });
    }

    const updatedDocument = await vaultService.updateDocumentMetadata(
      req.organizationId,
      documentId,
      {
        ...updates,
        userId: req.userId,
      }
    );
    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.status(200).json(updatedDocument);
  } catch (error) {
    console.error(`[Vault API] Error in PATCH /document/${req.params.id} route:`, error);

    if (error.message?.includes('Invalid field provided for update')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// DELETE /api/vault/document/:id - Delete a document
router.delete('/document/:id', async (req, res) => {
  try {
    const vaultService = resolveVaultService(req);
    const documentId = parseInt(req.params.id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID format.' });
    }

    const wasDeleted = await vaultService.deleteDocument(req.organizationId, documentId);
    if (!wasDeleted) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(`[Vault API] Error in DELETE /document/${req.params.id} route:`, error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

export default router;
