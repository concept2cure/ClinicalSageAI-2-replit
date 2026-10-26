/**
 * /api/c2c/projects/* — Project detail endpoints.
 *
 * Unified project-level reads for the Projects detail surface (Phase 10).
 * Aggregates over `regulatory_programs`, `c2c_document_sections`,
 * `project_members`, `c2c_project_pinned_evidence`, and `audit_logs`.
 *
 * Routes:
 *   GET  /api/c2c/projects/:id                     project metadata
 *   GET  /api/c2c/projects/:id/dossier              approved sections: home filing, each market, each module
 *   GET  /api/c2c/projects/:id/drafts?limit=7       recent section drafts
 *   GET  /api/c2c/projects/:id/team                 project members
 *   GET  /api/c2c/projects/:id/evidence?pinned=1    pinned evidence cards
 *   POST /api/c2c/projects/:id/evidence             pin evidence
 *   DELETE /api/c2c/projects/:id/evidence/:evId     unpin
 *   GET  /api/c2c/projects/:id/activity?limit=5     recent audit_logs
 *
 * @module server/routes/c2c/projects
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { readProjectActivity } from '../../services/c2c/project-activity.js';
import { readDossier, readDossierFigures, type DossierFigure } from '../../services/c2c/dossier-read.js';
import { requestPgClient } from '../../db/requestDb';
import type { PoolClient } from 'pg';
import {
  scaffoldProjectDocuments,
  type ScaffoldResult,
} from '../../services/c2c/scaffold-project-documents.js';
import {
  ProgramAnchorUnavailableError,
  requireProgramProjectAnchor,
} from '../../services/c2c/program-project-anchor.js';
import {
  canCreateProgram,
  canMutateProgram,
  programInOrganization,
  resolveProgramQuotaMode,
} from '../../services/c2c/program-access.js';
import { checkProgramQuota } from '../../services/license-manager.js';
import { computeAuditChainSealed, hashPayload } from '../../services/audit/chain.js';
import { createScopedLogger } from '../../utils/logger.js';
import { isIvdFamily } from '../../../shared/constants/domain/product-types.js';
import { resolveFilingCatalogEntry, deviceClassScopeForFiling, regionalDeviceApplicationClassOf } from '../../../shared/regulatory/filing-catalog.js';
import { readExtractionCoverage } from '../../../shared/data-room-processing-status.js';
import { registryContextForProgram } from '../../services/c2c/program-registry-context.js';
/* The create endpoint's validation tables (VALID_PROGRAM_TYPES /
   VALID_PRODUCT_TYPES / DRUG_APPLICATION_TYPES) and its canonical
   submission-spine plumbing live in ./project-intake.ts — pure domain helpers
   with no route or tenancy logic, split out when this file outgrew the repo
   line-count gate. */
import {
  VALID_PROGRAM_TYPES,
  DRUG_APPLICATION_TYPES,
  ensureSubmissionSpine,
  baseCodeFrom,
  productTypeForIntake,
} from './project-intake.js';
import {
  devicePathFor,
  normalizeDeviceClassification,
  usesDeviceClassification,
} from '../../../shared/constants/domain/device-classification.js';
import {
  programmePredicateDevicesColumn,
  programmeTeamMembersColumn,
  programmeProfilePatchSchema,
} from '../../services/c2c/programme-profile-write.js';
/* Every 5xx on this router goes through the canonical helper. Its job here is
   the one the MDX UAT (item A1) proved was missing: it logs the failure keyed
   by the SAME `X-Request-Id` the user is shown as "Reference <id>", and echoes
   that id back in the body. Before this, the catch ran `console.error` with no
   correlation id at all, so the three reference ids the UAT captured for the
   create failure could not be looked up in the logs — the reference the UI
   invited the user to quote pointed at nothing. */
import { serverError } from '../../lib/api-response.js';
import { requireGovernedReason } from '../governed-reason.js';
import { addProjectMarket, AddMarketRefusal } from '../../services/c2c/add-project-market.js';
import { sourceProcessingSummary } from '../../services/clinical-regulatory-evidence/data-room-processing-read.js';
import { createSource, findSourceByChecksum } from '../../services/clinical-regulatory-evidence/evidence-spine.service.js';
import { uploadedBinaryAvailableSql } from '../../services/document-data-disposition/eligibility.js';
import { lockDocumentDispositionProgram } from '../../services/document-data-disposition/program-lock.js';
import { readRecordedUploadLineage } from '../../services/document-data-disposition/recorded-lineage.js';
import { loadUploadedFile, sha256Hex, UploadedFileError, type UploadedFile } from '../../services/ana/uploaded-file-access.js';
import { supersededSql } from '../../services/vault/vault-version-family.js';
import { documentAgencyFor, marketOfferGivenOutline, type FilingOffer, type MarketInput } from '../../services/regulatory/market-support.js';
import { installProjectRouteAccess, requireProjectRouteAccess, requireProjectCreationAccess, withProjectWriteReservation, sendProjectAccessFailure } from './project-route-access';
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, verifiedProgramAnchors, ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { assertAnaUploadAccess } from '../../services/ana/source-context-admission';
import { AnaProjectScopeError } from '../../services/ana/project-scope-admission';
import { readProjectAuthoringRecords } from '../../services/c2c/project-authoring-records';
import { readProjectTeam } from '../../services/c2c/project-team';
import { projectWorkspaceInput, ProjectWorkspaceInputError } from './project-intake-workspace';
import { SourceReadAccessError } from '../../services/clinical-regulatory-evidence/source-read-access';
import { PROJECT_CARD_LIST_SQL, PROJECT_CARD_CREATED_SQL, portfolioAnchorJson, portfolioClientFilter, readPortfolioClients } from '../../services/c2c/project-portfolio';

/** A filing the market verdict does not offer, found once the scaffold has
 *  resolved its outline. Thrown inside the creation transaction so it rolls
 *  back, and answered 422 FILING_NOT_OFFERED. */
class FilingNotOfferedError extends Error {
  readonly offer: FilingOffer;
  constructor(offer: FilingOffer) {
    super(offer.reason);
    this.name = 'FilingNotOfferedError';
    this.offer = offer;
  }
}

function sendFilingNotOffered(res: Response, offer: FilingOffer) {
  return res.status(422).json({ error: 'FILING_NOT_OFFERED', message: offer.reason, marketSupport: offer });
}

// People are named through public.actor_name, not a join on users: since users
// took row-level security (D3, 2026-09-28) a tenant scope reads only current
// members, so the join dropped the name of anyone who had left
// (docs/evidence/D3/2026-09-29-actor-names/).
const router = Router();
installProjectRouteAccess(router, 'projects');

/**
 * A 42P01 (undefined_table) as an actionable 503 — actionable for the OPERATOR,
 * opaque to the client.
 *
 * ── Two failed attempts precede this one ─────────────────────────────────────
 * Every PENDING_STORE site in this file first answered `{ error: 'PENDING_STORE' }`
 * and nothing else: a correct status and an unactionable outage, because the
 * caller learned that a store was missing but not which one. `POST /` alone
 * touches the quota tables, the program row, the submission spine and the
 * PM-spine anchor, so "some store is missing" narrows it to four candidates.
 *
 * The correction put the relation name into the client-facing `message`, on the
 * reasoning that naming a schema object to an authenticated operator is not a
 * disclosure. That reasoning is wrong about who receives it. The response is
 * rendered by the browser, to whoever is holding the session — and in a
 * regulated product the schema shape of the governed store is exactly the kind
 * of internal that must not appear on a screen. It is an information-disclosure
 * finding, not a cosmetic one.
 *
 * ── What this does instead ───────────────────────────────────────────────────
 * The relation and the step go to the LOG, keyed by the request id the
 * `requestId` middleware already sets and echoes as `X-Request-Id`
 * (server/middleware/enterprise-security.ts). The client gets a sentence, the
 * machine-readable code, and that same id. The operator question — "which store
 * do I provision?" — is answered by one log lookup on an id the user can read
 * off the screen and quote, so nothing is lost except the disclosure.
 */
/**
 * Returns null when the 42P01 is NOT a provisioning problem, so the caller
 * reports a server error instead.
 *
 * A 42P01 names a relation in its message and the route used to take that name
 * at face value. It is not always the cause. On this route the golden drug-NDA
 * journey produces `relation "audit_logs" does not exist` from inside the
 * project-creation transaction while `to_regclass('public.audit_logs')` returns
 * the table — so the operator was being told to provision a store that is
 * already there, on the one code path whose whole job is to say what is wrong.
 * A false diagnosis on a fail-closed path is worse than a generic one: it sends
 * the reader somewhere confidently, and the second hop dead-ends too.
 *
 * So the relation is CHECKED before it is named. If it resolves, this is not a
 * missing store and the caller must not say it is.
 */
async function pendingStore(
  err: unknown,
  step: string,
  req: Request,
): Promise<{ error: string; step: string; message: string; correlationId: string } | null> {
  const raw = (err as { message?: string })?.message ?? '';
  const match = /relation "([^"]+)" does not exist/i.exec(raw);
  const store = match ? match[1] : null;
  const correlationId = (req as unknown as { requestId?: string }).requestId || randomUUID();

  // Verified on a FRESH connection: the one the error came from may be in an
  // aborted transaction, where every further statement fails regardless.
  let resolves: boolean | null = null;
  if (store) {
    try {
      const probe = await pool.query('SELECT to_regclass($1) AS reg', [store]);
      resolves = Boolean((probe.rows[0] as { reg?: string } | undefined)?.reg);
    } catch {
      // Could not check. Say so rather than asserting either way.
      resolves = null;
    }
  }

  if (resolves === true) {
    logger.error('42P01 names a relation that EXISTS — not a provisioning failure', {
      correlationId,
      step,
      store,
      code: (err as { code?: string })?.code ?? null,
      route: req.originalUrl,
      detail: raw.slice(0, 300),
    });
    return null;
  }

  logger.error('Store not provisioned — request failed closed', {
    correlationId,
    step,
    store,
    // Three-valued on purpose: 'absent' means to_regclass was asked and said
    // no; 'unverified' means the check itself could not run (an aborted
    // transaction fails every further statement) and the claim below is an
    // assumption. Collapsing those two would make an unchecked guess read
    // exactly like a confirmed finding.
    storeCheck: resolves === false ? 'absent' : 'unverified',
    code: (err as { code?: string })?.code ?? null,
    route: req.originalUrl,
  });

  return {
    error: 'PENDING_STORE',
    step,
    // "failed" rather than "cannot complete": `step` is sometimes a gerund
    // phrase ("creating the project") and sometimes a noun phrase ("the
    // licensed-program quota check"), and only "failed" reads naturally after
    // both. And NOT "contact your administrator" — this fires on an unapplied
    // migration, which no in-product admin role can act on; naming the wrong
    // actor sends the user on a second hop that also dead-ends.
    message:
      `This environment is not fully set up, so ${step} failed. ` +
      'Share the reference below with your system administrator or Concept2Cure support.',
    correlationId,
  };
}

const logger = createScopedLogger('c2c-projects');

/** What the person creating the program is told, per reason. No schema names. */
const PROJECT_RECORD_REFUSAL: Record<'NO_CLIENT_WORKSPACE' | 'AMBIGUOUS_CLIENT_WORKSPACE' | 'INVALID_CLIENT_WORKSPACE' | 'CLIENT_WORKSPACE_MISMATCH', string> = {
  NO_CLIENT_WORKSPACE:
    'The project was not created: this organization has no workspace set up yet, so the project ' +
    'could not be given its record. Nothing was saved. Share the reference below with your system ' +
    'administrator or Concept2Cure support.',
  AMBIGUOUS_CLIENT_WORKSPACE:
    'Choose a client workspace before creating this project. Nothing was saved.',
  INVALID_CLIENT_WORKSPACE:
    'The selected client workspace is unavailable. Refresh the workspace choices. Nothing was saved.',
  CLIENT_WORKSPACE_MISMATCH:
    'The workspace selection does not match this request or the recorded project. Nothing was saved.',

};

