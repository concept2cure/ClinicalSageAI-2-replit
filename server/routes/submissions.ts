/**
 * Canonical submission core API (spec §8.3)
 *
 * The REST surface for the canonical core — the API the Phase-2 Builder and
 * Sequences workspaces render against, and that nothing previously exposed.
 * Mounted at /api/submissions with authenticateToken applied at mount time.
 *
 * Every handler resolves organizationId/userId from the authenticated session
 * only (never from body/params), validates with Zod, and is RBAC-gated.
 */

import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../middleware/auth';
import { isUuid } from '../middleware/uuidParam';
import { ok, respondIfConverterBusy } from '../lib/api-response';
import { requestDb, requestPgClient } from '../db/requestDb';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import {
  createGovernedExportConsequence,
  createAuditedUnplacedExport,
} from '../services/export/governedExportConsequence';
import { createRateLimiter } from '../middleware/rateLimiter';
import { GATEWAY_ERROR_HTTP_STATUS } from '../services/ai-gateway/gateway-error-map';
import {
  createSubmission,
  getSubmission,
  getSequence,
  sequenceDispatchAuthorizationEligibility,
  createSequence,
  transitionSequence,
  upsertLeaf,
  removeLeaf,
  anchorSubmissionToProgram,
  listAnchorCandidates,
  SUBMISSION_ERROR_STATUS,
} from '../services/submission-service/submission-service';
import { resolveSignerOrgRole } from '../services/part11/resolve-signer-role';
import {
  isPlaceableDocumentTable,
  unplaceableDocumentTableMessage,
} from '../services/ectd/leaf-document-tables';
import { assessPathwayReadiness, PATHWAYS, type Pathway } from '../services/pathway-engines';
import {
  generateSubmissionPlan,
  explainValidation,
  runDispatchQc,
} from '../services/submission-ai/submission-ai-service';
import {
  traceProvenance,
  runConsistencyCheck,
  listConsistencyFindings,
} from '../services/truth-engine/truth-engine-service';
import { setAuditRowHeaders } from '../services/audit/audit-write-outcome';
import {
  runShadowReview,
  listShadowReviewRuns,
  getShadowReviewFindings,
} from '../services/shadow-review/shadow-review-service';
import { SHADOW_FINDING_DISPOSITIONS, withShadowFindingDispositions } from '../services/ectd/shadow-finding-disposition';
import { generateSection, AuthoringError } from '../services/authoring/section-generation-service';
import { createScopedLogger } from '../utils/logger.js';
import { requireGovernedReason } from './governed-reason';
import { readMarketApplicationNumber, recordMarketApplicationNumber } from '../services/submission-service/market-application-number';
import { stfFileName } from '../services/ectd/stf-generator';
import {
  listSubmissionsForRequest, getSubmissionForRequest, listSequencesForRequest, readSubmissionSequenceForRequest,
  readSubmissionLeavesForRequest, requireSubmissionReadStillCurrent, readDeliverableEvaluationInput, SubmissionReadError,
} from '../services/submission-service/submission-request-read';
import { readSubmissionHistoryForRequest } from '../services/submission-service/submission-history-read';
import { ProgramReadAccessError } from '../services/c2c/current-program-access';
import { AuthoringReadScopeError } from '../services/authoring/authoring-read-scope';
import { readSubmissionLeafSourceEvidence, requireSubmissionLeafSourceEvidenceStillCurrent, SubmissionLeafSourceReadError } from '../services/ectd/submission-leaf-source-evidence';

const logger = createScopedLogger('submissions-routes');
const router = Router();
const limiter = createRateLimiter();

interface Ctx {
  userId: number;
  organizationId: number;
  /** The request's address, for governed-export provenance and audit rows. */
  ipAddress: string | null;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  // Resolve the org the same way the rest of the platform does: tenant context
  // first, then the user claim. The org id is an integer FK; a non-numeric claim
  // (e.g. a UUID) is treated as unauthenticated rather than silently mis-scoped.
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId, ipAddress: req.ip ?? null };
}

const CODE_STATUS: Record<string, number> = {
  ...SUBMISSION_ERROR_STATUS,
  NO_AUTHORED_CONTENT: 422,
  // The gateway's own table, not a copy: a copy missed PLACEMENT_REFUSED (a
  // tenant placement refusal, 403) and answered it as a 500 (D6).
  ...GATEWAY_ERROR_HTTP_STATUS,
};

function isSubmissionReadRefusal(err: unknown): err is SubmissionReadError | ProgramReadAccessError | SubmissionLeafSourceReadError | AuthoringReadScopeError {
  return err instanceof SubmissionReadError || err instanceof ProgramReadAccessError || err instanceof SubmissionLeafSourceReadError || err instanceof AuthoringReadScopeError;
}
function handleReadRefusal(res: Response, err: unknown): boolean {
  if (!isSubmissionReadRefusal(err)) return false;
  if (err.status === 503) {
    logger.error('Submission read verification unavailable', { error: err });
    res.status(503).json({ error: { code: err.code, message: 'The submission records could not be verified. Refresh and try again.' } });
  } else res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return true;
}
function handleKnownCodeFailure(res: Response, err: unknown): boolean {
  // Any service error that carries a known `code` maps to a stable HTTP status.
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return true;
  }
  return false;
}
function fail(res: Response, err: unknown): void {
  if (handleReadRefusal(res, err)) return;
  // Assemble, freeze, dispatch and transmit all assemble the package, which
  // converts PDF leaves in conversion slots: a slot that never freed is 503
  // with Retry-After, not a 500 (OPS-13, MR-03 Stage 2).
  if (respondIfConverterBusy(res, err)) return;
  if (handleKnownCodeFailure(res, err)) return;
  const code = (err as { code?: string } | null)?.code;

  /* The support handle: `auditLog` (middleware/enterprise-security.ts) sets it
     before any route runs and echoes it as `X-Request-Id`, which is the
     "Reference <id>" the user reads off the error banner. Logging it is what
     makes a reported failure findable. */
  const header = res.getHeader('X-Request-Id');
  const correlationId = typeof header === 'string' && header ? header : null;

  /* ── 42P01: an unprovisioned store is not an internal error ────────────────
     MDX UAT 2026-08-18, item A2: GET /api/submissions returned 500 while
     GET /api/510k/estar/submissions returned 200. They are two different
     STORES, not two services: the canonical core lives in the `submissions`
     family created by migrations/20260604_submission_core_canonical.sql, which
     reached no durable applier until it was added to
     scripts/db/migration-set.mjs. On a database that never got it,
     `listSubmissions`' first statement raises 42P01.

     Reported as 500 INTERNAL that read as "the product is broken", when the
     true state is "this environment is not fully set up" — a different problem,
     with a different owner and a different fix. Every other router in this
     repository already answers 503 PENDING_STORE for exactly this (see
     `pendingStore` in routes/c2c/projects.ts, whose envelope this mirrors), and
     the client already branches on the code. Nothing here names the relation:
     the store is identified in the LOG, not in the response.

     Wiring the migration is the fix; this is the honest state for any database
     that has not applied it yet, and for the next store that goes missing. */
  if (code === '42P01') {
    const raw = err instanceof Error ? err.message : String(err);
    logger.error('Submission store not provisioned — request failed closed', {
      correlationId,
      code,
      store: /relation "([^"]+)" does not exist/i.exec(raw)?.[1] ?? null,
    });
    res.status(503).json({
      error: {
        code: 'PENDING_STORE',
        message:
          'This environment is not fully set up, so the submissions could not be read. ' +
          'Share the reference below with your system administrator or Concept2Cure support.',
      },
      ...(correlationId ? { correlationId } : {}),
    });
    return;
  }

  logger.error('submissions route error', {
    err: err instanceof Error ? err.message : String(err),
    correlationId,
    code: code ?? null,
  });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Request failed.' },
    ...(correlationId ? { correlationId } : {}),
  });
}

const idParam = (v: string | string[] | undefined) => {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ── Schemas ───────────────────────────────────────────────────────────────
const createSubmissionSchema = z.object({
  /* The project this submission belongs to (regulatory_programs.id). Required:
     every chain of governed records starts at a project, and a submission with
     none reaches its project only by a name match (LX-22). Without the field
     here the plain z.object stripped the id the Submission Center form had made
     the user pick. Tenancy is checked by createSubmission (404 for another
     organization's project), not here. */
  programId: z.string().uuid(),
  title: z.string().min(1).max(500),
  productName: z.string().max(500).optional(),
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  primaryRegion: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  lifecycleStage: z.string().max(64).optional(),
});
const createSequenceSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  sequenceNumber: z.string().regex(/^\d{4}$/, 'sequenceNumber must be 4 digits, e.g. "0000".'),
  type: z.enum(['original', 'amendment', 'response', 'variation', 'annual', 'withdrawal']).optional(),
});
const transitionSchema = z.object({
  status: z.enum(['assembling', 'validated', 'frozen', 'dispatched', 'draft']),
});
const upsertLeafSchema = z.object({
  leafId: z.coerce.number().int().positive().optional(),
  sectionCode: z.string().min(1).max(64),
  title: z.string().min(1).max(500),
  granularity: z.string().max(128).optional(),
  lifecycleOp: z.enum(['new', 'replace', 'append', 'delete']).optional(),
  documentTable: z
    .string()
    .max(64)
    .refine(isPlaceableDocumentTable, (v) => ({ message: unplaceableDocumentTableMessage(v) }))
    .optional(),
  documentId: z.coerce.number().int().positive().optional(),
  /* The uuid half of the polymorphic reference, for uuid-keyed stores
     (vault.documents). Validated as a uuid HERE so a malformed value is a 400
     naming the field, rather than reaching the ::uuid cast in the verifier and
     surfacing as a generic refusal. Which of the two a given table requires —
     and that a leaf carries one, not both — is enforced once, in upsertLeaf,
     against the table vocabulary; duplicating that rule here is how the two
     would drift. */
  documentUuid: z.string().uuid().optional(),
  documentType: z.string().max(64).optional(),
  parentLeafId: z.coerce.number().int().positive().optional(),
  studyId: z.string().trim().min(1).refine((value) => {
    try { stfFileName(value); return true; } catch { return false; }
  }, 'Study id must form a valid Study Tagging File name.').nullable().optional(),
  stfFileTag: z.string().refine((value) =>
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)),
  'STF file-tag must contain no control characters.').transform((value) => value.trim()).pipe(z.string().min(1).max(128)).nullable().optional(),
  studyTaggingEdit: z.object({
    expectedStudyId: z.string().nullable(),
    expectedStfFileTag: z.string().nullable(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.studyTaggingEdit && (!value.leafId || value.studyId === undefined || value.stfFileTag === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['studyTaggingEdit'],
      message: 'A study metadata edit requires leafId and explicit studyId and stfFileTag values.' });
  }
});

