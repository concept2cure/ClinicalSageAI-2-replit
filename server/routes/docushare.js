import { Router } from 'express';
import * as ds from '../services/docushare.js';
import prisma from '../prisma/client.js';
import multer from 'multer';
import { Readable } from 'stream';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Enhanced DocuShare API routes
 *
 * Provides a comprehensive set of endpoints for document management,
 * with support for metadata, filtering, versioning, and audit trails.
 */

// GET /api/docs/list - List documents with filtering
router.get('/docs/list', async (req, res, next) => {
  try {
    const { folder, studyId, indId, trialPhase, module, documentType } = req.query;

    const options = {
      studyId,
      indId,
      trialPhase,
      module,
      documentType,
    };

    const docs = await ds.list(folder || '/IND', options);
    res.json(docs);
  } catch (err) {
    console.error('Error listing documents:', err);
    next(err);
  }
});

// GET /api/docs/search - Search documents
router.get('/docs/search', async (req, res, next) => {
  try {
    const { query, limit = 50 } = req.query;

    // In a production environment, this would use a search index
    // For now, use simulated search in development
    const allDocs = await ds.list('/IND');
    const filteredDocs = allDocs
      .filter(
        doc => doc.type === 'document' && doc.name.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, parseInt(limit));

    res.json(filteredDocs);
  } catch (err) {
    console.error('Error searching documents:', err);
    next(err);
  }
});

// POST /api/docs/upload - Upload document with metadata
router.post('/docs/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { buffer, originalname: filename } = req.file;
    const { folder, studyId, indId, trialPhase, module, documentType, status } = req.body;

    const options = {
      path: folder || '/IND',
      studyId,
      indId,
      trialPhase,
      module,
      documentType,
      status: status || 'draft',
      version: '1.0',
    };

    const hash = await ds.upload(buffer, filename, options);

    // Store document reference in database
    await prisma.document.create({
      data: {
        name: filename,
        sha256: hash,
        path: options.path,
        metadata: JSON.stringify({
          studyId,
          indId,
          trialPhase,
          module,
          documentType,
          status,
        }),
        uploadedBy: req.user?.id ?? 0,
      },
    });

    res.status(201).json({
      success: true,
      documentId: filename,
      sha256: hash,
    });
  } catch (err) {
    console.error('Error uploading document:', err);
    next(err);
  }
});

// GET /api/docs/download - Download document
router.get('/docs/download', async (req, res, next) => {
  try {
    const { objectId } = req.query;
    if (!objectId) {
      return res.status(400).json({ error: 'Object ID is required' });
    }

    // Get document metadata first to determine content type
    let documentMetadata = {};
    try {
      documentMetadata = await ds.getDocumentMetadata(objectId);
    } catch (metaErr) {
      console.warn('Could not fetch document metadata:', metaErr.message);
    }

    const data = await ds.download(objectId);

    // Set content disposition and type headers
    res.setHeader('Content-Disposition', `attachment; filename="${objectId}"`);
    res.setHeader('Content-Type', documentMetadata.contentType || 'application/octet-stream');

    // If response is already a buffer, send it directly
    if (Buffer.isBuffer(data)) {
      return res.send(data);
    }

    // If it's a stream, pipe it to the response
    if (data.pipe && typeof data.pipe === 'function') {
      return data.pipe(res);
    }

    // Otherwise, convert to buffer and send
    const buffer = Buffer.from(data);
    res.send(buffer);
  } catch (err) {
    console.error('Error downloading document:', err);
    next(err);
  }
});

// GET /api/docs/view - Get document view URL
router.get('/docs/view', async (req, res, next) => {
  try {
    const { objectId } = req.query;
    if (!objectId) {
      return res.status(400).json({ error: 'Object ID is required' });
    }

    // In a real implementation, this would generate a signed URL
    // For now, return a simulated URL with proper structure
    const viewUrl = `/api/docs/download?objectId=${encodeURIComponent(objectId)}&view=true`;

    res.json({ url: viewUrl });
  } catch (err) {
    console.error('Error generating view URL:', err);
    next(err);
  }
});

// GET /api/docs/versions - Get document version history
router.get('/docs/versions', async (req, res, next) => {
  try {
    const { objectId } = req.query;
    if (!objectId) {
      return res.status(400).json({ error: 'Object ID is required' });
    }

    const versions = await ds.getVersionHistory(objectId);
    res.json(versions);
  } catch (err) {
    console.error('Error getting version history:', err);
    next(err);
  }
});

