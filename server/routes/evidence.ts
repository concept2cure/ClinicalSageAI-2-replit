/**
 * Evidence Objects API Router
 *
 * Unified API for evidence management - literature, test reports, clinical data.
 * Supports linking evidence to claims, sections, and requirements.
 *
 * @version 2.0.0
 * @module server/routes/evidence
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { requestConnectable, type RequestSqlClient } from '../db/requestDb';
import { stableStringify } from '../../shared/canonical-json';
import { governedReason } from './governed-reason';
import { setRequestQuery } from '../utils/expressQuery';
import { eq, and, desc, asc, sql, count, or, ilike } from 'drizzle-orm';
import { evidenceObjects, evidenceLinks } from '../../shared/schema/programs';
import { getSecureOrgId } from '../utils/tenantContext';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('evidence');

const router = Router();

/**
 * evidence_objects.id is uuid, so a non-UUID path segment makes Postgres raise
 * 22P02 (invalid input syntax for type uuid) and the handler returns 500 for
 * what is really "no such record".
 *
 * This is not hypothetical tidying: the Evidence surface POSTs to
 * /api/evidence/ask, which lives in a different router. Any GET that reaches
 * /api/evidence/ask — a crawler, a prefetch, a mistyped link — falls through to
 * `/:id` here, binds id='ask', and 500s. A 404 is both the correct answer and
 * the one that keeps a bad path out of the error budget.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireUuidId = (req: Request, res: Response, next: NextFunction) => {
  if (!UUID_RE.test(String(req.params.id))) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Evidence object ${req.params.id} not found` },
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const evidenceTypeEnum = z.enum([
  'literature',
  'test_report',
  'clinical_data',
  'standard',
  'cer_section',
  'approval_letter',
  'guidance',
  'expert_opinion',
]);

const evidenceCategoryEnum = z.enum([
  'clinical',
  'nonclinical',
  'performance',
  'biocompatibility',
  'safety',
  'regulatory',
  'manufacturing',
]);

const sourceTypeEnum = z.enum(['internal', 'external', 'literature', 'agency', 'standard_body']);
const evidenceLevelEnum = z.enum(['I', 'II', 'III', 'IV', 'V']);
const statusEnum = z.enum(['pending', 'approved', 'rejected', 'superseded']);
const REVIEW_METADATA = ['verificationReceipt', 'verificationInvalidation', 'verificationComments'] as const;
const evidenceMetadata = z.record(z.string(), z.unknown()).refine(
  value => !REVIEW_METADATA.some(key => Object.prototype.hasOwnProperty.call(value, key)),
  'Verification records are written by the governed review, not supplied as metadata.',
);

const createEvidenceSchema = z.object({
  title: z.string().min(1).max(500),
  code: z.string().max(100).optional(),
  description: z.string().optional(),
  evidenceType: evidenceTypeEnum,
  evidenceCategory: evidenceCategoryEnum,
  evidenceLevel: evidenceLevelEnum.optional(),
  sourceType: sourceTypeEnum,
  sourceReference: z.string().optional(),
  sourceCitation: z.string().optional(),
  programId: z.string().guid().optional(),
  documentId: z.number().optional(),
  documentVersion: z.string().optional(),
  pageRange: z.string().optional(),
  excerpt: z.string().optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  authors: z.array(z.string()).optional(),
  publicationDate: z.string().datetime().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  abstract: z.string().optional(),
  testType: z.string().optional(),
  testLab: z.string().optional(),
  testDate: z.string().datetime().optional(),
  testResults: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: evidenceMetadata.optional(),
});

const contentHash = z.string().regex(/^[0-9a-f]{64}$/);
const updateEvidenceSchema = createEvidenceSchema.partial().extend({
  reason: governedReason,
  expectedContentHash: contentHash.optional(),
}).strict();
const verifyEvidenceSchema = z.object({
  approved: z.boolean(), expectedContentHash: contentHash, reason: governedReason,
  comments: z.string().trim().max(4000).optional(),
}).strict();

const createLinkSchema = z.object({
  evidenceId: z.string().guid(),
  targetType: z.enum(['claim', 'section', 'requirement', 'standard', 'question']),
  targetId: z.string(),
  targetPath: z.string().optional(),
  linkType: z.enum(['supports', 'contradicts', 'references', 'supersedes']).default('supports'),
  strength: z.enum(['strong', 'moderate', 'weak']).default('moderate'),
  rationale: z.string().optional(),
});

const queryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  programId: z.string().guid().optional(),
  evidenceType: evidenceTypeEnum.optional(),
  evidenceCategory: evidenceCategoryEnum.optional(),
  status: statusEnum.optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'qualityScore', 'relevanceScore'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const validateBody = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.issues },
      });
      return;
    }
    next(error);
  }
};

const validateQuery =
  (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.query is getter-only in Express 5 — see setRequestQuery.
      setRequestQuery(req, schema.parse(req.query));
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  };

// Column map for sortBy -> actual drizzle column
const sortColumnMap: Record<string, any> = {
  createdAt: evidenceObjects.createdAt,
  updatedAt: evidenceObjects.updatedAt,
  title: evidenceObjects.title,
  qualityScore: evidenceObjects.qualityScore,
  relevanceScore: evidenceObjects.relevanceScore,
};

type EvidenceRecord = typeof evidenceObjects.$inferSelect;
const evidenceColumns = {
  title: 'title', code: 'code', description: 'description', evidenceType: 'evidence_type',
  evidenceCategory: 'evidence_category', evidenceLevel: 'evidence_level', sourceType: 'source_type',
  sourceReference: 'source_reference', sourceCitation: 'source_citation', programId: 'program_id',
  documentId: 'document_id', documentVersion: 'document_version', pageRange: 'page_range', excerpt: 'excerpt',
  qualityScore: 'quality_score', relevanceScore: 'relevance_score', validFrom: 'valid_from', validUntil: 'valid_until',
  authors: 'authors', publicationDate: 'publication_date', journal: 'journal', doi: 'doi', pmid: 'pmid',
  abstract: 'abstract', testType: 'test_type', testLab: 'test_lab', testDate: 'test_date',
  testResults: 'test_results', tags: 'tags', metadata: 'metadata',
} as const;
const dateFields = new Set(['validFrom', 'validUntil', 'publicationDate', 'testDate']);

function metadataOf(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new EvidenceRefusal(409, 'EVIDENCE_METADATA_UNREADABLE', 'The evidence metadata needs review before it can be changed.');
  return { ...value as Record<string, unknown> };
}

function materialEvidenceValue(key: string, raw: unknown): unknown {
  const value = raw ?? null;
  if (key === 'metadata') {
    const material = metadataOf(value);
    for (const reserved of REVIEW_METADATA) delete material[reserved];
    return material;
  }
  if (dateFields.has(key) && value !== null) return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
  if ((key === 'qualityScore' || key === 'relevanceScore') && value !== null) return String(Number(value));
  return value;
}

/** Human-review binding, versioned independently of review state and audit timestamps. */
export function evidenceContentHash(evidence: EvidenceRecord): string {
  const content: Record<string, unknown> = { id: evidence.id, organizationId: evidence.organizationId };
  for (const key of Object.keys(evidenceColumns) as Array<keyof typeof evidenceColumns>) content[key] = materialEvidenceValue(key, evidence[key]);
  return createHash('sha256').update(stableStringify({ schemaVersion: 1, content })).digest('hex');
}

