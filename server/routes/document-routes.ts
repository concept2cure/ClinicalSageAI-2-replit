import { Router, type Request } from 'express';
import { eq } from 'drizzle-orm';
import { storage } from '../storage';
import { z } from 'zod';
import {
  insertDocumentSchema,
  insertDocumentFolderSchema,
  documentVersions,
} from '@shared/schema';
import { getDb } from '../db/tenantDbHelper';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
// documentPreview stub removed — was a placeholder with no functionality
import { randomUUID } from 'crypto';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('document-routes');

/**
 * Fire-and-forget document-access audit. 21 CFR Part 11 §11.10(e)
 * requires every view of regulated content to be logged. Treat audit-
 * write failures as non-fatal so a transient pipeline issue never
 * blocks a legitimate download.
 */
async function auditDocumentAccess(
  req: Request,
  orgId: number,
  documentId: string,
  action: 'document_download' | 'document_view',
): Promise<void> {
  try {
    const user = (req as any).user;
    await auditService.logAction({
      tenantId: orgId,
      userId: user?.id ?? user?.userId,
      action,
      resourceType: 'document',
      resourceId: documentId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { route: req.path },
    });
  } catch (err) {
    logger.warn('Document-access audit write failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
      action,
      documentId,
    });
  }
}
// Use cryptographically secure UUID for regulatory document identifiers
const uuidv4 = () => randomUUID();

const router = Router();

// Setup multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueFilename = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  },
});