// POST /api/docs/delete - Delete document
router.post('/docs/delete', async (req, res, next) => {
  try {
    const { objectId } = req.body;
    if (!objectId) {
      return res.status(400).json({ error: 'Object ID is required' });
    }

    // In a real implementation, this would call the DocuShare delete API
    // For now, just log the deletion and return success
    console.log(`[SIMULATED] Deleting document ${objectId}`);

    // Log document deletion
    await prisma.document_activity.create({
      data: {
        document_id: objectId,
        action: 'delete',
        timestamp: new Date(),
        user_id: req.user?.id ?? 0,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting document:', err);
    next(err);
  }
});

// POST /api/docushare/webhook - Audit trail sink
router.post('/docushare/webhook', async (req, res, next) => {
  try {
    const ev = req.body; // { objectId, event, actor, timestamp, meta }
    await prisma.audit_log.create({ data: ev });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing webhook:', err);
    next(err);
  }
});

// GET /api/audit/export - CSV export for QA
router.get('/audit/export', async (req, res, next) => {
  try {
    const { startDate, endDate, type } = req.query;

    let query = `SELECT * FROM audit_log`;
    const params = [];

    if (startDate || endDate || type) {
      query += ` WHERE`;

      if (startDate) {
        query += ` timestamp >= $${params.length + 1}`;
        params.push(new Date(startDate));
      }

      if (endDate) {
        query += params.length ? ` AND` : ``;
        query += ` timestamp <= $${params.length + 1}`;
        params.push(new Date(endDate));
      }

      if (type) {
        query += params.length ? ` AND` : ``;
        query += ` event = $${params.length + 1}`;
        params.push(type);
      }
    }

    query += ` ORDER BY timestamp`;

    const rows = await prisma.$queryRaw({ text: query, values: params });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit_log.csv');
    res.send(
      [
        'id,objectId,event,actor,timestamp,metadata',
        ...rows.map(r => {
          return `${r.id},${r.objectid},${r.event},${r.actor},${r.timestamp.toISOString()},${r.meta || ''}`;
        }),
      ].join('\n')
    );
  } catch (err) {
    console.error('Error exporting audit log:', err);
    next(err);
  }
});

// GET /api/ind/docushare/status - Get DocuShare status for IND module
router.get('/ind/docushare/status', async (req, res) => {
  try {
    // Attempt to validate connection to DocuShare
    let connectionActive = false;
    let errorMessage = null;

    try {
      await ds.getToken();
      connectionActive = true;
    } catch (error) {
      errorMessage = error.message;
      console.warn('DocuShare connection check failed:', error.message);
    }

    // Get document counts from database
    const documentCounts = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN metadata->>'module' = 'Module 1' THEN 1 ELSE 0 END) as module1,
        SUM(CASE WHEN metadata->>'module' = 'Module 2' THEN 1 ELSE 0 END) as module2,
        SUM(CASE WHEN metadata->>'module' = 'Module 3' THEN 1 ELSE 0 END) as module3,
        SUM(CASE WHEN metadata->>'module' = 'Module 4' THEN 1 ELSE 0 END) as module4,
        SUM(CASE WHEN metadata->>'module' = 'Module 5' THEN 1 ELSE 0 END) as module5
      FROM document
      WHERE path LIKE '/IND%'
    `;

    // Get recent activity
    const recentActivity = await prisma.document_activity.findMany({
      where: {
        path: {
          startsWith: '/IND',
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 10,
      include: {
        user: true,
      },
    });

    res.json({
      status: {
        connectionActive,
        errorMessage,
        serverId: 'TrialSAGE-DS7',
        timestamp: new Date().toISOString(),
      },
      statistics: {
        totalDocuments: documentCounts[0]?.total || 0,
        byModule: {
          'Module 1': documentCounts[0]?.module1 || 0,
          'Module 2': documentCounts[0]?.module2 || 0,
          'Module 3': documentCounts[0]?.module3 || 0,
          'Module 4': documentCounts[0]?.module4 || 0,
          'Module 5': documentCounts[0]?.module5 || 0,
        },
      },
      recentActivity: recentActivity.map(activity => ({
        id: activity.id,
        documentId: activity.document_id,
        action: activity.action,
        timestamp: activity.timestamp,
        user: activity.user?.name || 'Unknown User',
      })),
    });
  } catch (err) {
    console.error('Error getting DocuShare status:', err);
    res.status(500).json({
      error: 'Failed to get DocuShare status',
      message: err.message,
    });
  }
});

export default router;