function evidenceRow(row: Record<string, unknown>): EvidenceRecord {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) mapped[key.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase())] = value;
  return mapped as EvidenceRecord;
}

class EvidenceRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Fresh authority on the same request executor, retaining membership and project locks until commit. */
async function admitEvidenceWriter(req: Request, client: RequestSqlClient, organizationId: number, programId: string | null): Promise<number> {
  const rawUserId = req.user?.id;
  const userId = typeof rawUserId === 'number' ? rawUserId : typeof rawUserId === 'string' && /^\d+$/.test(rawUserId) ? Number(rawUserId) : NaN;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new EvidenceRefusal(401, 'ACTOR_REQUIRED', 'A signed-in reviewer is required.');
  const { readCurrentProgramActor, requireCurrentProgramAccess } = await import('../services/c2c/current-program-access');
  const { GOVERNED_WRITE_ROLES } = await import('../middleware/orgMembership');
  const actor = await readCurrentProgramActor(client, { organizationId, userId, forShare: true });
  if (!GOVERNED_WRITE_ROLES.has(actor.role)) throw new EvidenceRefusal(403, 'EVIDENCE_WRITE_DENIED', 'Your current organization role cannot change evidence.');
  req.userId = actor.userId;
  if (programId !== null) {
    const access = await requireCurrentProgramAccess(client, { organizationId, userId, programId, forShare: true });
    const { requireProjectAdmission } = await import('./c2c/project-access');
    await requireProjectAdmission(req, String(access.projectId), true, { executor: client, programId, forShare: true });
  }
  return actor.userId;
}