/**
 * Intake refused the program because it could not be given its project record
 * (P-19). The refusal rolled the transaction back, so nothing was written. The
 * reason's detail names schema objects and goes to the log, keyed by the same
 * reference the person is shown; the response carries a sentence.
 */
async function sendProjectRecordRefusal(
  err: ProgramAnchorUnavailableError,
  req: Request,
  res: Response,
  orgId: number,
) {
  if (err.reason === 'PENDING_ANCHOR_COLUMN') {
    // An unapplied migration: the operator's problem, reported as every other
    // unprovisioned store on this route is.
    const pending = await pendingStore(err, 'creating the project', req);
    logger.error('Program refused: the anchor column is not provisioned', {
      correlationId: pending?.correlationId ?? null, orgId, reason: err.reason, detail: err.detail,
    });
    if (pending) return res.status(503).json(pending);
    return serverError(res, logger, 'creating the project', err);
  }
  const correlationId = (req as unknown as { requestId?: string }).requestId || randomUUID();
  logger.error('Program refused: its project record could not be written', {
    correlationId, orgId, reason: err.reason, detail: err.detail,
  });
  return res.status(409).json({
    error: err.code,
    reason: err.reason,
    message: PROJECT_RECORD_REFUSAL[err.reason],
    correlationId,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Parse a ?limit/?offset value: anything non-numeric falls back to `fallback`,
 *  and the result is clamped into [min, max] so a caller cannot ask for an
 *  unbounded page (or a negative OFFSET, which Postgres rejects). */
function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function send400(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

function send403(res: Response) {
  return res.status(403).json({ error: 'FORBIDDEN' });
}

function send404(res: Response) {
  return res.status(404).json({ error: 'NOT_FOUND' });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const READ_FAILED_REASON = 'The governed sections could not be read.';
const unread = (): DossierFigure => ({ state: 'unavailable', pct: null, reason: READ_FAILED_REASON });

/**
 * Each project's dossier readiness: the home filing's figure from
 * server/services/c2c/dossier-read.ts, the figure Project home's card prints
 * (FILING_SPINE F23). The list, the detail and the create read it here, so a
 * program reads the same on its card, its page and its create response.
 *
 * It replaces `readinessByProject`, which counted approved or locked sections
 * over every document of the project, the home filing and its added markets
 * pooled: adding EMA's MAA lowered an FDA NDA's figure, and the card disagreed
 * with Project home's own card. Before that the list read
 * `regulatory_programs.progress_percent`, written once as 0 and never updated;
 * that column is read nowhere now.
 *
 * A store this environment has not provisioned is answered by the service as
 * 'unavailable'. Any other failure is logged here and each figure is
 * 'unavailable' with the reason: the list is the primary surface and still
 * answers, and a figure that could not be read is shown as such, never as 0
 * and never as "no sections".
 */
async function homeFigures(projectIds: string[], orgId: number): Promise<Map<string, DossierFigure>> {
  try {
    return await readDossierFigures(pool, orgId, projectIds);
  } catch (err) {
    logger.warn('Dossier readiness could not be read; each figure is unavailable', {
      err: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code,
    });
    return new Map(projectIds.map((id) => [id, unread()]));
  }
}

/** A figure as a program row carries it: the share, its state, and why there is none. */
function readinessFields(f: DossierFigure): { readiness: number | null; readinessState: DossierFigure['state']; readinessReason?: string } {
  return { readiness: f.pct, readinessState: f.state, ...(f.state === 'unavailable' ? { readinessReason: f.reason } : {}) };
}

/**
 * Write one hash-chained domain audit row for a program mutation.
 *
 * Takes the querier rather than reaching for the pool, so a caller inside a
 * transaction passes its client and the audit row commits or rolls back with
 * the change it describes. A mutation that left no audit trace is not a record
 * a regulated tenant can defend.
 *
 * This is deliberately separate from the global tamper-proof interceptor in
 * startup/audit-trail.ts. That one writes `audit.tamper_proof_log`; this writes
 * `audit_logs`, the table GET /:id/activity reads. Columns and the seal follow
 * the canonical write in services/auditService.ts.
 */
async function writeProgramAudit(
  q: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  input: {
    orgId: number;
    userId: number | null;
    programId: string;
    action: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  const occurredAt = new Date().toISOString();
  const target = `regulatory_program:${input.programId}`;
  const payloadHash = hashPayload(input.details);
  const { sha256Chain, hmacSeal } = await computeAuditChainSealed(q as never, {
    // Name the tenant explicitly rather than letting the writer fall back to
    // the connection's app.current_tenant_id: this runs inside the caller's
    // transaction, and the row's chain must join the tenant it is about to be
    // INSERTed against, not whatever the connection was last scoped to.
    tenant_id: input.orgId,
    action: input.action,
    actor_id: input.userId,
    target,
    payload_hash: payloadHash,
    occurred_at: occurredAt,
  });
  await q.query(
    `INSERT INTO audit_logs
       (id, tenant_id, user_id, action, table_name, record_id, actor_id, target,
        target_type, target_id, payload_hash, sha256_chain, occurred_at, hmac_seal,
        new_values)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::json)`,
    [
      randomUUID(), input.orgId, input.userId, input.action, 'regulatory_programs',
      input.programId, input.userId, target, 'regulatory_program', input.programId,
      payloadHash, sha256Chain, occurredAt, hmacSeal, JSON.stringify(input.details),
    ],
  );
}

/**
 * Authorize a MUTATING program route. Returns true when the handler may
 * continue; when it returns false the 403 has already been sent.
 *
 * Uses the role freshly admitted by this router, never a stale token role.
 */
/** Whether this caller may change this program, by the role this router admitted. The one decision
 *  behind allowProgramMutation and the detail read's `canChange` (FILING_SPINE F22 review, 2026-10-15). */
function mayChangeProgram(req: Request, res: Response, program: { leadUserId: number | null }): boolean {
  const userId = resolveUserId(req);
  const orgRole = res.locals.currentProgramAccess?.actor?.role;
  return !!orgRole && canCreateProgram({ orgRole }) && canMutateProgram({ actor: { userId, orgRole }, program });
}

function allowProgramMutation(
  req: Request,
  res: Response,
  program: { leadUserId: number | null },
  route: string,
): boolean {
  const userId = resolveUserId(req);
  if (mayChangeProgram(req, res, program)) return true;
  logger.warn('Program mutation refused by current access', { route, programId: String(req.params.id), userId });
  send403(res);
  return false;
}

// ── The program DETAIL — one projection, one serializer ──────────────────────
//
// GET /api/c2c/projects/:id and the create's 201 both answer through these, so
// the read returns what the write stored by construction. Until 2026-09-21 the
// read projected none of the device taxonomy intake had just written —
// device_class, regulatory_path, product_code, predicate_devices, product_type,
// and the metadata-held reviewPanel / regulationNumber / deviceFlags — so a
// 510(k) IVD program's home showed no class, product code or predicate, and the
// shell could not tell a device program from a drug one (MDX demo pack, F9).
//
// Columns verified against migrations/20260524_program_workbench_schema.sql
// (the previous projection referenced sponsor_name / lead_indication /
// filing_date / pdufa_date / completion_percentage, none of which exist on
// regulatory_programs — the read 500'd with 42703 on a real schema).
// application_number: migrations/20260907_regulatory_programs_application_number.sql.
// sponsor_name is the organisation's name — the sponsor of record in this
// data model (the same join biopharma/programs.ts makes).
const PROGRAM_DETAIL_SQL = `
  SELECT
    p.id, p.code, p.name, p.program_type, p.status, p.phase, p.priority,
    p.description, p.product_name, p.indication, p.intended_use,
    p.primary_agency, p.target_agencies,
    p.target_submission_date, p.actual_submission_date, p.approval_date,
    p.lead_user_id, p.team_members,
    p.created_at, p.updated_at,
    p.application_number,
    p.product_type, p.device_class, p.regulatory_path, p.product_code,
    p.predicate_devices, p.metadata,
    o.name AS sponsor_name,
    cw.id AS client_workspace_id, cw.name AS client_name
  FROM regulatory_programs p
  LEFT JOIN organizations o ON o.id = p.organization_id
  JOIN projects anchor ON anchor.id=$3 AND anchor.organization_id=p.organization_id
    AND anchor.regulatory_program_id=p.id AND anchor.status IS DISTINCT FROM 'deleted'
  LEFT JOIN client_workspaces cw ON cw.id=anchor.client_workspace_id AND cw.organization_id=p.organization_id
  WHERE p.id = $1 AND p.organization_id = $2 AND p.deleted_at IS NULL
  LIMIT 1`;

/** A json/jsonb column as the driver hands it back — parsed, or still a string. */
function jsonColumn(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** The detail read model: the stored row plus the device fields intake keeps in
 *  `metadata`, lifted to first-class keys. Nothing is invented: a program
 *  without a device taxonomy answers null for each field, and `metadata` itself
 *  is not exposed (it holds internal provenance such as createdVia). */
export function serializeProgramDetail(row: Record<string, unknown>): Record<string, unknown> {
  const { metadata: rawMetadata, predicate_devices: rawPredicates, ...rest } = row;
  const metadata = jsonColumn(rawMetadata);
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
  const predicates = jsonColumn(rawPredicates);
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return {
    ...rest,
    product_type: str(rest.product_type),
    device_class: str(rest.device_class),
    regulatory_path: str(rest.regulatory_path),
    product_code: str(rest.product_code),
    predicate_devices: Array.isArray(predicates) ? predicates : [],
    review_panel: str(meta.reviewPanel),
    regulation_number: str(meta.regulationNumber),
    device_flags: Array.isArray(meta.deviceFlags)
      ? meta.deviceFlags.filter((f): f is string => typeof f === 'string')
      : null,
  };
}

/**
 * The detail row for one program in one organization, or null.
 *
 * `readiness`, `readinessState` and `readinessReason` are the figure the list
 * reports for the same program (homeFigures), so a program reads the same on
 * its card and on its own page. `progress_percent` is left out of the
 * projection: a column nothing maintains is not offered to a reader.
 * `readinessAsOf` is when this read measured it, null with no figure.
 */
async function readProgramDetail(id: string, orgId: number, projectId: number): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(PROGRAM_DETAIL_SQL, [id, orgId, projectId]);
  if (!rows.length) return null;
  const figure = (await homeFigures([id], orgId)).get(id) ?? unread();
  return {
    ...serializeProgramDetail(rows[0] as Record<string, unknown>),
    ...readinessFields(figure),
    // When it was measured: on this read, and a project page stays open for
    // hours. No figure, no time (filing-spine design review, open item 9).
    readinessAsOf: figure.state === 'measured' ? new Date().toISOString() : null,
  };
}

/** The figure a detail read measured, for the card a create returns, so the
 *  two agree. No detail read, no figure read. */
function readinessOfDetail(program: Record<string, unknown> | null): ReturnType<typeof readinessFields> {
  if (!program) return readinessFields(unread());
  const { readiness, readinessState, readinessReason } = program as ReturnType<typeof readinessFields>;
  return { readiness, readinessState, ...(readinessReason ? { readinessReason } : {}) };
}

// ── GET /api/c2c/projects ─────────────────────────────────────────────────────
//
// Portfolio list shaped to the v2 Projects surface's display contract
// ({ id, title, ws, code, stage, readiness, readinessState, status, lead,
// blocker, due, activity }) — every field projected from a real
// regulatory_programs column (phase → stage, target_submission_date → due,
// lead_user_id → lead), except readiness, which is the home filing's measured
// figure (homeFigures). Fails closed to an empty envelope when the store is
// not provisioned.
//
// Paged: ?limit= (default 50, max 200) and ?offset=. The read previously had no
// LIMIT at all, so one org with a few thousand programs serialized its entire
// portfolio into a single response on every render of the Projects surface.
// meta.count means rows in THIS response. No client currently reads `meta` at
// all — dataConnect's unwrapEnvelope returns `obj.data` and discards the rest —
// so limit/offset/hasMore are there for the paging control the portfolio still
// needs, not for something already consuming them. See the truncation note on
// the handler below.

router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = boundedInt((req.query as any).limit, 50, 1, 200);
  const offset = boundedInt((req.query as any).offset, 0, 0, Number.MAX_SAFE_INTEGER);
  // Archived programs are closed out, not deleted — they stay retrievable, but
  // a portfolio that keeps showing finished submissions beside live ones is the
  // reason nobody archives anything.
  const includeArchived = String((req.query as any).includeArchived ?? '') === 'true';
  let clientWorkspaceId: number | null;
  try { clientWorkspaceId = portfolioClientFilter(req.query.clientWorkspaceId); }
  catch { return send400(res, 'Client workspace must be a positive integer.'); }

  try {
    const identity = { organizationId: orgId, userId: resolveUserId(req) ?? undefined };
    const scope = await getCurrentAccessibleProgramScope(pool, identity);
    const anchors = verifiedProgramAnchors(pool, identity, scope);
    if (clientWorkspaceId !== null) {
      const workspace = await pool.query('SELECT id FROM client_workspaces WHERE id=$1 AND organization_id=$2 LIMIT 1', [clientWorkspaceId,orgId]);
      if (workspace.rows.length === 0) return send404(res);
    }
    // Fetch one row beyond the page so hasMore is a fact, not a second COUNT(*)
    // over the same predicate.
    const { rows } = await pool.query(
      PROJECT_CARD_LIST_SQL,
      [orgId, limit + 1, offset, includeArchived, scope.programIds, portfolioAnchorJson(anchors), clientWorkspaceId],
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Each card's dossier readiness, for the page being returned only, so the
    // read is bounded by the page size rather than by the org's project count.
    // A program with nothing to count is 'no_sections' and one whose sections
    // could not be read is 'unavailable', each with a null figure; a program
    // with its sections and nothing approved is a measured 0.
    const figures = await homeFigures((page as Array<{ id: string }>).map((p) => p.id), orgId);
    for (const p of page as Array<Record<string, unknown> & { id: string }>) {
      Object.assign(p, readinessFields(figures.get(p.id) ?? unread()));
    }

    const clients = await readPortfolioClients(pool, orgId, anchors, includeArchived);
    await requireProgramScopeStillCurrent(pool, identity, scope);
    return res.json({
      data: page,
      meta: { count: page.length, limit, offset, hasMore, ...clients, scope: scope.scope, reconciliationRequired: scope.reconciliationRequired },
    });
  } catch (err: unknown) {
    if (err instanceof ProgramReadAccessError) return sendProjectAccessFailure(res, err);
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({
        data: [],
        meta: { count: 0, limit, offset, hasMore: false, pendingStore: true },
      });
    }
    return serverError(res, logger, 'listing the projects', err);
  }
});

// ── POST /api/c2c/projects ────────────────────────────────────────────────────
//
// Create a real regulatory program from the v2 New-Project wizard. Persists to
// `regulatory_programs` — the SAME table the portfolio list reads — so a
// tester's new project appears live immediately and survives reload, instead of
// the old client-only `window.C2C_PROJECT` stub that vanished on refresh.
// Drug program types (DRUG_APPLICATION_TYPES) additionally create/link the
// canonical `submissions` row in the same transaction — the spine the
// IndLifecycle checklist, NdaCockpit, SubmissionCenter and DispatchReadiness
// surfaces read. Every program type additionally writes its PM-spine `projects`
// row carrying `regulatory_program_id` (Document Identity Contract slice C1),
// which the schedule, unified work, AnA's project context, the Vault and
// governed exports read the program through. A program that cannot have that
// row (no workspace can be chosen; see services/c2c/program-project-anchor.ts)
// is refused, not created without it (P-19).
//
// Body (from the wizard): { name, productName?, programType, productType?,
// primaryAgency?, submissionTypeId?, indication?, targetSubmissionDate?,
// teamMembers?, code? }. Org-scoped; the creating user becomes the lead.
// 400 on a missing/invalid required field; 503 PENDING_STORE on 42P01 or an
// absent anchor column; 409 PROJECT_RECORD_UNAVAILABLE when no workspace can be
// chosen for the program's record; 422 FILING_NOT_OFFERED, with the reason, for
// a filing the product does not offer in that market (the one verdict,
// services/regulatory/market-support.ts `offer`). Nothing is written on any
// refusal: a refusal found after the scaffold rolls the transaction back.

router.post('/', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  // Creation is a mutation like any other, and it was gated on org membership
  // alone — the exact shape this router's other handlers were fixed for. A
  // `viewer` could create a regulated program, have an audit row and a
  // scaffolded document written under their name, consume a licensed seat, and
  // become its lead_user_id — permanently authorized to mutate its evidence.
  // An unidentified caller could too: userId was read but never required.
  if (!orgId || !userId) return send403(res);
  try {
    await requireProjectCreationAccess(pool, orgId, userId);
  } catch (err) { return sendProjectAccessFailure(res, err); }

  let workspaceInput: ReturnType<typeof projectWorkspaceInput>;
  try { workspaceInput = projectWorkspaceInput(req); }
  catch (error) {
    if (error instanceof ProjectWorkspaceInputError) return res.status(400).json({ error: error.code, message: error.message });
    throw error;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const name = str(body.name);
  const productName = str(body.productName) || name;
  const programType = str(body.programType).toLowerCase().replace(/[\s-]+/g, '_');
  const requestedAgency = str(body.primaryAgency) || 'FDA';
  const primaryAgency = regionalDeviceApplicationClassOf(programType)
    ? documentAgencyFor({ applicationType: programType, market: requestedAgency }) ?? requestedAgency
    : requestedAgency;
  const submissionTypeId = str(body.submissionTypeId) || regionalDeviceApplicationClassOf(programType)?.registryId || null;
  const indication = str(body.indication) || null;
  // Agency-assigned application number (IND / NDA / BLA / MAA). Optional: a
  // program has none until the agency assigns one, and it is never invented.
  const applicationNumber = str(body.applicationNumber) || null;
  const priority = ['low', 'medium', 'high', 'critical'].includes(str(body.priority))
    ? str(body.priority) : 'medium';
  // Accept 'YYYY-MM-DD' (wizard <input type=date>); '' → null.
  const rawDate = str(body.targetSubmissionDate);
  const targetSubmissionDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  /* The wizard sends names. `team_members` is a TeamMember[] column and the
     governed write stores `{ name, role? }` with role OPTIONAL, so a name with
     no stated role maps onto the canonical shape and asserts nothing extra.
     Until 2026-10-19 this wrote the bare string array: the service that reads
     `Array<{ name?, userId?, role? }>` saw `{}` for every member, and the
     owner initials computed from `teamMembers[].name` came out undefined. */
  const teamMemberNames = Array.isArray(body.teamMembers)
    ? (body.teamMembers as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    : [];

  if (!name) return send400(res, 'name is required');
  if (!programType) return send400(res, 'A filing type is required.');
  if (!VALID_PROGRAM_TYPES.has(programType)) {
    return send400(res, `The filing type must be one of: ${[...VALID_PROGRAM_TYPES].join(', ')}`);
  }
  // A filing the product does not offer in this market is refused, with the
  // verdict's own reason (WORKFLOW_DECISION_2026-10-08 §4 Q2; FILING_SPINE F19,
  // services/regulatory/market-support.ts `offer`). Health Canada, an MHRA
  // "IND", a new Japanese application, an agency with no outline or none
  // mapped: each used to create a program with an empty outline, or a spine for
  // a sequence the agency would reject. The verdict is the one the market rows
  // and the New project picker read (GET /api/submissions/market-support), so
  // the picker never offers what this refuses. An agency-assigned number marks
  // a continuing application.
  //
  // Two points, one verdict. Here, before anything is written: whatever no
  // outline could lift. After the scaffold, which reads the pack for this class
  // in the verdict's own order: a filing with no outline, rolled back (below).
  const marketInput: MarketInput = {
    applicationType: programType,
    market: primaryAgency,
    continuingLifecycle: applicationNumber != null,
  };
  const offer = marketOfferGivenOutline(marketInput, true);
  if (offer.tier === 'not_offered') return sendFilingNotOffered(res, offer);
  // The product class: the filing type's when it fixes one (a 510(k) is a
  // device, a BLA a biologic), the person's when it does not (an IND, CTA, MAA,
  // J-NDA or DMF covers drugs and biologics alike — P-21). A device filing may
  // not be recorded as medicinal. The rules are productTypeForIntake's.
  const classDecision = productTypeForIntake(programType, str(body.productType).toLowerCase(), submissionTypeId);
  if ('refusal' in classDecision) return send400(res, classDecision.refusal);
  const { productType } = classDecision;

  // Licensed program count. The org's `max_projects` entitlement was sold and
  // billed but never checked on this path, so the wizard could create programs
  // past the plan indefinitely.
  //
  // It ships in WARN mode on purpose, and that is the opposite call from the
  // authorization gate above. This quota has never been enforced, and the
  // default entitlement is 10 (migrations/0000_sweet_joseph.sql) — which is also
  // exactly the standard tier. Flipping it straight to enforce would lock every
  // tenant already at or over ten out of creating anything, retroactively, for a
  // limit they have been silently exceeding with the product's blessing. The
  // risk of a few days of unbilled capacity is smaller than the risk of blocking
  // paying customers from working. Set PROGRAM_QUOTA_MODE=enforce once the
  // tenant distribution has been checked and entitlements reconciled.
  let quota;
  try {
    quota = await checkProgramQuota(orgId);
  } catch (e) {
    // 42P01 is an unprovisioned store, not a quota decision — keep the
    // documented PENDING_STORE contract rather than reporting a missing table
    // as a billing refusal.
    if ((e as { code?: string })?.code === '42P01') {
      const pending = await pendingStore(e, 'the licensed-project quota check', req);
      if (pending) return res.status(503).json(pending);
      return serverError(res, logger, 'checking the licensed-project quota', e);
    }
    throw e;
  }
  if (!quota.withinQuota) {
    if (resolveProgramQuotaMode() === 'enforce') {
      return res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message:
          `This organization has ${quota.currentCount} of ${quota.maxAllowed} licensed ` +
          'projects. Archive a project or raise the plan limit to create another.',
      });
    }
    logger.warn(
      'Program quota exceeded but allowed (mode=warn). This create would be ' +
        'refused in enforce mode.',
      { orgId, currentCount: quota.currentCount, maxAllowed: quota.maxAllowed },
    );
  }

  /* The device taxonomy a 510(k) turns on. regulatory_programs already had
     columns for most of it and nothing wrote them, so a device programme was
     created with an oncology therapeutic area and no product code. Validated
     rather than trusted: an unparseable value is dropped and named, never
     coerced into something that reads as data. */
  const documentAgency = documentAgencyFor(marketInput);
  const euRegulation = documentAgency === 'EMA'
    ? programType === 'ivdr' ? 'ivdr' : ['mdr', 'cer'].includes(programType) ? 'mdr' : null
    : null;
  const regional = programmeProfilePatchSchema.safeParse({
    euMdrClass: body.euMdrClass ?? null, euIvdrClass: body.euIvdrClass ?? null,
  });
  if (!regional.success) return send400(res, 'EU device classification must use the applicable MDR or IVDR class.');
  const { euMdrClass = null, euIvdrClass = null } = regional.data;
  const selectedFiling = submissionTypeId ? resolveFilingCatalogEntry(submissionTypeId) : null;
  const classScope = deviceClassScopeForFiling(submissionTypeId);
  const declaredEuClass = euRegulation === 'mdr' ? euMdrClass : euIvdrClass;
  if (classScope && (classScope.regulation !== euRegulation || (declaredEuClass !== null && !classScope.classes.includes(declaredEuClass)))) {
    return send400(res, 'The stated EU class conflicts with the selected class-specific filing. Choose the matching filing or leave the class unconfirmed.');
  }
  if ((euMdrClass !== null && euRegulation !== 'mdr') || (euIvdrClass !== null && euRegulation !== 'ivdr')
    || (euRegulation && (euRegulation === 'ivdr') !== isIvdFamily(productType))
    || (euRegulation && selectedFiling && (selectedFiling.region !== 'EU'
      || selectedFiling.pathwayKey !== programType))) {
    return send400(res, 'The EU classification, product type and selected filing must describe the same MDR or IVDR context.');
  }
  const rawClassification = body.deviceClassification as Record<string, unknown> | undefined;
  const fdaFields = ['productCode', 'regulationNumber', 'deviceClass', 'reviewPanel', 'predicateK', 'predicateName', 'flags'];
  if (usesDeviceClassification(productType) && documentAgency !== 'FDA'
    && rawClassification && fdaFields.some(key => {
      const value = rawClassification[key];
      return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : value != null;
    })) return send400(res, 'FDA device classification and predicate fields apply only to an FDA filing.');
  const deviceCls = normalizeDeviceClassification(body.deviceClassification);
  if (deviceCls.rejected.length && !usesDeviceClassification(productType)) {
    // A pharma filing sent device fields — ignore them rather than 400.
    deviceCls.rejected.length = 0;
  }
  if (deviceCls.rejected.length) {
    return res.status(400).json({
      error: 'INVALID_DEVICE_CLASSIFICATION',
      message: deviceCls.rejected.join('; '),
    });
  }
  const dc = deviceCls.value;

  /* Both json columns through the governed write's own schemas, so a shape it
     would refuse cannot be written here either. The predicate pair is already
     enforced by normalizeDeviceClassification, which 400s above when only one
     half arrives; `id` is the submission number, the key the audit row records
     the claim under. */
  const teamMembersColumn = programmeTeamMembersColumn.parse(
    teamMemberNames.map((name) => ({ name })),
  ) ?? [];
  const predicateDevicesColumn = programmePredicateDevicesColumn.parse(
    dc.predicateK && dc.predicateName
      ? [{ id: dc.predicateK, name: dc.predicateName, kNumber: dc.predicateK }]
      : [],
  ) ?? [];

  const targetAgencies = JSON.stringify([primaryAgency]);
  const metadata = JSON.stringify({
    createdVia: 'v2-new-project-wizard',
    ...(submissionTypeId ? { submissionTypeId } : {}),
    /* `teamMemberNames` was mirrored here and read by nothing — one capability,
       one home: the `team_members` column below. */
    /* Review panel and the device flags have no column of their own. The flags
       are load-bearing — each one adds a statutory section, so they drive the
       required-content model rather than describing the product. */
    ...(dc.reviewPanel ? { reviewPanel: dc.reviewPanel } : {}),
    ...(dc.regulationNumber ? { regulationNumber: dc.regulationNumber } : {}),
    ...(Array.isArray(dc.flags) ? { deviceFlags: dc.flags } : {}),
  });
  const createdBy = userId != null ? String(userId) : 'system';

  // Insert. `code` is unique per (organization_id, code); derive a readable base
  // and disambiguate with a short suffix only if the base is already taken.
  const base = baseCodeFrom(productName, name);
  // The program insert and the document scaffold share ONE transaction. If they
  // did not, a failure between them would leave a project with no document —
  // which is precisely the bug being fixed. `insert` therefore runs on the
  // caller-supplied client, not on the pool.
  const insert = async (client: PoolClient, code: string) =>
    client.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency,
          target_agencies, product_name, indication, status, phase, priority,
          target_submission_date, progress_percent, lead_user_id, team_members,
          metadata, created_by, updated_by,
          device_class, regulatory_path, product_code, intended_use, predicate_devices,
          application_number, eu_mdr_class, eu_ivdr_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7::json, $8, $9, 'active', 'planning', $10,
               $11::timestamp, 0, $12, $13::json, $14::json, $15, $15,
               $16, $17, $18, $19, $20::json,
               $21, $22, $23)
       RETURNING id`,
      [
        orgId, name, code, programType, productType, primaryAgency,
        targetAgencies, productName, indication, priority,
        targetSubmissionDate, userId, JSON.stringify(teamMembersColumn), metadata, createdBy,
        dc.deviceClass ?? null,
        /* The US premarket route, derived from the filing type the user picked
           — not asked for twice. FILING_TYPE_PRODUCT_CLASS already knows a
           510(k) from a De Novo. */
        devicePathFor(programType),
        dc.productCode ?? null,
        dc.intendedUse ?? null,
        JSON.stringify(predicateDevicesColumn),
        applicationNumber,
        euMdrClass, euIvdrClass,
      ],
    );

  const client = await pool.connect();
  let newId: string;
  // The code actually persisted — `base`, or the disambiguated retry code. The
  // audit row below records what was written, not what was first attempted.
  let createdCode = base;
  let scaffold: ScaffoldResult;
  // Canonical application type for drug programs; null for device/CER/MDR
  // program types, which create no submission spine.
  const applicationType = DRUG_APPLICATION_TYPES[programType] ?? null;
  let submissionSpine: { id: number; created: boolean } | null = null;
  let projectAnchor: Awaited<ReturnType<typeof requireProgramProjectAnchor>> | null = null;
  let commitStarted = false;
  let committed = false;
  let discardError: Error | undefined;
  try {
    try {
      await client.query('BEGIN');
      await requireProjectCreationAccess(client, orgId, userId, true);
      let created;
      try {
        created = await insert(client, base);
      } catch (e) {
        // 23505 = unique_violation on (organization_id, code). The retry needs a
        // SAVEPOINT: inside a transaction the failed statement has already
        // aborted it, so a bare retry would raise 25P02 instead of inserting.
        if ((e as { code?: string })?.code === '23505') {
          await client.query('ROLLBACK');
          await client.query('BEGIN');
          await requireProjectCreationAccess(client, orgId, userId, true);
          createdCode = `${base}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
          created = await insert(client, createdCode);
        } else {
          throw e;
        }
      }
      newId = (created.rows[0] as { id: string }).id;

      // Scaffold the project's first document from its rule pack. Insert-only,
      // so the Part 11 BEFORE UPDATE version trigger never fires. A skip
      // (unmapped program type, no pack) is returned rather than thrown — the
      // project is still legitimately created — and surfaced in the 201 body so
      // it is never silent.
      // The class is resolved from the agency the verdict judged (2026-10-08,
      // F19b review): 'us' and 'EU' read as FDA and EMA, and an 'EU / Notified
      // Body' device filing as the 'ema' key its packs carry. Without this the
      // verdict offered those filings and the scaffold, which knows only agency
      // names, found no class and the creation was refused with a false "no
      // outline" reason. The program keeps the agency as it was sent.
      scaffold = await scaffoldProjectDocuments({
        client, orgId, userId, projectId: newId,
        programType, primaryAgency: documentAgencyFor(marketInput) ?? primaryAgency, productName,
      });
      // No outline for this class (no pack, or no document class for the
      // program type): nothing to author, so the filing is not offered. Until
      // 2026-10-08 the project was created anyway with an empty Vault and the
      // skip reported in the 201. Rolled back, never half-created.
      if (scaffold.skipped === 'NO_RULE_PACK' || scaffold.skipped === 'UNMAPPED_PROGRAM_TYPE') {
        const noOutline = marketOfferGivenOutline(marketInput, false);
        if (noOutline.tier === 'not_offered') throw new FilingNotOfferedError(noOutline);
      }

      // Canonical submission spine, SAME transaction. Intake wrote
      // regulatory_programs + the document scaffold but never a `submissions`
      // row, so every canonical-core surface (IndLifecycle checklist,
      // NdaCockpit, SubmissionCenter, DispatchReadiness) stayed permanently
      // empty for self-serve drug programs. Drug application types only;
      // device/CER/MDR programs run on their own pathway stores. The spine is
      // anchored to THIS program (submissions.program_id, LX-22) and reused
      // only if already anchored to it — never adopted from another project by
      // product name. A failure here rolls the whole creation back — no
      // program without its spine.
      if (applicationType) {
        submissionSpine = await ensureSubmissionSpine({
          client, orgId, userId, programId: newId, name, productName, applicationType, productType, primaryAgency,
        });
      }

      // PM-spine anchor, SAME transaction (Document Identity Contract, slice
      // C1). `concept2cure_artifacts.project_id` is an integer FK to
      // `projects.id`, and the schedule, unified work, AnA's project context
      // and the Vault all read the program through this row. Mirrors
      // ensureSubmissionSpine exactly: caller-owned transaction, idempotent,
      // and any error propagates so the whole creation rolls back — never a
      // program with a half-written anchor.
      //
      // Strict intake verifies the active owned workspace and retains its row
      // lock on this transaction. Multiple active choices require an explicit
      // ID; a default marker or request header cannot choose on the user's behalf.
      // Any refusal rolls the program, scaffold and submission spine back.
      // The project record carries the registry context the readiness digest
      // reads (projects.metadata). Intake wrote none, so readiness was never
      // computed for any program (QA 2026-10-08, j8).
      projectAnchor = await requireProgramProjectAnchor({
        client, orgId, userId, programId: newId, name, code: createdCode, priority,
        ...workspaceInput, requireExplicitWorkspace: true,
        metadata: registryContextForProgram({ submissionTypeId, programType, primaryAgency }),
      });

      // Domain audit row for the creation, in the SAME transaction as the
      // insert: a created program that left no audit trace is not a record a
      // regulated tenant can defend, and rolling back the program is the only
      // honest outcome if its audit row cannot be written.
      //
      // The global tamper-proof interceptor (startup/audit-trail.ts) does NOT
      // cover this: it writes audit.tamper_proof_log, a different store from
      // the audit_logs table GET /:id/activity reads — which is why that feed
      // was empty for every project ever created here. Columns and the
      // hash-chain seal follow the canonical write in services/auditService.ts.
      const auditDetails = {
        project_id: newId,
        name,
        code: createdCode,
        program_type: programType,
        product_type: productType,
        primary_agency: primaryAgency,
        eu_mdr_class: euMdrClass,
        eu_ivdr_class: euIvdrClass,
        created_via: 'v2-new-project-wizard',
        // The audit row covers EVERY creation this transaction performed: the
        // linked canonical submission is part of the record, whether newly
        // created here or already anchored to this program (a replay).
        ...(submissionSpine
          ? {
              submission_id: submissionSpine.id,
              submission_created: submissionSpine.created,
              submission_application_type: applicationType,
            }
          : {}),
        // The PM-spine anchor is part of the record. It is always present: a
        // program that could not have one was refused above (P-19).
        project_anchor_id: projectAnchor.projectId,
        project_anchor_created: projectAnchor.created,
        client_workspace_id: projectAnchor.clientWorkspaceId,
      };
      await writeProgramAudit(client, {
        orgId, userId, programId: newId,
        action: 'c2c.project.create',
        details: auditDetails,
      });

      commitStarted = true;
      await client.query('COMMIT');
      committed = true;
    } catch (e) {
      if (commitStarted) discardError = e instanceof Error ? e : new Error('Project creation commit was not acknowledged');
      else await client.query('ROLLBACK').catch(rollbackError => {
        discardError = rollbackError instanceof Error ? rollbackError : new Error('Project creation rollback was not acknowledged');
      });
      throw e;
    } finally {
      if (discardError) client.release(discardError);
      else client.release();
    }

    // Re-read through the EXACT projection the list uses, so the client receives
    // the new card in its display contract (id, title, ws, code, stage, …).
    const { rows } = await pool.query(
      PROJECT_CARD_CREATED_SQL,
      [newId, orgId, portfolioAnchorJson([{programId:newId,projectId:projectAnchor.projectId,clientWorkspaceId:projectAnchor.clientWorkspaceId ?? null}])],
    );
    // The stored program through the SAME projection and serializer the read
    // uses — so a client that just created a 510(k) sees its class, product
    // code and predicate without a second round trip, and the create can never
    // return a field the read then omits.
    const program = await readProgramDetail(newId, orgId, projectAnchor.projectId);
    if (!rows[0] || !program) throw new Error('The committed project details could not be read');
    return res.status(201).json({
      data: rows[0] ? { ...rows[0], ...readinessOfDetail(program) } : rows[0],
      program,
      meta: {
        created: true,
        organizationId: orgId,
        actorUserId: userId,
        clientWorkspaceId: projectAnchor.clientWorkspaceId,
        clientWorkspaceName: projectAnchor.clientWorkspaceName,
        documentId: scaffold.documentId,
        scaffoldedSections: scaffold.sectionCount,
        ...(scaffold.skipped ? { scaffoldSkipped: scaffold.skipped, scaffoldDetail: scaffold.detail } : {}),
        // What the product offers for this market (build and sequence, or
        // author documents only), with its reason: the verdict creation used.
        marketSupport: offer,
        // Surfaced so the spine linkage is never silent: present for drug
        // programs (submissionCreated=false means a spine already anchored to
        // this program was reused), absent for device/CER/MDR program types.
        ...(submissionSpine
          ? { submissionId: submissionSpine.id, submissionCreated: submissionSpine.created }
          : {}),
        // The program's project record, written in the same transaction.
        projectAnchorId: projectAnchor.projectId,
        projectAnchorCreated: projectAnchor.created,
      },
    });
  } catch (err: unknown) {
    if (commitStarted || discardError) {
      const correlationId = (req as Request & { requestId?: string }).requestId || randomUUID();
      logger.error(committed ? 'Project committed but details unavailable' : 'Project creation commit outcome unknown', { correlationId, orgId, err });
      return res.status(503).json({
        error: committed ? 'PROJECT_CREATED_DETAILS_UNAVAILABLE' : 'PROJECT_CREATE_OUTCOME_UNKNOWN',
        message: committed ? 'The project was created, but its details are unavailable. Check Projects before trying again.'
          : 'The project creation outcome could not be confirmed. Check Projects before trying again.',
        correlationId,
        ...(committed ? { created: true, programId: newId!, projectAnchorId: projectAnchor?.projectId,
          organizationId: orgId, actorUserId: userId, clientWorkspaceId: projectAnchor?.clientWorkspaceId,
          clientWorkspaceName: projectAnchor?.clientWorkspaceName } : {}),
      });
    }
    if (err instanceof FilingNotOfferedError) return sendFilingNotOffered(res, err.offer);
    if (err instanceof ProgramReadAccessError) return sendProjectAccessFailure(res, err);
    if (err instanceof ProgramAnchorUnavailableError) {
      return sendProjectRecordRefusal(err, req, res, orgId);
    }
    if ((err as { code?: string })?.code === '42P01') {
      const pending = await pendingStore(err, 'creating the project', req);
      if (pending) return res.status(503).json(pending);
      return serverError(res, logger, 'creating the project', err);
    }
    return serverError(res, logger, 'creating the project', err);
  }
});

