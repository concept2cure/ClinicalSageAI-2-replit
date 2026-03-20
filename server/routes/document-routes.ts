import { Router } from 'express';
import { storage } from '../storage';
import { z } from 'zod';
import { insertDocumentSchema, insertDocumentFolderSchema } from '@shared/schema';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import documentPreviewRouter from './documentPreview';
import { randomUUID } from 'crypto';
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

// Get a single document by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await storage.getDocument(id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

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

// Update a document
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get existing document to ensure it exists
    const existingDocument = await storage.getDocument(id);
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

// Delete a document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get existing document to ensure it exists
    const existingDocument = await storage.getDocument(id);
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
    const { id } = req.params;

    // Get document to ensure it exists
    const document = await storage.getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If the document has a filePath, send the file
    if (document.filePath && fs.existsSync(document.filePath)) {
      return res.download(document.filePath, document.fileName || `document-${id}.pdf`);
    }

    // For documents with content but no file, generate a PDF or HTML file
    if (document.content) {
      // This is a simplified example - in a real app, you'd use a PDF generation library
      const htmlContent = generateHtmlFromDocument(document);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${document.name || 'document'}.html"`
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
        h1 { color: #d97757; }
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

// Mount document preview sub-router
router.use('/', documentPreviewRouter);

export default router;