async function mutateEvidence<T>(req: Request, work: (client: RequestSqlClient, before: EvidenceRecord, userId: number) => Promise<T>): Promise<T> {
  const organizationId = Number(getSecureOrgId(req));
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new EvidenceRefusal(401, 'UNAUTHORIZED', 'Tenant context required.');
  const client = await requestConnectable(req).connect();
  let committing = false;
  try {
    await client.query('BEGIN');
    const scope = await client.query('SELECT program_id FROM evidence_objects WHERE id=$1 AND organization_id=$2', [String(req.params.id), organizationId]);
    if (scope.rows.length !== 1) throw new EvidenceRefusal(404, 'NOT_FOUND', 'Evidence object not found.');
    const programId = scope.rows[0].program_id as string | null;
    const userId = await admitEvidenceWriter(req, client, organizationId, programId);
    if (req.body.programId !== undefined && req.body.programId !== programId) {
      await admitEvidenceWriter(req, client, organizationId, req.body.programId);
    }
    const result = await client.query('SELECT * FROM evidence_objects WHERE id=$1 AND organization_id=$2 FOR UPDATE', [String(req.params.id), organizationId]);
    if (result.rows.length !== 1) throw new EvidenceRefusal(404, 'NOT_FOUND', 'Evidence object not found.');
    const before = evidenceRow(result.rows[0]);
    if (before.programId !== programId) throw new EvidenceRefusal(409, 'EVIDENCE_SCOPE_CHANGED', 'The evidence project changed. Re-read it before recording a decision.');
    const out = await work(client, before, userId);
    committing = true;
    await client.query('COMMIT');
    return out;
  } catch (error) {
    if (committing) {
      client.release(error instanceof Error ? error : new Error('Evidence transaction outcome unknown'));
      throw new EvidenceRefusal(500, 'OUTCOME_UNKNOWN', 'The evidence change could not be confirmed. Re-read the evidence before trying again.');
    }
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { client.release(rollbackError instanceof Error ? rollbackError : new Error('Evidence rollback failed')); }
    throw error;
  } finally { client.release(); }
}

function failedEvidenceMutation(res: Response, error: unknown): Response {
  const failure = error as { status?: unknown; code?: unknown; message?: unknown };
  if (failure instanceof EvidenceRefusal || (typeof failure.status === 'number' && [403,404,409,503].includes(failure.status))) {
    return res.status(failure.status as number).json({ success: false, error: { code: failure.code, message: failure.message } });
  }
  logger.error('Evidence change not recorded', { error: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ success: false, error: { code: 'EVIDENCE_CHANGE_NOT_RECORDED', message: 'The evidence change and its audit record were not recorded.' } });
}

async function auditEvidence(client: RequestSqlClient, before: EvidenceRecord, userId: number,
  input: { action: string; reason: string; details: Record<string, unknown> }): Promise<void> {
  const { writeChainedAuditRow } = await import('../services/auditService');
  await writeChainedAuditRow(client, { tenantId: before.organizationId, userId, action: input.action,
    resourceType: 'evidence_objects', resourceId: before.id, reason: input.reason,
    details: { ...input.details, reason: input.reason } });
}

