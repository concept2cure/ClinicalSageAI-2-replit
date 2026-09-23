/**
 * eCTD Documents Routes
 * Electronic Common Technical Document management
 *
 * Backed by coauthor_documents table with eCTD-specific filtering.
 */
import { Router, Request, Response } from 'express';
import { eq, desc, and, like } from 'drizzle-orm';
import { z } from 'zod';
import { db, transaction } from '../db';
import { coauthorDocuments } from '../../shared/schema';
import { requireRole } from '../middleware/auth';
import {
  applyCoauthorDocumentPut,
  planCoauthorStatusWrite,
} from '../services/coauthor/coauthor-status-write.js';
import { coauthorAuditActor, recordCoauthorDocumentEvent } from '../services/coauthor/coauthor-audit.js';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  classifyDocument,
  extractStructure,
  IngestionError,
} from '../services/ingestion/ingestion-service';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ectd-documents');

const router = Router();

// Rate limiter for the AI-backed ingestion endpoints.
const ingestionRateLimiter = createRateLimiter();

/**
 * Resolve organization from headers or query params.
 * Returns null when absent so callers can decide whether to 400 or allow open access.
 */
const resolveOrganizationId = (req: any): number | null => {
  const raw =
    req.tenantId ||
    req.tenantContext?.organizationId ||
    req.user?.organizationId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// ── List ────────────────────────────────────────────────────────────────────

router.get('/', requireRole('regulatory-author'), async (req: Request, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (organizationId === null) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });

    const { module, status, region } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // Build conditions array
    const conditions: any[] = [];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }
    if (status && typeof status === 'string') {
      conditions.push(eq(coauthorDocuments.status, status));
    }
    if (module && typeof module === 'string') {
      conditions.push(like(coauthorDocuments.moduleNumber, `${module}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const documents = await db
      .select()
      .from(coauthorDocuments)
      .where(whereClause)
      .orderBy(desc(coauthorDocuments.updatedAt))
      .limit(limit)
      .offset(offset);

    // Map to eCTD-specific response format
    const ectdDocuments = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      module: doc.moduleNumber || null,
      moduleName: doc.moduleName || null,
      status: doc.status,
      region: (doc.metadata as any)?.region || 'US',
      version: (doc.metadata as any)?.version || '0001',
      content: doc.content || '',
      completionPercentage: doc.completionPercentage || 0,
      complianceScore: doc.regulatoryComplianceScore || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
    }));

    res.json({
      documents: ectdDocuments,
      total: ectdDocuments.length,
      filters: {
        module: module || null,
        status: status || null,
        region: region || null,
      },
    });
  } catch (error: any) {
    logger.error('List error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch eCTD documents', code: 'INTERNAL' });
  }
});

// ── Get by ID ───────────────────────────────────────────────────────────────

router.get('/:id', requireRole('regulatory-author'), async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);
    if (organizationId === null) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });

    const conditions: any[] = [eq(coauthorDocuments.id, docId)];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }

    const [doc] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(...conditions))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    const metadata = (doc.metadata as any) || {};

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        moduleName: doc.moduleName || null,
        section: metadata.section || null,
        status: doc.status,
        region: metadata.region || 'US',
        version: metadata.version || '0001',
        content: doc.content || '',
        completionPercentage: doc.completionPercentage || 0,
        complianceScore: doc.regulatoryComplianceScore || null,
        sections: doc.sections || null,
        lifecycle: metadata.lifecycle || [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy,
      },
    });
  } catch (error: any) {
    logger.error('Get error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch eCTD document', code: 'INTERNAL' });
  }
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post('/', requireRole('regulatory-author'), async (req: Request, res: Response) => {
  try {
    const { title, module: ectdModule, section, content, region } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const organizationId = resolveOrganizationId(req);
    if (organizationId === null) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required (x-organization-id header)' });
    }

    const userId = (req as any).user?.id || (req as any).user?.userId;

    const lifecycle = [{ event: 'created', timestamp: new Date().toISOString() }];

    const [doc] = await db
      .insert(coauthorDocuments)
      .values({
        organizationId,
        title,
        moduleNumber: ectdModule || null,
        content: content || '',
        status: 'draft',
        createdBy: userId ? String(userId) : null,
        metadata: {
          region: region || 'US',
          section: section || null,
          version: '0001',
          lifecycle,
        },
      })
      .returning();

    res.status(201).json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        section: section || null,
        content: doc.content || '',
        region: region || 'US',
        status: doc.status,
        version: '0001',
        lifecycle,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('Create error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create eCTD document', code: 'INTERNAL' });
  }
});

// ── Update ──────────────────────────────────────────────────────────────────

router.put('/:id', requireRole('regulatory-author'), async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);
    if (organizationId === null) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });

    const { title, content, status, module: ectdModule, section, region } = req.body || {};

    /* 2026-09-23 (W5/D7, round-3 review): this handler wrote `status` from the
       body verbatim, behind requireRole('regulatory-author') — which
       ORG_ROLE_FUNCTIONAL_GRANTS gives every org 'member' — so after round 2
       closed PUT /api/coauthor/documents/:id, {"status":"approved"} sent HERE
       still stamped a draft snapshot approved and cleared transmit's "only
       approved documents" refusal (same column, coauthor_documents.status).
       It also kept its own case-sensitive `approved || finalized` list to
       bump metadata.version. Both are gone: the write goes through the one
       rule in services/coauthor/coauthor-status-write.ts (working states
       only; any other value is a no-op restate or 400; title / content /
       module of a row carrying a verdict are frozen, 409), and the version
       bump is deleted — no finalized status can be set here any more.
       `module` is governed with title and content: moving an approved
       document's module_number re-files its verdict against another section
       of the IND checklist / NDA cockpit.

       Metadata (section, region, the lifecycle log) is written only when the
       request changes something, so a restate stays a no-op, and in the same
       write as the rest, so a refused request logs no 'updated' event.
       2026-09-23 (W5/D7, round-3 review, repair 1): it merged onto a row read
       here before the write, so a concurrent metadata change could be lost;
       it now merges onto the row the shared rule holds FOR UPDATE (that read
       also answers the 404 this handler's own pre-read used to). */
    const changesSomething =
      title !== undefined ||
      content !== undefined ||
      ectdModule !== undefined ||
      section !== undefined ||
      region !== undefined ||
      planCoauthorStatusWrite(status).kind === 'set';

    const mergeMetadata = (current: { metadata: unknown }) => {
      if (!changesSomething) return {};
      const updatedMetadata = { ...((current.metadata as any) || {}) };
      if (section !== undefined) updatedMetadata.section = section;
      if (region !== undefined) updatedMetadata.region = region;
      const lifecycle = Array.isArray(updatedMetadata.lifecycle) ? [...updatedMetadata.lifecycle] : [];
      lifecycle.push({ event: 'updated', timestamp: new Date().toISOString() });
      updatedMetadata.lifecycle = lifecycle;
      return { metadata: updatedMetadata };
    };

    const outcome = await applyCoauthorDocumentPut({
      documentId: docId,
      organizationId,
      status,
      governed: { title, content, moduleNumber: ectdModule },
      ungoverned: mergeMetadata,
    });
    if (!outcome.ok) {
      const { httpStatus, body } = outcome.refusal;
      return res
        .status(httpStatus)
        .json(httpStatus === 404 ? { error: 'eCTD document not found' } : body);
    }
    const doc = outcome.document;

    const meta = (doc.metadata as any) || {};

    res.json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        section: meta.section || null,
        content: doc.content || '',
        status: doc.status,
        version: meta.version || '0001',
        region: meta.region || 'US',
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('Update error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to update eCTD document', code: 'INTERNAL' });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────

router.delete('/:id', requireRole('regulatory-author'), async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);
    if (organizationId === null) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });

    const actor = coauthorAuditActor(req);

    // 21 CFR Part 11 §11.10(e): delete the regulated eCTD document and record
    // the deletion in the hash-chained, append-only audit_events table IN THE
    // SAME TRANSACTION — atomic and fail-closed (an audit failure rolls the
    // delete back, so a regulated document is never removed unaudited).
    // 2026-09-23 (W5/D7, round-3 review, repair 2): through the one writer of
    // a coauthor document event, services/coauthor/coauthor-audit.ts, which
    // coauthor.ts's DELETE and the filing-copy re-take also use.
    const deletedRow = await transaction(async (client: any) => {
      const delParams: unknown[] = [docId];
      let delSql = 'DELETE FROM coauthor_documents WHERE id = $1';
      if (organizationId) {
        delParams.push(organizationId);
        delSql += ` AND organization_id = $${delParams.length}`;
      }
      delSql += ' RETURNING id, organization_id';

      const del = await client.query(delSql, delParams);
      if (!del.rows.length) return null;
      const row = del.rows[0];

      await recordCoauthorDocumentEvent(client, {
        organizationId: row.organization_id,
        documentId: row.id,
        eventType: 'coauthor_document.deleted',
        actor,
        reason: 'eCTD coauthor document deleted',
      });

      return row;
    });

    if (!deletedRow) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    res.json({ success: true, deletedId: deletedRow.id });
  } catch (error: any) {
    logger.error('Delete error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete eCTD document', code: 'INTERNAL' });
  }
});

// ── eCTD Structure Metadata ─────────────────────────────────────────────────

router.get('/meta/structure', (_req: Request, res: Response) => {
  res.json({
    modules: [
      { number: '1', title: 'Administrative Information', region: 'all' },
      { number: '2', title: 'Common Technical Document Summaries', region: 'all' },
      { number: '3', title: 'Quality (CMC)', region: 'all' },
      { number: '4', title: 'Nonclinical Study Reports', region: 'all' },
      { number: '5', title: 'Clinical Study Reports', region: 'all' },
    ],
  });
});

// ── Ingestion: classify + extract (Phase 1, WO-1.4) ──────────────────────────
//
// RECONCILE (RECONCILE.md §3): the work order specced these under
// /api/documents/:id/* but there is no /api/documents router. coauthor_documents
// — the canonical eCTD document table — is served by THIS router, mounted at
// /api/ectd-documents, so the endpoints live here:
//   POST /api/ectd-documents/:id/classify
//   POST /api/ectd-documents/:id/extract
// Both require the regulatory-author role, are rate-limited and Zod-validated,
// and resolve organizationId from the authenticated session only.

const classifyBodySchema = z.object({
  // Optional target sequence — when supplied (and owned), a draft leaf is placed.
  sequenceId: z.coerce.number().int().positive().optional(),
});

const extractBodySchema = z.object({
  sectionCode: z.string().min(1).max(64),
  // Provenance links require a submission context.
  submissionId: z.coerce.number().int().positive(),
});

interface UserContext {
  userId: number;
  organizationId: number;
}

/** Resolve user + org strictly from the authenticated session (never body/params). */
function resolveUserContext(req: Request): UserContext | null {
  const user = (req as any).user;
  const userId = Number(user?.id);
  const organizationId = Number(user?.organizationId);
  if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) return null;
  return { userId, organizationId };
}

const INGESTION_ERROR_STATUS: Record<IngestionError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_AI_RESPONSE: 502,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  TOKEN_LIMIT_EXCEEDED: 413,
};

function sendIngestionError(res: Response, err: unknown): void {
  if (err instanceof IngestionError) {
    res
      .status(INGESTION_ERROR_STATUS[err.code] ?? 500)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  logger.error('Ingestion failure', {
    err: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Ingestion request failed.' } });
}

router.post(
  '/:id/classify',
  requireRole('regulatory-author'),
  ingestionRateLimiter,
  async (req: Request, res: Response) => {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid document id.' } });
    }
    const ctx = resolveUserContext(req);
    if (!ctx) {
      return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    }
    const parsed = classifyBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
    }
    try {
      const result = await classifyDocument({
        documentId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        sequenceId: parsed.data.sequenceId,
      });
      res.json(result);
    } catch (err) {
      sendIngestionError(res, err);
    }
  }
);

router.post(
  '/:id/extract',
  requireRole('regulatory-author'),
  ingestionRateLimiter,
  async (req: Request, res: Response) => {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid document id.' } });
    }
    const ctx = resolveUserContext(req);
    if (!ctx) {
      return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    }
    const parsed = extractBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
    }
    try {
      const result = await extractStructure({
        documentId,
        sectionCode: parsed.data.sectionCode,
        submissionId: parsed.data.submissionId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });
      res.json(result);
    } catch (err) {
      sendIngestionError(res, err);
    }
  }
);

export default router;
