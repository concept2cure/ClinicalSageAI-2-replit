/**
 * @fileoverview Clinical-Regulatory Intelligence Graph API routes.
 * @module server/routes/clinical-regulatory-evidence-routes
 *
 * The seven reads and one action that back the phase-7 v2 surfaces:
 *
 *   GET  /api/clinical-regulatory-evidence/coverage?studyId=&designNodeId=
 *   GET  /api/clinical-regulatory-evidence/findings?<§8.1 filters>
 *   GET  /api/clinical-regulatory-evidence/findings/:id
 *   GET  /api/clinical-regulatory-evidence/outcome?applicationNumber=
 *   GET  /api/clinical-regulatory-evidence/design-evidence?designNodeId=
 *   GET  /api/clinical-regulatory-evidence/trace/:traceId
 *   POST /api/clinical-regulatory-evidence/stress-test
 *
 * Envelope: { success, data } — matching the sibling board routes
 * (csr-workflow-routes.ts, precedent-engine-board.ts) that the v2 surfaces
 * already consume through `useLiveData`.
 *
 * ── What these routes will and will not do ──────────────────────────────────
 *
 * TENANT SCOPING (§14). organizationId is resolved from JWT-bound request
 * context ONLY — never from the body, query or a header. Missing context is a
 * 401, not an unscoped read. There is no route parameter anywhere in this file
 * that can widen visibility, which is what makes cross-tenant retrieval a
 * structural impossibility rather than a rule someone has to remember.
 *
 * FEATURE FLAG. Everything sits behind ENABLE_CLINICAL_REGULATORY_GRAPH. Flag
 * off ⇒ 404, as though the surface does not exist — not an empty 200, which
 * would leave the UI rendering a corpus-empty state for a feature that is simply
 * switched off. No half-state.
 *
 * HONEST EMPTY. Through phases 1–3 the facade has no ingested corpus, so these
 * routes return real zeros and an exclusion note saying so. They do not return
 * sample findings. See the facade's module docstring for why that matters more
 * here than almost anywhere else in the product.
 */

import { Router, type Request, type Response } from 'express';

import * as evidence from '../services/clinical-regulatory-evidence/index.js';
import type {
  Discipline,
  EvidenceScope,
  FindingQuery,
  VerificationState,
} from '../services/clinical-regulatory-evidence/types.js';
import {
  ingestCrl,
  extractFindingsFromText,
  type CrlIngestInput,
} from '../services/clinical-regulatory-evidence/crl-ingestion.service.js';
import { projectOrgCsrReports } from '../services/clinical-regulatory-evidence/csr-adapter.service.js';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('clinical-regulatory-evidence-routes');

/**
 * Is the graph enabled for this deployment? Defaults OFF — a regulated evidence
 * path should require an explicit decision to switch on, never arrive enabled
 * because someone forgot to set a variable.
 */
export function isGraphEnabled(): boolean {
  return process.env.ENABLE_CLINICAL_REGULATORY_GRAPH === 'true';
}

/**
 * Resolve the tenant scope from JWT-bound context only. Mirrors
 * csr-workflow-routes.ts:102 exactly — one resolution rule across the codebase
 * so there is no second, weaker path to an organization id.
 */
function resolveScope(req: Request): EvidenceScope | null {
  const r = req as unknown as {
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
    tenantId?: unknown;
  };
  const candidate = r.tenantContext?.organizationId ?? r.user?.organizationId ?? r.tenantId;
  if (candidate == null) return null;
  const n = typeof candidate === 'string' ? parseInt(candidate, 10) : Number(candidate);
  if (!Number.isInteger(n) || n <= 0) return null;

  const scope: EvidenceScope = { organizationId: n };
  const projectRaw = req.query.projectId;
  if (typeof projectRaw === 'string' && /^\d+$/.test(projectRaw)) {
    scope.projectId = parseInt(projectRaw, 10);
  }
  return scope;
}

/** Read a single string query param, ignoring array/duplicate forms. */
function str(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return v.length > 0 ? v : undefined;
}

const DISCIPLINES: readonly Discipline[] = [
  'clinical',
  'statistical',
  'safety',
  'clinical_pharmacology',
  'cmc',
  'microbiology',
  'device',
  'labeling',
  'facility',
  'administrative',
];

const VERIFICATION_STATES: readonly VerificationState[] = [
  'source_verified',
  'extracted_unreviewed',
  'inferred_mapping',
  'potential_study_link',
  'insufficient_evidence',
  'stale_recalculate',
];