type EvidenceUpdate = z.infer<typeof updateEvidenceSchema>;
async function updateEvidenceContent(client: RequestSqlClient, before: EvidenceRecord, updates: EvidenceUpdate, userId: number): Promise<EvidenceRecord> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(evidenceColumns) as Array<keyof typeof evidenceColumns>) {
    if (updates[key] === undefined || key === 'metadata') continue;
    patch[evidenceColumns[key]] = updates[key];
  }
  const metadata = metadataOf(updates.metadata ?? before.metadata);
  const previousMetadata = metadataOf(before.metadata);
  for (const reserved of REVIEW_METADATA) {
    if (Object.prototype.hasOwnProperty.call(previousMetadata, reserved)) metadata[reserved] = previousMetadata[reserved];
  }
  patch.metadata = metadata;
  // The row's actual column types govern JSON, UUID, timestamp and numeric
  // conversion. Key presence preserves omitted fields without interpolating SQL.
  const updated = await client.query(`UPDATE evidence_objects AS saved SET
    title=CASE WHEN $1::jsonb ? 'title' THEN patch.title ELSE saved.title END,
    code=CASE WHEN $1::jsonb ? 'code' THEN patch.code ELSE saved.code END,
    description=CASE WHEN $1::jsonb ? 'description' THEN patch.description ELSE saved.description END,
    evidence_type=CASE WHEN $1::jsonb ? 'evidence_type' THEN patch.evidence_type ELSE saved.evidence_type END,
    evidence_category=CASE WHEN $1::jsonb ? 'evidence_category' THEN patch.evidence_category ELSE saved.evidence_category END,
    evidence_level=CASE WHEN $1::jsonb ? 'evidence_level' THEN patch.evidence_level ELSE saved.evidence_level END,
    source_type=CASE WHEN $1::jsonb ? 'source_type' THEN patch.source_type ELSE saved.source_type END,
    source_reference=CASE WHEN $1::jsonb ? 'source_reference' THEN patch.source_reference ELSE saved.source_reference END,
    source_citation=CASE WHEN $1::jsonb ? 'source_citation' THEN patch.source_citation ELSE saved.source_citation END,
    program_id=CASE WHEN $1::jsonb ? 'program_id' THEN patch.program_id ELSE saved.program_id END,
    document_id=CASE WHEN $1::jsonb ? 'document_id' THEN patch.document_id ELSE saved.document_id END,
    document_version=CASE WHEN $1::jsonb ? 'document_version' THEN patch.document_version ELSE saved.document_version END,
    page_range=CASE WHEN $1::jsonb ? 'page_range' THEN patch.page_range ELSE saved.page_range END,
    excerpt=CASE WHEN $1::jsonb ? 'excerpt' THEN patch.excerpt ELSE saved.excerpt END,
    quality_score=CASE WHEN $1::jsonb ? 'quality_score' THEN patch.quality_score ELSE saved.quality_score END,
    relevance_score=CASE WHEN $1::jsonb ? 'relevance_score' THEN patch.relevance_score ELSE saved.relevance_score END,
    valid_from=CASE WHEN $1::jsonb ? 'valid_from' THEN patch.valid_from ELSE saved.valid_from END,
    valid_until=CASE WHEN $1::jsonb ? 'valid_until' THEN patch.valid_until ELSE saved.valid_until END,
    authors=CASE WHEN $1::jsonb ? 'authors' THEN patch.authors ELSE saved.authors END,
    publication_date=CASE WHEN $1::jsonb ? 'publication_date' THEN patch.publication_date ELSE saved.publication_date END,
    journal=CASE WHEN $1::jsonb ? 'journal' THEN patch.journal ELSE saved.journal END,
    doi=CASE WHEN $1::jsonb ? 'doi' THEN patch.doi ELSE saved.doi END,
    pmid=CASE WHEN $1::jsonb ? 'pmid' THEN patch.pmid ELSE saved.pmid END,
    abstract=CASE WHEN $1::jsonb ? 'abstract' THEN patch.abstract ELSE saved.abstract END,
    test_type=CASE WHEN $1::jsonb ? 'test_type' THEN patch.test_type ELSE saved.test_type END,
    test_lab=CASE WHEN $1::jsonb ? 'test_lab' THEN patch.test_lab ELSE saved.test_lab END,
    test_date=CASE WHEN $1::jsonb ? 'test_date' THEN patch.test_date ELSE saved.test_date END,
    test_results=CASE WHEN $1::jsonb ? 'test_results' THEN patch.test_results ELSE saved.test_results END,
    tags=CASE WHEN $1::jsonb ? 'tags' THEN patch.tags ELSE saved.tags END,
    metadata=patch.metadata, updated_by=$2, updated_at=NOW()
    FROM json_populate_record(NULL::evidence_objects, $1::json) AS patch
    WHERE saved.id=$3 AND saved.organization_id=$4 RETURNING saved.*`,
  [JSON.stringify(patch), String(userId), before.id, before.organizationId]);
  return evidenceRow(updated.rows[0]);
}

