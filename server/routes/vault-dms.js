/**
 * @file vault-dms.js
 * @description API routes for the Vault DMS. Now includes multer for file uploads.
 *
 * ARCHITECT: Google Gemini
 * DATE: 2025-07-10
 * REVISION: 2 - Added multer for file upload handling.
 */
import express from 'express';
import multer from 'multer';

const router = express.Router();

// Configure Multer to handle file uploads in memory.
// This is a temporary step before integrating a cloud storage provider.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware to log access and prepare tenantId
router.use((req, res, next) => {
  console.log(`[Vault API] Request received for: ${req.method} ${req.originalUrl}`);
  if (!req.app.locals.vaultDmsService) {
    return res.status(500).json({
      error: 'VaultDMSService is not available. Check server initialization.',
    });
  }
  // Hardcoding tenantId for now. Will be replaced by auth middleware.
  req.organizationId = 'default-tenant';
  next();
});

// GET /api/vault - List all documents
router.get('/', async (req, res) => {
  try {
    const vaultService = req.app.locals.vaultDmsService;
    const documents = await vaultService.listDocuments(req.organizationId);
    res.status(200).json(documents);
  } catch (error) {
    console.error('[Vault API] Error in GET / route:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// GET /api/vault/search/:term - Search for documents
router.get('/search/:term', async (req, res) => {
  try {
    console.log(`[Vault API] Search endpoint called with term: ${req.params.term}`);
    const vaultService = req.app.locals.vaultDmsService;
    const { term } = req.params;

    if (!term || term.trim().length === 0) {
      console.log(`[Vault API] Search term validation failed`);
      return res.status(400).json({ error: 'Search term is required.' });
    }

    console.log(
      `[Vault API] Calling vaultService.searchDocuments with organizationId: ${req.organizationId}, term: ${term}`
    );
    const documents = await vaultService.searchDocuments(req.organizationId, term);
    console.log(`[Vault API] Search completed, found ${documents.length} documents`);

    res.status(200).json(documents);
  } catch (error) {
    console.error(`[Vault API] Error in GET /search/${req.params.term} route:`, error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// GET /api/vault/document/:id - Retrieve a specific document
router.get('/document/:id', async (req, res) => {
  try {
    const vaultService = req.app.locals.vaultDmsService;
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

// POST /api/vault - Create a new document with a file upload
// The `upload.single('document')` middleware processes the uploaded file.
router.post('/', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A document file is required.' });
    }
    const vaultService = req.app.locals.vaultDmsService;
    // Document metadata comes from the form body
    const documentData = req.body;
    // The actual file comes from req.file
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

// PATCH /api/vault/document/:id - Update a document's metadata
router.patch('/document/:id', async (req, res) => {
  try {
    const vaultService = req.app.locals.vaultDmsService;
    const documentId = parseInt(req.params.id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID format.' });
    }

    // Validate that there are updates to apply
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No update fields provided.' });
    }

    const updatedDocument = await vaultService.updateDocumentMetadata(
      req.organizationId,
      documentId,
      updates
    );
    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.status(200).json(updatedDocument);
  } catch (error) {
    console.error(`[Vault API] Error in PATCH /document/${req.params.id} route:`, error);

    // Handle specific error cases
    if (error.message.includes('Invalid field provided for update')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// DELETE /api/vault/document/:id - Delete a document
router.delete('/document/:id', async (req, res) => {
  try {
    const vaultService = req.app.locals.vaultDmsService;
    const documentId = parseInt(req.params.id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID format.' });
    }

    const wasDeleted = await vaultService.deleteDocument(req.organizationId, documentId);
    if (!wasDeleted) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.status(204).send(); // 204 No Content is standard for successful deletion
  } catch (error) {
    console.error(`[Vault API] Error in DELETE /document/${req.params.id} route:`, error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

export default router;