/**
 * Build the §8.1 constraint set from the query string.
 *
 * Unrecognized enum values are DROPPED rather than passed through. A filter the
 * service does not understand would otherwise silently widen the result set —
 * the user would believe they had constrained to "clinical" and receive
 * everything. Dropping narrows nothing but never lies about what was applied.
 */
function parseFindingQuery(req: Request): FindingQuery {
  const q: FindingQuery = {};

  const applicationType = str(req.query.applicationType);
  if (applicationType) q.applicationType = applicationType;

  const discipline = str(req.query.discipline);
  if (discipline && (DISCIPLINES as readonly string[]).includes(discipline)) {
    q.discipline = discipline as Discipline;
  }

  const verification = str(req.query.verification);
  if (verification && (VERIFICATION_STATES as readonly string[]).includes(verification)) {
    q.verification = verification as VerificationState;
  }

  for (const key of [
    'category',
    'ctdSection',
    'ichE3Section',
    'designNode',
    'indication',
    'phase',
    'modality',
    'endpointClass',
    'control',
    'text',
  ] as const) {
    const v = str(req.query[key]);
    if (v) q[key] = v;
  }

  const limitRaw = str(req.query.limit);
  if (limitRaw && /^\d+$/.test(limitRaw)) {
    q.limit = Math.min(parseInt(limitRaw, 10), 200);
  }
  return q;
}

/** Shared guard: flag on, tenant resolved. Returns the scope or ends the response. */
function guard(req: Request, res: Response): EvidenceScope | null {
  if (!isGraphEnabled()) {
    res.status(404).json({ success: false, error: 'Not found' });
    return null;
  }
  const scope = resolveScope(req);
  if (!scope) {
    res.status(401).json({ success: false, error: 'Organization context required' });
    return null;
  }
  return scope;
}

/** Uniform 500 that never leaks internals to a regulated client surface. */
function fail(res: Response, op: string, e: unknown): Response {
  logger.error(`${op} failed`, { error: e instanceof Error ? e.message : String(e) });
  return res.status(500).json({ success: false, error: 'Evidence service unavailable' });
}

/**
 * The eight handlers, defined at module scope rather than inside the router
 * factory. Each one guards first (flag + tenant), then delegates to the facade —
 * no handler reaches past the facade to an adapter.
 */

/** Coverage strip — §8.1 denominators for a study or design node. */
async function handleCoverage(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  try {
    const data = await evidence.getCoverage(scope, {
      studyId: str(req.query.studyId),
      designNodeId: str(req.query.designNodeId),
    });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'coverage', e);
  }
}

/** CRL library list + CSR findings panel. Constraints applied before ranking. */
async function handleFindings(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  try {
    const data = await evidence.searchFindings(scope, parseFindingQuery(req));
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'findings', e);
  }
}

/**
 * CRL library detail. 404 when absent OR not visible to this tenant — the two
 * are deliberately indistinguishable, so a probe cannot confirm that another
 * tenant's finding exists.
 */
async function handleFindingDetail(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  try {
    const finding = await evidence.getFinding(scope, String(req.params.id));
    if (!finding) {
      res.status(404).json({ success: false, error: 'Finding not found' });
      return;
    }
    res.json({ success: true, data: finding });
  } catch (e) {
    fail(res, 'finding-detail', e);
  }
}

/**
 * CSR regulatory-outcome card. `data: null` means NO VERIFIED OUTCOME — the
 * surface renders "Not verified". It never means "approved" and it is never
 * inferred from trial status (§4.2).
 */
async function handleOutcome(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  const applicationNumber = str(req.query.applicationNumber);
  if (!applicationNumber) {
    res.status(400).json({ success: false, error: 'applicationNumber is required' });
    return;
  }
  try {
    const data = await evidence.getOutcome(scope, applicationNumber);
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'outcome', e);
  }
}

/** Study Design evidence panel — all seven §13 questions in one payload. */
async function handleDesignEvidence(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  const designNodeId = str(req.query.designNodeId);
  if (!designNodeId) {
    res.status(400).json({ success: false, error: 'designNodeId is required' });
    return;
  }
  try {
    const data = await evidence.getDesignEvidence(
      scope,
      designNodeId,
      str(req.query.designNodeType) ?? 'unknown',
    );
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'design-evidence', e);
  }
}

/** Evidence-chain report + the Trace action. */
async function handleTrace(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  try {
    const trace = await evidence.getTrace(scope, String(req.params.traceId));
    if (!trace) {
      res.status(404).json({ success: false, error: 'Trace not found' });
      return;
    }
    res.json({ success: true, data: trace });
  } catch (e) {
    fail(res, 'trace', e);
  }
}