function hasEvidenceReview(before: EvidenceRecord): boolean {
  return before.isVerified === true || before.verifiedBy !== null || before.verifiedAt !== null ||
    before.status === 'approved' || before.status === 'rejected' || metadataOf(before.metadata).verificationReceipt !== undefined;
}
async function invalidateSupportReviews(client: RequestSqlClient, evidence: EvidenceRecord): Promise<boolean> {
  const out = await client.query(`UPDATE evidence_links SET is_verified=false, verified_by=NULL, verified_at=NULL
    WHERE evidence_id=$1 AND organization_id=$2 AND (is_verified=true OR verified_by IS NOT NULL OR verified_at IS NOT NULL) RETURNING id`,
    [evidence.id, evidence.organizationId]);
  return out.rows.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence
 * List all evidence objects with filtering and pagination
 */
router.get('/', validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      programId,
      evidenceType,
      evidenceCategory,
      status,
      search,
      sortBy,
      sortOrder,
      // validateQuery(queryParamsSchema) has already parsed/validated req.query
      // against this schema; cast through unknown across the ParsedQs boundary.
    } = req.query as unknown as z.infer<typeof queryParamsSchema>;

    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];
    if (programId) conditions.push(eq(evidenceObjects.programId, programId));
    if (evidenceType) conditions.push(eq(evidenceObjects.evidenceType, evidenceType));
    if (evidenceCategory) conditions.push(eq(evidenceObjects.evidenceCategory, evidenceCategory));
    if (status) conditions.push(eq(evidenceObjects.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(evidenceObjects.title, `%${search}%`),
          ilike(evidenceObjects.description, `%${search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);
    const offset = (page - 1) * limit;

    const sortCol = sortColumnMap[sortBy] || evidenceObjects.createdAt;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const [evidence, totalResult] = await Promise.all([
      db
        .select()
        .from(evidenceObjects)
        .where(whereClause)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(evidenceObjects)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.total ?? 0;

    res.json({
      success: true,
      data: evidence,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('GET / error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch evidence' },
    });
  }
});

/**
 * GET /api/evidence/search
 * Search evidence with faceted filters
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, category, level, status, programId, verified } = req.query;

    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];

    if (q && typeof q === 'string') {
      conditions.push(
        or(
          ilike(evidenceObjects.title, `%${q}%`),
          ilike(evidenceObjects.description, `%${q}%`)
        )!
      );
    }
    if (type && typeof type === 'string') conditions.push(eq(evidenceObjects.evidenceType, type));
    if (category && typeof category === 'string') conditions.push(eq(evidenceObjects.evidenceCategory, category));
    if (level && typeof level === 'string') conditions.push(eq(evidenceObjects.evidenceLevel, level));
    if (status && typeof status === 'string') conditions.push(eq(evidenceObjects.status, status));
    if (programId && typeof programId === 'string') conditions.push(eq(evidenceObjects.programId, programId));
    if (verified === 'true') conditions.push(eq(evidenceObjects.isVerified, true));
    if (verified === 'false') conditions.push(eq(evidenceObjects.isVerified, false));

    const whereClause = and(...conditions);
    const baseWhere = eq(evidenceObjects.organizationId, orgIdNum);

    const [items, totalResult, typeFacets, categoryFacets, levelFacets, statusFacets] =
      await Promise.all([
        db.select().from(evidenceObjects).where(whereClause).orderBy(desc(evidenceObjects.createdAt)).limit(50),
        db.select({ total: count() }).from(evidenceObjects).where(whereClause),
        db
          .select({ value: evidenceObjects.evidenceType, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.evidenceType),
        db
          .select({ value: evidenceObjects.evidenceCategory, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.evidenceCategory),
        db
          .select({ value: evidenceObjects.evidenceLevel, count: count() })
          .from(evidenceObjects)
          .where(and(baseWhere, sql`${evidenceObjects.evidenceLevel} IS NOT NULL`))
          .groupBy(evidenceObjects.evidenceLevel),
        db
          .select({ value: evidenceObjects.status, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.status),
      ]);

    res.json({
      success: true,
      data: {
        items,
        facets: {
          type: typeFacets,
          category: categoryFacets,
          level: levelFacets,
          status: statusFacets,
        },
        total: totalResult[0]?.total ?? 0,
      },
    });
  } catch (error) {
    logger.error('GET /search error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Search failed' },
    });
  }
});

/**
 * GET /api/evidence/stats
 * Get evidence statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];
    if (programId && typeof programId === 'string') {
      conditions.push(eq(evidenceObjects.programId, programId));
    }
    const whereClause = and(...conditions);

    const [
      totalResult,
      verifiedResult,
      statusCounts,
      typeCounts,
      categoryCounts,
      levelCounts,
      avgScores,
      linkedCountResult,
    ] = await Promise.all([
      db.select({ total: count() }).from(evidenceObjects).where(whereClause),
      db.select({ total: count() }).from(evidenceObjects).where(and(...conditions, eq(evidenceObjects.isVerified, true))),
      db.select({ value: evidenceObjects.status, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.status),
      db.select({ value: evidenceObjects.evidenceType, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.evidenceType),
      db.select({ value: evidenceObjects.evidenceCategory, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.evidenceCategory),
      db.select({ value: evidenceObjects.evidenceLevel, count: count() }).from(evidenceObjects)
        .where(and(...conditions, sql`${evidenceObjects.evidenceLevel} IS NOT NULL`))
        .groupBy(evidenceObjects.evidenceLevel),
      db.select({
        avgQuality: sql<string>`COALESCE(AVG(${evidenceObjects.qualityScore}::numeric), 0)`,
        avgRelevance: sql<string>`COALESCE(AVG(${evidenceObjects.relevanceScore}::numeric), 0)`,
      }).from(evidenceObjects).where(whereClause),
      db.select({ total: sql<number>`COUNT(DISTINCT ${evidenceLinks.evidenceId})` })
        .from(evidenceLinks)
        .where(eq(evidenceLinks.organizationId, orgIdNum)),
    ]);

    const total = totalResult[0]?.total ?? 0;
    const verified = verifiedResult[0]?.total ?? 0;
    const linkedEvidence = linkedCountResult[0]?.total ?? 0;

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) statusMap[row.value] = row.count;

    const byType: Record<string, number> = {};
    for (const row of typeCounts) byType[row.value] = row.count;

    const byCategory: Record<string, number> = {};
    for (const row of categoryCounts) byCategory[row.value] = row.count;

    const byLevel: Record<string, number> = {};
    for (const row of levelCounts) if (row.value) byLevel[row.value] = row.count;

    res.json({
      success: true,
      data: {
        total,
        verified,
        pending: statusMap['pending'] ?? 0,
        rejected: statusMap['rejected'] ?? 0,
        byType,
        byCategory,
        byLevel,
        averageQualityScore: parseFloat(avgScores[0]?.avgQuality ?? '0'),
        averageRelevanceScore: parseFloat(avgScores[0]?.avgRelevance ?? '0'),
        linkedEvidence,
        unlinkedEvidence: Math.max(0, total - linkedEvidence),
      },
    });
  } catch (error) {
    logger.error('GET /stats error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
    });
  }
});

/**
 * GET /api/evidence/:id
 * Get a single evidence object by ID
 */
router.get('/:id', requireUuidId, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const [evidence] = await db
      .select()
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, data: { ...evidence, links }, meta: { contentHash: evidenceContentHash(evidence) } });
  } catch (error) {
    logger.error('GET /:id error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch evidence' },
    });
  }
});

/**
 * POST /api/evidence
 * Create a new evidence object
 */
router.post('/', validateBody(createEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userId = (req as any).user?.id ? String((req as any).user.id) : 'system';

    const typePrefix =
      data.evidenceType === 'literature'
        ? 'LIT'
        : data.evidenceType === 'test_report'
          ? 'TEST'
          : data.evidenceType === 'clinical_data'
            ? 'CLIN'
            : 'EV';
    const code =
      data.code ||
      `${typePrefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    const [evidence] = await db
      .insert(evidenceObjects)
      .values({
        organizationId: orgIdNum,
        programId: data.programId || null,
        title: data.title,
        code,
        description: data.description || null,
        evidenceType: data.evidenceType,
        evidenceCategory: data.evidenceCategory,
        evidenceLevel: data.evidenceLevel || null,
        sourceType: data.sourceType,
        sourceReference: data.sourceReference || null,
        sourceCitation: data.sourceCitation || null,
        documentId: data.documentId || null,
        documentVersion: data.documentVersion || null,
        pageRange: data.pageRange || null,
        excerpt: data.excerpt || null,
        qualityScore: data.qualityScore != null ? String(data.qualityScore) : null,
        relevanceScore: data.relevanceScore != null ? String(data.relevanceScore) : null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        isVerified: false,
        authors: data.authors || null,
        publicationDate: data.publicationDate ? new Date(data.publicationDate) : null,
        journal: data.journal || null,
        doi: data.doi || null,
        pmid: data.pmid || null,
        abstract: data.abstract || null,
        testType: data.testType || null,
        testLab: data.testLab || null,
        testDate: data.testDate ? new Date(data.testDate) : null,
        testResults: data.testResults || null,
        status: 'pending',
        metadata: data.metadata || null,
        tags: data.tags || [],
        createdBy: userId,
        updatedBy: userId,
      } as any)
      .returning();

    res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    logger.error('POST / error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create evidence' },
    });
  }
});