const AUTHOR = 'regulatory-author';
const readSelectionSchema = z.object({ programId: z.string().uuid().optional(),
  submissionId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe()).optional() });
function readSelection(req: Request) {
  const parsed = readSelectionSchema.safeParse(req.query);
  if (!parsed.success) throw new SubmissionReadError(400, 'BAD_REQUEST', 'The selected submission scope is invalid.');
  return { expectedProgramId: parsed.data.programId?.toLowerCase(), expectedSubmissionId: parsed.data.submissionId };
}
function requestedPathway(req: Request): Pathway | undefined {
  if (req.query.pathway === undefined) return undefined;
  if (typeof req.query.pathway !== 'string' || !(PATHWAYS as string[]).includes(req.query.pathway)) {
    throw new SubmissionReadError(400, 'VALIDATION', 'Choose a supported framework.');
  }
  return req.query.pathway as Pathway;
}
function requestedMemberStates(req: Request): string | undefined {
  if (req.query.memberStates !== undefined && typeof req.query.memberStates !== 'string') throw new SubmissionReadError(400, 'CTIS_MEMBER_STATES_INVALID', 'Choose valid EU member-state codes.');
  return req.query.memberStates as string | undefined;
}
async function readCoverageInputs(req: Request, ctx: Ctx, sequenceId: number, regulation?: 'mdr' | 'ivdr') {
  const q = requestPgClient(req);
  const admitted = await readSubmissionSequenceForRequest(q, ctx, sequenceId, readSelection(req));
  const evaluation = await readDeliverableEvaluationInput(q, admitted, { pathway: requestedPathway(req), memberStates: requestedMemberStates(req), regulation });
  const leaves = await readSubmissionLeavesForRequest(q, admitted);
  const sources = await readSubmissionLeafSourceEvidence(q, { ...admitted, leaves });
  return { q, admitted, sources, ...evaluation };
}
async function finishCoverageRead(read: Awaited<ReturnType<typeof readCoverageInputs>>) {
  await requireSubmissionLeafSourceEvidenceStillCurrent(read.q, read.sources.admission);
  await requireSubmissionReadStillCurrent(read.q, read.admitted);
}

// ── Submissions ─────────────────────────────────────────────────────────────
router.get('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  // Current accessible records only. Hidden project counts are not a list fact.
  const programParam = req.query.programId;
  try {
    if (programParam === undefined) {
      res.json(await listSubmissionsForRequest(requestPgClient(req), ctx));
      return;
    }
    if (typeof programParam !== 'string' || !isUuid(programParam)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'programId must be a project UUID.' } });
    }
    const programId = programParam.toLowerCase();
    ok(res, await listSubmissionsForRequest(requestPgClient(req), ctx, programId));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = createSubmissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  /* A market the platform does not offer for this application type is refused
     here as the market statement says it (filing-spine design review, item 6,
     2026-10-15): a UK IND read "Not offered" and could still be created. An
     unreadable statement creates nothing. */
  let statement: { offered: boolean; line: string } | undefined;
  try {
    const { readMarketSupport } = await import('../services/regulatory/market-support.js');
    [statement] = await readMarketSupport(requestPgClient(req), [{ applicationType: parsed.data.applicationType, market: parsed.data.primaryRegion }]);
  } catch {
    return res.status(503).json({ error: { code: 'MARKET_SUPPORT_UNAVAILABLE', message: 'Whether this market is offered could not be read. Nothing was created.' } });
  }
  if (statement && !statement.offered) {
    return res.status(422).json({ error: { code: 'MARKET_NOT_OFFERED', message: `${statement.line}. Nothing was created.` } });
  }
  try {
    res.status(201).json(await createSubmission(parsed.data, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Capabilities (feature-gating for the UI) ─────────────────────────────────
// Registered before '/:id' so it is not shadowed by the id param route.
router.get('/capabilities', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const environment = req.query.environment === 'staging' ? 'staging' : 'production';
  try {
    const { gatewayConfigurationStatus } = await import('../services/submission-gateways/index.js');
    let gateways: Array<{ configured: boolean }> = [];
    try {
      gateways = (await gatewayConfigurationStatus(ctx.organizationId, environment)) as Array<{ configured: boolean }>;
    } catch {
      gateways = [];
    }
    res.json({
      environment,
      gateways,
      gatewaysConfigured: gateways.filter((g) => g.configured).length,
      // Which workspaces are server-ready today, keyed by the canonical workspace
      // ids in shared/types/submission-ui.ts (SUBMISSION_WORKSPACES) — no key drift.
      workspaces: {
        portfolio: true,
        planner: true,
        builder: true,
        sequences: true,
        validation: true,
        'shadow-review': true,
        dispatch: true,
      },
      // Capability flags (not workspaces). The assemble/publish BYTES are now
      // server-ready (eCTD packager + device technical-file ZIP both materialize
      // from the canonical core via the storage resolver). The wire TRANSMIT to the
      // agency stays gated behind the governed transmit path + Part 11 e-signature.
      features: {
        assemble: true,
        deviceTechnicalFile: true,
        pathwayManifest: true,
        publishTransmit: false,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── Validation rule corpus (Validation workspace reference data) ──────────────
// The named, sourced eCTD validation criteria the gate checks against. Static
// reference data (not tenant-specific). Registered before '/:id' so the literal
// path is not shadowed by the id param route. `?region=` scopes to a framework.
router.get('/validation-rules', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const region = String(Array.isArray(req.query.region) ? req.query.region[0] : req.query.region ?? '');
  const REGIONS = ['fda', 'eu', 'jp', 'ca', 'au', 'ch'] as const;
  if (region && !(REGIONS as readonly string[]).includes(region)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `region must be one of: ${REGIONS.join(', ')}.` } });
  }
  try {
    const { RULE_CORPUS, rulesForRegion, corpusSummary } = await import('../services/ectd/validation-rule-corpus.js');
    const rules = region ? rulesForRegion(region as (typeof REGIONS)[number]) : RULE_CORPUS;
    res.json({ region: region || 'all', summary: corpusSummary(), rules });
  } catch (err) {
    fail(res, err);
  }
});

// ── What the platform can carry for a market (FILING_SPINE.md F19) ──────────
// One statement per (application type, market), composed by
// services/regulatory/market-support.ts from the rule pack, the regional
// backbone, the region profile and the channel with its adapter's refusal. No
// model writes any of it. `?applicationType=` is required; `?market=` (an
// agency, a region code or a submission region) narrows to one market, and
// without it every region the platform names is returned.
// Registered before '/:id' so the literal path is not shadowed.
router.get('/market-support', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const first = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '').trim();
  const applicationType = first(req.query.applicationType);
  const market = first(req.query.market);
  if (!applicationType || applicationType.length > 64 || market.length > 64) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'applicationType is required (at most 64 characters); market, when given, is at most 64.' } });
  }
  try {
    const [{ readMarketSupport }, { REGION_IDENTITY }] = await Promise.all([
      import('../services/regulatory/market-support.js'),
      import('../../shared/regulatory/region-identity.js'),
    ]);
    const markets = market ? [market] : Object.keys(REGION_IDENTITY);
    const asOf = new Date().toISOString().slice(0, 10);
    /* The request's own pinned connection, not the shared pool
       (ci:requestdb-coverage). readMarketSupport reads the platform's active
       rule packs — reference data, not this tenant's rows — but it reads them
       on the caller's request scope like every other read in this router, so
       the route holds no second path to the database. */
    const out = await readMarketSupport(
      requestPgClient(req),
      markets.map((m) => ({ applicationType, market: m })),
      asOf,
    );
    res.json({ applicationType, asOf, markets: out });
  } catch (err) {
    fail(res, err);
  }
});

