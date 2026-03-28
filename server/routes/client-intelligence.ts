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
  searchMemoryEntriesSemantic,
  getIngestedDocuments,
  // Project-level intelligence
  upsertProjectIntelligence,
  getProjectIntelligence,
  ingestProjectDocument,
  getProjectMemoryEntries,
  searchProjectMemoryEntriesSemantic,
  getProjectIngestedDocuments,
  buildProjectIntelligenceContext,
  getDocumentChecklist,
  archiveMemoryEntry,
  verifyMemoryEntry,
  buildClientIntelligenceContext,
  supersedeClientMemoryEntry,
  supersedeProjectMemoryEntry,
  getSharedMemoryPool,
} from '../services/client-intelligence-memory';
import { buildMemoryContextForChat } from '../services/memory-context-assembler.js';

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
 * GET /api/client-intelligence/memory/semantic-search
 * Semantic search across client memory entries for a profile.
 */
router.get('/memory/semantic-search', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const profileId = req.query.profileId
      ? parseInt(req.query.profileId as string, 10)
      : null;
    const query = (req.query.query as string)?.trim();

    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const minSimilarity = req.query.minSimilarity
      ? parseFloat(req.query.minSimilarity as string)
      : undefined;

    const result = await searchMemoryEntriesSemantic(profileId, organizationId, query, {
      category,
      limit,
      minSimilarity,
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /memory/semantic-search error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/memory/context-assemble
 * Build bounded memory context from working + client + project memory for a query.
 */
router.get('/memory/context-assemble', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const threadId = (req.query.threadId as string)?.trim();
    const query = (req.query.query as string)?.trim();
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const limitPerLayer = req.query.limitPerLayer ? parseInt(req.query.limitPerLayer as string, 10) : 4;
    const maxChars = req.query.maxChars ? parseInt(req.query.maxChars as string, 10) : 3500;
    const minSimilarity = req.query.minSimilarity ? parseFloat(req.query.minSimilarity as string) : undefined;
    const maxAgeDays = req.query.maxAgeDays ? parseInt(req.query.maxAgeDays as string, 10) : undefined;

    if (!threadId) {
      return res.status(400).json({ success: false, error: 'threadId is required' });
    }
    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const CONTEXT_ASSEMBLY_TIMEOUT_MS = 30000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Memory context assembly timeout')), CONTEXT_ASSEMBLY_TIMEOUT_MS)
    );
    const result = await Promise.race([
      buildMemoryContextForChat({
        threadId,
        organizationId,
        projectId,
        query,
        limitPerLayer,
        maxChars,
        minSimilarity,
        maxAgeDays,
      }),
      timeoutPromise,
    ]) as Awaited<ReturnType<typeof buildMemoryContextForChat>>;

    return res.json({
      success: true,
      ...result,
      memoryBlockChars: result.memoryBlock.length,
      memoryDiagnostics: result.diagnostics,
    });
  } catch (err: any) {
    if (err.message === 'Memory context assembly timeout') {
      console.error('[ClientIntelligence] GET /memory/context-assemble timed out after 30s');
      return res.status(504).json({ success: false, error: 'Memory context assembly timed out' });
    }
    console.error('[ClientIntelligence] GET /memory/context-assemble error:', err);
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
 * POST /api/client-intelligence/memory/:id/supersede
 * Mark a client memory entry as superseded (optionally linked to successor entry).
 */
router.post('/memory/:id/supersede', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const entryId = parseInt(req.params.id, 10);
    const supersededById = req.body?.supersededById
      ? parseInt(String(req.body.supersededById), 10)
      : undefined;

    await supersedeClientMemoryEntry(entryId, organizationId, supersededById);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientIntelligence] POST /memory/:id/supersede error:', err);
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
 * GET /api/client-intelligence/project/:projectId/memory/semantic-search
 * Semantic search across project memory entries.
 */
router.get('/project/:projectId/memory/semantic-search', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const projectId = parseInt(req.params.projectId, 10);
    const query = (req.query.query as string)?.trim();

    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const profile = await getProjectIntelligence(projectId);
    if (!profile) return res.json({ success: true, entries: [], totalCount: 0, query });

    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const minSimilarity = req.query.minSimilarity
      ? parseFloat(req.query.minSimilarity as string)
      : undefined;

    const result = await searchProjectMemoryEntriesSemantic(
      profile.id,
      projectId,
      organizationId,
      query,
      { category, limit, minSimilarity }
    );

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ProjectIntelligence] GET semantic memory error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/project/:projectId/memory/:id/supersede
 * Mark a project memory entry as superseded.
 */
router.post('/project/:projectId/memory/:id/supersede', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const projectId = parseInt(req.params.projectId, 10);
    const entryId = parseInt(req.params.id, 10);

    await supersedeProjectMemoryEntry(entryId, projectId, organizationId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ProjectIntelligence] POST /project/:projectId/memory/:id/supersede error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/memory/shared-pool
 * Unified memory pool for multi-agent collaboration (client + project memory).
 */
router.get('/memory/shared-pool', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getRequestContext(req);
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const category = (req.query.category as string | undefined)?.trim();
    const query = (req.query.query as string | undefined)?.trim();
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const includeSuperseded = req.query.includeSuperseded === 'true';

    const result = await getSharedMemoryPool(organizationId, {
      projectId,
      category,
      query,
      limit,
      includeSuperseded,
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[ClientIntelligence] GET /memory/shared-pool error:', err);
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

// ============================================================
// AnA Intelligence System Routes (CLAUDE.md Memory Compression Model)
// ============================================================

import {
  buildUserContext,
  upsertUserProfile,
  buildMergedContext,
} from '../services/ana-context-router';

/**
 * GET /api/client-intelligence/ana/user-profile
 * Get the current user's intelligence profile (User.md layer).
 */
router.get('/ana/user-profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    if (!userId || !organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { userIntelligenceProfiles } = await import('shared/schema');
    const { eq, and } = await import('drizzle-orm');

    const [profile] = await db
      .select()
      .from(userIntelligenceProfiles)
      .where(
        and(
          eq(userIntelligenceProfiles.userId, userId),
          eq(userIntelligenceProfiles.organizationId, organizationId)
        )
      )
      .limit(1);

    return res.json({ success: true, profile: profile || null });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET user-profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/ana/user-profile
 * Upsert the current user's intelligence profile.
 */
router.post('/ana/user-profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    if (!userId || !organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    await upsertUserProfile(userId, organizationId, req.body);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[AnA Intelligence] POST user-profile error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/merged-context
 * Preview the full merged context (Global + Local + User + Capabilities + Wisdom).
 */
router.get('/ana/merged-context', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string, 10)
      : undefined;

    const result = await buildMergedContext({
      organizationId,
      projectId,
      userId,
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET merged-context error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/capabilities
 * Get AnA capabilities for a project context.
 */
router.get('/ana/capabilities', async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { anaCapabilityRegistry } = await import('shared/schema');
    const { eq, desc } = await import('drizzle-orm');

    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string, 10)
      : undefined;

    const capabilities = await db
      .select()
      .from(anaCapabilityRegistry)
      .where(eq(anaCapabilityRegistry.isActive, true))
      .orderBy(desc(anaCapabilityRegistry.successCount))
      .limit(100);

    return res.json({ success: true, capabilities });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET capabilities error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/ana/log-outcome
 * Log an AnA action outcome for learning.
 */
router.post('/ana/log-outcome', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { anaOutcomeLog, anaCapabilityRegistry } = await import('shared/schema');
    const { eq, sql } = await import('drizzle-orm');

    const {
      capabilityKey, actionType, outcome, qualityScore,
      userFeedback, editDelta, errorMessage, regulatoryBody,
      projectType, therapeuticArea, documentType, sectionCode,
      durationMs, tokenCount, lessonsLearned, inputSummary,
      projectId,
    } = req.body;

    // Insert outcome log
    await db.insert(anaOutcomeLog).values({
      organizationId,
      projectId: projectId || null,
      userId: userId || null,
      capabilityKey,
      actionType,
      outcome,
      qualityScore,
      userFeedback,
      editDelta,
      errorMessage,
      regulatoryBody,
      projectType,
      therapeuticArea,
      documentType,
      sectionCode,
      durationMs,
      tokenCount,
      lessonsLearned,
      inputSummary,
    });

    // Update capability counts (non-blocking)
    if (outcome === 'success') {
      await db.update(anaCapabilityRegistry)
        .set({
          successCount: sql`${anaCapabilityRegistry.successCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(anaCapabilityRegistry.capabilityKey, capabilityKey));
    } else if (outcome === 'failure') {
      await db.update(anaCapabilityRegistry)
        .set({
          failureCount: sql`${anaCapabilityRegistry.failureCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(anaCapabilityRegistry.capabilityKey, capabilityKey));
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[AnA Intelligence] POST log-outcome error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/wisdom
 * Get AnA platform wisdom entries.
 */
router.get('/ana/wisdom', async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { anaPlatformWisdom } = await import('shared/schema');
    const { eq, and, desc, sql } = await import('drizzle-orm');

    const projectType = req.query.projectType as string | undefined;
    const regulatoryBody = req.query.regulatoryBody as string | undefined;

    const wisdom = await db
      .select()
      .from(anaPlatformWisdom)
      .where(
        and(
          eq(anaPlatformWisdom.isActive, true),
          sql`${anaPlatformWisdom.evidenceCount} >= ${anaPlatformWisdom.minEvidenceThreshold}`
        )
      )
      .orderBy(desc(anaPlatformWisdom.confidenceScore))
      .limit(50);

    // Filter by context if provided
    const filtered = wisdom.filter(w => {
      if (regulatoryBody && w.regulatoryBody && w.regulatoryBody !== regulatoryBody) return false;
      if (projectType && w.projectType && w.projectType !== projectType) return false;
      return true;
    });

    return res.json({ success: true, wisdom: filtered });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET wisdom error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/objectives
 * Get client objectives.
 */
router.get('/ana/objectives', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { anaClientObjectives } = await import('shared/schema');
    const { eq, and, desc } = await import('drizzle-orm');

    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string, 10)
      : undefined;

    const conditions = [eq(anaClientObjectives.organizationId, organizationId)];
    if (projectId) {
      conditions.push(eq(anaClientObjectives.projectId, projectId));
    }

    const objectives = await db
      .select()
      .from(anaClientObjectives)
      .where(and(...conditions))
      .orderBy(desc(anaClientObjectives.createdAt))
      .limit(50);

    return res.json({ success: true, objectives });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET objectives error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/client-intelligence/ana/objectives
 * Create a new client objective.
 */
router.post('/ana/objectives', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { anaClientObjectives } = await import('shared/schema');

    const [objective] = await db
      .insert(anaClientObjectives)
      .values({
        organizationId,
        createdBy: userId,
        ...req.body,
      })
      .returning();

    return res.json({ success: true, objective });
  } catch (err: any) {
    console.error('[AnA Intelligence] POST objectives error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/templates/company-types
 * Get available company type templates.
 */
router.get('/ana/templates/company-types', async (_req: Request, res: Response) => {
  try {
    const { getCompanyTypes } = await import('../services/industry-context-templates');
    return res.json({ success: true, types: getCompanyTypes() });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET company-types error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/templates/project-types
 * Get available project type templates.
 */
router.get('/ana/templates/project-types', async (_req: Request, res: Response) => {
  try {
    const { getProjectTypes } = await import('../services/industry-context-templates');
    return res.json({ success: true, types: getProjectTypes() });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET project-types error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/templates/company/:type
 * Get a specific company template.
 */
router.get('/ana/templates/company/:type', async (req: Request, res: Response) => {
  try {
    const { getCompanyTemplate } = await import('../services/industry-context-templates');
    const template = getCompanyTemplate(req.params.type as any);
    return res.json({ success: true, template });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET company template error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/client-intelligence/ana/templates/project/:type
 * Get a specific project template.
 */
router.get('/ana/templates/project/:type', async (req: Request, res: Response) => {
  try {
    const { getProjectTemplate } = await import('../services/industry-context-templates');
    const template = getProjectTemplate(req.params.type as any);
    return res.json({ success: true, template });
  } catch (err: any) {
    console.error('[AnA Intelligence] GET project template error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