/**
 * PATCH /api/evidence/:id
 * Update an evidence object
 */
router.patch('/:id', requireUuidId, validateBody(updateEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const updates = req.body as z.infer<typeof updateEvidenceSchema>;
    const out = await mutateEvidence(req, async (client, before, userId) => {
      const beforeHash = evidenceContentHash(before);
      if (updates.expectedContentHash && updates.expectedContentHash !== beforeHash) {
        throw new EvidenceRefusal(409, 'EVIDENCE_CHANGED', 'The evidence changed. Re-read it before recording this change.');
      }
      let updated = await updateEvidenceContent(client, before, updates, userId);
      // Bind the actual saved values, including database decimal/date normalization.
      const nextHash = evidenceContentHash(updated);
      const contentChanged = beforeHash !== nextHash;
      const changedFields = (Object.keys(evidenceColumns) as Array<keyof typeof evidenceColumns>).filter(key =>
        stableStringify(materialEvidenceValue(key, before[key])) !== stableStringify(materialEvidenceValue(key, updated[key])));
      const verificationInvalidated = contentChanged && hasEvidenceReview(before);
      const supportVerificationInvalidated = contentChanged ? await invalidateSupportReviews(client, before) : false;
      let invalidation: Record<string, unknown> | null = null;
      if (verificationInvalidated) {
        const metadata = metadataOf(updated.metadata);
        delete metadata.verificationReceipt;
        delete metadata.verificationComments;
        invalidation = { schemaVersion: 1, previousContentHash: beforeHash, contentHash: nextHash,
          changedFields, invalidatedBy: userId, invalidatedAt: new Date().toISOString(),
          reason: 'Evidence content or source changed; review of the current content is required.' };
        metadata.verificationInvalidation = invalidation;
        const reset = await client.query(`UPDATE evidence_objects SET is_verified=false, verified_by=NULL,
          verified_at=NULL, status='pending', metadata=$1::json WHERE id=$2 AND organization_id=$3 RETURNING *`,
          [JSON.stringify(metadata), before.id, before.organizationId]);
        updated = evidenceRow(reset.rows[0]);
      }
      await auditEvidence(client, before, userId, { action: verificationInvalidated ? 'evidence.verification_invalidated' : 'evidence.updated', reason: updates.reason,
        details: { previousContentHash: beforeHash, contentHash: nextHash, changedFields, verificationInvalidated,
          supportVerificationInvalidated, previousVerification: metadataOf(before.metadata).verificationReceipt ?? null } });
      return { data: updated, meta: { contentHash: nextHash, verificationInvalidated, supportVerificationInvalidated,
        ...(invalidation ? { reason: invalidation } : {}) } };
    });
    return res.json({ success: true, ...out });
  } catch (error) { return failedEvidenceMutation(res, error); }
});