// ── Market submission specifications (per-market governance + formatting) ─────
// The consolidated, per-market-per-format datasheet: formatting requirements, the
// governance (e-signature basis, sequencing, lifecycle), language/translation,
// gateway, forms, templates, and rule-corpus linkage. Static reference data.
// `?market=` (us|eu|jp|ca|…) and `?family=` (ectd|estar|eu_mdr|eu_ivdr|ctis) filter.
// Registered before '/:id' so the literal path is not shadowed.
router.get('/market-specs', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  const family = String(Array.isArray(req.query.family) ? req.query.family[0] : req.query.family ?? '');
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `family must be one of: ${FAMILIES.join(', ')}.` } });
  }
  try {
    const m = await import('../services/market-specs/market-submission-specs.js');
    let specs = m.MARKET_SUBMISSION_SPECS;
    if (market) specs = specs.filter((s) => s.market === market);
    if (family) specs = specs.filter((s) => s.family === family);
    res.json({ market: market || 'all', family: family || 'all', summary: m.marketSpecSummary(), specs });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/market-specs/:specId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getMarketSpec } = await import('../services/market-specs/market-submission-specs.js');
    const spec = getMarketSpec(String(req.params.specId));
    if (!spec) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No market spec "${req.params.specId}".` } });
    res.json(spec);
  } catch (err) {
    fail(res, err);
  }
});

// ── Market formatting validation (enforce the datasheet against files) ────────
// Deterministically checks supplied file descriptors against a market spec's
// formatting rules (naming pattern, name/path length, accepted formats, size,
// encryption). Read-only computation; does NOT transmit.
const formattingValidateSchema = z.object({
  leaves: z.array(z.object({
    fileName: z.string().min(1).max(512),
    filePath: z.string().max(2048).optional(),
    fileSizeBytes: z.number().int().nonnegative().optional(),
    fileFormat: z.string().max(64).optional(),
    encrypted: z.boolean().optional(),
  })).max(10000),
});
router.post('/market-specs/:specId/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = formattingValidateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { getMarketSpec } = await import('../services/market-specs/market-submission-specs.js');
    const spec = getMarketSpec(String(req.params.specId));
    if (!spec) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No market spec "${req.params.specId}".` } });
    const { validateLeavesAgainstMarketSpec } = await import('../services/market-specs/market-formatting-validator.js');
    res.json(validateLeavesAgainstMarketSpec(spec, parsed.data.leaves));
  } catch (err) {
    fail(res, err);
  }
});

// ── Document template structures (canonical section skeletons) ───────────────
// The heading skeleton of the key submission documents (CTD M2 summaries, 510(k)
// summary, SmPC, GSPR, PER, IMPD) with each section's purpose + regulatory basis.
// Static reference data; `?family=` filters. Before '/:id' so it is not shadowed.
router.get('/document-templates', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const family = String(Array.isArray(req.query.family) ? req.query.family[0] : req.query.family ?? '');
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `family must be one of: ${FAMILIES.join(', ')}.` } });
  }
  try {
    const m = await import('../services/market-specs/document-template-library.js');
    const templates = family ? m.templatesForFamily(family as 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis') : m.DOCUMENT_TEMPLATES;
    res.json({ family: family || 'all', templates });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/document-templates/:templateId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getDocumentTemplate } = await import('../services/market-specs/document-template-library.js');
    const t = getDocumentTemplate(String(req.params.templateId));
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No document template "${req.params.templateId}".` } });
    res.json(t);
  } catch (err) {
    fail(res, err);
  }
});

// ── Submission requirements matrix (Planner) ─────────────────────────────────
// Per submission TYPE, the required CTD modules / document templates / forms, and
// a deterministic gap assessment. Static reference data + pure assessment.
router.get('/requirements', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  try {
    const { SUBMISSION_REQUIREMENTS } = await import('../services/market-specs/submission-requirements.js');
    const requirements = market ? SUBMISSION_REQUIREMENTS.filter((r) => r.market === market) : SUBMISSION_REQUIREMENTS;
    res.json({ market: market || 'all', requirements });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/requirements/:type', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getRequirements } = await import('../services/market-specs/submission-requirements.js');
    const r = getRequirements(String(req.params.type));
    if (!r) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No requirements for "${req.params.type}".` } });
    res.json(r);
  } catch (err) {
    fail(res, err);
  }
});
const requirementsAssessSchema = z.object({
  templateIds: z.array(z.string().max(128)).max(2000).optional(),
  documentNames: z.array(z.string().max(512)).max(2000).optional(),
  forms: z.array(z.string().max(256)).max(2000).optional(),
});
router.post('/requirements/:type/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = requirementsAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessRequirements } = await import('../services/market-specs/submission-requirements.js');
    const a = assessRequirements(String(req.params.type), parsed.data);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No requirements for "${req.params.type}".` } });
    res.json(a);
  } catch (err) {
    fail(res, err);
  }
});

// ── Expedited-pathway eligibility (Planner) ──────────────────────────────────
// The criteria for the major accelerated/special designations + a deterministic
// eligibility assessment from yes/no answers.
router.get('/designations', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  try {
    const { DESIGNATIONS, designationsForMarket } = await import('../services/market-specs/pathway-eligibility.js');
    res.json({ market: market || 'all', designations: market ? designationsForMarket(market) : DESIGNATIONS });
  } catch (err) {
    fail(res, err);
  }
});
const eligibilityAssessSchema = z.object({
  answers: z.record(z.string(), z.boolean()).default({}),
});
router.post('/designations/:id/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = eligibilityAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessEligibility } = await import('../services/market-specs/pathway-eligibility.js');
    const a = assessEligibility(String(req.params.id), parsed.data.answers);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No designation "${req.params.id}".` } });
    res.json(a);
  } catch (err) {
    fail(res, err);
  }
});

// ── Post-submission change classification (lifecycle) ────────────────────────
// The FDA supplement / EU variation category catalog + a flag-driven classifier
// that maps a proposed change to its category and the canonical sequence type.
router.get('/change-categories', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  if (market && market !== 'us' && market !== 'eu') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market must be one of: us, eu.' } });
  }
  try {
    const { CHANGE_CATEGORIES, categoriesForMarket } = await import('../services/market-specs/post-submission-changes.js');
    res.json({ market: market || 'all', categories: market ? categoriesForMarket(market as 'us' | 'eu') : CHANGE_CATEGORIES });
  } catch (err) {
    fail(res, err);
  }
});
const changeClassifySchema = z.object({
  market: z.enum(['us', 'eu']),
  flags: z.object({
    scopeExtension: z.boolean().optional(),
    majorImpact: z.boolean().optional(),
    moderateImpact: z.boolean().optional(),
    immediateSafetyChange: z.boolean().optional(),
    minimalImpact: z.boolean().optional(),
    euImmediateNotification: z.boolean().optional(),
  }).default({}),
});
router.post('/change-categories/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = changeClassifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { recommendChangeCategory } = await import('../services/market-specs/post-submission-changes.js');
    res.json(recommendChangeCategory(parsed.data.market, parsed.data.flags));
  } catch (err) {
    fail(res, err);
  }
});

// ── Device evidence structures + classification + shadow reviewer (mdx/ivd) ──
// CER (MEDDEV 2.7/1 / MDR Annex XIV) and PER (IVDR Annex XIII) structure + gap
// assessment, the MDR/IVDR/FDA classification engine, and the reverse-workflow
// reviewer checklist. All deterministic, read-only/compute; never transmit.
router.get('/device/cer/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { CER_STAGES, CER_SECTIONS } = await import('../services/market-specs/cer-structure.js');
    res.json({ stages: CER_STAGES, sections: CER_SECTIONS });
  } catch (err) { fail(res, err); }
});
const cerAssessSchema = z.object({
  presentSectionIds: z.array(z.string().max(64)).max(200).default([]),
  equivalenceClaimed: z.boolean().optional(),
});
router.post('/device/cer/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = cerAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessCerStructure } = await import('../services/market-specs/cer-structure.js');
    res.json(assessCerStructure(parsed.data.presentSectionIds, { equivalenceClaimed: parsed.data.equivalenceClaimed }));
  } catch (err) { fail(res, err); }
});
router.get('/device/per/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { PER_PILLARS, ANALYTICAL_METRICS, CLINICAL_METRICS, PER_SECTIONS } = await import('../services/market-specs/per-structure.js');
    res.json({ pillars: PER_PILLARS, analyticalMetrics: ANALYTICAL_METRICS, clinicalMetrics: CLINICAL_METRICS, sections: PER_SECTIONS });
  } catch (err) { fail(res, err); }
});
const perAssessSchema = z.object({ presentSectionIds: z.array(z.string().max(64)).max(200).default([]) });
router.post('/device/per/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = perAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessPerStructure } = await import('../services/market-specs/per-structure.js');
    res.json(assessPerStructure(parsed.data.presentSectionIds));
  } catch (err) { fail(res, err); }
});
const classifySchema = z.object({ framework: z.enum(['mdr', 'ivdr', 'fda']), facts: z.record(z.string(), z.unknown()).default({}) });
router.post('/device/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = classifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const m = await import('../services/market-specs/device-classification.js');
    const facts = parsed.data.facts as Record<string, never>;
    const result =
      parsed.data.framework === 'mdr' ? m.classifyMdr(facts)
        : parsed.data.framework === 'ivdr' ? m.classifyIvdr(facts)
          : m.recommendFdaPathway(facts);
    res.json({ framework: parsed.data.framework, ...result });
  } catch (err) { fail(res, err); }
});
router.get('/device/reviewer-checklist', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const type = String(Array.isArray(req.query.type) ? req.query.type[0] : req.query.type ?? '');
  const TYPES = ['510k', 'de_novo', 'pma', 'cer', 'per'];
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `type must be one of: ${TYPES.join(', ')}.` } });
  }
  try {
    const { buildShadowReviewerChecklist } = await import('../services/market-specs/device-shadow-reviewer.js');
    res.json(buildShadowReviewerChecklist(type as '510k' | 'de_novo' | 'pma' | 'cer' | 'per'));
  } catch (err) { fail(res, err); }
});