// SECURITY: Restrict file types and enforce size limits for regulatory submissions
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/xml', 'text/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain', 'text/csv',
  'image/png', 'image/jpeg', 'image/tiff',
]);

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max per FDA ESG guidelines
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed. Accepted: PDF, DOCX, XLSX, XML, CSV, TXT, PNG, JPEG, TIFF.`));
    }
  },
});

// Get all documents with optional filtering
router.get('/', async (req, res) => {
  try {
    const { type, status, search, folderId, limit, offset } = req.query;

    const options: any = {};
    if (limit) options.limit = Number(limit);
    if (offset) options.offset = Number(offset);
    if (type) options.type = String(type);
    if (status) options.status = String(status);
    if (search) options.search = String(search);
    if (folderId) options.folderId = String(folderId);

    const documents = await storage.getDocuments(options);

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get a single document by ID.
//
// SECURITY: storage.getDocument now requires an organizationId — the
// helper sources it from the JWT (req.user) and refuses with 403 if
// no tenant context is present. Foreign-tenant documents come back
// as `undefined` from storage and surface here as 404 (existence
// not enumerable).
router.get('/:id', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { id } = req.params;
    const document = await storage.getDocument(id, guard.orgId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Audit document view — 21 CFR Part 11 §11.10(e) requires every
    // read of regulated content to be logged.
    await auditDocumentAccess(req, guard.orgId, id, 'document_view');

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Create a new document
router.post('/', async (req, res) => {
  try {
    // Validate request body using Zod schema
    const documentData = insertDocumentSchema.parse(req.body);

    // Create document in storage
    const document = await storage.createDocument(documentData);

    res.status(201).json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid document data', details: error.errors });
    }

    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Upload a document file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get document data from request
    const documentDataStr = req.body.data;
    if (!documentDataStr) {
      return res.status(400).json({ error: 'No document data provided' });
    }

    let documentData;
    try {
      documentData = JSON.parse(documentDataStr);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid document data format' });
    }

    // Add file information to document data
    const enhancedDocumentData = {
      ...documentData,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      filePath: file.path,
    };

    // Validate document data
    const validatedData = insertDocumentSchema.parse(enhancedDocumentData);

    // Create document in storage
    const document = await storage.createDocument(validatedData);

    res.status(201).json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid document data', details: error.errors });
    }

    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Update a document. Tenant gate first: the existence check uses the
// JWT-bound getDocument so a foreign-tenant id is indistinguishable
// from "not found", and the update PK lookup in storage is then on a
// known-in-scope id.
router.patch('/:id', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { id } = req.params;

    const existingDocument = await storage.getDocument(id, guard.orgId);
    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update document in storage
    const updatedDocument = await storage.updateDocument(id, req.body);

    res.json(updatedDocument);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete a document — same tenant gate as PATCH.
router.delete('/:id', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { id } = req.params;

    const existingDocument = await storage.getDocument(id, guard.orgId);
    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete document from storage
    const result = await storage.deleteDocument(id);

    res.json({ success: result });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Download a document
router.get('/:id/download', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { id } = req.params;

    // Tenant-scoped fetch — a foreign-tenant document is "not found".
    // Without this, a download URL with a guessed id could serve
    // another tenant's file content (the worst class of leak here).
    const document = await storage.getDocument(id, guard.orgId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Audit BEFORE serving the bytes. 21 CFR Part 11 requires the
    // download to be recorded even if the response stream later
    // fails — the user requested it, that's the event.
    await auditDocumentAccess(req, guard.orgId, id, 'document_download');

    // File bytes / content live on the current document version, not on the
    // document row. Load the current version to source filePath and content.
    const currentVersion = document.currentVersionId
      ? (
          await getDb(req)
            .select()
            .from(documentVersions)
            .where(eq(documentVersions.id, document.currentVersionId))
            .limit(1)
        )[0]
      : undefined;

    // Derive a download filename from the document title and version mime type.
    const extFromMime = currentVersion?.mimeType?.split('/')[1];
    const fileName = `${document.title || `document-${id}`}${extFromMime ? `.${extFromMime}` : '.pdf'}`;

    // If the current version has a filePath, send the file
    if (currentVersion?.filePath && fs.existsSync(currentVersion.filePath)) {
      return res.download(currentVersion.filePath, fileName);
    }

    // For versions with content but no file, generate an HTML file
    if (currentVersion?.content) {
      // This is a simplified example - in a real app, you'd use a PDF generation library
      const htmlContent = generateHtmlFromDocument({
        ...document,
        content: currentVersion.content,
      });

      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${document.title || 'document'}.html"`
      );
      return res.send(htmlContent);
    }

    // If no file or content is available
    res.status(404).json({ error: 'Document content not available for download' });
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Get all folders
router.get('/folders', async (req, res) => {
  try {
    const { parentId } = req.query;

    const options: any = {};
    if (parentId !== undefined) {
      options.parentId = parentId === 'null' ? null : String(parentId);
    }

    const folders = await storage.getFolders(options);

    res.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create a new folder
router.post('/folders', async (req, res) => {
  try {
    // Validate request body using Zod schema
    const folderData = insertDocumentFolderSchema.parse(req.body);

    // Create folder in storage
    const folder = await storage.createFolder(folderData);

    res.status(201).json(folder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid folder data', details: error.errors });
    }

    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Helper function to generate HTML from document content
function generateHtmlFromDocument(document: any): string {
  let content = '';

  // Generate HTML content from the document's sections
  if (document.content?.sections && document.content.sections.length > 0) {
    content = document.content.sections
      .map((section: any) => {
        return `
        <div style="margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 20px;">${section.title}</h2>
          <p style="margin-bottom: 10px;">${section.content}</p>
        </div>
      `;
      })
      .join('');
  } else {
    // Fallback if no sections are available
    content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 20px;">${document.name}</h2>
        <p style="margin-bottom: 10px;">${document.description || ''}</p>
      </div>
    `;
  }

  // Create full HTML document
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${document.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; }
        h1 { color: #1c1917; }
        h2 { color: #333; margin-top: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .metadata { color: #666; font-size: 12px; margin-bottom: 30px; border: 1px solid #eee; padding: 10px; background: #f9f9f9; }
        .content { margin-bottom: 20px; }
        .footer { border-top: 1px solid #eee; padding-top: 10px; font-size: 10px; color: #999; }
        .watermark { position: fixed; top: 50%; left: 0; width: 100%; text-align: center; opacity: 0.1; transform: rotate(-45deg); font-size: 120px; z-index: -1; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-approved { background: #e6f4ea; color: #137333; }
        .status-draft { background: #fff8e6; color: #b06000; }
      </style>
    </head>
    <body>
      ${document.status === 'draft' ? '<div class="watermark">DRAFT</div>' : ''}
      
      <div class="header">
        <h1>${document.name}</h1>
        <div class="status ${document.status === 'approved' ? 'status-approved' : 'status-draft'}">
          ${document.status?.toUpperCase() || 'DRAFT'}
        </div>
      </div>
      
      <div class="metadata">
        <div><strong>Version:</strong> ${document.version || '1.0.0'}</div>
        <div><strong>Author:</strong> ${document.author || 'Unknown'}</div>
        <div><strong>Last Modified:</strong> ${new Date(document.modified_at || document.dateModified || Date.now()).toLocaleDateString()}</div>
        <div><strong>Document ID:</strong> ${document.id}</div>
        ${document.tags && document.tags.length > 0 ? `<div><strong>Tags:</strong> ${document.tags.join(', ')}</div>` : ''}
      </div>
      
      <div class="content">
        ${content}
      </div>
      
      <div class="footer">
        Generated by Concept2Cure Document System on ${new Date().toLocaleDateString()}
      </div>
    </body>
    </html>
  `;
}

// documentPreview sub-router removed (was a stub)

export default router;