/**
 * DELETE /api/evidence/:id
 * Delete an evidence object
 */
router.delete('/:id', requireUuidId, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const existing = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    await db
      .delete(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    await db
      .delete(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)));

    res.json({ success: true, message: 'Evidence deleted successfully' });
  } catch (error) {
    logger.error('DELETE /:id error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete evidence' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence Verification
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/evidence/:id/verify
 * Verify an evidence object
 */
router.post('/:id/verify', requireUuidId, validateBody(verifyEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const decision = req.body as z.infer<typeof verifyEvidenceSchema>;
    const out = await mutateEvidence(req, async (client, before, userId) => {
      const currentHash = evidenceContentHash(before);
      if (decision.expectedContentHash !== currentHash) {
        throw new EvidenceRefusal(409, 'EVIDENCE_CHANGED', 'The evidence changed after it was read. Review the current content before deciding.');
      }
      const reviewedAt = new Date().toISOString();
      const metadata = metadataOf(before.metadata);
      delete metadata.verificationInvalidation;
      metadata.verificationReceipt = { schemaVersion: 1, method: 'human_review', contentHash: currentHash,
        approved: decision.approved, reviewerUserId: userId, reviewedAt, reason: decision.reason };
      if (decision.comments) metadata.verificationComments = decision.comments;
      else delete metadata.verificationComments;
      const updated = await client.query(`UPDATE evidence_objects
        SET is_verified=$1, verified_by=$2, verified_at=$3, status=$4, metadata=$5::json,
            updated_by=$6, updated_at=NOW() WHERE id=$7 AND organization_id=$8 RETURNING *`,
        [decision.approved, decision.approved ? String(userId) : null, decision.approved ? reviewedAt : null,
          decision.approved ? 'approved' : 'rejected', JSON.stringify(metadata), String(userId), before.id, before.organizationId]);
      const supportVerificationInvalidated = decision.approved ? false : await invalidateSupportReviews(client, before);
      await auditEvidence(client, before, userId, { action: decision.approved ? 'evidence.verified' : 'evidence.rejected', reason: decision.reason,
        details: { contentHash: currentHash, previousVerified: before.isVerified, receipt: metadata.verificationReceipt,
          comments: decision.comments ?? null, supportVerificationInvalidated } });
      return { data: evidenceRow(updated.rows[0]), meta: { contentHash: currentHash, audited: true,
        verificationMethod: 'human_review' } };
    });
    return res.json({ success: true, ...out });
  } catch (error) { return failedEvidenceMutation(res, error); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence Links
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence/:id/links
 * Get all links for an evidence object
 */
router.get('/:id/links', requireUuidId, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, data: links });
  } catch (error) {
    logger.error('GET /:id/links error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch links' },
    });
  }
});