// Risk management file (ISO 14971), biocompatibility (ISO 10993), software (IEC 62304).
router.get('/device/risk-management/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { RMF_SECTIONS } = await import('../services/market-specs/risk-management-structure.js');
    res.json({ sections: RMF_SECTIONS });
  } catch (err) { fail(res, err); }
});
const rmfAssessSchema = z.object({ presentSectionIds: z.array(z.string().max(64)).max(200).default([]) });
router.post('/device/risk-management/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = rmfAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessRmfStructure } = await import('../services/market-specs/risk-management-structure.js');
    res.json(assessRmfStructure(parsed.data.presentSectionIds));
  } catch (err) { fail(res, err); }
});
const biocompSchema = z.object({
  nature: z.enum(['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood']),
  duration: z.enum(['limited', 'prolonged', 'long_term']),
});
router.post('/device/biocompatibility', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = biocompSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { requiredBiocompEndpoints } = await import('../services/market-specs/biocompatibility-matrix.js');
    res.json(requiredBiocompEndpoints(parsed.data.nature, parsed.data.duration));
  } catch (err) { fail(res, err); }
});
const softwareSchema = z.object({
  canContributeToDeathOrSeriousInjury: z.boolean().optional(),
  canContributeToNonSeriousInjury: z.boolean().optional(),
});
router.post('/device/software/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = softwareSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const m = await import('../services/market-specs/software-lifecycle.js');
    const cls = m.classifySoftware(parsed.data);
    res.json({ ...cls, deliverables: m.deliverablesForClass(cls.class), reviewerQuestions: m.SOFTWARE_REVIEWER_QUESTIONS });
  } catch (err) { fail(res, err); }
});

// The unified reverse-workflow blueprint — classification + requirements +
// applicable evidence modules + reviewer checklist in one object.
const blueprintSchema = z.object({
  submissionType: z.enum(['510k', 'de_novo', 'pma', 'mdr_td', 'ivdr_td']),
  classification: z.object({ framework: z.enum(['mdr', 'ivdr', 'fda']), facts: z.record(z.string(), z.unknown()) }).optional(),
  contact: z.object({
    nature: z.enum(['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood']),
    duration: z.enum(['limited', 'prolonged', 'long_term']),
  }).optional(),
  software: z.object({
    applicable: z.boolean(),
    canContributeToDeathOrSeriousInjury: z.boolean().optional(),
    canContributeToNonSeriousInjury: z.boolean().optional(),
    presentDeliverableIds: z.array(z.string().max(64)).max(100).optional(),
  }).optional(),
  electrical: z.object({
    electricallyPowered: z.boolean().optional(),
    hasAlarms: z.boolean().optional(),
    closedLoopControl: z.boolean().optional(),
    homeUse: z.boolean().optional(),
    emsUse: z.boolean().optional(),
    hasParticularStandard: z.boolean().optional(),
  }).optional(),
  sterilization: z.object({
    sterile: z.boolean().optional(),
    method: z.enum(['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown']).optional(),
  }).optional(),
  present: z.object({
    cerSectionIds: z.array(z.string().max(64)).max(200).optional(),
    perSectionIds: z.array(z.string().max(64)).max(200).optional(),
    rmfSectionIds: z.array(z.string().max(64)).max(200).optional(),
  }).optional(),
  equivalenceClaimed: z.boolean().optional(),
});
router.post('/device/blueprint', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = blueprintSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { buildDeviceBlueprint } = await import('../services/market-specs/device-blueprint.js');
    const { scorecardFromBlueprint } = await import('../services/market-specs/device-readiness-scorecard.js');
    const blueprint = buildDeviceBlueprint(parsed.data as Parameters<typeof buildDeviceBlueprint>[0]);
    res.json({ ...blueprint, scorecard: scorecardFromBlueprint(blueprint) });
  } catch (err) { fail(res, err); }
});

// Global multi-region device strategy (build once, file many).
router.get('/device/global-strategy', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const kind = String(Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind ?? '');
  if (kind !== 'device' && kind !== 'ivd') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'kind must be one of: device, ivd.' } });
  }
  const regRaw = Array.isArray(req.query.regions) ? req.query.regions[0] : req.query.regions;
  const regions = typeof regRaw === 'string' && regRaw ? regRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  try {
    const { buildGlobalDeviceStrategy } = await import('../services/market-specs/device-global-strategy.js');
    res.json(buildGlobalDeviceStrategy(kind as 'device' | 'ivd', regions as never));
  } catch (err) { fail(res, err); }
});

