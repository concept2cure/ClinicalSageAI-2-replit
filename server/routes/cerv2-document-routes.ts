/**
 * CERV2 Document Routes
 * Clinical Evaluation Report v2 document management
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { documents, documentVersions } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';
import { requestDb, requestPgClient } from '../db/requestDb';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('cerv2-documents');

const resolveOrganizationId = (req: any) => {
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveClientWorkspaceId = (req: any) => {
  const headerClient =
    req.header('x-client-id') ||
    req.header('x-client-workspace-id') ||
    req.header('x-client-workspace');
  const queryClient = req.query?.client_workspace_id || req.query?.clientWorkspaceId;
  const raw = headerClient || queryClient;
  if (!raw) {
    throw new Error('Client workspace context required');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid client workspace ID');
  }
  return parsed;
};

const resolveUserId = (req: any) => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  if (!raw) {
    throw new Error('User context required');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid user ID');
  }
  return parsed;
};

/** Resolve the acting user without throwing — an unattributed governed
 *  decision is refused, not recorded anonymously. */
const resolveUserIdOrNull = (req: any): number | null => {
  try {
    return resolveUserId(req);
  } catch {
    return null;
  }
};

/**
 * Confirm a program is visible in the caller's org before it is used as a scope
 * key or echoed back. One implementation for every literature handler here —
 * three copies of this predicate is three chances to forget the org filter.
 */
const programVisibleInOrg = async (
  req: any,
  programId: string,
  organizationId: number,
): Promise<boolean> => {
  const { regulatoryPrograms } = await import('../../shared/schema/programs');
  const [program] = await requestDb(req)
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, programId),
        eq(regulatoryPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(program);
};