/**
 * Stress-test run. Delegates scenario selection to the graph and the simulation
 * itself to the EXISTING simulator — no numbers are minted here.
 */
async function handleStressTest(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  const body = (req.body ?? {}) as { designNodeId?: unknown; assumptions?: unknown };
  if (typeof body.designNodeId !== 'string' || !body.designNodeId.trim()) {
    res.status(400).json({ success: false, error: 'designNodeId is required' });
    return;
  }
  try {
    const data = await evidence.runStressTest(scope, {
      designNodeId: body.designNodeId.trim(),
      assumptions: Array.isArray(body.assumptions)
        ? (body.assumptions as evidence.Assumption[])
        : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'stress-test', e);
  }
}

/**
 * Ingest an FDA Complete Response Letter into the SHARED evidence corpus.
 *
 * This is the write that fills cre_regulatory_findings / cre_regulatory_outcomes —
 * the tables every CRE surface reads. It is PLATFORM-ADMIN only (route-level
 * `requirePlatformAdmin`): a CRL is a public FDA record written GLOBAL_PUBLIC (org
 * NULL) and visible to every tenant, so a single tenant user must not be able to
 * mint cross-tenant regulatory evidence. Accepts already-structured `findings`, or a
 * raw `text` letter which is extracted through the AI gateway (never fabricated — an
 * empty extraction yields a 422, never a synthetic finding). The tenant scope
 * supplies the acting org; the rows still land global-public by design.
 */
async function handleIngestCrl(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  const body = (req.body ?? {}) as Partial<CrlIngestInput> & { text?: string };
  const applicationNumber = str(body.applicationNumber);
  if (!applicationNumber) {
    res.status(400).json({ success: false, error: 'applicationNumber is required' });
    return;
  }
  try {
    let findings = Array.isArray(body.findings) ? body.findings : [];
    if (findings.length === 0 && typeof body.text === 'string' && body.text.trim().length >= 40) {
      findings = await extractFindingsFromText(body.text, { applicationNumber });
    }
    if (findings.length === 0) {
      res.status(422).json({
        success: false,
        error: 'No findings supplied, and none could be extracted from the letter text.',
      });
      return;
    }
    const result = await ingestCrl(scope.organizationId, { ...body, applicationNumber, findings });
    res.json({
      success: true,
      data: {
        sourceId: result.source.id,
        applicationNumber,
        findingCount: result.findings.length,
        outcomeCount: result.outcomes.length,
        linkedStudyIds: result.linkedStudyIds,
        relationshipCount: result.relationshipCount,
      },
    });
  } catch (e) {
    fail(res, 'ingest-crl', e);
  }
}

/**
 * Project this tenant's own CSR reports into the evidence spine.
 *
 * Unlike CRL ingestion, this writes TENANT-PRIVATE evidence sourced from the
 * caller's existing `csr_reports` — a business admin curating their own corpus,
 * not minting shared FDA records — so it is gated by the tenant `guard()` (flag +
 * JWT-bound org) alone, with no platform-admin requirement. `adaptCsrReport` is
 * idempotent: rows already projected report as `alreadyPresent`, never duplicated.
 * A bounded `limit` (1–2000, default 500) keeps a single call from sweeping an
 * unbounded corpus in one request.
 */
async function handleProjectCsr(req: Request, res: Response): Promise<void> {
  const scope = guard(req, res);
  if (!scope) return;
  const body = (req.body ?? {}) as { limit?: unknown };
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : undefined;
  try {
    const data = await projectOrgCsrReports(scope.organizationId, { limit });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, 'project-csr', e);
  }
}

export default function createClinicalRegulatoryEvidenceRoutes(): Router {
  const router = Router();

  router.get('/coverage', handleCoverage);
  router.get('/findings', handleFindings);
  router.get('/findings/:id', handleFindingDetail);
  router.get('/outcome', handleOutcome);
  router.get('/design-evidence', handleDesignEvidence);
  router.get('/trace/:traceId', handleTrace);
  router.post('/stress-test', handleStressTest);

  // Write path — platform-admin only (fills the shared global-public FDA corpus).
  router.post('/crl', requirePlatformAdmin, handleIngestCrl);

  // Tenant curation — projects the caller's OWN csr_reports into the spine
  // (tenant-private, idempotent). Gated by the tenant guard only, no platform admin.
  router.post('/project-csr', handleProjectCsr);

  return router;
}
