/**
 * Client Intelligence Memory API Routes
 *
 * Provides endpoints for:
 * - Client profile CRUD (company persona, regulatory identity)
 * - Document ingestion (PDF, DOCX, XLSX, CSV upload & processing)
 * - Memory entry management (view, verify, archive learned intelligence)
 * - Document checklist (what documents we need from the client)
 *
 * @module server/routes/client-intelligence
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  upsertClientProfile,
  getClientProfile,
  ingestDocument,
  getMemoryEntries,
  getIngestedDocuments,
  // Project-level intelligence
  upsertProjectIntelligence,
  getProjectIntelligence,
  ingestProjectDocument,
  getProjectMemoryEntries,
  getProjectIngestedDocuments,
  buildProjectIntelligenceContext,
  getDocumentChecklist,
  archiveMemoryEntry,
  verifyMemoryEntry,
  buildClientIntelligenceContext,
} from '../services/client-intelligence-memory';

const router = Router();

// ── Multer config for file uploads (50MB limit) ─────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── Helper: extract org/user from request ────────────────────────────────────
function getRequestContext(req: Request) {
  const organizationId = parseInt(
    (req.headers['x-organization-id'] as string) || '',
    10
  );
  if (!organizationId) {
    throw new Error('Organization context required');
  }
  const userId = (req as any).user?.id;
  return { organizationId, userId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/client-intelligence/profile
 * Retrieve the current client intelligence profile.
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const clientWorkspaceId = req.query.clientWorkspaceId
      ? parseInt(req.query.clientWorkspaceId as string, 10)
      : undefined;

    const profile = await getClientProfile(organizationId, clientWorkspaceId);

    if (!profile) {
      return res.json({
        success: true,
        profile: null,
        message: 'No client intelligence profile found. Create one to get started.',
      });
    }

    return res.json({ success: true, profile });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/profile
 * Create or update the client intelligence profile (company persona).
 */
router.post('/profile', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getRequestContext(req);
    const { clientWorkspaceId, ...profileData } = req.body;

    if (!profileData.companyName) {
      return res.status(400).json({
        success: false,
        error: 'companyName is required',
      });
    }

    const profile = await upsertClientProfile(
      organizationId,
      profileData,
      userId,
      clientWorkspaceId ? parseInt(clientWorkspaceId, 10) : undefined
    );

    return res.json({ success: true, profile });
  } catch (err: any) {
    console.error('[ClientIntelligence] POST /profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT INGESTION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/client-intelligence/documents/upload
 * Upload and ingest a document into client intelligence memory.
 */
router.post(
  '/documents/upload',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = getRequestContext(req);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      const profileId = parseInt(req.body.profileId, 10);
      if (!profileId) {
        return res.status(400).json({
          success: false,
          error: 'profileId is required',
        });
      }

      const result = await ingestDocument(
        profileId,
        organizationId,
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        },
        userId
      );

      return res.json({ success: true, result });
    } catch (err: any) {
      console.error('[ClientIntelligence] POST /documents/upload error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/client-intelligence/documents
 * List all ingested documents for a profile.
 */
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(req.query.profileId as string, 10);
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const documents = await getIngestedDocuments(profileId);
    return res.json({ success: true, documents });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /documents error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/checklist
 * Get the document checklist showing what we need from the client.
 */
router.get('/checklist', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(req.query.profileId as string, 10);
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const checklist = await getDocumentChecklist(profileId);
    return res.json({ success: true, checklist });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /checklist error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY ENTRY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/client-intelligence/memory
 * Get memory entries for a profile, optionally filtered by category.
 */
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(req.query.profileId as string, 10);
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await getMemoryEntries(profileId, { category, limit, offset });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /memory error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/memory/:id/verify
 * Mark a memory entry as verified by a human.
 */
router.post('/memory/:id/verify', async (req: Request, res: Response) => {
  try {
    const { userId } = getRequestContext(req);
    const entryId = parseInt(req.params.id, 10);

    await verifyMemoryEntry(entryId, userId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientIntelligence] POST /memory/:id/verify error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/client-intelligence/memory/:id
 * Archive (soft-delete) a memory entry.
 */
router.delete('/memory/:id', async (req: Request, res: Response) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    await archiveMemoryEntry(entryId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientIntelligence] DELETE /memory/:id error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/context
 * Build the full intelligence context string for the Lumen Context Builder.
 * Useful for debugging / previewing what AnA sees.
 */
router.get('/context', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const clientWorkspaceId = req.query.clientWorkspaceId
      ? parseInt(req.query.clientWorkspaceId as string, 10)
      : undefined;

    const context = await buildClientIntelligenceContext(organizationId, clientWorkspaceId);
    return res.json({ success: true, context });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /context error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT-LEVEL INTELLIGENCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/client-intelligence/project/:projectId/profile
 * Get project intelligence profile.
 */
router.get('/project/:projectId/profile', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const profile = await getProjectIntelligence(projectId);
    return res.json({ success: true, profile });
  } catch (err: any) {
    console.error('[ProjectIntelligence] GET profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/project/:projectId/profile
 * Create or update project intelligence profile.
 */
router.post('/project/:projectId/profile', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId } = getRequestContext(req);
    const projectId = parseInt(req.params.projectId, 10);
    const profile = await upsertProjectIntelligence(projectId, organizationId, req.body, userId);
    return res.json({ success: true, profile });
  } catch (err: any) {
    console.error('[ProjectIntelligence] POST profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/project/:projectId/documents/upload
 * Upload a document to project intelligence.
 */
router.post(
  '/project/:projectId/documents/upload',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = getRequestContext(req);
      const projectId = parseInt(req.params.projectId, 10);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      // Get or create project profile
      let profile = await getProjectIntelligence(projectId);
      if (!profile) {
        profile = await upsertProjectIntelligence(projectId, organizationId, {}, userId);
      }

      const result = await ingestProjectDocument(
        profile.id,
        projectId,
        organizationId,
        { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype, size: file.size },
        userId
      );

      return res.json({ success: true, result });
    } catch (err: any) {
      console.error('[ProjectIntelligence] POST documents/upload error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/client-intelligence/project/:projectId/documents
 * List project ingested documents.
 */
router.get('/project/:projectId/documents', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const profile = await getProjectIntelligence(projectId);
    if (!profile) return res.json({ success: true, documents: [] });

    const documents = await getProjectIngestedDocuments(profile.id);
    return res.json({ success: true, documents });
  } catch (err: any) {
    console.error('[ProjectIntelligence] GET documents error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/project/:projectId/memory
 * Get project memory entries.
 */
router.get('/project/:projectId/memory', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const profile = await getProjectIntelligence(projectId);
    if (!profile) return res.json({ success: true, entries: [], totalCount: 0 });

    const category = req.query.category as string | undefined;
    const result = await getProjectMemoryEntries(profile.id, { category });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ProjectIntelligence] GET memory error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/project/:projectId/context
 * Preview the project intelligence context string.
 */
router.get('/project/:projectId/context', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const context = await buildProjectIntelligenceContext(projectId);
    return res.json({ success: true, context });
  } catch (err: any) {
    console.error('[ProjectIntelligence] GET context error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