// ── GET /api/c2c/projects/:id ─────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
  const id = Array.isArray(req.params.id) ? (req.params.id[0] ?? '') : req.params.id;
  // Guard the uuid cast — a non-uuid id would otherwise throw 22P02 → 500.
  if (!UUID_RE.test(id)) return send404(res);

  try {
    // One projection and one serializer, shared with the create's 201 — see
    // PROGRAM_DETAIL_SQL / serializeProgramDetail above.
    const program = await readProgramDetail(id, orgId, res.locals.currentProgramAccess.projectId);
    if (!program) return send404(res);
    // Whether this caller may change the project (add a market, close it out), by the same decision the
    // writes take, so a screen can say so before a form rather than meet a 403 after it.
    const lead = program.lead_user_id == null ? null : Number(program.lead_user_id);
    return res.json({ ...program, canChange: mayChangeProgram(req, res, { leadUserId: lead }) });
  } catch (err: unknown) {
    return serverError(res, logger, 'loading the project', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/dossier ─────────────────────────────────────────
//
// The project's dossier, read once (FILING_SPINE F23, server/services/c2c/
// dossier-read): the home filing's figure, each market's own line, and one row
// per module, on one definition of complete. It replaces /workstreams, whose
// weighted mean (review 75, drafted 50, locked 0) and split of "M1" from "1.1"
// disagreed with the header beside it. A store this environment has not
// provisioned answers 200 with each figure 'unavailable' and the reason; any
// other failure is a 500, never an empty dossier.

router.get('/:id/dossier', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);
    return res.json(await readDossier(pool, orgId, String(req.params.id)));
  } catch (err: unknown) {
    return serverError(res, logger, 'reading the dossier', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/drafts ─────────────────────────────────────────
//
// Most-recently-updated sections for the project. Default limit 7.

router.get('/:id/drafts', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = Math.min(parseInt(String((req.query as any).limit ?? '7'), 10) || 7, 50);

  try {
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         ds.id, ds.document_id, ds.section_key, ds.label,
         ds.status, ds.draft_source, ds.owner_id,
         ds.updated_at, ds.version,
         d.doc_type, d.agency, d.title AS document_title
       FROM c2c_document_sections ds
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE d.project_id = $1 AND d.org_id = $2
         AND ds.status != 'todo'
       ORDER BY ds.updated_at DESC NULLS LAST
       LIMIT $3`,
      [req.params.id, orgId, limit],
    );

    return res.json({ drafts: rows });
  } catch (err: unknown) {
    return serverError(res, logger, 'loading the recent drafts', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/team ───────────────────────────────────────────
//
// Recorded responsibilities and current sharing are independent facts. The
// admitted integer anchor joins the durable roster; recorded names stay
// unlinked. The service rechecks current project admission before returning.

router.get('/:id/team', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const access = res.locals.currentProgramAccess;
    if (!access) throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. No project data was supplied.');
    return res.json(await readProjectTeam(requestPgClient(req), { organizationId: orgId, access }));
  } catch (err: unknown) {
    return sendProjectAccessFailure(res, err, true);
  }
});

// ── GET /api/c2c/projects/:id/evidence ───────────────────────────────────────

router.get('/:id/evidence', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         e.id, e.evidence_kind, e.evidence_ref, e.title, e.meta,
         e.pinned_by, e.pinned_at, e.reason
       FROM c2c_project_pinned_evidence e
       WHERE e.project_id = $1
       ORDER BY e.pinned_at DESC`,
      [req.params.id],
    );

    return res.json({ evidence: rows });
  } catch (err: unknown) {
    // Never return an empty evidence list on a caught failure — a reviewer
    // cannot distinguish "no pinned evidence" from "the query failed".
    if ((err as { code?: string })?.code === '42P01') {
      // c2c_project_pinned_evidence may not exist in all environments yet.
      const pending = await pendingStore(err, 'reading pinned evidence', req);
      if (pending) return res.status(503).json(pending);
      return serverError(res, logger, 'reading pinned evidence', err);
    }
    return serverError(res, logger, 'loading the pinned evidence', err, { programId: String(req.params.id) });
  }
});

// ── POST /api/c2c/projects/:id/evidence ──────────────────────────────────────

router.post('/:id/evidence', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { evidenceKind, evidenceRef, title, meta, reason } = req.body as {
    evidenceKind: string;
    evidenceRef:  string;
    title:        string;
    meta?:        string;
    reason?:      string;
  };

  if (!evidenceKind || !evidenceRef || !title) {
    return send400(res, 'evidenceKind, evidenceRef, and title are required');
  }

  const VALID_KINDS = new Set(['artifact','vault_doc','rim_precedent','guidance']);
  if (!VALID_KINDS.has(evidenceKind)) {
    return send400(res, `evidenceKind must be one of: ${[...VALID_KINDS].join(', ')}`);
  }

  try {
    const rows = await withProjectWriteReservation(req, res, async q => {
      const result = await q.query(
      `INSERT INTO c2c_project_pinned_evidence
         (project_id, evidence_kind, evidence_ref, title, meta, pinned_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, evidence_kind, evidence_ref) DO NOTHING
       RETURNING *`,
      [req.params.id, evidenceKind, evidenceRef, title, meta ?? null, userId, reason ?? null],
      );
      if (result.rows.length) await writeProgramAudit(q, { orgId, userId, programId: String(req.params.id),
        action: 'c2c.project.evidence.pin', details: { evidenceKind, evidenceRef, reason: reason ?? null } });
      return result.rows;
    });
    return res.status(201).json(rows[0] ?? { message: 'already pinned' });
  } catch (err: unknown) {
    if (err instanceof ProgramReadAccessError) return sendProjectAccessFailure(res, err);
    return serverError(res, logger, 'pinning the evidence', err, { programId: String(req.params.id) });
  }
});