/**
 * POST /api/evidence/links
 * Create a new evidence link
 */
router.post('/links', validateBody(createLinkSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userId = (req as any).user?.id ? String((req as any).user.id) : 'system';

    const [evidenceExists] = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, data.evidenceId), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (!evidenceExists) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${data.evidenceId} not found` },
      });
    }

    const [link] = await db
      .insert(evidenceLinks)
      .values({
        organizationId: orgIdNum,
        evidenceId: data.evidenceId,
        targetType: data.targetType,
        targetId: data.targetId,
        targetPath: data.targetPath || null,
        linkType: data.linkType,
        strength: data.strength,
        rationale: data.rationale || null,
        isVerified: false,
        createdBy: userId,
      } as any)
      .returning();

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    logger.error('POST /links error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create link' },
    });
  }
});

/**
 * DELETE /api/evidence/links/:linkId
 * Delete an evidence link
 */
router.delete('/links/:linkId', async (req: Request, res: Response) => {
  try {
    const linkId = String(req.params.linkId);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const existing = await db
      .select({ id: evidenceLinks.id })
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.id, linkId), eq(evidenceLinks.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence link ${linkId} not found` },
      });
    }

    await db
      .delete(evidenceLinks)
      .where(and(eq(evidenceLinks.id, linkId), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error) {
    logger.error('DELETE /links/:linkId error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete link' },
    });
  }
});

export default router;