// Regulatory timeline for a pathway.
router.get('/device/timeline', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const pathway = String(Array.isArray(req.query.pathway) ? req.query.pathway[0] : req.query.pathway ?? '');
  try {
    const { getTimeline } = await import('../services/market-specs/regulatory-timelines.js');
    const t = getTimeline(pathway);
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No timeline for pathway "${pathway}".` } });
    res.json(t);
  } catch (err) { fail(res, err); }
});

// UDI validation (GS1 check digit + AI parsing → GUDID/EUDAMED components).
const udiSchema = z.object({ udi: z.string().min(1).max(512) });
router.post('/device/udi/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = udiSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { validateUdi } = await import('../services/market-specs/udi-validator.js');
    res.json(validateUdi(parsed.data.udi));
  } catch (err) { fail(res, err); }
});

// Electrical safety (IEC 60601) applicable standards from device facts.
const electricalSchema = z.object({
  electricallyPowered: z.boolean().optional(),
  hasAlarms: z.boolean().optional(),
  closedLoopControl: z.boolean().optional(),
  homeUse: z.boolean().optional(),
  emsUse: z.boolean().optional(),
  hasParticularStandard: z.boolean().optional(),
});
router.post('/device/electrical-safety', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = electricalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { applicableElectricalStandards } = await import('../services/market-specs/electrical-safety.js');
    res.json(applicableElectricalStandards(parsed.data));
  } catch (err) { fail(res, err); }
});

// Sterilization requirements (ISO 11135/11137/17665) from device facts.
const sterilizationSchema = z.object({
  sterile: z.boolean().optional(),
  method: z.enum(['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown']).optional(),
});
router.post('/device/sterilization', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = sterilizationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { sterilizationRequirements } = await import('../services/market-specs/sterilization.js');
    res.json(sterilizationRequirements(parsed.data));
  } catch (err) { fail(res, err); }
});

// Regulatory capabilities index — one call for the UI to discover the whole layer.
router.get('/regulatory-capabilities', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { regulatoryCapabilitiesIndex } = await import('../services/market-specs/regulatory-capabilities-index.js');
    res.json(regulatoryCapabilitiesIndex());
  } catch (err) { fail(res, err); }
});

// Combination product assessment (21 CFR Part 3 PMOA → lead center).
const combinationSchema = z.object({
  components: z.array(z.enum(['drug', 'biologic', 'device'])).min(1).max(5),
  primaryModeOfAction: z.enum(['drug', 'biologic', 'device']).optional(),
  combinationType: z.enum(['single_entity', 'co_packaged', 'cross_labeled']).optional(),
});
router.post('/combination-product/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = combinationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessCombinationProduct } = await import('../services/market-specs/combination-products.js');
    res.json(assessCombinationProduct(parsed.data));
  } catch (err) { fail(res, err); }
});

// Quality management system (ISO 13485 ↔ FDA QMSR) structure + readiness.
router.get('/device/qms/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { QMS_CLAUSES, FDA_QMSR_NOTE } = await import('../services/market-specs/quality-system.js');
    res.json({ clauses: QMS_CLAUSES, fdaNote: FDA_QMSR_NOTE });
  } catch (err) { fail(res, err); }
});
const qmsAssessSchema = z.object({ presentClauseIds: z.array(z.string().max(64)).max(100).default([]) });
router.post('/device/qms/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = qmsAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessQmsReadiness } = await import('../services/market-specs/quality-system.js');
    res.json(assessQmsReadiness(parsed.data.presentClauseIds));
  } catch (err) { fail(res, err); }
});

// Device labeling requirements (21 CFR 801 / MDR Annex I §23 / ISO 15223-1) from facts.
const labelingSchema = z.object({
  sterile: z.boolean().optional(),
  singleUse: z.boolean().optional(),
  reusable: z.boolean().optional(),
  implantable: z.boolean().optional(),
  prescriptionOnly: z.boolean().optional(),
  forClinicalInvestigation: z.boolean().optional(),
  hasExpiry: z.boolean().optional(),
  containsMedicinalSubstance: z.boolean().optional(),
});
router.post('/device/labeling', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = labelingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { deviceLabelingRequirements } = await import('../services/market-specs/device-labeling.js');
    res.json(deviceLabelingRequirements(parsed.data));
  } catch (err) { fail(res, err); }
});

// Gap-check a STORED CER (cer_reports/cer_sections) against the canonical structure.
// Tenant-scoped; needs a database. 404 when the report is not in the organization.
router.get('/device/cer/:reportId/assess-stored', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  // 2026-10-15: only 'true'/'1' was read, so an absent answer reached the engine as
  // "not claimed" and a CER with no Equivalence section came back ready.
  const claim = req.query.equivalenceClaimed;
  const equivalenceClaimed = claim === 'true' || claim === '1' ? true : claim === 'false' || claim === '0' ? false : undefined;
  try {
    const { assessStoredCer } = await import('../services/market-specs/stored-cer-assessment.js');
    res.json(await assessStoredCer({ reportId: String(req.params.reportId), organizationId: ctx.organizationId, equivalenceClaimed }));
  } catch (err) { fail(res, err); }
});

router.get('/:id', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await getSubmissionForRequest(requestPgClient(req), ctx, id, readSelection(req)));
  } catch (err) {
    fail(res, err);
  }
});

// ── Sequences ─────────────────────────────────────────────────────────────
router.get('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listSequencesForRequest(requestPgClient(req), ctx, id, readSelection(req)));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = createSequenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.status(201).json(await createSequence({ submissionId: id, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Anchor a submission to its project (P-14's remedy) ───────────────────────
// A submission created before submissions recorded their project accepts no
// placement of a project's document (409 UNANCHORED_SUBMISSION, P-14). This is
// where it is anchored: by the project's lead or an organization manager, with
// a reason, on the audit chain (anchorSubmissionToProgram). The role is the
// membership row's, never the token's or the body's.
const anchorProgramSchema = z.object({ programId: z.string().uuid() });
// The projects this submission may be anchored to: its own filing type, by the
// rule the anchor applies (listAnchorCandidates). QA 2026-10-08 (j6): the
// control offered every programme, a device programme for an NDA among them.
router.get('/:id/program-anchor', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listAnchorCandidates(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});
// ── A market's own application number (decision P-44) ───────────────────────
// The number another market's agency assigned, recorded on that market's
// submission; packages for that market read it, never the project's. One
// governed act: lead or manager, a stated reason, a chained audit row.
const marketNumberSchema = z.object({ applicationNumber: z.string().min(1).max(200) });
router.get('/:id/application-number', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    // The caller's project access, as every submission read (getSubmissionForRequest).
    await getSubmissionForRequest(requestPgClient(req), ctx, id, readSelection(req));
    res.json(await readMarketApplicationNumber(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});
router.post('/:id/application-number', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = marketNumberSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) {
    return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error }, field: 'reason' });
  }
  try {
    const orgRole = await resolveSignerOrgRole(ctx.userId, ctx.organizationId);
    res.json(await recordMarketApplicationNumber(
      { submissionId: id, applicationNumber: parsed.data.applicationNumber, reason: reason.reason,
        ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      { ...ctx, orgRole },
    ));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/program-anchor', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = anchorProgramSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) {
    return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error }, field: 'reason' });
  }
  try {
    const orgRole = await resolveSignerOrgRole(ctx.userId, ctx.organizationId);
    res.json(
      await anchorSubmissionToProgram(
        { submissionId: id, programId: parsed.data.programId, reason: reason.reason },
        { ...ctx, orgRole },
      ),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/transition', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = transitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await transitionSequence(seqId, parsed.data.status, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Builder leaves ──────────────────────────────────────────────────────────
// Request-owned parent/source admission precedes leaf metadata. sourceDocument
// reuses canonical pin, status, content, seal and retained-byte primitives;
// missing evidence stays undetermined. Governed dispatch remains its separate
// canonical assessment, and background resolver/service callers keep their ABI.
router.get('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const q = requestPgClient(req);
    const admitted = await readSubmissionSequenceForRequest(q, ctx, seqId, readSelection(req));
    const leaves = await readSubmissionLeavesForRequest(q, admitted);
    const sources = await readSubmissionLeafSourceEvidence(q, { ...admitted, leaves });
    await requireSubmissionLeafSourceEvidenceStillCurrent(q, sources.admission);
    await requireSubmissionReadStillCurrent(q, admitted);
    res.json(leaves.map((leaf, i) => ({ ...leaf, sourceDocument: sources.sourceDocuments[i], sourceRef: sources.leaves[i]?.sourceRef })));
  } catch (err) {
    fail(res, err);
  }
});

/* The sequence's history: who created the submission, and every placement in
   the sequence, removed ones included, from the one ledger with its chain
   verdict (submission-history-read.ts; filing-spine review item 3). Admitted
   as the leaves read is. */
router.get('/sequences/:seqId/history', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const q = requestPgClient(req);
    const admitted = await readSubmissionSequenceForRequest(q, ctx, seqId, readSelection(req));
    res.json({ success: true, data: await readSubmissionHistoryForRequest(q, admitted) });
  } catch (err) {
    fail(res, err);
  }
});

router.put('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = upsertLeafSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  /* A placement decides what content goes into a regulator-facing sequence.
     Its audit row recorded what changed and never why: no dialog asked and the
     schema had no field (PX-1, docs/evidence/reviews/2026-09-24/lenses.md). The
     person placing it now gives the reason, and it is recorded, never replaced. */
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) {
    return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error }, field: 'reason' });
  }
  try {
    res.json(await upsertLeaf({ sequenceId: seqId, ...parsed.data, reason: reason.reason }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// Remove a misplaced leaf (draft-stage sequences only; soft delete, audited).
// Before this, a wrong placement could only be corrected in place — never
// removed (BP-W1-6 find F05).
router.delete('/sequences/:seqId/leaves/:leafId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  const leafId = idParam(req.params.leafId);
  if (seqId === null || leafId === null) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence or leaf id.' } });
  }
  /* A removal decides what content leaves a regulator-facing sequence, the
     inverse of a placement, so it takes the reason a placement takes (PX-1) and
     records it on the LEAF_REMOVED row. QA 2026-10-08 (j6): the Builder had no
     remove control at all; the one it has now sends the reason. */
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) {
    return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error }, field: 'reason' });
  }
  try {
    /* WO-16C #133. `removeLeaf` now reports what became of its §11.10(e) row,
       and this route answered 204 No Content — which has no body to put it in, so
       the service's outcome was arriving here and being dropped. That is the
       vacuous conversion this work order keeps finding: a value produced,
       returned, and discarded one layer up.

       A 204 can carry headers, so it does. The status is deliberately unchanged:
       the leaf really was soft-deleted, and turning a successful removal into a
       200-with-body to make room for an audit field would change a contract for
       reporting's sake. Same reason and same shape as the predicate-intelligence
       proxy, which forwards an upstream body verbatim and therefore also reports
       through headers. */
    const removal = await removeLeaf(leafId, seqId, ctx, reason.reason);
    setAuditRowHeaders(res, removal.auditTrail);
    // A removal from a Validated sequence returned it to Assembling; the 204
    // has no body, so the change rides on a header like the audit outcome.
    if (removal.sequenceStatusChanged) {
      res.setHeader('X-Sequence-Status-Changed', `${removal.sequenceStatusChanged.from}->${removal.sequenceStatusChanged.to}`);
    }
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

// ── Planner (AI) ────────────────────────────────────────────────────────────
const planSchema = z.object({
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  regions: z.array(z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg'])).min(1),
  productProfile: z.string().max(4000).optional(),
});
router.post('/:id/plan', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = planSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx); // tenant ownership
    res.json(await generateSubmissionPlan(parsed.data, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Validation co-pilot (AI explain) ─────────────────────────────────────────
const explainSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  findings: z
    .array(z.object({ ruleId: z.string().optional(), severity: z.enum(['error', 'warning', 'info']), message: z.string(), leaf: z.string().optional() }))
    .min(1),
});
router.post('/:id/validation/explain', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = explainSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx);
    res.json(await explainValidation(parsed.data, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Dispatch QC (deterministic verdict + optional model narrative; does NOT transmit)
// VSR-001 F-9: the verdict is computed by the platform's deterministic gates and
// the model, when configured, only narrates under `narrative` (null without a
// provider — never a 502). When `sequenceId` is supplied the full server-side
// assessment (assessSequenceDispatchReadiness — the gate freeze/dispatch enforce)
// IS the verdict and the client numbers are ignored. Without one the verdict is
// the hard gate over the supplied counts, with a warning naming what was not
// checked; prefer GET /sequences/:seqId/dispatch-readiness for the full gate.
const dispatchQcSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  sequenceId: z.number().int().positive().optional(),
  validationErrors: z.number().int().min(0),
  unresolvedShadowCriticals: z.number().int().min(0),
  leaves: z.array(z.object({ sectionCode: z.string(), operation: z.string() })),
});
router.post('/:id/dispatch-qc', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = dispatchQcSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx);
    let input = parsed.data;
    let assessment = null;
    if (parsed.data.sequenceId) {
      // Authoritative, tamper-proof gate inputs from server state.
      const { assessSequenceDispatchReadiness } = await import('../services/ectd/assess-dispatch-readiness');
      assessment = await assessSequenceDispatchReadiness({ sequenceId: parsed.data.sequenceId, organizationId: ctx.organizationId });
      input = { ...parsed.data, validationErrors: assessment.validationErrors, unresolvedShadowCriticals: assessment.unacknowledgedShadowCriticals };
    }
    res.json(await runDispatchQc(input, { ...ctx, submissionId: id }, { assessment }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Truth Engine: provenance + consistency ───────────────────────────────────
router.get('/:id/provenance', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const section = Array.isArray(req.query.section) ? String(req.query.section[0]) : typeof req.query.section === 'string' ? req.query.section : '';
  if (!section) return res.status(400).json({ error: { code: 'VALIDATION', message: 'query param "section" is required.' } });
  try {
    res.json(await traceProvenance({ submissionId: id, targetSectionCode: section }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/* The check compares SAVED sections, read by the engine (slice G4). A `text`
   in the body is never compared; the reply says it was ignored. */
const consistencySchema = z.object({
  dimension: z.string().min(1).max(64),
  left: z.object({ sectionId: z.string().uuid() }),
  right: z.array(z.object({ sectionId: z.string().uuid() })).min(1),
});
const suppliedTextIn = (body: unknown): boolean => {
  const b = (body ?? {}) as { left?: { text?: unknown }; right?: Array<{ text?: unknown }> };
  return typeof b.left?.text === 'string' || (Array.isArray(b.right) && b.right.some((r) => typeof r?.text === 'string'));
};
router.post('/:id/consistency', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = consistencySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    // The body stays the findings array; the check's §11.10(e) row is reported
    // in the header pair, as the leaf removal above does. No browser client
    // calls this route today (AnA's check_consistency is the reachable path),
    // so neither header is on the CORS expose list; a client that adds a call
    // adds them there.
    const { findings, notCompared, auditTrail } = await runConsistencyCheck({ submissionId: id, ...parsed.data }, ctx);
    setAuditRowHeaders(res, auditTrail);
    // How many of the claim's figures got no verdict: an empty array is
    // "nothing compared" as often as "no conflict".
    res.setHeader('X-Consistency-Not-Compared', String(notCompared.length));
    if (suppliedTextIn(req.body)) res.setHeader('X-Consistency-Supplied-Text', 'ignored');
    res.json(findings);
  } catch (err) {
    fail(res, err);
  }
});
router.get('/:id/consistency', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listConsistencyFindings(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Shadow Review (the moat) ────────────────────────────────────────────────
const shadowSchema = z.object({
  lens: z.enum(['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr']).optional(),
});
router.post('/sequences/:seqId/shadow-review', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = shadowSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await runShadowReview({ sequenceId: seqId, lens: parsed.data.lens, organizationId: ctx.organizationId, userId: ctx.userId }));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/sequences/:seqId/shadow-review', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    res.json(await listShadowReviewRuns(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/shadow-review/:runId/findings', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const runId = idParam(req.params.runId);
  if (runId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid run id.' } });
  try {
    // P-35: each finding with who closed it, how, when, why and under which
    // signature, and what may be signed on it now — by the act's own rule.
    const rows = await getShadowReviewFindings(runId, ctx);
    res.json(await withShadowFindingDispositions(requestPgClient(req), { organizationId: ctx.organizationId, runId }, rows));
  } catch (err) {
    fail(res, err);
  }
});

// ── Shadow Review waiver (P-34, decided 2026-10-15) ─────────────────────────
// Offered only after the sequence's newest run failed because every AI provider
// failed or was overloaded (ask POST governed-precheck { step: 'shadow-waiver' }).
// Sign first: POST /api/c2c/actions/sign, target "ectd-sequence:<seqId>",
// payload { intent: 'shadow-waiver', meaning: 'responsibility' | 'approval' },
// with the reason — the signature's reason is the waiver's. Then pass its
// actionId and the failed run here. 403 GOVERNED_REQUIRED for a missing,
// spent, void or wrong-intent signature; 409 SHADOW_WAIVER_NOT_ELIGIBLE, with
// the reason, when no waiver is on offer; a refused waive voids its signature.
// The act is waiveShadowReview's; no AnA tool reaches this door.
const shadowWaiveSchema = z.object({
  signatureActionId: z.string().min(1).max(128),
  failedRunId: z.number().int().positive(),
});
router.post('/sequences/:seqId/shadow-review/waive', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = shadowWaiveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { waiveShadowReview } = await import('../services/submission-service/submission-service');
    res.json(await waiveShadowReview({ sequenceId: seqId, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Closing a critical Shadow Review finding (P-35, decided 2026-10-15) ─────
// Each open critical finding is closed on its own: 'accepted' (risk accepted)
// or 'fixed' (offered only when a completed Shadow Review ran after the
// finding's run; ask POST governed-precheck { step: 'shadow-finding-disposition',
// findingId, disposition }). Sign first: POST /api/c2c/actions/sign, target
// "ectd-sequence:<seqId>", payload { intent: 'shadow-finding-disposition',
// meaning: 'approval' | 'responsibility', findingId, disposition }, with the
// reason — the signature's reason is the disposition's. Then pass its actionId
// here. 403 GOVERNED_REQUIRED for a missing, spent, void, wrong-intent or
// other-finding signature; 409 SHADOW_FINDING_NOT_DISPOSABLE, with the reason;
// a refused act voids its signature. The act is dispositionShadowFinding's; no
// AnA tool reaches this door.
const shadowFindingDispositionSchema = z.object({
  signatureActionId: z.string().min(1).max(128),
  disposition: z.enum(SHADOW_FINDING_DISPOSITIONS),
});
router.post('/sequences/:seqId/shadow-review/findings/:findingId/disposition', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  const findingId = idParam(req.params.findingId);
  if (seqId === null || findingId === null) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence or finding id.' } });
  }
  const parsed = shadowFindingDispositionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { dispositionShadowFinding } = await import('../services/submission-service/submission-service');
    res.json(await dispositionShadowFinding({ sequenceId: seqId, findingId, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Authoring (section-generation, streamed via SSE) ─────────────────────────
const generateSectionSchema = z.object({
  sectionCode: z.string().min(1).max(64),
  evidence: z.array(z.object({ id: z.string(), source: z.string(), text: z.string() })).default([]),
  productContext: z.string().max(8000).optional(),
});
router.post('/:id/sections/generate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = generateSectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  // Server-Sent Events: stream tokens as `chunk`, then a final `done` (or `error`).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
  // Stop writing once the client disconnects (avoids EPIPE / write-after-end).
  let closed = false;
  res.on('close', () => {
    closed = true;
  });
  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  try {
    const result = await generateSection({ submissionId: id, ...parsed.data }, ctx, (text) => send('chunk', { text }));
    send('done', result);
  } catch (err) {
    const known = err instanceof AuthoringError;
    logger.error('section generation failed', { code: (err as { code?: string } | null)?.code ?? null });
    send('error', { code: known ? err.code : 'GENERATION_FAILED',
      message: known ? err.message : 'The section draft could not be completed. Its saved status has not been confirmed.' });
  } finally {
    res.end();
  }
});

// ── Pathway readiness (CTIS / MDR / IVDR / eSTAR — non-eCTD projections) ──────
// Projects the sequence's canonical leaves onto a target pathway's required
// structure and returns a gap/readiness report. Map + gap-check only; never
// submits. Deterministic — no AI.
router.get('/sequences/:seqId/pathway-readiness', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const read = await readCoverageInputs(req, ctx, seqId);
    const result = assessPathwayReadiness({ ...read.engine, leaves: read.sources.leaves, sourceAware: true });
    await finishCoverageRead(read);
    res.json({ ...result, scope: read.scope, sourceIssues: read.sources.sourceIssues });
  } catch (err) {
    fail(res, err);
  }
});

// ── Universal pathway manifest (assembled ToC for ANY non-eCTD pathway) ───────
// One uniform table-of-contents across eSTAR / CTIS / MDR / IVDR / PMDA: runs the
// pathway engine, then projects its result into ordered entries (group + path +
// present/missing + sources). Deterministic, read-only — maps + reports gaps.
router.get('/sequences/:seqId/pathway-manifest', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const read = await readCoverageInputs(req, ctx, seqId);
    const { buildPathwayManifest } = await import('../services/pathway-engines/pathway-manifest');
    const result = assessPathwayReadiness({ ...read.engine, leaves: read.sources.leaves, sourceAware: true });
    const manifest = buildPathwayManifest(read.engine.pathway, result.detail);
    await finishCoverageRead(read);
    res.json({ ...manifest, scope: read.scope, sourceIssues: read.sources.sourceIssues });
  } catch (err) {
    fail(res, err);
  }
});

// ── Device technical-file manifest (EU MDR/IVDR assemble structure) ───────────
// The device equivalent of the eCTD index: projects the sequence's canonical
// leaves onto the MDR/IVDR Annex II/III structure and returns the assembled
// table-of-contents (ordered sections, paths, present/missing, sources).
// Deterministic, read-only — maps + reports gaps, never invents content.
router.get('/sequences/:seqId/technical-file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const regulation = req.query.regulation;
    if (regulation !== undefined && regulation !== 'mdr' && regulation !== 'ivdr') throw new SubmissionReadError(400, 'VALIDATION', 'Choose mdr or ivdr.');
    const read = await readCoverageInputs(req, ctx, seqId, regulation);
    if (!read.scope.regulation) throw new SubmissionReadError(422, 'TECHNICAL_FILE_COVERAGE_UNAVAILABLE', 'Technical-file coverage is only available for recorded MDR or IVDR filings.');
    const { assembleTechDoc } = await import('../services/pathway-engines');
    const { buildTechnicalFileManifest } = await import('../services/pathway-engines/technical-file-manifest');
    const result = assembleTechDoc({ regulation: read.scope.regulation, leaves: read.sources.leaves, sourceAware: true });
    const manifest = buildTechnicalFileManifest(result);
    await finishCoverageRead(read);
    res.json({ ...manifest, scope: read.scope, sourceIssues: read.sources.sourceIssues });
  } catch (err) {
    fail(res, err);
  }
});

// ── Device technical-file DELIVERY (shared by both technical-file routes) ─────
// The assembled ZIP bytes go through the SAME governed-export consequence the
// eSTAR /build route uses: `createGovernedExportConsequence` (artifact registry
// + provenance + EXPORT_GENERATED audit) when a PM-spine project anchors the
// program, `createAuditedUnplacedExport` (delivered + audit-logged with the
// SHA-256, registry placement pending) otherwise. Either way the caller gets
// the bytes — an assemble must never delete the package before anyone can
// download it, and must never answer with a checksum of a file that no longer
// exists.
const GOVERNED_EXPORT_SIZE_CAP_RE = /INVALID_GOVERNED_EXPORT_INPUT: binaryOutput exceeds max size/;

interface TechnicalFileDelivery {
  bytes: Buffer;
  filename: string;
  regulation: 'mdr' | 'ivdr';
  /** The manifest.json content — the artifact's source content for provenance. */
  manifest: unknown;
  title: string;
  backendRoute: string;
  /** Program-scoped delivery: the program and its PM-spine anchor (null when unanchored). */
  program: { id: string; anchorProjectId: number | null } | null;
  /** Audit anchor for the unplaced path. */
  resourceType: string;
  resourceId: string;
  /** Assembly facts carried into the export metadata. */
  report: Record<string, unknown>;
}

async function deliverTechnicalFile(ctx: Ctx, d: TechnicalFileDelivery) {
  const metadata: Record<string, unknown> = {
    format: 'zip',
    package: `EU ${d.regulation.toUpperCase()} technical file (Annex II/III tree + manifest + checksums)`,
    regulation: d.regulation,
    programId: d.program?.id,
    ...d.report,
  };
  if (d.program && d.program.anchorProjectId !== null) {
    return createGovernedExportConsequence({
      organizationId: ctx.organizationId,
      projectId: d.program.anchorProjectId,
      userId: ctx.userId,
      title: d.title,
      contentForArtifact: JSON.stringify(d.manifest),
      sourceType: 'export_zip',
      ctdSection: d.regulation === 'mdr' ? 'eu-mdr-annex-ii' : 'eu-ivdr-annex-ii',
      suggestedPlacement: `EU ${d.regulation.toUpperCase()} technical documentation (Annex II/III)`,
      backendRoute: d.backendRoute,
      binaryOutput: d.bytes,
      mimeType: 'application/zip',
      filename: d.filename,
      metadata,
      ipAddress: ctx.ipAddress,
    });
  }
  return createAuditedUnplacedExport({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    sourceType: 'export_zip',
    backendRoute: d.backendRoute,
    resourceType: d.resourceType,
    resourceId: d.resourceId,
    programUuid: d.program?.id ?? null,
    filename: d.filename,
    mimeType: 'application/zip',
    buffer: d.bytes,
    metadata,
  });
}

/** Technical-file error mapping: the governed size cap is an honest 413, everything else goes through `fail`. */
function technicalFileFail(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (GOVERNED_EXPORT_SIZE_CAP_RE.test(message)) {
    res.status(413).json({
      error: {
        code: 'EXPORT_TOO_LARGE',
        message:
          'The assembled technical file exceeds the governed-export size cap and was not delivered. ' +
          'Reduce the package (split large section bodies) or raise GOVERNED_EXPORT_MAX_BYTES.',
      },
    });
    return;
  }
  fail(res, err);
}

// ── Device technical-file ASSEMBLE (materialize the MDR/IVDR ZIP) ─────────────
// Device counterpart of POST /assemble: materializes the sequence's leaves into a
// real technical-file ZIP (Annex II/III tree + manifest.json + checksums) with
// valid PDF leaves, reads the bytes BEFORE the staging directory is removed, and
// delivers them through the governed-export consequence (a sequence carries no
// PM-spine program anchor, so this is the audited-unplaced delivery). Does NOT
// transmit — submit/transmit stays behind the governed transmit path + e-sign.
const techFileAssembleSchema = z.object({
  regulation: z.enum(['mdr', 'ivdr']),
  applicationId: z.string().min(1).max(128).optional(),
  productName: z.string().min(1).max(256).optional(),
  manufacturer: z.string().min(1).max(256).optional(),
});
router.post('/sequences/:seqId/technical-file/assemble', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = techFileAssembleSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assembleTechnicalFileFromCore } = await import('../services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core');
    const result = await assembleTechnicalFileFromCore({
      sequenceId: seqId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      regulation: parsed.data.regulation,
      applicationId: parsed.data.applicationId ?? `UNASSIGNED-SEQ-${seqId}`,
      productName: parsed.data.productName,
      manufacturer: parsed.data.manufacturer,
    });
    let bytes: Buffer;
    let manifest: unknown = null;
    try {
      // Read the bytes while the staged package still exists; cleanup runs in
      // `finally` so the temp dir is removed on every path, including a throw.
      bytes = await fs.readFile(result.bundle.path);
      try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(bytes);
        const manifestJson = await zip.file('manifest.json')?.async('string');
        manifest = manifestJson ? JSON.parse(manifestJson) : null;
      } catch {
        manifest = null;
      }
    } finally {
      await result.cleanup();
    }
    // 2026-09-23 (W5/D7, residual repair): the leaves no technical-file slot
    // claims are returned and reported BY NAME (they were visible only folded
    // into `skipped`); `unmappedTechnicalDocumentation` lists the Annex II/III
    // ones, which are why `ready` is false. IV.* conformity / registration
    // leaves are listed in unmappedLeaves and do not count.
    // 2026-09-23 (W5/D7, final pass): `matchedByTitleOnly` names each placed
    // source a slot matched by its title alone (a Vault-built CER, say). It
    // does not change `ready`; it is reported so it is never mistaken for a
    // keyed placement.
    const report = {
      ready: result.ready,
      fileCount: result.bundle.fileCount,
      materialized: result.materialized,
      skipped: result.skipped.length,
      unresolved: result.unresolvedLeaves.length,
      unfinalized: result.unfinalized,
      unmapped: result.unmappedLeaves.length,
      unmappedTechnicalDocumentation: result.unmappedLeaves.filter((u) => u.inTechnicalDocumentation).map((u) => u.source),
      matchedByTitleOnly: result.matchedByTitleOnly,
    };
    const consequence = await deliverTechnicalFile(ctx, {
      bytes,
      filename: result.bundle.path.split('/').pop() ?? `SEQ-${seqId}-technical-file-${parsed.data.regulation}.zip`,
      regulation: parsed.data.regulation,
      manifest: manifest ?? { regulation: parsed.data.regulation, sequenceId: seqId, ...report },
      title: result.bundle.displayName,
      backendRoute: 'POST /api/submissions/sequences/:seqId/technical-file/assemble',
      program: null,
      resourceType: 'ectd_sequence',
      resourceId: String(seqId),
      report,
    });
    // Sanitized — never expose the server temp path.
    res.json({
      ok: true,
      regulation: parsed.data.regulation,
      ready: result.ready,
      sha256: result.bundle.sha256,
      sizeBytes: result.bundle.sizeBytes,
      fileCount: result.bundle.fileCount,
      materialized: result.materialized,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
      unmappedLeaves: result.unmappedLeaves,
      matchedByTitleOnly: result.matchedByTitleOnly,
      unfinalized: result.unfinalized,
      unfinalizedSections: result.unfinalizedSections,
      ...consequence,
      meta: { auditTrail: result.auditTrail },
    });
  } catch (err) {
    technicalFileFail(res, err);
  }
});

// ── Device technical-file EXPORT from the GOVERNED document ───────────────────
// Packages the program's authored mdr/ivdr document (c2c_documents +
// c2c_document_sections — the rows the MDx editor and the eu-mdr / eu-ivdr rule
// packs write) into the technical-file ZIP and delivers it through the governed
// export consequence. The program is proved to belong to the caller's org via
// the request-scoped client BEFORE the assembler runs (404 otherwise — a foreign
// program is indistinguishable from a missing one). 422 NO_AUTHORED_CONTENT when
// nothing of that regulation has been authored; never an empty package.
const techFileExportSchema = z.object({
  regulation: z.enum(['mdr', 'ivdr']),
  productName: z.string().min(1).max(256).optional(),
  manufacturer: z.string().min(1).max(256).optional(),
});
router.post('/programs/:programId/technical-file/export', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const programId = String(Array.isArray(req.params.programId) ? req.params.programId[0] : req.params.programId ?? '');
  if (!isUuid(programId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid program id.' } });
  const parsed = techFileExportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const rdb = requestDb(req);
    const [program] = await rdb
      .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name, productName: regulatoryPrograms.productName })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, ctx.organizationId)))
      .limit(1);
    if (!program) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Program not found.' } });
    }

    const { assembleTechnicalFileFromProgram } = await import('../services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core');
    const result = await assembleTechnicalFileFromProgram({
      programId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      regulation: parsed.data.regulation,
      productName: parsed.data.productName ?? program.productName ?? undefined,
      manufacturer: parsed.data.manufacturer,
    });

    const anchorProjectId = await resolveProgramProjectAnchor(rdb, {
      programId,
      orgId: ctx.organizationId,
      context: 'submissions.technical-file.export',
    });
    // 2026-09-23 (W5/D7, residual repair): unmapped leaves by name — see the
    // sequence assemble route above. (Final pass, same date: and the
    // title-only placements, likewise.)
    const report = {
      ready: result.ready,
      fileCount: result.fileCount,
      materialized: result.materialized,
      leafCount: result.leafCount,
      skipped: result.skipped.length,
      unresolved: result.unresolvedLeaves.length,
      unfinalized: result.unfinalized,
      unmapped: result.unmappedLeaves.length,
      unmappedTechnicalDocumentation: result.unmappedLeaves.filter((u) => u.inTechnicalDocumentation).map((u) => u.source),
      matchedByTitleOnly: result.matchedByTitleOnly,
    };
    const consequence = await deliverTechnicalFile(ctx, {
      bytes: result.buffer,
      filename: result.filename,
      regulation: parsed.data.regulation,
      manifest: result.manifest,
      title: `${program.name ?? programId} — EU ${parsed.data.regulation.toUpperCase()} technical file`,
      backendRoute: 'POST /api/submissions/programs/:programId/technical-file/export',
      program: { id: programId, anchorProjectId },
      resourceType: 'device_technical_file',
      resourceId: programId,
      report,
    });
    res.json({
      ok: true,
      regulation: parsed.data.regulation,
      programId,
      ready: result.ready,
      sha256: result.sha256,
      sizeBytes: result.sizeBytes,
      fileCount: result.fileCount,
      materialized: result.materialized,
      leafCount: result.leafCount,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
      unmappedLeaves: result.unmappedLeaves,
      matchedByTitleOnly: result.matchedByTitleOnly,
      unfinalized: result.unfinalized,
      unfinalizedSections: result.unfinalizedSections,
      ...consequence,
      meta: { auditTrail: result.auditTrail },
    });
  } catch (err) {
    technicalFileFail(res, err);
  }
});

// ── Assemble (a dry run of the assemble step) ─────────────────────────────────
// Drives the real eCTD publisher off the sequence's canonical leaves and reports
// what the package would hold and what transmit would refuse. Returns a
// sanitized descriptor (no server paths). Does NOT transmit — submit/transmit
// stays behind the governed transmit_submission tool + Part 11 e-sign.
//
// 2026-10-08 (P-27 follow-up): it is a dry run, and says so. It filled the
// backbone's identity from the body or from UNASSIGNED placeholders and answered
// with the digest of bytes it then deleted. A package names only recorded
// identity (package-identity.ts); this route produces none, so it takes no
// identity — a body naming one is refused rather than silently ignored — and the
// answer carries dryRun / packageProduced / notice.
const DRY_RUN_IDENTITY_FIELDS = ['applicationId', 'sponsorId', 'sponsorName'] as const;
router.post('/sequences/:seqId/assemble', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const named = DRY_RUN_IDENTITY_FIELDS.filter((f) => (req.body ?? {})[f] !== undefined);
  if (named.length > 0) {
    return res.status(400).json({
      error: {
        code: 'DRY_RUN_TAKES_NO_IDENTITY',
        message:
          `This assembly is a dry run and takes no identity (${named.join(', ')}). A package's application number and ` +
          'applicant are read from the record when it is exported, compiled or sent. Nothing was assembled.',
      },
    });
  }
  const assembly = await import('../services/ectd/assemble-from-core');
  try {
    const { assembleSequence, assembledTransmitBlockers } = assembly;
    const { DRY_RUN_NOTICE } = await import('../services/ectd/package-identity');
    const result = await assembleSequence({
      sequenceId: seqId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dryRun: true,
    });
    // A dry run: the response carries metadata, not bytes, and the staged
    // bundle is discarded before answering — nothing of it is kept.
    await result.cleanup();
    // Sanitized — never expose the server temp path.
    res.json({
      ok: true,
      dryRun: true,
      packageProduced: false,
      notice: DRY_RUN_NOTICE,
      // No sha256: a digest of discarded placeholder-identity bytes is exactly
      // what could be recorded as a package's (P-27). Size and format describe
      // the dry run; the digest of a package is its export's or its compile's.
      format: result.bundle.format,
      sizeBytes: result.bundle.sizeBytes,
      materialized: result.materialized,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
      // 2026-09-22 (W5/D7): assembled is not ready-to-send. A draft leaf is IN
      // the package; transmit refuses it, so the response says so.
      unfinalized: result.unfinalized,
      unfinalizedSections: result.unfinalizedSections,
      transmitBlockers: assembledTransmitBlockers(result),
      // What happened to the ECTD_ASSEMBLE row (§11.10(e)): an assembly that
      // went unrecorded says so here, not only in a server log.
      auditTrail: result.auditTrail,
    });
  } catch (err) {
    // A refused assembly is a refusal, not an outage. It carries no `code`, so
    // fail() answered it 500 "Request failed." and dropped the ECTD_ASSEMBLE_BLOCKED
    // row's outcome, which IS the record that the refusal happened.
    if (err instanceof assembly.EctdAssemblyBlockedError) {
      return res.status(422).json({
        error: { code: 'ECTD_ASSEMBLE_BLOCKED', message: err.message },
        auditTrail: err.auditTrail,
      });
    }
    fail(res, err);
  }
});