const tableExists = async (_req: any, tableName: string) => {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      )
    `);
    const rows = (result as any).rows ?? result;
    return rows?.[0]?.exists === true;
  } catch (error) {
    logger.error('Failed to check table existence', { error, tableName });
    return false;
  }
};

const saveSchema = z.object({
  documentType: z.string().min(1).optional(),
  documentCode: z.string().optional(),
  title: z.string().optional(),
  sections: z.any().optional(),
  metadata: z.any().optional(),
});

/**
 * GET /api/cerv2/literature/search?q=…&max=&years=&studyType=
 *
 * Thin org-authenticated read over the canonical PubMed client
 * (server/services/integrations/pubmed-client.ts — the same client AnA's
 * search_literature tool uses). The search itself persists nothing
 * (`recorded: false`); hits become part of the org corpus only through the
 * explicit POST /literature/record write path below.
 *
 * Honest degradation: a PubMed/network failure answers 200 with
 * { available: false, unavailableReason } and zero articles — never a
 * fabricated result set, never a silent empty list.
 */
const literatureQuerySchema = z.object({
  q: z.string().trim().min(2, 'q must be at least 2 characters').max(400),
  max: z.coerce.number().int().min(1).max(20).optional(),
  /** Year or range, e.g. "2023" or "2020-2026". */
  years: z
    .string()
    .trim()
    .regex(/^\d{4}(\s*-\s*\d{4})?$/, 'years must be YYYY or YYYY-YYYY')
    .optional(),
  studyType: z.enum(['rct', 'observational', 'systematic_review', 'case_report', 'any']).optional(),
});

router.get('/literature/search', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const parsed = literatureQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }
  const { q, max, years, studyType } = parsed.data;
  try {
    const { searchPubmed } = await import('../services/integrations/pubmed-client');
    const result = await searchPubmed({
      query: q,
      maxResults: max,
      dateRange: years,
      studyType,
    });
    return res.json({ available: true, recorded: false, ...result });
  } catch (error: any) {
    logger.warn('PubMed literature search unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.json({
      available: false,
      recorded: false,
      unavailableReason: `PubMed search unavailable — ${
        error instanceof Error ? error.message : 'network error'
      }`,
      source: 'PubMed',
      totalCount: 0,
      articles: [],
    });
  }
});

/**
 * POST /api/cerv2/literature/record — record PubMed search hits into the
 * org's literature corpus (literature_entries), the write path consumed by
 * the CER workbench's "Record to corpus" action and mirrored by AnA's
 * record_literature tool (same service logic).
 *
 *   - Org comes from the authenticated request, never the body.
 *   - Idempotent per (org, pmid): re-recording updates instead of duplicating.
 *   - Writes run on the REQUEST-SCOPED client (requestPgClient — the raw-SQL
 *     sibling of requestDb, needed because literature_entries has no Drizzle
 *     schema), so RLS session vars apply; absent context fails closed.
 *   - `programId` (optional) is validated as visible in the caller's org, but
 *     the table has no program column — see PROGRAM_BINDING_NOTE. Screening
 *     state (included/excluded) is still not accepted HERE — recording an
 *     article and appraising it are different governed acts with different
 *     actors — but it is no longer unrepresentable: POST /literature/screen
 *     below persists it (SCREENING_RECORDED_SEPARATELY).
 */
const literatureRecordSchema = z.object({
  programId: z.string().uuid().optional(),
  entries: z
    .array(
      z.object({
        pmid: z.string().trim().regex(/^\d{1,10}$/, 'pmid must be a numeric PubMed ID'),
        title: z.string().trim().min(1).max(4000),
        abstract: z.string().max(50_000).nullish(),
        journal: z.string().max(1000).nullish(),
        year: z.coerce.number().int().min(1800).max(2100).nullish(),
        authors: z
          .union([z.array(z.string().max(500)).max(100), z.string().max(4000)])
          .nullish(),
        doi: z.string().max(300).nullish(),
        url: z.string().max(1000).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

router.post('/literature/record', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const parsed = literatureRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const { recordLiteratureEntries, SCREENING_RECORDED_SEPARATELY, PROGRAM_BINDING_NOTE } =
    await import('../services/literature-recording.service');

  try {
    if (parsed.data.programId) {
      if (!(await programVisibleInOrg(req, parsed.data.programId, organizationId))) {
        return res.status(404).json({ error: 'Program not found in your organization' });
      }
    }

    const result = await recordLiteratureEntries(
      requestPgClient(req),
      organizationId,
      parsed.data.entries,
    );
    return res.json({
      recorded: true,
      ...result,
      screeningState: null,
      notes: [SCREENING_RECORDED_SEPARATELY, PROGRAM_BINDING_NOTE],
    });
  } catch (error) {
    logger.error('Failed to record literature entries', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      recorded: false,
      error: `Failed to record literature entries — ${
        error instanceof Error ? error.message : 'database error'
      }`,
    });
  }
});

/* ─── Literature screening (MEDDEV 2.7/1 Rev 4 appraisal trail) ─────────────
 *
 * GA ledger L4. Search and recording were already end-to-end; the reviewer's
 * include/exclude decision was not persisted at all, so the screening trail —
 * the part a notified body audits — died with the browser session.
 *
 * Shared preconditions for both handlers below:
 *   - Org comes from the authenticated request, NEVER the body or the query.
 *   - Reads and writes run on the REQUEST-SCOPED client (requestPgClient, the
 *     raw-SQL sibling of requestDb, since neither table has a Drizzle schema),
 *     so RLS session vars apply and absent context fails closed.
 *   - `programId` is validated as visible in the caller's org before it is used
 *     as a scope key, exactly as the record route does.
 *   - A decision that cannot be persisted answers 422 with the service's real
 *     reason (article not in the corpus / screening store not provisioned) —
 *     never a 200 that pretends.
 */

/**
 * POST /api/cerv2/literature/screen — record one screening/appraisal decision.
 *
 * The decision is governance evidence, so it is audited through the canonical
 * `auditService` path (chained + HMAC-sealed, see
 * docs/AUDIT_STORE_INVENTORY_2026-08.md §2) and never a hand-rolled INSERT. The
 * audit payload carries the SUPERSEDED decision alongside the new one, so a
 * revised call is reconstructable rather than silently overwritten.
 */
const literatureScreenSchema = z
  .object({
    pmid: z.string().trim().regex(/^\d{1,10}$/, 'pmid must be a numeric PubMed ID'),
    stage: z.enum(['title_abstract', 'full_text']),
    decision: z.enum(['included', 'excluded', 'pending']),
    exclusionReason: z.string().trim().max(4000).nullish(),
    programId: z.string().uuid().nullish(),
  })
  .superRefine((value, ctx) => {
    // MEDDEV 2.7/1 Rev 4 §8 — every exclusion carries its rationale. Checked
    // here, in the service, and by a DB CHECK constraint: three layers, because
    // this is the field an auditor reads first.
    if (value.decision === 'excluded' && !value.exclusionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusionReason'],
        message:
          'An exclusion must carry a reason — MEDDEV 2.7/1 Rev 4 §8 requires the rationale for ' +
          'every excluded article to be part of the clinical evaluation record',
      });
    }
    if (value.decision !== 'excluded' && value.exclusionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusionReason'],
        message: `An exclusion reason is only meaningful on an exclusion — "${value.decision}" must not carry one`,
      });
    }
  });

router.post('/literature/screen', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const userId = resolveUserIdOrNull(req);
  if (!userId) {
    return res.status(400).json({
      screened: false,
      error:
        'User context required — a screening decision must be attributable to a named reviewer ' +
        '(21 CFR Part 11 §11.10(e))',
    });
  }
  const parsed = literatureScreenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const { recordScreeningDecision, ScreeningRefusal, SCREENING_STAGE_LABELS } = await import(
    '../services/literature-screening.service'
  );

  try {
    if (parsed.data.programId) {
      if (!(await programVisibleInOrg(req, parsed.data.programId, organizationId))) {
        return res.status(404).json({ error: 'Program not found in your organization' });
      }
    }

    const result = await recordScreeningDecision(requestPgClient(req), organizationId, userId, {
      pmid: parsed.data.pmid,
      stage: parsed.data.stage,
      decision: parsed.data.decision,
      exclusionReason: parsed.data.exclusionReason ?? null,
      programId: parsed.data.programId ?? null,
    });

    // Governance evidence → the sanctioned chained writer. Awaited, not
    // fire-and-forget: the audit row is part of what makes this decision
    // defensible. auditService itself never throws on a persistence failure
    // (it logs), so awaiting cannot fail the user's action.
    const auditService = (await import('../services/auditService')).default;
    await auditService.logAction({
      organizationId,
      userId,
      action: result.outcome === 'created' ? 'create' : 'update',
      resourceType: 'literature_screening_decision',
      resourceId: result.current.id,
      details: {
        pmid: result.current.pmid,
        literatureEntryId: result.current.literatureEntryId,
        programId: result.current.programId,
        stage: result.current.stage,
        stageLabel: SCREENING_STAGE_LABELS[result.current.stage],
        decision: result.current.decision,
        exclusionReason: result.current.exclusionReason,
        // old → new. Null on a first decision; populated on every revision so
        // the superseded call is in the chain, not just the surviving one.
        supersededDecision: result.superseded?.decision ?? null,
        supersededExclusionReason: result.superseded?.exclusionReason ?? null,
        supersededDecidedBy: result.superseded?.decidedBy ?? null,
        supersededDecidedAt: result.superseded?.decidedAt ?? null,
        basis: 'MEDDEV 2.7/1 Rev 4 §8-§9 literature screening/appraisal',
      },
      ipAddress: req.ip,
      userAgent: req.get?.('user-agent') ?? undefined,
    });

    return res.json({ screened: true, outcome: result.outcome, decision: result.current });
  } catch (error) {
    if (error instanceof ScreeningRefusal) {
      // Refusals are the honest outcome, not a server fault: the reviewer can
      // act on every one of them.
      logger.warn('Refused a literature screening decision', {
        code: error.code,
        reason: error.message,
      });
      return res.status(422).json({ screened: false, code: error.code, error: error.message });
    }
    logger.error('Failed to record literature screening decision', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      screened: false,
      error: `Failed to record the screening decision — ${
        error instanceof Error ? error.message : 'database error'
      }`,
    });
  }
});

/**
 * GET /api/cerv2/literature/screening?programId=&pmids=…
 *
 * Read the stored decisions back so a reviewer's call survives a reload. Keyed
 * by PMID (joined through literature_entries) because that is what the search
 * surface holds. Articles with no stored decision are ABSENT from the response
 * — never defaulted to 'pending', which would report unscreened articles as
 * actively triaged.
 *
 * When the screening store is not provisioned the response is
 * { available: false, unavailableReason } with zero decisions — the same honest
 * degradation shape /literature/search uses, so the UI can say the trail is
 * unavailable instead of drawing every row as unscreened.
 */
const literatureScreeningQuerySchema = z.object({
  programId: z.string().uuid().optional(),
  /** Comma-separated PMIDs — typically the hits currently on screen. */
  pmids: z.string().trim().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

router.get('/literature/screening', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const parsed = literatureScreeningQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }

  const { getScreeningDecisions, ScreeningRefusal } = await import(
    '../services/literature-screening.service'
  );

  try {
    if (parsed.data.programId) {
      if (!(await programVisibleInOrg(req, parsed.data.programId, organizationId))) {
        return res.status(404).json({ error: 'Program not found in your organization' });
      }
    }

    const pmids = (parsed.data.pmids ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const result = await getScreeningDecisions(requestPgClient(req), organizationId, {
      programId: parsed.data.programId ?? null,
      pmids,
      limit: parsed.data.limit,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof ScreeningRefusal) {
      return res.status(422).json({
        available: false,
        code: error.code,
        error: error.message,
        decisions: [],
      });
    }
    logger.error('Failed to read literature screening decisions', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      available: false,
      error: `Failed to read screening decisions — ${
        error instanceof Error ? error.message : 'database error'
      }`,
      decisions: [],
    });
  }
});

router.get('/documents', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const hasDocsTable = await tableExists(req, 'documents');
  if (!hasDocsTable) {
    return res.json({ documents: [] });
  }

  try {
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, organizationId))
      .orderBy(desc(documents.updatedAt))
      .limit(50);

    return res.json({ documents: docs });
  } catch (error) {
    logger.error('Failed to list documents', { error });
    return res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.get('/documents/:documentId', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, documentId)))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const [latestVersion] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.id))
      .limit(1);

    return res.json({ document: doc, latestVersion });
  } catch (error) {
    logger.error('Failed to fetch document', { error, documentId });
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.post('/documents/:documentId/save', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const clientWorkspaceId = resolveClientWorkspaceId(req);
  const userId = resolveUserId(req);
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const hasDocsTable = await tableExists(req, 'documents');
  const hasVersionsTable = await tableExists(req, 'document_versions');
  if (!hasDocsTable || !hasVersionsTable) {
    return res.status(503).json({ error: 'Document tables unavailable' });
  }

  try {
    const payload = parsed.data;
    const documentType = payload.documentType || 'cerv2_510k';
    const title = payload.title || payload.metadata?.title || 'CERV2 Document';
    const documentCode = payload.documentCode || `CERV2-${documentType}-${Date.now()}`;

    const paramId = req.params.documentId;
    const documentId = Number(paramId);
    let storedDocumentId = documentId;

    if (!Number.isFinite(documentId)) {
      storedDocumentId = NaN;
    }

    if (!Number.isFinite(storedDocumentId)) {
      const [createdDoc] = await db
        .insert(documents)
        .values({
          organizationId,
          clientWorkspaceId,
          documentCode,
          title,
          documentType,
          category: 'regulatory',
          status: 'draft',
          ownerId: userId,
          createdById: userId,
          metadata: payload.metadata ?? null,
          updatedAt: new Date(),
        })
        .returning();
      storedDocumentId = createdDoc.id;
    } else {
      const [existing] = await db
        .select()
        .from(documents)
        .where(
          and(eq(documents.organizationId, organizationId), eq(documents.id, storedDocumentId))
        )
        .limit(1);

      if (!existing) {
        const [createdDoc] = await db
          .insert(documents)
          .values({
            organizationId,
            clientWorkspaceId,
            documentCode,
            title,
            documentType,
            category: 'regulatory',
            status: 'draft',
            ownerId: userId,
            createdById: userId,
            metadata: payload.metadata ?? null,
            updatedAt: new Date(),
          })
          .returning();
        storedDocumentId = createdDoc.id;
      } else {
        await db
          .update(documents)
          .set({
            title,
            documentType,
            metadata: payload.metadata ?? existing.metadata,
            updatedAt: new Date(),
          })
          .where(
            and(eq(documents.organizationId, organizationId), eq(documents.id, storedDocumentId))
          );
      }
    }

    const [versionRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, storedDocumentId));

    const versionNumber = `${Number(versionRow?.count || 0) + 1}.0`;
    const content = JSON.stringify({
      documentType,
      sections: payload.sections ?? null,
      metadata: payload.metadata ?? null,
      savedAt: new Date().toISOString(),
    });

    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId: storedDocumentId,
        versionNumber,
        content,
        changeDescription: 'Auto-save from CERV2 editor',
        changeType: 'auto_save',
        status: 'draft',
        createdById: userId,
      })
      .returning();

    return res.json({
      success: true,
      documentId: storedDocumentId,
      version: versionNumber,
      documentVersionId: version.id,
    });
  } catch (error) {
    logger.error('Failed to save document', { error });
    return res.status(500).json({ error: 'Failed to save document' });
  }
});

export default router;
