/**
 * Document Storage API Routes
 * Handles real file storage and retrieval for the document vault
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import pkg from 'pg';
const { Pool } = pkg;
const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vault_documents (
          id SERIAL PRIMARY KEY,
          document_id VARCHAR(255) UNIQUE NOT NULL,
          title TEXT NOT NULL,
          filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          content_text TEXT,
          ctd_section VARCHAR(50) NOT NULL,
          document_type VARCHAR(20) NOT NULL,
          file_size BIGINT,
          status VARCHAR(50) DEFAULT 'draft',
          version VARCHAR(20) DEFAULT '1.0',
          creator VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          organization_id VARCHAR(255),
          metadata JSONB
      )
    `);

    // Create search index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vault_documents_content_search 
      ON vault_documents USING gin(to_tsvector('english', title || ' ' || COALESCE(content_text, '')))
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vault_documents_ctd_section 
      ON vault_documents(ctd_section)
    `);

    console.log('Document vault database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize on startup
initializeDatabase();

// Ensure documents directory exists
const DOCUMENTS_BASE_PATH = path.join(process.cwd(), 'vault_documents');

// Initialize directory structure
async function ensureDirectoryStructure() {
  try {
    await fs.mkdir(DOCUMENTS_BASE_PATH, { recursive: true });

    // Create CTD module directories
    const ctdModules = [
      'Module_1/1.0_Cover_Letters_Forms',
      'Module_1/1.2_Agency_Correspondence',
      'Module_1/1.3_Labeling',
      'Module_1/1.5_Environmental_Assessment',
      'Module_1/1.6_Financial_Disclosure',
      'Module_1/1.7_Patent_Information',
      'Module_2/2.1_CTD_Table_of_Contents',
      'Module_2/2.3_Quality_Overall_Summary',
      'Module_2/2.4_Nonclinical_Overview',
      'Module_2/2.5_Clinical_Overview',
      'Module_2/2.6_Nonclinical_Summaries',
      'Module_2/2.7_Clinical_Summaries',
      'Module_3/3.2.S_Drug_Substance',
      'Module_3/3.2.P_Drug_Product',
      'Module_3/3.2.A_Appendices',
      'Module_3/3.2.R_Regional_Information',
      'Module_4/4.2.1_Pharmacology',
      'Module_4/4.2.2_Pharmacokinetics',
      'Module_4/4.2.3_Toxicology',
      'Module_5/5.1_Tabular_Listing',
      'Module_5/5.2_Clinical_Study_Reports',
      'Module_5/5.3_Protocols_SAPs',
      'Module_5/5.3.5_ISS_ISE',
      'Module_5/5.5_Case_Report_Forms',
      'Module_5/5.6_Literature_References',
    ];

    for (const moduleDir of ctdModules) {
      await fs.mkdir(path.join(DOCUMENTS_BASE_PATH, moduleDir), { recursive: true });
    }

    console.log('CTD directory structure initialized');
  } catch (error) {
    console.error('Error creating directory structure:', error);
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const { module } = req.body;
    const moduleDir = path.join(DOCUMENTS_BASE_PATH, module || 'Module_1');
    try {
      await fs.mkdir(moduleDir, { recursive: true });
      cb(null, moduleDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word, and text files allowed.'));
    }
  },
});

// Initialize on startup
ensureDirectoryStructure();

// Get all documents in a folder from database
router.get('/folders/:folderId/documents', async (req, res) => {
  try {
    const { folderId } = req.params;

    const result = await pool.query(
      `
      SELECT document_id, title, filename, ctd_section, document_type, 
             file_size, status, version, creator, created_at, updated_at
      FROM vault_documents 
      WHERE ctd_section = $1 
      ORDER BY created_at DESC
    `,
      [folderId]
    );

    const documents = result.rows.map(row => ({
      id: row.document_id,
      name: row.filename,
      title: row.title,
      type: row.document_type,
      size: row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : '0 KB',
      lastModified: new Date(row.updated_at).toLocaleDateString(),
      creator: row.creator || 'System',
      version: row.version || '1.0',
      status: row.status || 'available',
      ctdSection: row.ctd_section,
    }));

    res.json({ documents });
  } catch (error) {
    console.error('Error reading folder:', error);
    res.status(500).json({ error: 'Failed to read folder contents' });
  }
});

// Save document content
router.post('/documents', async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, content, module, type = 'docx' } = req.body;

    if (!title || !content || !module) {
      return res.status(400).json({ error: 'Title, content, and module are required' });
    }

    const moduleDir = path.join(DOCUMENTS_BASE_PATH, module.replace(/\./g, '_'));
    await fs.mkdir(moduleDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.txt`;
    const filePath = path.join(moduleDir, filename);
    const documentId = `${module}_${filename}`;

    // Save content as text file
    await fs.writeFile(filePath, content, 'utf8');

    const stats = await fs.stat(filePath);

    // Check for existing document with same title in same module
    const existingDoc = await client.query(
      `
      SELECT document_id FROM vault_documents 
      WHERE title = $1 AND ctd_section = $2
    `,
      [title, module]
    );

    if (existingDoc.rows.length > 0) {
      // Update existing document instead of creating duplicate
      const updateResult = await client.query(
        `
        UPDATE vault_documents 
        SET content_text = $1, file_path = $2, file_size = $3, updated_at = CURRENT_TIMESTAMP,
            version = CASE 
              WHEN version ~ '^[0-9]+\.[0-9]+$' 
              THEN (substring(version, '^[0-9]+')::int || '.' || (substring(version, '[0-9]+$')::int + 1)::text)
              ELSE '1.1'
            END
        WHERE document_id = $4
        RETURNING *
      `,
        [content, filePath, stats.size, existingDoc.rows[0].document_id]
      );

      documentId = existingDoc.rows[0].document_id;
    } else {
      // Save new document metadata to database
      await client.query(
        `
        INSERT INTO vault_documents 
        (document_id, title, filename, file_path, content_text, ctd_section, document_type, file_size, creator)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [documentId, title, filename, filePath, content, module, type, stats.size, 'Current User']
      );
    }

    const document = {
      id: documentId,
      name: filename,
      title: title,
      type: type,
      size: `${(stats.size / 1024).toFixed(1)} KB`,
      lastModified: stats.mtime.toLocaleDateString(),
      creator: 'Current User',
      version: '1.0',
      status: 'draft',
      path: filePath,
      ctdSection: module,
      content: content,
    };

    res.json({
      success: true,
      document,
      message: 'Document saved to vault and database',
    });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document' });
  } finally {
    client.release();
  }
});

// Get document content from database and file system
router.get('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document metadata from database
    const result = await pool.query(
      `
      SELECT document_id, title, filename, file_path, content_text, 
             ctd_section, document_type, file_size, status, version, creator, 
             created_at, updated_at
      FROM vault_documents 
      WHERE document_id = $1
    `,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found in vault' });
    }

    const docRecord = result.rows[0];

    // Try to read the actual file content
    let content = docRecord.content_text;
    if (docRecord.file_path) {
      try {
        const fileContent = await fs.readFile(docRecord.file_path, 'utf8');
        content = fileContent;
      } catch (fileError) {
        console.warn('Could not read file, using database content:', fileError.message);
        // Fall back to database content if file is missing
      }
    }

    const document = {
      id: docRecord.document_id,
      name: docRecord.filename,
      title: docRecord.title,
      type: docRecord.document_type,
      size: docRecord.file_size ? `${(docRecord.file_size / 1024).toFixed(1)} KB` : '0 KB',
      lastModified: new Date(docRecord.updated_at).toLocaleDateString(),
      creator: docRecord.creator || 'System',
      version: docRecord.version || '1.0',
      status: docRecord.status || 'available',
      ctdSection: docRecord.ctd_section,
      content: content || '',
      path: docRecord.file_path,
    };

    // Log document access for analytics
    await pool.query(
      `
      INSERT INTO vault_document_access (document_id, user_id, access_type, accessed_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `,
      [documentId, 'current_user', 'view']
    );

    // Update last accessed timestamp
    await pool.query(
      `
      UPDATE vault_documents 
      SET last_accessed = CURRENT_TIMESTAMP 
      WHERE document_id = $1
    `,
      [documentId]
    );

    res.json({ document });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Failed to get document from vault' });
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { module } = req.body;
    const stats = await fs.stat(req.file.path);

    const document = {
      id: `${module}_${req.file.filename}`,
      name: req.file.filename,
      originalName: req.file.originalname,
      type: path.extname(req.file.originalname).substring(1),
      size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
      lastModified: stats.mtime.toLocaleDateString(),
      creator: 'Current User',
      version: '1.0',
      status: 'uploaded',
      path: req.file.path,
      ctdSection: module,
    };

    res.json({
      success: true,
      document,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Update document (rename or move)
router.patch('/documents/:documentId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { documentId } = req.params;
    const { title, ctdSection, content } = req.body;

    // Get current document from database
    const currentDoc = await client.query(
      `
      SELECT * FROM vault_documents WHERE document_id = $1
    `,
      [documentId]
    );

    if (currentDoc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = currentDoc.rows[0];
    const updates = [];
    const values = [];
    let valueIndex = 1;

    // Build dynamic update query
    if (title && title !== doc.title) {
      updates.push(`title = $${valueIndex}`);
      values.push(title);
      valueIndex++;
    }

    if (content !== undefined) {
      updates.push(`content_text = $${valueIndex}`);
      values.push(content);
      valueIndex++;

      // Update file content if it exists
      if (doc.file_path) {
        try {
          await fs.writeFile(doc.file_path, content, 'utf8');
        } catch (fileError) {
          console.error('Error updating file content:', fileError);
        }
      }
    }

    if (ctdSection && ctdSection !== doc.ctd_section) {
      updates.push(`ctd_section = $${valueIndex}`);
      values.push(ctdSection);
      valueIndex++;

      // Move file to new directory if CTD section changed
      const oldPath = doc.file_path;
      const newDir = path.join(DOCUMENTS_BASE_PATH, ctdSection.replace(/\./g, '_'));
      await fs.mkdir(newDir, { recursive: true });
      const newPath = path.join(newDir, doc.filename);

      try {
        await fs.rename(oldPath, newPath);
        updates.push(`file_path = $${valueIndex}`);
        values.push(newPath);
        valueIndex++;
      } catch (fileError) {
        console.error('Error moving file:', fileError);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    // Add updated timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(documentId);

    const updateQuery = `
      UPDATE vault_documents 
      SET ${updates.join(', ')} 
      WHERE document_id = $${valueIndex}
      RETURNING *
    `;

    const result = await client.query(updateQuery, values);

    res.json({
      success: true,
      document: result.rows[0],
      message: 'Document updated successfully',
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  } finally {
    client.release();
  }
});

// Delete document from database and file system
router.delete('/documents/:documentId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { documentId } = req.params;

    // Get document info before deletion
    const result = await client.query(
      `
      SELECT file_path FROM vault_documents WHERE document_id = $1
    `,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filePath = result.rows[0].file_path;

    // Delete from database first
    await client.query(
      `
      DELETE FROM vault_documents WHERE document_id = $1
    `,
      [documentId]
    );

    // Then delete the file
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (fileError) {
        console.warn('File already deleted or not found:', fileError.message);
      }
    }

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  } finally {
    client.release();
  }
});

// Search documents using database full-text search
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Use PostgreSQL full-text search
    const result = await pool.query(
      `
      SELECT document_id, title, filename, ctd_section, document_type, 
             file_size, status, version, creator, created_at, updated_at,
             ts_rank(to_tsvector('english', title || ' ' || COALESCE(content_text, '')), 
                     plainto_tsquery('english', $1)) as rank
      FROM vault_documents 
      WHERE to_tsvector('english', title || ' ' || COALESCE(content_text, '')) 
            @@ plainto_tsquery('english', $1)
         OR title ILIKE $2
         OR filename ILIKE $2
      ORDER BY rank DESC, created_at DESC
      LIMIT 50
    `,
      [query, `%${query}%`]
    );

    const searchResults = result.rows.map(row => ({
      id: row.document_id,
      name: row.filename,
      title: row.title,
      type: row.document_type,
      size: row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : '0 KB',
      lastModified: new Date(row.updated_at).toLocaleDateString(),
      creator: row.creator || 'System',
      version: row.version || '1.0',
      status: row.status || 'available',
      ctdSection: row.ctd_section,
      matchType: row.rank > 0 ? 'content' : 'filename',
      relevanceScore: parseFloat(row.rank || 0).toFixed(3),
    }));

    res.json({
      results: searchResults,
      query: query,
      total: searchResults.length,
    });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Export documents as eCTD bundle
router.post('/export', async (req, res) => {
  try {
    const { documentIds, format = 'zip', includeMetadata = true } = req.body;

    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'Document IDs array required' });
    }

    const result = await pool.query(
      `
      SELECT document_id, title, filename, file_path, ctd_section, content_text, 
             document_type, version, creator, created_at
      FROM vault_documents 
      WHERE document_id = ANY($1)
      ORDER BY ctd_section, title
    `,
      [documentIds]
    );

    const exportData = {
      exportDate: new Date().toISOString(),
      format: format,
      totalDocuments: result.rows.length,
      documents: result.rows.map(doc => ({
        id: doc.document_id,
        title: doc.title,
        filename: doc.filename,
        ctdSection: doc.ctd_section,
        documentType: doc.document_type,
        version: doc.version,
        creator: doc.creator,
        createdAt: doc.created_at,
        ...(includeMetadata && {
          content: doc.content_text,
          filePath: doc.file_path,
        }),
      })),
    };

    res.json({
      success: true,
      exportData,
      message: `Successfully exported ${result.rows.length} documents`,
    });
  } catch (error) {
    console.error('Error exporting documents:', error);
    res.status(500).json({ error: 'Failed to export documents' });
  }
});

// Get document analytics
router.get('/analytics', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_documents,
        COUNT(DISTINCT ctd_section) as total_sections,
        AVG(file_size) as avg_file_size,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'final' THEN 1 END) as final_count,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent_updates
      FROM vault_documents
    `);

    const topSections = await pool.query(`
      SELECT ctd_section, COUNT(*) as document_count
      FROM vault_documents
      GROUP BY ctd_section
      ORDER BY document_count DESC
      LIMIT 10
    `);

    const recentActivity = await pool.query(`
      SELECT title, ctd_section, updated_at, creator
      FROM vault_documents
      WHERE updated_at > NOW() - INTERVAL '30 days'
      ORDER BY updated_at DESC
      LIMIT 20
    `);

    res.json({
      statistics: stats.rows[0],
      topSections: topSections.rows,
      recentActivity: recentActivity.rows,
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get document analytics' });
  }
});

export default router;