// ── Dispatch readiness (deterministic, server-computed gate inputs) ───────────
// The tamper-proof counterpart to dispatch-qc: it computes validationErrors (from
// the canonical leaves) and unacknowledgedShadowCriticals (from shadow_findings)
// SERVER-SIDE and runs the hard gate, so the verdict can't be talked out of a
// blocker by a client-supplied number. Read-only; does NOT transmit.
router.get('/sequences/:seqId/dispatch-readiness', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const { assessSequenceDispatchReadiness } = await import('../services/ectd/assess-dispatch-readiness');
    const [assessment, sequence] = await Promise.all([
      assessSequenceDispatchReadiness({ sequenceId: seqId, organizationId: ctx.organizationId }),
      getSequence(seqId, ctx),
    ]);
    const dispatchAuthorization = sequenceDispatchAuthorizationEligibility(sequence);
    // Whether THIS user may sign the sequence's freeze and dispatch, asked of
    // the sign step's own separation-of-duties check (signerIndependenceOf),
    // so the Dispatch tab can say so before a password is typed rather than
    // after the server refuses — and cannot disagree with that refusal. It no
    // longer re-derives the author rule here. Informational: the sign route
    // and Gate 1 still decide. A failed lookup is 'unverified', never
    // 'independent'.
    const { signerIndependenceOf } = await import('../services/governance/separation-of-duties');
    const signer = { state: await signerIndependenceOf(`ectd-sequence:${seqId}`, ctx.organizationId, ctx.userId) };
    res.json({ ...assessment, signer, dispatchAuthorization });
  } catch (err) {
    fail(res, err);
  }
});