// ── DELETE /api/c2c/projects/:id/evidence/:evId ───────────────────────────────

router.delete('/:id/evidence/:evId', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  try {
    const del = await withProjectWriteReservation(req, res, async q => {
      const result = await q.query(
      `DELETE FROM c2c_project_pinned_evidence
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [req.params.evId, req.params.id],
      );
      if (result.rows.length) await writeProgramAudit(q, { orgId, userId, programId: String(req.params.id),
        action: 'c2c.project.evidence.unpin', details: { evidenceId: String(req.params.evId) } });
      return result;
    });
    if (del.rows.length === 0) return send404(res);
    return res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof ProgramReadAccessError) return sendProjectAccessFailure(res, err);
    return serverError(res, logger, 'unpinning the evidence', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/activity ───────────────────────────────────────

router.get('/:id/activity', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = Math.min(parseInt(String((req.query as any).limit ?? '5'), 10) || 5, 50);
  // Guard the uuid comparisons below — a non-uuid id would raise 22P02 → 500.
  if (!UUID_RE.test(String(req.params.id))) return send404(res);

  try {
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);

    const rows = await readProjectActivity(pool, String(req.params.id), orgId, limit);
    return res.json({ activity: rows });
  } catch (err: unknown) {
    // The activity feed is an audit-log read; a caught failure must not render
    // as an empty feed (indistinguishable from a project with no activity).
    if ((err as { code?: string })?.code === '42P01') {
      const pending = await pendingStore(err, 'reading the activity feed', req);
      if (pending) return res.status(503).json(pending);
      return serverError(res, logger, 'reading the activity feed', err);
    }
    return serverError(res, logger, 'loading the project activity', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/records ────────────────────────────────────────
//
// From the project, every record anchored to it (PF-17): one read, each store
// by its recorded project key — never by name. A store this database cannot
// read is reported as unavailable with its reason, never as an empty list.

type RecordSection = { available: boolean; rows: unknown[]; reason?: string };

const PROJECT_RECORD_READS: ReadonlyArray<readonly [string, string]> = [
  ['submissions', `SELECT id, title, application_type, primary_region, status, lifecycle_stage
                     FROM submissions WHERE program_id = $1 AND organization_id = $2 AND deleted_at IS NULL
                    ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 200`],
  // The Data room's live-source predicate (listClientDocuments with
  // currentOnly): a withdrawn source is not in it, a source a re-upload retired
  // (is_current = false) is not in it, and only client documents are. A row
  // older than the is_current column still counts (IS NOT FALSE).
  ['sources', `SELECT id, title, source_type, checksum, created_at
                 FROM cre_evidence_sources WHERE client_program_id = $1 AND organization_id = $2
                  AND deleted_at IS NULL AND source_type = 'client_document'
                  AND is_current IS NOT FALSE
                ORDER BY created_at DESC LIMIT 200`],
  // A document is its current version (the Vault tree's rule, VR-09): a row a
  // live later version supersedes is one of the document's versions, not a
  // document of its own.
  ['vaultDocuments', `SELECT d.id, d.document_code, d.document_title, d.version, d.created_at
                        FROM vault.documents d
                        JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $2
                       WHERE d.program_id = $1 AND d.organization_id=$2 AND d.deleted_at IS NULL
                         AND NOT ${supersededSql('d')}
                       ORDER BY d.created_at DESC LIMIT 200`],
  ['studyDesigns', `SELECT study_id AS id, protocol_title AS title, study_phase, protocol_status
                      FROM cdisc_prm_studies WHERE program_id = $1 AND tenant_id = $2
                     ORDER BY updated_at DESC NULLS LAST LIMIT 200`],
  ['filingDocuments', `SELECT id, title, doc_type
                         FROM c2c_documents WHERE project_id = $1 AND org_id = $2 LIMIT 200`],
];

async function readRecordSection(sql: string, programId: string, orgId: number): Promise<RecordSection> {
  try {
    const { rows } = await pool.query(sql, [programId, orgId]);
    return { available: true, rows };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '42P01' || code === '42703') return { available: false, rows: [], reason: 'not provisioned in this environment' };
    logger.warn('project records: a section could not be read', { programId, code, err: (err as Error)?.message });
    return { available: false, rows: [], reason: 'could not be read' };
  }
}

router.get('/:id/records', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return send404(res);
  try {
    if (!(await programInOrganization(pool, id, orgId))) return send404(res);
    const records: Record<string, RecordSection> = {};
    for (const [section, sql] of PROJECT_RECORD_READS) records[section] = await readRecordSection(sql, id, orgId);
    records.authoringDocuments = await readProjectAuthoringRecords(pool, { organizationId: orgId, userId: resolveUserId(req) ?? undefined, programId: id });
    return res.json({ projectId: id, records });
  } catch (err: unknown) {
    return serverError(res, logger, 'listing the project records', err, { programId: id });
  }
});

// ── POST /api/c2c/projects/:id/adopt ─────────────────────────────────────────
//
// A conversation file becomes this project's Data Room source (PF-07; founder
// decision 2026-09-26). A file attached in chat with no project open records no
// source; adopting it is the one way into a project's Data Room: from no
// project to this one, once, audited as c2c.project.adopt on the same
// transaction as the source, never reversed. The file must be the caller's
// organization's; the same bytes already in this project are that source, not
// a second one, and adopting again writes nothing.

class AdoptionRefusal extends Error {
  constructor(readonly status: 404 | 409, readonly code: string, message: string) { super(message); }
}
type AdoptionFileRow = {
  id: string; original_name: string | null; mime_type: string | null;
  storage_path: string | null; checksum_sha256: string | null;
};

function requireUnboundConversationUpload(alreadyBound: boolean): void {
  if (alreadyBound) throw new AdoptionRefusal(409, 'FILE_ALREADY_PROJECT_BOUND', 'This file already has a recorded project association. Nothing was adopted.');
}

/** The pre-read takes no row lock. Recheck under FOR UPDATE only after the
 * shared disposition advisory lock, so save/withdrawal cannot invert locks. */
async function authorizeAdoptionProgram(client: PoolClient, req: Request, res: Response, scope: { orgId: number; programId: string }, lock: boolean): Promise<boolean> {
  const { orgId, programId } = scope;
  await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: lock });
  const program = await client.query(
    `SELECT lead_user_id FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
    [programId, orgId],
  );
  if (program.rows.length === 0) { send404(res); return false; }
  const lead = (program.rows[0] as { lead_user_id: number | null }).lead_user_id;
  return allowProgramMutation(req, res, { leadUserId: lead == null ? null : Number(lead) }, 'POST /:id/adopt');
}

/** Caller already holds the program advisory and impact-table reservations.
 * The loader is the sole byte/tenant integrity engine; the final row lock binds
 * its verified bytes to the current eligible database identity until commit. */
async function verifiedAdoptionUpload(client: PoolClient, fileUploadId: string, orgId: number, userId: number, programId: string): Promise<{ file: AdoptionFileRow; upload: UploadedFile; sha256: string; alreadyBound: boolean }> {
  await assertAnaUploadAccess(client, { organizationId: orgId, userId, fileIds: [fileUploadId] });
  const bindings = await client.query(`SELECT client_program_id::text AS program_id FROM cre_evidence_sources
    WHERE organization_id=$1 AND provenance->>'fileUploadId'=$2
    UNION ALL SELECT NULL::text FROM concept2cure_artifacts WHERE organization_id=$1 AND metadata->>'fileId'=$2`, [orgId, fileUploadId]);
  if (bindings.rows.some(row => row.program_id !== programId)) throw new AdoptionRefusal(409, 'FILE_ALREADY_PROJECT_BOUND', 'This file already has a recorded project association. It cannot be adopted as an unbound conversation file.');
  const sql = `SELECT f.id, f.original_name, f.mime_type, f.storage_path, f.checksum_sha256
    FROM file_uploads f WHERE f.id = $1 AND f.organization_id = $2
      AND ${uploadedBinaryAvailableSql('f')}`;
  const initial = await client.query<AdoptionFileRow>(sql, [fileUploadId, orgId]);
  if (!initial.rows[0]) throw new AdoptionRefusal(404, 'FILE_NOT_FOUND', 'File not found');
  if (!initial.rows[0].checksum_sha256) throw new AdoptionRefusal(409, 'FILE_IDENTITY_UNKNOWN', 'This file has no recorded checksum, so its identity cannot be established. Upload it again with the project open.');
  const upload = await loadUploadedFile(fileUploadId, orgId, { userId });
  if (upload.integrity !== 'verified') throw new AdoptionRefusal(409, 'FILE_IDENTITY_UNKNOWN', 'This file has no recorded checksum, so its identity cannot be established. Upload it again with the project open.');
  const sha256 = sha256Hex(upload.buffer);
  const final = await client.query<AdoptionFileRow>(`${sql} FOR SHARE OF f`, [fileUploadId, orgId]);
  await assertAnaUploadAccess(client, { organizationId: orgId, userId, fileIds: [fileUploadId] });
  const file = final.rows[0];
  if (!file || file.id !== upload.fileId || file.storage_path !== upload.storagePath || file.checksum_sha256 !== sha256) {
    throw new AdoptionRefusal(409, 'FILE_CHANGED', 'The file identity or availability changed during adoption. Nothing was captured. Read or upload the file again.');
  }
  return { file, upload, sha256, alreadyBound: bindings.rows.length > 0 };
}

function adoptionRefusalResponse(res: Response, err: unknown): Response | null {
  if (err instanceof ProgramReadAccessError) return sendProjectAccessFailure(res, err);
  if (err instanceof AnaProjectScopeError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err instanceof AdoptionRefusal) return res.status(err.status).json({ error: err.message, code: err.code });
  if (!(err instanceof UploadedFileError)) return null;
  const failures = {
    UPLOAD_NOT_FOUND: { status: 404, error: 'File not found' },
    UPLOAD_BYTES_MISSING: { status: 410, error: 'The file bytes are no longer available. Upload it again with the project open.' },
    UPLOAD_INTEGRITY_FAILED: { status: 409, error: 'The file failed its integrity check. Nothing was captured. Upload it again with the project open.' },
  };
  const failure = failures[err.code];
  return res.status(failure.status).json({ error: failure.error, code: err.code });
}

/**
 * Read, classify and version an adopted file, as an upload is
 * (data-room-processing.ts). After the commit: the adopt is the record and
 * stands without its derived text. Processing status is separate from capture.
 */
async function processAdopted(orgId: number, programId: string, sourceId: number, f: AdoptionFileRow, upload: UploadedFile): Promise<Omit<import('../../services/clinical-regulatory-evidence/data-room-processing.js').SourceProcessingResult, 'extracted'>> {
  try {
    const { processCapturedSource } = await import('../../services/clinical-regulatory-evidence/data-room-processing.js');
    const done = await processCapturedSource(orgId, sourceId, {
      bytes: upload.buffer, fileName: f.original_name ?? upload.fileName, mimeType: f.mime_type ?? upload.mimeType,
      programId, expectedWorkspaceId: null, processedBy: 'adopt',
    });
    return { ok: done.ok, processed: done.processed, status: done.status, ...(done.reasonCode ? { reasonCode: done.reasonCode } : {}) };
  } catch (err) {
    logger.warn('Adopted capture processing unavailable', { sourceId, err: err instanceof Error ? err.message : String(err) });
    return { ok: false, processed: false, status: 'retryable_failure', reasonCode: 'PROCESSING_UNAVAILABLE' };
  }
}

function adoptionRequestIdentity(req: Request, res: Response): { orgId: number; userId: number; programId: string; fileUploadId: string } | null {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) { send403(res); return null; }
  const programId = String(req.params.id).toLowerCase();
  if (!UUID_RE.test(programId)) { send404(res); return null; }
  const fileUploadId = typeof req.body?.fileUploadId === 'string' ? req.body.fileUploadId.trim() : '';
  if (!fileUploadId) { send400(res, 'fileUploadId is required.'); return null; }
  return { orgId, userId, programId, fileUploadId };
}

router.post('/:id/adopt', async (req: Request, res: Response) => {
  const identity = adoptionRequestIdentity(req, res);
  if (!identity) return;
  const { orgId, userId, programId, fileUploadId } = identity;
  const scope = { orgId, programId };

  const client = await pool.connect();
  let clientOwned = true;
  let commitAttempted = false;
  let commitConfirmed = false;
  let pendingSourceId: number | null = null;
  const releaseCaptureClient = (error?: Error) => {
    if (clientOwned) { clientOwned = false; client.release(error); }
  };
  try {
    await client.query('BEGIN');
    if (!await authorizeAdoptionProgram(client, req, res, scope, false)) {
      await client.query('ROLLBACK');
      return;
    }
    await lockDocumentDispositionProgram(client, orgId, programId);
    if (!await authorizeAdoptionProgram(client, req, res, scope, true)) {
      await client.query('ROLLBACK');
      return;
    }
    // Availability is organization-wide: reserve disposition impact tables in
    // their established order before any eligible identity read, including a
    // withdrawal associated with a different program. No dispositions-table
    // lock is acquired here, which would invert withdrawal's impact lock order.
    await client.query('LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE');
    const { file: f, upload, sha256, alreadyBound } = await verifiedAdoptionUpload(client, fileUploadId, orgId, userId, programId);
    const lineage = await readRecordedUploadLineage(client, orgId, upload.fileId, sha256);
    const existing = await findSourceByChecksum(orgId, sha256, {
      sourceType: 'client_document', clientProgramId: programId, clientWorkspaceId: null,
    }, client);
    if (existing) {
      await client.query('ROLLBACK');
      releaseCaptureClient();
      const processing = await processAdopted(orgId, programId, existing.id, f, upload);
      return res.json({ adopted: false, sourceId: existing.id, processed: processing.processed, processing,
        message: 'This file already has a capture in the project’s Data Room.' });
    }
    requireUnboundConversationUpload(alreadyBound);
    const source = await createSource(orgId, {
      sourceType: 'client_document',
      visibilityClass: 'project_private',
      clientProgramId: programId,
      clientWorkspaceId: null,
      title: f.original_name,
      storedArtifactRef: upload.storagePath,
      checksum: sha256,
      ingestionStatus: 'ingested',
      extractionStatus: 'pending',
      createdBy: userId,
      provenance: { origin: 'adopt', fileUploadId: upload.fileId, storagePath: upload.storagePath, adoptedByUserId: userId, adoptedFrom: 'conversation', ...(lineage ?? {}) },
      metadata: { originalName: f.original_name, mimeType: f.mime_type, fileSize: upload.buffer.length,
        ...(lineage ? { scientificQualification: 'unassessed', formulaResults: 'not_recalculated' } : {}) },
    }, client);
    pendingSourceId = source.id;
    await writeProgramAudit(client, {
      orgId, userId, programId,
      action: 'c2c.project.adopt',
      details: { file_upload_id: upload.fileId, source_id: source.id, checksum: sha256, from: 'conversation' },
    });
    commitAttempted = true;
    await client.query('COMMIT');
    commitConfirmed = true;
    // Processing opens its own short transactions. Return this connection
    // first so concurrent captures cannot occupy the whole pool while waiting.
    releaseCaptureClient();
    const processing = await processAdopted(orgId, programId, source.id, f, upload);
    return res.status(201).json({ adopted: true, sourceId: source.id, processed: processing.processed, processing });
  } catch (err: unknown) {
    if (commitAttempted && !commitConfirmed) {
      releaseCaptureClient(err instanceof Error ? err : new Error('Adoption commit unconfirmed'));
      return res.status(503).json({ adopted: null, sourceId: pendingSourceId, code: 'ADOPTION_COMMIT_UNCONFIRMED',
        message: 'The capture result could not be confirmed. Check this project’s Data Room before trying to add the file again.',
        recovery: { method: 'GET', url: `/api/c2c/projects/${programId}/sources`, programId, fileUploadId, sourceId: pendingSourceId } });
    }
    if (clientOwned) await client.query('ROLLBACK').catch(rollbackError => {
      releaseCaptureClient(rollbackError instanceof Error ? rollbackError : new Error('Adoption rollback unconfirmed'));
    });
    const refusal = adoptionRefusalResponse(res, err);
    if (refusal) return refusal;
    return serverError(res, logger, 'adopting the file into the project', err, { programId });
  } finally {
    releaseCaptureClient();
  }
});

// ── GET /api/c2c/projects/:id/conversation-files ─────────────────────────────
//
// The caller's own chat files that are in no project's Data Room (PF-07). A
// file attached with no project open records no source; this is where a
// project offers it, and POST /:id/adopt brings it in. Only the caller's own
// uploads: a colleague's chat attachment is theirs to bring in. A file whose
// bytes are already a source of some project is not listed — adopt is from no
// project. One past the window, so a full one says so.

const CONVERSATION_FILES_WINDOW = 50;

router.get('/:id/conversation-files', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return send403(res);
  const programId = String(req.params.id);
  if (!UUID_RE.test(programId)) return send404(res);
  try {
    if (!(await programInOrganization(pool, programId, orgId))) return send404(res);
    const { rows } = await pool.query(
      `SELECT f.id, f.original_name, f.mime_type, f.file_size, f.created_at
         FROM file_uploads f
        WHERE f.organization_id = $1 AND f.user_id = $2 AND f.checksum_sha256 IS NOT NULL
          AND ${uploadedBinaryAvailableSql('f')}
          AND NOT EXISTS (
                SELECT 1 FROM cre_evidence_sources s
                 WHERE s.organization_id = $1 AND s.checksum = f.checksum_sha256
                   AND (s.client_program_id IS NOT NULL OR s.client_workspace_id IS NOT NULL))
          AND NOT EXISTS (SELECT 1 FROM concept2cure_artifacts a WHERE a.organization_id=$1 AND a.metadata->>'fileId'=f.id)
        ORDER BY f.created_at DESC
        LIMIT $3`,
      [orgId, userId, CONVERSATION_FILES_WINDOW + 1],
    );
    const truncated = rows.length > CONVERSATION_FILES_WINDOW;
    const files = (truncated ? rows.slice(0, CONVERSATION_FILES_WINDOW) : rows).map((f) => ({
      id: String(f.id),
      name: f.original_name ?? null,
      mimeType: f.mime_type ?? null,
      fileSize: f.file_size == null ? null : Number(f.file_size),
      uploadedAt: f.created_at ?? null,
    }));
    return res.json({ projectId: programId, files, window: { shown: files.length, truncated } });
  } catch (err: unknown) {
    return serverError(res, logger, 'listing conversation files', err, { programId });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /:id/sources — the project's Data Room
//
// Every client document this project holds, as canonical
// `cre_evidence_sources` identities (see
// migrations/20260726_cre_source_program_scope.sql). This is the read the
// project management module renders, and the set that feeds the project's
// documentation: an entry here is a real source a section can be drafted from,
// not a loose file.
//
// `includeUnscoped=true` additionally returns the org's documents that belong
// to no project yet, so they can be adopted into one. They are returned in a
// SEPARATE field rather than mixed into the project's list — a document the
// project does not own must never appear as though it does.
// ════════════════════════════════════════════════════════════════════════════

// Search, filters and paging (Data Room catalog S2, 2026-10-08): `q` (full
// text over title and the text read from the file), `status`, `kind`, `from`,
// `to`, `current=true`, `limit` (1-200, default 200) and `offset`, with the
// real `total`. With none of them the answer is what it was: the newest 200,
// superseded included. An unreadable filter is a 400, never a wider list.

type ShapeableSource = EvidenceSourceRow & { snippet?: string | null; charCount?: number | null; pageCount?: number | null; studyRef?: number | null };
type EvidenceSourceRow = import('../../services/clinical-regulatory-evidence/types.js').EvidenceSource;
type SourceUsageSummary = { sourceId: number; sections: number; documents: number; changedSections: number };

/** One Data Room source as GET /:id/sources answers it. */
function shapeSource(s: ShapeableSource, usage: Map<number, SourceUsageSummary>) {
  const meta = (s.metadata ?? {}) as Record<string, any>;
  const prov = (s.provenance ?? {}) as Record<string, unknown>;
  return {
    id: s.id,
    title: s.title,
    checksum: s.checksum,
    isCurrent: s.isCurrent !== false,
    dataEligible: s.dataEligible !== false,
    originalFileAvailable: s.originalFileAvailable !== false,
    disposition: s.disposition ?? null,
    ingestionStatus: s.ingestionStatus,
    extractionStatus: s.extractionStatus,
    textAvailable: s.textAvailable ?? null,
    processing: s.processing ?? sourceProcessingSummary(meta),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    // Reported from recorded citations only. Nothing here is inferred from
    // titles or text similarity: a usage exists because someone recorded it.
    usage: usage.get(s.id) ?? { sourceId: s.id, sections: 0, documents: 0, changedSections: 0 },
    ...sourceFileFacts(meta, prov),
    // Where a search matched, and how much was read (S2). Null outside a search.
    snippet: s.snippet ?? null,
    charCount: s.charCount ?? null,
    pageCount: s.pageCount ?? null,
    catalog: catalogSummary(s, meta),
  };
}

/**
 * What the catalog found a source IS (S3), each from a rule or the project's
 * record; null fields were not found, never guessed. The dataset profile is
 * summarized here: tables, their CDISC standard and domain, rows and columns.
 */
function catalogSummary(s: ShapeableSource, meta: Record<string, any>) {
  const profile = meta.datasetProfile as { format?: string; tableCount?: number; tables?: Array<Record<string, any>> } | undefined;
  return {
    studyRef: s.studyRef ?? null,
    trialRegistryIdentifier: s.trialRegistryIdentifier ?? null,
    protocolNumber: meta.catalogEvidence?.protocolNumber?.value ?? null,
    documentDate: s.documentDate ?? null,
    dataCutDate: meta.dataCutDate ?? null,
    product: s.product ?? null,
    dataset: profile
      ? {
          format: profile.format ?? null,
          tableCount: profile.tableCount ?? 0,
          tables: (profile.tables ?? []).slice(0, 10).map(t => ({
            name: t.name, standard: t.cdisc?.standard ?? null, domain: t.cdisc?.domain ?? null,
            rowCount: t.rowCount ?? 0, columnCount: t.columnCount ?? 0,
          })),
        }
      : null,
  };
}

/** What kind of file a source is and how it arrived, without a second round trip. */
function sourceFileFacts(meta: Record<string, any>, prov: Record<string, unknown>) {
  return {
    mimeType: meta.mimeType ?? null,
    fileSize: meta.fileSize ?? null,
    artifactId: meta.artifactId ?? null,
    origin: prov.origin ?? null,
    fileUploadId: prov.fileUploadId ?? null,
    extractionMethod: prov.extractionMethod ?? null,
    // How much of a scanned PDF OCR read; null when not recorded or malformed.
    extractionCoverage: readExtractionCoverage(prov.extractionCoverage),
    evidenceKind: (meta.dossier?.evidenceKind as string | undefined) ?? null,
  };
}

router.get('/:id/sources', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);

    const { listClientDocuments } = await import(
      '../../services/clinical-regulatory-evidence/evidence-spine.service.js'
    );
    const { searchDataRoom, parseDataRoomQuery, DataRoomQueryError } = await import(
      '../../services/clinical-regulatory-evidence/data-room-search.js'
    );

    const programId = String(req.params.id);
    let query;
    try {
      query = parseDataRoomQuery(programId, req.query as Record<string, unknown>);
    } catch (e) {
      if (e instanceof DataRoomQueryError) return send400(res, e.message);
      throw e;
    }
    /* Superseded sources stay in the list unless current=true: the authoring
       canvas and sources rail read this route too, and each carries isCurrent,
       so a reader that counts can count once. */
    const { total, currentTotal, sources } = await searchDataRoom(orgId, query);
    const truncated = (query.offset ?? 0) + sources.length < total;
    const unscoped =
      req.query.includeUnscoped === 'true'
        ? await listClientDocuments(pool, orgId, { userId: resolveUserId(req) ?? undefined, includeUnscoped: true, limit: 50 })
            // `includeUnscoped` with no scope returns ONLY ownerless rows, but
            // filter defensively so a future change to that query can never
            // leak another project's documents into this list.
            .then(rows => rows.filter(r => !r.clientProgramId && !r.clientWorkspaceId))
        : [];

    // Back-reference: which sections and documents each of these sources is
    // actually used in, and how many of those citations are against content the
    // source no longer has. Absence means "not cited yet" — a real state worth
    // seeing, not a zero to hide. One query for the whole page, not one per row.
    const { summarizeSourceUsage } = await import(
      '../../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const usage = await summarizeSourceUsage(
      pool, orgId,
      [...sources, ...unscoped].map((s) => s.id),
      { userId: resolveUserId(req) ?? undefined },
    );

    const shape = (s: ShapeableSource) => shapeSource(s, usage);

    return res.json({
      projectId: programId,
      sources: sources.map(shape),
      unscoped: unscoped.map(shape),
      total,
      currentTotal,
      page: { limit: query.limit, offset: query.offset },
      window: { shown: sources.length, truncated },
      usageScope: 'accessible-citations',
    });
  } catch (err: unknown) {
    if (err instanceof ProgramReadAccessError || err instanceof SourceReadAccessError) return sendProjectAccessFailure(res, new ProgramReadAccessError(err.status, err.code, err.message), true);
    return serverError(res, logger, 'loading the sources', err, { programId: String(req.params.id) });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /:id/source-changes — what in this project was written against superseded
// content
//
// Every citation in this project still carrying a checksum its source no longer
// has. That is a fact recorded at cite time
// (authoring_citations.payload_sha256), not a comparison invented per render, so
// it survives the browser session and is the same answer for everyone.
//
// A REPORT, never a rewrite. A source moving does not tell us how the section
// written from it should now read, and silently regenerating regulated text is
// not something a platform should do. What was missing is that the affected
// sections were not discoverable at all: a superseded protocol left no trace in
// the documents drafted from it.
// ════════════════════════════════════════════════════════════════════════════

router.get('/:id/source-changes', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    /* The canonical program check (PF-11): it refuses a deleted program, and a
       non-UUID id, which the inline query sent to a uuid column. */
    if (!(await programInOrganization(pool, req.params.id, orgId))) return send404(res);

    const { listChangedSourceUsages } = await import(
      '../../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const changes = await listChangedSourceUsages(pool, orgId, { userId: resolveUserId(req) ?? undefined, programId: String(req.params.id) });

    return res.json({ projectId: String(req.params.id), changes, count: changes.length });
  } catch (err: unknown) {
    if (err instanceof ProgramReadAccessError || err instanceof SourceReadAccessError) return sendProjectAccessFailure(res, new ProgramReadAccessError(err.status, err.code, err.message), true);
    return serverError(res, logger, 'loading the source changes', err, { programId: String(req.params.id) });
  }
});

// ── Close-out: archive / unarchive / soft-delete ──────────────────────────────
//
// A program had no end state. It could be created and worked, never closed —
// so a tenant's portfolio only ever grew, finished submissions sat beside live
// ones, and the licensed seat a finished program held could never be released.
// `regulatory_programs` already carried the vocabulary for this (a `status`
// including 'archived', an indexed column, and `deleted_at`); nothing wrote it.
//
// That left the gap visible from the outside: checkProgramQuota already excludes
// archived and soft-deleted programs from the licensed count, and the refusal it
// produces tells the user to "Archive a program or raise the plan limit" — a
// remedy no route could perform until now.
//
// Archive is reversible and keeps the record. Delete is a soft delete: the row
// stays for the audit trail and for any submission that references it, and only
// stops being listed. Neither is a hard DELETE — a regulated tenant does not get
// to make a program disappear, and the audit rows below would dangle if it did.

/** Shared close-out body: authorize, mutate, audit, in one transaction. */
/**
 * What a project holds that makes it a record rather than a draft (PF-13;
 * founder decision 2026-09-26): a transmittal, a frozen or dispatched sequence,
 * a document filed in its Vault, a sealed authoring document. Each counted by
 * its recorded project key. Read inside the caller's transaction, one savepoint
 * per store, so a store this database does not carry (42P01 / 42703) holds
 * nothing and does not abort the transaction; any other failure propagates.
 */
const PROJECT_HOLD_READS: ReadonlyArray<readonly [string, string]> = [
  ['transmitted', `SELECT count(*)::int AS n FROM submission_transmittals WHERE program_id = $1 AND organization_id = $2`],
  ['frozenOrDispatched', `SELECT count(*)::int AS n FROM ectd_sequences e
                            JOIN submissions s ON s.id = e.submission_id AND s.organization_id = e.organization_id
                           WHERE s.program_id = $1 AND s.organization_id = $2
                             AND e.status IN ('frozen', 'dispatched') AND e.deleted_at IS NULL`],
  ['filed', `SELECT count(*)::int AS n FROM vault.documents d
               JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $2
              WHERE d.program_id = $1 AND d.deleted_at IS NULL`],
  ['sealed', `SELECT count(*)::int AS n FROM frozen_documents f
                JOIN authoring_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
               WHERE d.client_program_id = $1 AND d.tenant_id = $2`],
];

async function projectHolds(client: PoolClient, programId: string, orgId: number): Promise<Record<string, number>> {
  const holds: Record<string, number> = {};
  for (const [kind, sql] of PROJECT_HOLD_READS) {
    await client.query('SAVEPOINT project_hold');
    try {
      const { rows } = await client.query(sql, [programId, orgId]);
      await client.query('RELEASE SAVEPOINT project_hold');
      const n = Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
      if (n > 0) holds[kind] = n;
    } catch (err: unknown) {
      await client.query('ROLLBACK TO SAVEPOINT project_hold');
      const code = (err as { code?: string })?.code;
      if (code !== '42P01' && code !== '42703') throw err;
    }
  }
  return holds;
}

async function transitionProgram(
  req: Request,
  res: Response,
  opts: {
    action: string;
    /** SQL SET clause; $1 is the program id, $2 the org id. */
    set: string;
    /** Extra guard on the current row, e.g. only archive something not archived. */
    precondition?: (row: { status: string; deleted_at: string | null }) => string | null;
    /** A refusal that needs the project's records, read under the row lock. */
    guard?: (client: PoolClient, programId: string, orgId: number) => Promise<{ status: number; body: Record<string, unknown> } | null>;
    details: (row: { status: string }) => Record<string, unknown>;
  },
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) { send403(res); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-level lock: two concurrent close-outs would otherwise both read the
    // old status and both write an audit row claiming they made the change.
    const { rows } = await client.query(
      `SELECT lead_user_id, status, deleted_at FROM regulatory_programs
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); send404(res); return; }

    const row = rows[0] as { lead_user_id: number | null; status: string; deleted_at: string | null };
    await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true, includeDeleted: true });
    if (!allowProgramMutation(req, res, { leadUserId: row.lead_user_id == null ? null : Number(row.lead_user_id) }, opts.action)) {
      await client.query('ROLLBACK');
      return;
    }

    const blocked = opts.precondition?.(row);
    if (blocked) { await client.query('ROLLBACK'); send400(res, blocked); return; }
    const refused = await opts.guard?.(client, String(req.params.id), orgId);
    if (refused) { await client.query('ROLLBACK'); res.status(refused.status).json(refused.body); return; }

    await client.query(
      `UPDATE regulatory_programs SET ${opts.set}, updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );
    await writeProgramAudit(client, {
      orgId, userId, programId: String(req.params.id),
      action: opts.action,
      details: opts.details(row),
    });

    await client.query('COMMIT');
    res.json({ ok: true, projectId: String(req.params.id) });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ProgramReadAccessError) { sendProjectAccessFailure(res, err); return; }
    // 42P01 is an unprovisioned store, not a failed close-out — keep the
    // documented PENDING_STORE contract the rest of this router uses rather
    // than reporting a missing table as an internal error.
    if ((err as { code?: string })?.code === '42P01') {
      const pending = await pendingStore(err, opts.action, req);
      if (pending) { res.status(503).json(pending); return; }
    }
    serverError(res, logger, opts.action, err, { programId: String(req.params.id) });
  } finally {
    client.release();
  }
}

/** The market a POST /:id/markets body names, its strings trimmed; unknown client types dropped. */
function readMarketBody(body: Record<string, unknown> | undefined) {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const clientType = str(body?.clientType);
  return {
    agency: str(body?.agency),
    applicationType: str(body?.applicationType),
    title: str(body?.title) || undefined,
    clientType: ['pharma', 'biotech', 'mdx', 'ivd'].includes(clientType) ? clientType : undefined,
  };
}

/* ── POST /:id/markets — add a market (FILING_SPINE.md F22) ──────────────────
   The market's own Module 1 and 3.2.R, the market on target_agencies, its
   anchored submission and the governed action, in one transaction, for a stated
   reason, by someone who may change the project (add-project-market.ts). A
   market the platform does not offer, a device program, a class with no outline
   and a repeat are refused by name, and nothing is written. */
router.post('/:id/markets', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) { send403(res); return; }
  const market = readMarketBody(req.body);
  if (!market.agency || !market.applicationType) { send400(res, 'Name the agency and the application type of the market to add.'); return; }
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) { res.status(400).json({ error: 'REASON_REQUIRED', message: reason.error }); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT lead_user_id, status FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); send404(res); return; }
    if ((rows[0] as { status?: string }).status === 'archived') {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'PROJECT_ARCHIVED', message: 'This project is archived, so no market can be added to it. Nothing was added.' });
      return;
    }
    await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true });
    const lead = (rows[0] as { lead_user_id: number | null }).lead_user_id;
    if (!allowProgramMutation(req, res, { leadUserId: lead == null ? null : Number(lead) }, 'c2c.project.add_market')) {
      await client.query('ROLLBACK');
      return;
    }
    const added = await addProjectMarket({ client, orgId, userId, programId: String(req.params.id), ...market, reason: reason.reason });
    await client.query('COMMIT');
    res.status(201).json({ ok: true, ...added });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof AddMarketRefusal) { res.status(err.status).json({ error: err.code, message: err.message }); return; }
    if (err instanceof ProgramReadAccessError) { sendProjectAccessFailure(res, err); return; }
    serverError(res, logger, 'c2c.project.add_market', err, { programId: String(req.params.id) });
  } finally {
    client.release();
  }
});

