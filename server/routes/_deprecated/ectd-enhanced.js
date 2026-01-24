import express from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getTemplate } from '../../client/src/templates/ectd/ectdTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const pool = getPool();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/ectd');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.body.nodeId || 'doc'}-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, and XML files are allowed.'));
    }
  }
});

// Validation schemas
const documentMetadataSchema = z.object({
  nodeId: z.string(),
  fileName: z.string().optional(),
  fileSize: z.string().optional(),
  fileType: z.string().optional(),
  status: z.enum(['template', 'in_progress', 'in_review', 'approved', 'locked', 'checked_out']),
  version: z.string().default('1.0'),
  checkedOutBy: z.string().optional().nullable(),
  lastModifiedBy: z.string().optional(),
});

const documentContentSchema = z.object({
  nodeId: z.string(),
  content: z.string(),
  metadata: documentMetadataSchema.optional(),
});

// GET /api/ectd/unified/tree/:projectId - Get the eCTD tree structure with metadata
router.get('/unified/tree/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Fetch project documents and metadata
    const documentsResult = await pool.query(
      `SELECT d.*, dm.* FROM ectd_documents d
       LEFT JOIN ectd_document_metadata dm ON d.id = dm.document_id
       WHERE d.project_id = $1
       ORDER BY d.node_id`,
      [projectId]
    );
    
    // Build tree structure with metadata
    const treeData = {
      projectId,
      documents: documentsResult.rows.reduce((acc, doc) => {
        acc[doc.node_id] = {
          id: doc.id,
          nodeId: doc.node_id,
          fileName: doc.file_name,
          fileSize: doc.file_size,
          fileType: doc.file_type,
          status: doc.status,
          version: doc.version,
          checkedOutBy: doc.checked_out_by,
          lastModified: doc.updated_at,
          lastModifiedBy: doc.last_modified_by,
          exists: !!doc.file_path,
          hasTemplate: !!doc.template_id,
          locked: doc.is_locked || false,
        };
        return acc;
      }, {})
    };
    
    res.json(treeData);
  } catch (error) {
    console.error('Error fetching eCTD tree:', error);
    res.status(500).json({ error: 'Failed to fetch eCTD tree' });
  }
});