// ── Governed freeze / dispatch (the SUBMIT step) ──────────────────────────────
// Each requires a Part 11 e-signature: first POST /api/c2c/actions/sign with
// target "ectd-sequence:<seqId>" (re-auth + separation-of-duties + ledger), then
// pass the returned actionId here. The service applies BOTH gates atomically —
// the e-signature AND the deterministic dispatch gate — so a sequence cannot be
// frozen or dispatched while the gate blocks. Neither transmits.
const governedTransitionSchema = z.object({ signatureActionId: z.string().min(1).max(128) });

// ── Governed precheck (ask the step's gates BEFORE a signature is taken) ─────
// QA 2026-10-08 (j6): the client signed first and asked the gate second, so a
// refused freeze left an executed approval signature. This runs the step's own
// gates without a signature (precheckGovernedStep) and answers 200 with
// { cleared, refusal } either way — a refusal here is the answer, not an error.
// It authorizes nothing: the step re-runs every gate itself.
const governedPrecheckSchema = z
  .object({
    // 'shadow-waiver' (P-34): whether a Shadow Review waiver is on offer, and
    // the failed run it would cite, before anyone signs one.
    // 'shadow-finding-disposition' (P-35): whether the named finding may be
    // closed that way now, before anyone signs.
    step: z.enum(['freeze', 'dispatch', 'transmit', 'shadow-waiver', 'shadow-finding-disposition']),
    environment: z.enum(['staging', 'production']).optional(),
    // Transmit: the number the person typed, judged against the program record
    // before anyone signs (P-23), by the rule transmit itself applies.
    applicationId: z.string().min(1).max(128).optional(),
    // Finding disposition: the finding and how it is to be closed.
    findingId: z.number().int().positive().optional(),
    disposition: z.enum(SHADOW_FINDING_DISPOSITIONS).optional(),
  })
  .refine((b) => b.step !== 'shadow-finding-disposition' || (b.findingId !== undefined && b.disposition !== undefined), {
    message: "A 'shadow-finding-disposition' precheck names the finding (findingId) and the disposition (accepted or fixed).",
    path: ['findingId'],
  });