router.post('/:id/archive', async (req: Request, res: Response) => {
  await transitionProgram(req, res, {
    action: 'c2c.project.archive',
    set: `status = 'archived'`,
    precondition: (row) =>
      row.deleted_at ? 'This program is deleted and cannot be archived.'
      : row.status === 'archived' ? 'This program is already archived.'
      : null,
    details: (row) => ({ from_status: row.status, to_status: 'archived' }),
  });
});

router.post('/:id/unarchive', async (req: Request, res: Response) => {
  await transitionProgram(req, res, {
    action: 'c2c.project.unarchive',
    // Restores to 'active' rather than to whatever it was before: the prior
    // status is not recorded on the row, and reconstructing it from the audit
    // trail to pick a resume point would be guessing at intent.
    set: `status = 'active'`,
    precondition: (row) =>
      row.deleted_at ? 'This program is deleted and cannot be unarchived.'
      : row.status !== 'archived' ? 'This program is not archived.'
      : null,
    details: (row) => ({ from_status: row.status, to_status: 'active' }),
  });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await transitionProgram(req, res, {
    action: 'c2c.project.delete',
    set: `deleted_at = now()`,
    precondition: (row) => (row.deleted_at ? 'This program is already deleted.' : null),
    // A project that holds sealed, filed or transmitted records is archived,
    // never deleted (PF-13; founder decision 2026-09-26): deleting it made its
    // Vault leaves stop resolving, and its chain stopped reading.
    guard: async (client, programId, orgId) => {
      const holds = await projectHolds(client, programId, orgId);
      return Object.keys(holds).length === 0
        ? null
        : {
            status: 409,
            body: {
              error: 'PROJECT_HOLDS_RECORDS',
              message: 'This project holds sealed, filed or transmitted records. Archive it instead.',
              holds,
            },
          };
    },
    details: (row) => ({ from_status: row.status, soft_delete: true }),
  });
});

export default router;