// GET /api/ectd/documents/:documentId - Get document content
router.get('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const result = await pool.query(
      `SELECT d.*, dm.* FROM ectd_documents d
       LEFT JOIN ectd_document_metadata dm ON d.id = dm.document_id
       WHERE d.node_id = $1 OR d.id = $1`,
      [documentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = result.rows[0];
    
    // If document has content in database
    if (document.content) {
      return res.json({
        id: document.id,
        nodeId: document.node_id,
        content: document.content,
        metadata: {
          fileName: document.file_name,
          fileSize: document.file_size,
          fileType: document.file_type,
          status: document.status,
          version: document.version,
          lastModifiedBy: document.last_modified_by,
          lastModified: document.updated_at,
        }
      });
    }
    
    // If document has file path, read from file
    if (document.file_path) {
      const content = await fs.readFile(document.file_path, 'utf-8');
      return res.json({
        id: document.id,
        nodeId: document.node_id,
        content,
        metadata: {
          fileName: document.file_name,
          fileSize: document.file_size,
          fileType: document.file_type,
          status: document.status,
          version: document.version,
          lastModifiedBy: document.last_modified_by,
          lastModified: document.updated_at,
        }
      });
    }
    
    // Otherwise return template
    const template = getTemplate(document.node_id);
    res.json({
      id: document.id,
      nodeId: document.node_id,
      content: template.template,
      isTemplate: true,
      metadata: {
        status: 'template',
        guidance: template.guidance,
        requirements: template.requirements,
      }
    });
    
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST /api/ectd/documents - Create or update document
router.post('/documents', async (req, res) => {
  try {
    const validated = documentContentSchema.parse(req.body);
    const { nodeId, content, metadata } = validated;
    
    // Check if document exists
    const existing = await pool.query(
      'SELECT id FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    let result;
    if (existing.rows.length > 0) {
      // Update existing document
      result = await pool.query(
        `UPDATE ectd_documents 
         SET content = $1, 
             status = $2,
             version = $3,
             last_modified_by = $4,
             updated_at = NOW()
         WHERE node_id = $5
         RETURNING *`,
        [
          content,
          metadata?.status || 'in_progress',
          metadata?.version || '1.0',
          metadata?.lastModifiedBy || 'system',
          nodeId
        ]
      );
    } else {
      // Create new document
      result = await pool.query(
        `INSERT INTO ectd_documents (node_id, content, status, version, last_modified_by, project_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          nodeId,
          content,
          metadata?.status || 'in_progress',
          metadata?.version || '1.0',
          metadata?.lastModifiedBy || 'system',
          req.body.projectId || 'IND-2024-001'
        ]
      );
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

// POST /api/ectd/documents/upload - Upload document file
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const { nodeId, projectId } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Check if document exists
    const existing = await pool.query(
      'SELECT id FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    const fileInfo = {
      fileName: file.originalname,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      fileType: path.extname(file.originalname).substring(1).toUpperCase(),
      filePath: file.path,
    };
    
    let result;
    if (existing.rows.length > 0) {
      // Update existing document
      result = await pool.query(
        `UPDATE ectd_documents 
         SET file_name = $1,
             file_size = $2,
             file_type = $3,
             file_path = $4,
             status = 'in_progress',
             updated_at = NOW()
         WHERE node_id = $5
         RETURNING *`,
        [fileInfo.fileName, fileInfo.fileSize, fileInfo.fileType, fileInfo.filePath, nodeId]
      );
    } else {
      // Create new document record
      result = await pool.query(
        `INSERT INTO ectd_documents 
         (node_id, file_name, file_size, file_type, file_path, status, project_id)
         VALUES ($1, $2, $3, $4, $5, 'in_progress', $6)
         RETURNING *`,
        [nodeId, fileInfo.fileName, fileInfo.fileSize, fileInfo.fileType, fileInfo.filePath, projectId || 'IND-2024-001']
      );
    }
    
    res.json({
      success: true,
      document: result.rows[0],
      message: 'File uploaded successfully'
    });
    
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/ectd/documents/:nodeId/download - Download document
router.get('/documents/:nodeId/download', async (req, res) => {
  try {
    const { nodeId } = req.params;
    
    const result = await pool.query(
      'SELECT file_path, file_name FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].file_path) {
      return res.status(404).json({ error: 'Document file not found' });
    }
    
    const { file_path, file_name } = result.rows[0];
    
    // Check if file exists
    try {
      await fs.access(file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    res.download(file_path, file_name);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// POST /api/ectd/documents/:nodeId/checkout - Check out document
router.post('/documents/:nodeId/checkout', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { userId } = req.body;
    
    // Check if already checked out
    const existing = await pool.query(
      'SELECT checked_out_by FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    if (existing.rows[0]?.checked_out_by) {
      return res.status(409).json({ 
        error: 'Document already checked out',
        checkedOutBy: existing.rows[0].checked_out_by 
      });
    }
    
    const result = await pool.query(
      `UPDATE ectd_documents 
       SET checked_out_by = $1,
           checked_out_at = NOW(),
           is_locked = true,
           status = 'checked_out'
       WHERE node_id = $2
       RETURNING *`,
      [userId || 'current-user', nodeId]
    );
    
    res.json({
      success: true,
      document: result.rows[0],
      message: 'Document checked out successfully'
    });
    
  } catch (error) {
    console.error('Error checking out document:', error);
    res.status(500).json({ error: 'Failed to check out document' });
  }
});

// POST /api/ectd/documents/:nodeId/checkin - Check in document
router.post('/documents/:nodeId/checkin', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { userId, newVersion } = req.body;
    
    // Create version history entry
    await pool.query(
      `INSERT INTO ectd_document_versions (document_id, version, created_by, created_at)
       SELECT id, version, checked_out_by, NOW()
       FROM ectd_documents
       WHERE node_id = $1`,
      [nodeId]
    );
    
    // Check in document
    const result = await pool.query(
      `UPDATE ectd_documents 
       SET checked_out_by = NULL,
           checked_out_at = NULL,
           is_locked = false,
           status = 'in_review',
           version = $1,
           updated_at = NOW()
       WHERE node_id = $2
       RETURNING *`,
      [newVersion || 'INCREMENT', nodeId]
    );
    
    res.json({
      success: true,
      document: result.rows[0],
      message: 'Document checked in successfully'
    });
    
  } catch (error) {
    console.error('Error checking in document:', error);
    res.status(500).json({ error: 'Failed to check in document' });
  }
});

// GET /api/ectd/documents/:nodeId/versions - Get version history
router.get('/documents/:nodeId/versions', async (req, res) => {
  try {
    const { nodeId } = req.params;
    
    const result = await pool.query(
      `SELECT v.*, d.node_id 
       FROM ectd_document_versions v
       JOIN ectd_documents d ON v.document_id = d.id
       WHERE d.node_id = $1
       ORDER BY v.created_at DESC`,
      [nodeId]
    );
    
    res.json({
      versions: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// POST /api/ectd/documents/bulk-download - Bulk download documents
router.post('/documents/bulk-download', async (req, res) => {
  try {
    const { documentIds } = req.body;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'No documents specified' });
    }
    
    // Create a zip file with all documents
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment('ectd-documents.zip');
    archive.pipe(res);
    
    for (const docId of documentIds) {
      const result = await pool.query(
        'SELECT file_path, file_name FROM ectd_documents WHERE node_id = $1',
        [docId]
      );
      
      if (result.rows[0]?.file_path) {
        try {
          await fs.access(result.rows[0].file_path);
          archive.file(result.rows[0].file_path, { name: result.rows[0].file_name });
        } catch (err) {
          console.warn(`File not found: ${result.rows[0].file_path}`);
        }
      }
    }
    
    await archive.finalize();
    
  } catch (error) {
    console.error('Error in bulk download:', error);
    res.status(500).json({ error: 'Failed to download documents' });
  }
});

// POST /api/ectd/export-package - Export entire eCTD package
router.post('/export-package', async (req, res) => {
  try {
    const { projectId, includeAll } = req.body;
    
    const documents = await pool.query(
      `SELECT * FROM ectd_documents 
       WHERE project_id = $1 AND (status = 'approved' OR $2 = true)
       ORDER BY node_id`,
      [projectId, includeAll]
    );
    
    // Generate eCTD XML backbone
    const xmlContent = generateECTDXML(documents.rows);
    
    // Create package structure
    const packageId = Date.now();
    const packageDir = path.join(__dirname, `../../exports/ectd-${packageId}`);
    await fs.mkdir(packageDir, { recursive: true });
    
    // Create module directories and copy files
    for (const doc of documents.rows) {
      const moduleMatch = doc.node_id.match(/module(\d+)/);
      if (moduleMatch) {
        const moduleDir = path.join(packageDir, `m${moduleMatch[1]}`);
        await fs.mkdir(moduleDir, { recursive: true });
        
        if (doc.file_path) {
          const destPath = path.join(moduleDir, doc.file_name || `${doc.node_id}.pdf`);
          await fs.copyFile(doc.file_path, destPath);
        }
      }
    }
    
    // Write backbone XML
    await fs.writeFile(path.join(packageDir, 'index.xml'), xmlContent);
    
    res.json({
      success: true,
      packageId,
      documentCount: documents.rows.length,
      message: 'eCTD package exported successfully'
    });
    
  } catch (error) {
    console.error('Error exporting package:', error);
    res.status(500).json({ error: 'Failed to export package' });
  }
});

// DELETE /api/ectd/documents/:nodeId - Delete document
router.delete('/documents/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    
    // Get file path before deletion
    const fileResult = await pool.query(
      'SELECT file_path FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    // Delete from database
    await pool.query(
      'DELETE FROM ectd_documents WHERE node_id = $1',
      [nodeId]
    );
    
    // Delete physical file if exists
    if (fileResult.rows[0]?.file_path) {
      try {
        await fs.unlink(fileResult.rows[0].file_path);
      } catch (err) {
        console.warn('Could not delete file:', err);
      }
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/ectd/templates/:sectionId - Get template for a section
router.get('/templates/:sectionId', (req, res) => {
  try {
    const { sectionId } = req.params;
    const template = getTemplate(sectionId);
    
    res.json({
      sectionId,
      ...template
    });
    
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/ectd/auto-save - Auto-save document changes
router.post('/auto-save', async (req, res) => {
  try {
    const { projectId, documentStatus, comments } = req.body;
    
    // Save to auto-save table or cache
    await pool.query(
      `INSERT INTO ectd_autosave (project_id, document_status, comments, saved_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id) 
       DO UPDATE SET document_status = $2, comments = $3, saved_at = NOW()`,
      [projectId, JSON.stringify(documentStatus), JSON.stringify(comments)]
    );
    
    res.json({ success: true, message: 'Auto-saved successfully' });
    
  } catch (error) {
    console.error('Error auto-saving:', error);
    res.status(500).json({ error: 'Failed to auto-save' });
  }
});

// Helper function to generate eCTD XML
function generateECTDXML(documents) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" 
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://www.ich.org/ectd">
  <admin>
    <submission-info>
      <submission-id>IND-2024-001</submission-id>
      <submission-type>ind</submission-type>
      <submission-date>${new Date().toISOString()}</submission-date>
    </submission-info>
  </admin>
  <m1-administrative-information-and-prescribing-information>
    ${documents.filter(d => d.node_id.startsWith('module1')).map(d => 
      `<leaf ID="${d.node_id}" operation="new" xlink:href="m1/${d.file_name || d.node_id + '.pdf'}" />`
    ).join('\n    ')}
  </m1-administrative-information-and-prescribing-information>
  <m2-common-technical-document-summaries>
    ${documents.filter(d => d.node_id.startsWith('module2')).map(d => 
      `<leaf ID="${d.node_id}" operation="new" xlink:href="m2/${d.file_name || d.node_id + '.pdf'}" />`
    ).join('\n    ')}
  </m2-common-technical-document-summaries>
  <m3-quality>
    ${documents.filter(d => d.node_id.startsWith('module3')).map(d => 
      `<leaf ID="${d.node_id}" operation="new" xlink:href="m3/${d.file_name || d.node_id + '.pdf'}" />`
    ).join('\n    ')}
  </m3-quality>
  <m4-nonclinical-study-reports>
    ${documents.filter(d => d.node_id.startsWith('module4')).map(d => 
      `<leaf ID="${d.node_id}" operation="new" xlink:href="m4/${d.file_name || d.node_id + '.pdf'}" />`
    ).join('\n    ')}
  </m4-nonclinical-study-reports>
  <m5-clinical-study-reports>
    ${documents.filter(d => d.node_id.startsWith('module5')).map(d => 
      `<leaf ID="${d.node_id}" operation="new" xlink:href="m5/${d.file_name || d.node_id + '.pdf'}" />`
    ).join('\n    ')}
  </m5-clinical-study-reports>
</ectd:ectd>`;
}

export default router;