router.post('/sequences/:seqId/governed-precheck', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = governedPrecheckSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { precheckGovernedStep } = await import('../services/submission-service/submission-service');
    res.json(
      await precheckGovernedStep(seqId, parsed.data.step, ctx, {
        environment: parsed.data.environment,
        applicationId: parsed.data.applicationId,
        findingId: parsed.data.findingId,
        disposition: parsed.data.disposition,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/freeze', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = governedTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { freezeSequence } = await import('../services/submission-service/submission-service');
    const seq = await freezeSequence(seqId, ctx, parsed.data.signatureActionId);
    res.json(seq);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/dispatch', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = governedTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { dispatchSequence } = await import('../services/submission-service/submission-service');
    const seq = await dispatchSequence(seqId, ctx, parsed.data.signatureActionId);
    res.json(seq);
  } catch (err) {
    fail(res, err);
  }
});

// ── Transmit (the final step — assemble → send to the agency gateway) ─────────
// Requires the sequence to be dispatched, a Part 11 e-signature on the sequence
// target, and a clear dispatch gate. Real transmission only happens when the org
// has gateway credentials for the chosen environment; otherwise the response
// reports `transmitted: false, reason: "gateway_not_configured"` honestly.
const transmitSchema = z.object({
  signatureActionId: z.string().min(1).max(128),
  environment: z.enum(['staging', 'production']).optional(),
  applicationId: z.string().min(1).max(128).optional(),
  sponsorId: z.string().min(1).max(128).optional(),
  // No sponsorName: the package names the organisation's recorded name (QA j6).
});
router.post('/sequences/:seqId/transmit', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = transmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { transmitSequence } = await import('../services/submission-service/submission-service');
    const result = await transmitSequence({
      sequenceId: seqId,
      ctx,
      signatureActionId: parsed.data.signatureActionId,
      environment: parsed.data.environment,
      applicationId: parsed.data.applicationId,
      sponsorId: parsed.data.sponsorId,
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
