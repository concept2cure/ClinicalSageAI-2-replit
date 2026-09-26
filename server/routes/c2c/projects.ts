/**
 * /api/c2c/projects/* — Project detail endpoints.
 *
 * Unified project-level reads for the Projects detail surface (Phase 10).
 * Aggregates over `regulatory_programs`, `c2c_document_sections`,
 * `project_members`, `c2c_project_pinned_evidence`, and `audit_logs`.
 *
 * Routes:
 *   GET  /api/c2c/projects/:id                     project metadata
 *   GET  /api/c2c/projects/:id/workstreams          section counts grouped by CTD module
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
import { productTypesToSegments } from '../../services/report-os/segment.js';
import type { PoolClient } from 'pg';
import {
  scaffoldProjectDocuments,
  type ScaffoldResult,
} from '../../services/c2c/scaffold-project-documents.js';
import {
  ensureProgramProjectAnchor,
  type AnchorResult,
} from '../../services/c2c/program-project-anchor.js';
import {
  canCreateProgram,
  canMutateProgram,
  resolveProgramAuthzMode,
  resolveProgramQuotaMode,
} from '../../services/c2c/program-access.js';
import { checkProgramQuota } from '../../services/license-manager.js';
import { computeAuditChainSealed, hashPayload } from '../../services/audit/chain.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  foldersForView,
  docKindsForView,
  filingTypesForView,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy.js';
import { sectionHasContentSql, completeStatusSqlList } from '../../services/c2c/section-content.js';
import {
  productTypeForFilingType,
  DEVICE_FAMILY_PRODUCT_TYPES,
  workstreamSqlCase,
} from '../../../shared/constants/domain/product-types.js';
/* The create endpoint's validation tables (VALID_PROGRAM_TYPES /
   VALID_PRODUCT_TYPES / DRUG_APPLICATION_TYPES) and its canonical
   submission-spine plumbing live in ./project-intake.ts — pure domain helpers
   with no route or tenancy logic, split out when this file outgrew the repo
   line-count gate. */
import {
  VALID_PROGRAM_TYPES,
  VALID_PRODUCT_TYPES,
  DRUG_APPLICATION_TYPES,
  ensureSubmissionSpine,
  baseCodeFrom,
} from './project-intake.js';
import {
  devicePathFor,
  normalizeDeviceClassification,
  usesDeviceClassification,
} from '../../../shared/constants/domain/device-classification.js';
/* Every 5xx on this router goes through the canonical helper. Its job here is
   the one the MDX UAT (item A1) proved was missing: it logs the failure keyed
   by the SAME `X-Request-Id` the user is shown as "Reference <id>", and echoes
   that id back in the body. Before this, the catch ran `console.error` with no
   correlation id at all, so the three reference ids the UAT captured for the
   create failure could not be looked up in the logs — the reference the UI
   invited the user to quote pointed at nothing. */
import { serverError } from '../../lib/api-response.js';

const router = Router();

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

function resolveOrgRole(req: Request): string | null {
  const r = req as any;
  const raw = r.userRole ?? r.user?.role;
  return typeof raw === 'string' && raw ? raw : null;
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

/**
 * Real readiness for a set of projects: the share of each project's governed
 * sections that the filing has approved or locked.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The list used to report `COALESCE(p.progress_percent, 0) AS readiness`.
 * `regulatory_programs.progress_percent` is written exactly ONCE — as the
 * literal `0` in this file's own INSERT — and no UPDATE of that column exists
 * anywhere in server/. So every project a customer created reported 0% forever.
 * Draft and approve an entire IND and the card still read 0%, while the
 * documents inside it carried a genuinely maintained number.
 *
 * A figure that looks measured and can never move is worse than no figure: it
 * reads as "no progress" rather than as "not computed".
 *
 * ── The definition is the document one, one level up ──────────────────────────
 * c2c_documents.readiness is maintained by c2c_recompute_document_readiness()
 * as the share of that document's sections which are approved or locked. This
 * aggregates the same predicate across all of a project's governed documents,
 * so a project is measured exactly the way its documents are, weighted by how
 * many sections each actually has. The status list comes from the single
 * constant, so it cannot drift from the trigger.
 *
 * ── Separate query, on purpose ────────────────────────────────────────────────
 * Folding this into the list SELECT would make the projects list — the primary
 * surface — depend on c2c_documents existing. The vault route already fails
 * closed on 42P01 for exactly that store, so its absence is a real state in
 * this codebase, not a hypothetical. Keeping it separate means a database
 * without the phase-9 schema still gets its project list.
 *
 * On that failure it answers null, not an empty map: "could not measure" and
 * "measured, nothing approved" are different answers. The list keeps the stored
 * value on null — not a good answer, it is the same 0, but it is the
 * pre-existing one and it is logged. The detail read reports null, which
 * ProjectHome renders as no figure.
 */
async function readinessByProject(
  projectIds: string[],
  orgId: number,
): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;
  try {
    const { rows } = await pool.query(
      `SELECT d.project_id::text AS project_id,
              COALESCE(ROUND(100.0
                * COUNT(*) FILTER (WHERE s.status IN (${completeStatusSqlList()}))
                / NULLIF(COUNT(*), 0))::integer, 0) AS readiness
         FROM c2c_documents d
         JOIN c2c_document_sections s ON s.document_id = d.id
        WHERE d.project_id = ANY($1::uuid[]) AND d.org_id = $2
        GROUP BY d.project_id`,
      [projectIds, orgId],
    );
    for (const r of rows as Array<{ project_id: string; readiness: number }>) {
      out.set(r.project_id, Number(r.readiness));
    }
  } catch (err) {
    logger.warn('Governed readiness unavailable; project cards keep their stored value', {
      err: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code,
    });
    return null;
  }
  return out;
}

/**
 * The org-scoped existence check every :id route runs, but returning the one
 * column an authorization decision needs. `SELECT 1 … WHERE organization_id`
 * only ever proved tenancy; the lead is what tells us whether THIS caller may
 * change THIS program (see services/c2c/program-access.ts).
 *
 * Returns null when the program does not exist in the caller's org — callers
 * must keep answering 404 for that, exactly as before, so the response never
 * distinguishes "not yours" from "not there".
 */
async function loadProgramForAuthz(
  programId: string,
  orgId: number,
): Promise<{ leadUserId: number | null } | null> {
  const { rows } = await pool.query(
    `SELECT lead_user_id FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [programId, orgId],
  );
  if (rows.length === 0) return null;
  const leadUserId = (rows[0] as { lead_user_id: number | null }).lead_user_id;
  return { leadUserId: leadUserId == null ? null : Number(leadUserId) };
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
 * Warn mode logs the denial and continues, mirroring the rollout idiom in
 * middleware/authBoundary.ts: a tenant whose programs predate lead_user_id
 * being meaningful can soak the rule and see who it would have rejected before
 * it starts rejecting them.
 */
function allowProgramMutation(
  req: Request,
  res: Response,
  program: { leadUserId: number | null },
  route: string,
): boolean {
  const userId = resolveUserId(req);
  const orgRole = resolveOrgRole(req);
  if (canMutateProgram({ actor: { userId, orgRole }, program })) return true;

  if (resolveProgramAuthzMode() === 'enforce') {
    send403(res);
    return false;
  }

  logger.warn(
    'Program mutation allowed without authorization (mode=warn). ' +
      'This request would be rejected in enforce mode.',
    { route, programId: String(req.params.id), userId, orgRole, leadUserId: program.leadUserId },
  );
  return true;
}

/** Present a program_type as the portfolio workstream bucket.
 *  Case-insensitive: the store holds mixed casing ('510K', 'BLA', 'nda'), so
 *  match on lower() — otherwise every real row falls through to the ELSE branch
 *  and none bucket into MDX / Biotech / Pharma (the surface's filter tabs). */
const WS_CASE = workstreamSqlCase('p.program_type');

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
    o.name AS sponsor_name
  FROM regulatory_programs p
  LEFT JOIN organizations o ON o.id = p.organization_id
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
 * `readiness` is the figure the list reports for the same program
 * (readinessByProject), so a program reads the same on its card and on its own
 * page. It used to return the raw `progress_percent` — written once as 0 and
 * never updated — which ProjectHome drew as "Dossier readiness 0%" and told AnA,
 * while the card beside it showed the real share. `progress_percent` is left
 * out of the projection: a column nothing maintains is not offered to a reader.
 * Null when the aggregate could not be read: not assessed, never 0.
 */
async function readProgramDetail(id: string, orgId: number): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(PROGRAM_DETAIL_SQL, [id, orgId]);
  if (!rows.length) return null;
  const measured = await readinessByProject([id], orgId);
  return {
    ...serializeProgramDetail(rows[0] as Record<string, unknown>),
    readiness: measured ? (measured.get(id) ?? 0) : null,
  };
}

// ── GET /api/c2c/projects ─────────────────────────────────────────────────────
//
// Portfolio list shaped to the v2 Projects surface's display contract
// ({ id, title, ws, code, stage, readiness, status, lead, blocker, due,
// activity }) — every field projected from a real regulatory_programs column
// (progress_percent → readiness, phase → stage, target_submission_date → due,
// lead_user_id → lead). Fails closed to an empty envelope when the store is
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

  try {
    // Fetch one row beyond the page so hasMore is a fact, not a second COUNT(*)
    // over the same predicate.
    const { rows } = await pool.query(
      `SELECT p.id::text                                            AS id,
              p.name                                                AS title,
              ${WS_CASE}                                            AS ws,
              COALESCE(p.code, '—')                                 AS code,
              initcap(replace(COALESCE(p.phase, 'planning'), '_', ' ')) AS stage,
              COALESCE(p.progress_percent, 0)                       AS readiness,
              p.status                                              AS status,
              COALESCE(u.name, u.email, '—')                        AS lead,
              NULL::text                                            AS blocker,
              COALESCE(to_char(p.target_submission_date, 'Mon DD, YYYY'), '—') AS due,
              'Updated ' || to_char(p.updated_at, 'Mon DD')         AS activity
         FROM regulatory_programs p
         LEFT JOIN users u ON u.id = p.lead_user_id
        WHERE p.organization_id = $1 AND p.deleted_at IS NULL
          AND ($4::boolean OR p.status <> 'archived')
        ORDER BY p.updated_at DESC
        LIMIT $2 OFFSET $3`,
      [orgId, limit + 1, offset, includeArchived],
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Replace the stored progress_percent — which nothing has ever updated —
    // with the share of each project's governed sections the filing has
    // approved. Only for the page being returned, so the aggregate is bounded
    // by the page size rather than by the org's project count.
    const real = await readinessByProject(
      (page as Array<{ id: string }>).map((p) => p.id),
      orgId,
    );
    for (const p of page as Array<{ id: string; readiness: number }>) {
      const r = real?.get(p.id);
      if (r != null) p.readiness = r;
    }

    return res.json({
      data: page,
      meta: { count: page.length, limit, offset, hasMore },
    });
  } catch (err: unknown) {
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
// surfaces read. Every program type additionally ensures a PM-spine `projects`
// row carrying `regulatory_program_id` (Document Identity Contract slice C1),
// which is what lets governed exports be registry-placed and the Vault be
// filtered by program — WHERE the workspace is unambiguous; see
// services/c2c/program-project-anchor.ts for why a skip is the honest outcome
// otherwise, and meta.projectAnchorSkipped for how a skip is surfaced.
//
// Body (from the wizard): { name, productName?, programType, productType?,
// primaryAgency?, submissionTypeId?, indication?, targetSubmissionDate?,
// teamMembers?, code? }. Org-scoped; the creating user becomes the lead.
// 400 on a missing/invalid required field; 503 PENDING_STORE on 42P01.

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
  if (!canCreateProgram({ orgRole: resolveOrgRole(req) })) return send403(res);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const name = str(body.name);
  const productName = str(body.productName) || name;
  const programType = str(body.programType).toLowerCase().replace(/[\s-]+/g, '_');
  const primaryAgency = str(body.primaryAgency) || 'FDA';
  const submissionTypeId = str(body.submissionTypeId) || null;
  const indication = str(body.indication) || null;
  // Agency-assigned application number (IND / NDA / BLA / MAA). Optional: a
  // program has none until the agency assigns one, and it is never invented.
  const applicationNumber = str(body.applicationNumber) || null;
  const priority = ['low', 'medium', 'high', 'critical'].includes(str(body.priority))
    ? str(body.priority) : 'medium';
  // Accept 'YYYY-MM-DD' (wizard <input type=date>); '' → null.
  const rawDate = str(body.targetSubmissionDate);
  const targetSubmissionDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const teamMembers = Array.isArray(body.teamMembers)
    ? (body.teamMembers as unknown[]).filter((m) => typeof m === 'string')
    : [];

  if (!name) return send400(res, 'name is required');
  if (!programType) return send400(res, 'programType is required');
  if (!VALID_PROGRAM_TYPES.has(programType)) {
    return send400(res, `programType must be one of: ${[...VALID_PROGRAM_TYPES].join(', ')}`);
  }
  // The product class. Derived from the FILING TYPE when the client omits it —
  // a 510(k) is a device submission, an EU IVDR technical file is about an IVD,
  // and neither can be about a drug. The old derivation ended in a bare
  // `return 'drug'`, so `mdr` and `ivdr` — absent from every branch — persisted
  // EU device and IVD technical files as drug programmes.
  let productType = str(body.productType).toLowerCase();
  if (!productType) productType = productTypeForFilingType(programType) ?? '';
  if (!VALID_PRODUCT_TYPES.has(productType)) {
    return send400(res, `productType must be one of: ${[...VALID_PRODUCT_TYPES].join(', ')}`);
  }

  // A device or IVD filing may not be recorded as a medicinal product, whatever
  // the client sent. This is the defect the MDX UAT found — the wizard derived
  // the product class from the UI segment, so a 510(k) started while the
  // Pharma & Biotech tab was open was submitted as `productType: 'biologic'`
  // and the server accepted it over its own correct derivation. The filing type
  // is a regulatory fact; the client does not get to contradict it.
  const impliedClass = productTypeForFilingType(programType);
  if (
    impliedClass &&
    DEVICE_FAMILY_PRODUCT_TYPES.includes(impliedClass) &&
    !DEVICE_FAMILY_PRODUCT_TYPES.includes(productType as never)
  ) {
    return send400(
      res,
      `A ${programType} filing is a device submission and cannot be recorded as ` +
        `"${productType}". Use one of: ${DEVICE_FAMILY_PRODUCT_TYPES.join(', ')}.`,
    );
  }

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
      const pending = await pendingStore(e, 'the licensed-program quota check', req);
      if (pending) return res.status(503).json(pending);
      return serverError(res, logger, 'the licensed-program quota check', e);
    }
    throw e;
  }
  if (!quota.withinQuota) {
    if (resolveProgramQuotaMode() === 'enforce') {
      return res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message:
          `This organization has ${quota.currentCount} of ${quota.maxAllowed} licensed ` +
          'programs. Archive a program or raise the plan limit to create another.',
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
  const deviceCls = normalizeDeviceClassification((req.body ?? {}).deviceClassification);
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

  const targetAgencies = JSON.stringify([primaryAgency]);
  const metadata = JSON.stringify({
    createdVia: 'v2-new-project-wizard',
    ...(submissionTypeId ? { submissionTypeId } : {}),
    ...(teamMembers.length ? { teamMemberNames: teamMembers } : {}),
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
          application_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7::json, $8, $9, 'active', 'planning', $10,
               $11::timestamp, 0, $12, $13::json, $14::json, $15, $15,
               $16, $17, $18, $19, $20::json,
               $21)
       RETURNING id`,
      [
        orgId, name, code, programType, productType, primaryAgency,
        targetAgencies, productName, indication, priority,
        targetSubmissionDate, userId, JSON.stringify(teamMembers), metadata, createdBy,
        dc.deviceClass ?? null,
        /* The US premarket route, derived from the filing type the user picked
           — not asked for twice. FILING_TYPE_PRODUCT_CLASS already knows a
           510(k) from a De Novo. */
        devicePathFor(programType),
        dc.productCode ?? null,
        dc.intendedUse ?? null,
        JSON.stringify(dc.predicateK ? [{ kNumber: dc.predicateK }] : []),
        applicationNumber,
      ],
    );

  const client = await pool.connect();
  let newId: string;
  // The code actually persisted — `base`, or the disambiguated retry code. The
  // audit row below records what was written, not what was first attempted.
  let createdCode = base;
  let scaffold: ScaffoldResult = { documentId: null, sectionCount: 0 };
  // Canonical application type for drug programs; null for device/CER/MDR
  // program types, which create no submission spine.
  const applicationType = DRUG_APPLICATION_TYPES[programType] ?? null;
  let submissionSpine: { id: number; created: boolean } | null = null;
  let projectAnchor: AnchorResult = { projectId: null, created: false };
  try {
    try {
      await client.query('BEGIN');
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
      scaffold = await scaffoldProjectDocuments({
        client, orgId, userId, projectId: newId,
        programType, primaryAgency, productName,
      });

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
      // `projects.id`, so without a projects row carrying this program's uuid
      // the governed artifact registry has nowhere to put a 510(k)/CER export
      // and the Vault cannot be filtered by program at all. Mirrors
      // ensureSubmissionSpine exactly: caller-owned transaction, idempotent,
      // and any error propagates so the whole creation rolls back — never a
      // program with a half-written anchor.
      //
      // A SKIP is not an error. `projects.client_workspace_id` is NOT NULL and
      // nothing in program data names a workspace, so the anchor is created
      // only where the org has exactly one (the unambiguous case). Otherwise
      // the program is created without it and the reason is reported — in the
      // 201 body and in the sealed audit payload below.
      projectAnchor = await ensureProgramProjectAnchor({
        client, orgId, userId, programId: newId, name, code: createdCode, priority,
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
        // The PM-spine anchor, present or absent, is part of the record. An
        // absent one is recorded WITH its reason: a regulated tenant asking
        // later why this program's exports were never registry-placed gets the
        // answer from the audit row rather than from a support ticket.
        ...(projectAnchor.projectId !== null
          ? {
              project_anchor_id: projectAnchor.projectId,
              project_anchor_created: projectAnchor.created,
            }
          : {
              project_anchor_id: null,
              project_anchor_skipped: projectAnchor.skipped ?? null,
            }),
      };
      await writeProgramAudit(client, {
        orgId, userId, programId: newId,
        action: 'c2c.project.create',
        details: auditDetails,
      });

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // Re-read through the EXACT projection the list uses, so the client receives
    // the new card in its display contract (id, title, ws, code, stage, …).
    const { rows } = await pool.query(
      `SELECT p.id::text                                            AS id,
              p.name                                                AS title,
              ${WS_CASE}                                            AS ws,
              COALESCE(p.code, '—')                                 AS code,
              initcap(replace(COALESCE(p.phase, 'planning'), '_', ' ')) AS stage,
              COALESCE(p.progress_percent, 0)                       AS readiness,
              p.status                                              AS status,
              COALESCE(u.name, u.email, '—')                        AS lead,
              NULL::text                                            AS blocker,
              COALESCE(to_char(p.target_submission_date, 'Mon DD, YYYY'), '—') AS due,
              'Updated ' || to_char(p.updated_at, 'Mon DD')         AS activity
         FROM regulatory_programs p
         LEFT JOIN users u ON u.id = p.lead_user_id
        WHERE p.id = $1 AND p.organization_id = $2`,
      [newId, orgId],
    );
    // The stored program through the SAME projection and serializer the read
    // uses — so a client that just created a 510(k) sees its class, product
    // code and predicate without a second round trip, and the create can never
    // return a field the read then omits.
    const program = await readProgramDetail(newId, orgId);
    return res.status(201).json({
      data: rows[0],
      program,
      meta: {
        created: true,
        documentId: scaffold.documentId,
        scaffoldedSections: scaffold.sectionCount,
        ...(scaffold.skipped ? { scaffoldSkipped: scaffold.skipped, scaffoldDetail: scaffold.detail } : {}),
        // Surfaced so the spine linkage is never silent: present for drug
        // programs (submissionCreated=false means a spine already anchored to
        // this program was reused), absent for device/CER/MDR program types.
        ...(submissionSpine
          ? { submissionId: submissionSpine.id, submissionCreated: submissionSpine.created }
          : {}),
        // Never silent, same idiom as the scaffold skip above: either the
        // anchor id, or the reason there is none.
        ...(projectAnchor.projectId !== null
          ? { projectAnchorId: projectAnchor.projectId, projectAnchorCreated: projectAnchor.created }
          : {
              projectAnchorId: null,
              projectAnchorSkipped: projectAnchor.skipped,
              projectAnchorDetail: projectAnchor.detail,
            }),
      },
    });
  } catch (err: unknown) {
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
    const program = await readProgramDetail(id, orgId);
    if (!program) return send404(res);
    return res.json(program);
  } catch (err: unknown) {
    return serverError(res, logger, 'loading the project', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/workstreams ─────────────────────────────────────
//
// Groups c2c_document_sections by CTD module prefix (the first component of
// section_key, e.g. 'm3', 'm4', 'm5', 'm2', 'm1'). Each group returns a
// status rollup and a completion percentage.
//
// Falls back gracefully when no sections exist yet.

router.get('/:id/workstreams', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    // Verify project access.
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         split_part(ds.section_key, '.', 1) AS module,
         COUNT(*)                            AS total,
         COUNT(*) FILTER (WHERE ds.status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE ds.status = 'review')   AS review,
         COUNT(*) FILTER (WHERE ds.status = 'drafted')  AS drafted,
         COUNT(*) FILTER (WHERE ds.status = 'todo')     AS todo,
         ROUND(
           AVG(CASE WHEN ds.status = 'approved' THEN 100
                    WHEN ds.status = 'review'   THEN  75
                    WHEN ds.status = 'drafted'  THEN  50
                    ELSE 0 END)
         )::integer AS completion_pct,
         MAX(ds.updated_at) AS last_updated
       FROM c2c_document_sections ds
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE d.project_id = $1 AND d.org_id = $2
       GROUP BY 1
       ORDER BY 1`,
      [req.params.id, orgId],
    );

    return res.json({ workstreams: rows });
  } catch (err: unknown) {
    return serverError(res, logger, 'loading the workstreams', err, { programId: String(req.params.id) });
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
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

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
// The roster comes from `regulatory_programs` itself: lead_user_id resolved
// against `users`, plus whatever the wizard stored in team_members.
//
// It used to read `project_members` — and could never return a row. That table
// keys on project_id INTEGER (projects.id), while this surface's :id is a
// regulatory_programs UUID, so the join raised 42883 (operator does not exist:
// uuid = integer) on every request; it also selected pm.added_at, a column the
// table does not have (it has created_at / accepted_at). Both errors landed in
// a bare `catch { team: [] }`, so the panel rendered "no members" forever with
// nothing logged. project_members cannot hold membership for a uuid-keyed
// program at all, so the fix is to stop pretending it does.
//
// team_members entries are surfaced name-only with a null user_id: the create
// handler stores bare strings there (it filters the wizard payload to
// `typeof m === 'string'`), and a name is not an identity — inventing a user id
// or an email to fill the shape would be fabricating a person.

router.get('/:id/team', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const { rows } = await pool.query(
      `SELECT p.lead_user_id, p.team_members, u.name, u.email
         FROM regulatory_programs p
         LEFT JOIN users u ON u.id = p.lead_user_id
        WHERE p.id = $1 AND p.organization_id = $2
        LIMIT 1`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) return send404(res);

    const program = rows[0] as {
      lead_user_id: number | null;
      team_members: unknown;
      name: string | null;
      email: string | null;
    };

    const team: Array<{
      user_id: number | null;
      role: string | null;
      name: string | null;
      email: string | null;
    }> = [];

    if (program.lead_user_id != null) {
      team.push({
        user_id: Number(program.lead_user_id),
        role: 'lead',
        name: program.name ?? null,
        email: program.email ?? null,
      });
    }

    const named = Array.isArray(program.team_members) ? program.team_members : [];
    for (const member of named) {
      if (typeof member !== 'string') continue;
      const memberName = member.trim();
      if (!memberName) continue;
      team.push({ user_id: null, role: null, name: memberName, email: null });
    }

    return res.json({ team });
  } catch (err: unknown) {
    // Only an undefined table degrades to an empty roster — that is a
    // not-yet-provisioned store, not a failure. Anything else is a real error
    // and is logged and reported; the previous silent swallow is what let the
    // uuid/integer join fail unnoticed for the life of this endpoint.
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ team: [] });
    }
    return serverError(res, logger, 'loading the project team', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/evidence ───────────────────────────────────────

router.get('/:id/evidence', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

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
    // Pinned evidence is the set the AI generation path reads, so changing it
    // is a mutation of the project's regulatory input — not something every
    // member of the org is entitled to do just by being in the org.
    const program = await loadProgramForAuthz(String(req.params.id), orgId);
    if (!program) return send404(res);
    if (!allowProgramMutation(req, res, program, 'POST /:id/evidence')) return;

    const { rows } = await pool.query(
      `INSERT INTO c2c_project_pinned_evidence
         (project_id, evidence_kind, evidence_ref, title, meta, pinned_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, evidence_kind, evidence_ref) DO NOTHING
       RETURNING *`,
      [req.params.id, evidenceKind, evidenceRef, title, meta ?? null, userId, reason ?? null],
    );

    return res.status(201).json(rows[0] ?? { message: 'already pinned' });
  } catch (err: unknown) {
    return serverError(res, logger, 'pinning the evidence', err, { programId: String(req.params.id) });
  }
});

// ── DELETE /api/c2c/projects/:id/evidence/:evId ───────────────────────────────

router.delete('/:id/evidence/:evId', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  try {
    const program = await loadProgramForAuthz(String(req.params.id), orgId);
    if (!program) return send404(res);
    if (!allowProgramMutation(req, res, program, 'DELETE /:id/evidence/:evId')) return;

    const del = await pool.query(
      `DELETE FROM c2c_project_pinned_evidence
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [req.params.evId, req.params.id],
    );

    if (del.rows.length === 0) return send404(res);
    return res.status(204).send();
  } catch (err: unknown) {
    return serverError(res, logger, 'unpinning the evidence', err, { programId: String(req.params.id) });
  }
});

// ── GET /api/c2c/projects/:id/activity ───────────────────────────────────────

router.get('/:id/activity', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = Math.min(parseInt(String((req.query as any).limit ?? '5'), 10) || 5, 50);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    // Columns aliased from what audit_logs ACTUALLY has (table_name /
    // record_id / new_values — see migrations/0000_sweet_joseph.sql plus the
    // chain fields from 20260527_mutation_primitives.sql) to the names the
    // client's ActivityRow reads. The projection previously named
    // resource_type / resource_id / details, none of which are columns, so
    // every request raised 42703 into the catch below and the feed rendered
    // empty no matter how much audited activity a project had.
    const { rows } = await pool.query(
      `SELECT
         al.id, al.action, al.table_name AS resource_type, al.record_id AS resource_id,
         COALESCE(al.actor_id, al.user_id) AS actor_id, al.new_values AS details,
         COALESCE(u.name, u.email) AS actor_name,
         al.occurred_at, al.ip_address
       FROM audit_logs al
       LEFT JOIN users u ON u.id = COALESCE(al.actor_id, al.user_id)
       WHERE al.tenant_id = $2
         AND (al.record_id = $1 OR al.new_values->>'project_id' = $1)
       ORDER BY al.occurred_at DESC NULLS LAST
       LIMIT $3`,
      [req.params.id, orgId, limit],
    );

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

// ── GET /api/c2c/projects/:id/vault-structure ────────────────────────────────
//
// Workstream A1 — the dynamic, build-type-aware Vault structure. Returns the
// folder/document tree the Vault Explorer should render for THIS project,
// aligned to its client segment AND its active document build types:
//   - `view`         the vault view (pharma/biotech/device/ivd/service),
//                    derived from the project's product_type (falls back across
//                    the org's programs, then to the cross-sponsor service view)
//   - `folders`      the segment folder spine (CTD / DHF / TMF) — foldersForView
//   - `docKinds`     the document-kind filters valid for this view
//   - `filingTypes`  the framework pills valid for this view
//   - `buildTypes`   the distinct (doc_type/agency) filings live on the project
//   - `documents`    each filing's rule-pack section tree merged with LIVE
//                    section status (todo/drafted/…); this is what makes the
//                    files "organized exactly by document build type".
//
// Everything is derived — no hardcoded per-segment tree — so a 510(k) device
// project renders the DHF/eSTAR structure, an IVDR project its Annex tree, a
// pharma NDA the CTD modules, and a CRO study the TMF zones. Tenant-scoped.

router.get('/:id/vault-structure', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
  const projectId = req.params.id;

  try {
    // Project + its product modality (org-scoped for tenancy).
    const projRes = await pool.query(
      `SELECT id, name, product_type
       FROM regulatory_programs
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [projectId, orgId],
    );
    if (projRes.rows.length === 0) return send404(res);
    const productType = (projRes.rows[0] as any).product_type as string | null;

    // Derive the vault view: project product_type → segment; if the project has
    // none, fall back to the union across the org's programs; else the
    // cross-sponsor service (CRO/CDMO) view.
    let view: VaultViewId;
    const projSegs = productType ? productTypesToSegments([productType]) : [];
    if (projSegs.length > 0) {
      view = projSegs[0];
    } else {
      const orgTypesRes = await pool.query(
        `SELECT DISTINCT product_type FROM regulatory_programs
         WHERE organization_id = $1 AND product_type IS NOT NULL`,
        [orgId],
      );
      const orgSegs = productTypesToSegments(orgTypesRes.rows.map((r: any) => r.product_type));
      view = orgSegs[0] ?? 'service';
    }

    // The project's active document build types + their rule-pack section trees.
    const docsRes = await pool.query(
      `SELECT d.id, d.doc_type, d.agency, d.rule_pack_version, d.title,
              d.status, d.readiness, rp.required_sections
       FROM c2c_documents d
       LEFT JOIN c2c_rule_packs rp
         ON rp.doc_type = d.doc_type AND rp.agency = d.agency
            AND rp.version = d.rule_pack_version
       WHERE d.project_id = $1 AND d.org_id = $2
       ORDER BY d.updated_at DESC`,
      [projectId, orgId],
    );

    const documents = [];
    for (const d of docsRes.rows as any[]) {
      // Live section statuses for this document.
      const secRes = await pool.query(
        `SELECT section_key, status, version,
                ${sectionHasContentSql('content')} AS has_content
         FROM c2c_document_sections
         WHERE document_id = $1`,
        [d.id],
      );
      const live = new Map<string, any>(secRes.rows.map((r: any) => [r.section_key, r]));
      const specs = Array.isArray(d.required_sections) ? (d.required_sections as any[]) : [];
      const sections = specs.map((spec: any) => ({
        key:        spec.key,
        parentKey:  spec.parent_key ?? null,
        label:      spec.label,
        mandatory:  spec.mandatory ?? false,
        pathOrder:  spec.path_order ?? 0,
        status:     live.get(spec.key)?.status ?? 'todo',
        version:    live.get(spec.key)?.version ?? null,
        hasContent: live.get(spec.key)?.has_content ?? false,
      }));
      documents.push({
        id:        d.id,
        docType:   d.doc_type,
        agency:    d.agency,
        title:     d.title,
        status:    d.status,
        readiness: d.readiness,
        sections,
      });
    }

    const buildTypes = Array.from(
      new Set((docsRes.rows as any[]).map(d => `${d.doc_type}/${d.agency}`)),
    );

    return res.json({
      projectId,
      view,
      folders:     foldersForView(view),
      docKinds:    docKindsForView(view).map(k => ({ value: k.value, label: k.label, description: k.description })),
      // Industry-specific framing: each framework pill carries its governing
      // regulation(s) so the Explorer can render "510(k) · 21 CFR 807",
      // "eCTD · ICH M8", "IVDR PE · EU IVDR 2017/746" — the segment's real
      // regulatory language, not a generic label.
      filingTypes: filingTypesForView(view).map(f => ({
        value: f.value,
        label: f.label,
        description: f.description,
        regulatoryRefs: (f as { regulatoryRefs?: string[] }).regulatoryRefs ?? [],
      })),
      buildTypes,
      documents,
    });
  } catch (err: unknown) {
    return serverError(res, logger, 'loading the Vault structure', err, { programId: String(req.params.id) });
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

/** How many of a project's sources /:id/sources returns, newest first. */
const SOURCES_WINDOW = 200;

router.get('/:id/sources', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    // Verify project access before reading anything scoped to it.
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { listClientDocuments } = await import(
      '../../services/clinical-regulatory-evidence/evidence-spine.service.js'
    );

    const programId = String(req.params.id);
    /* One past the window, so a full one can say so: the reader's default cap
       was 200 and nothing said when it was reached. Superseded sources stay in
       the list — the authoring canvas and sources rail read this route too —
       and each carries isCurrent, so a reader that counts can count once. */
    const read = await listClientDocuments(orgId, { programId, limit: SOURCES_WINDOW + 1 });
    const truncated = read.length > SOURCES_WINDOW;
    const sources = truncated ? read.slice(0, SOURCES_WINDOW) : read;
    const unscoped =
      req.query.includeUnscoped === 'true'
        ? await listClientDocuments(orgId, { includeUnscoped: true, limit: 50 })
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
      orgId,
      [...sources, ...unscoped].map((s) => s.id),
    );

    const shape = (s: (typeof sources)[number]) => ({
      id: s.id,
      title: s.title,
      checksum: s.checksum,
      isCurrent: s.isCurrent !== false,
      ingestionStatus: s.ingestionStatus,
      extractionStatus: s.extractionStatus,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      // Reported from recorded citations only. Nothing here is inferred from
      // titles or text similarity: a usage exists because someone recorded it.
      usage: usage.get(s.id) ?? { sourceId: s.id, sections: 0, documents: 0, changedSections: 0 },
      // Surfaced so the Data Room can show what kind of file this is and how it
      // arrived, without a second round trip.
      mimeType: (s.metadata as Record<string, unknown> | null)?.mimeType ?? null,
      fileSize: (s.metadata as Record<string, unknown> | null)?.fileSize ?? null,
      artifactId: (s.metadata as Record<string, unknown> | null)?.artifactId ?? null,
      origin: (s.provenance as Record<string, unknown> | null)?.origin ?? null,
      fileUploadId: (s.provenance as Record<string, unknown> | null)?.fileUploadId ?? null,
      extractionMethod: (s.provenance as Record<string, unknown> | null)?.extractionMethod ?? null,
    });

    return res.json({
      projectId: programId,
      sources: sources.map(shape),
      unscoped: unscoped.map(shape),
      window: { shown: sources.length, truncated },
    });
  } catch (err: unknown) {
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
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { listChangedSourceUsages } = await import(
      '../../services/clinical-regulatory-evidence/source-usage.service.js'
    );
    const changes = await listChangedSourceUsages(orgId, { programId: String(req.params.id) });

    return res.json({ projectId: String(req.params.id), changes, count: changes.length });
  } catch (err: unknown) {
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
async function transitionProgram(
  req: Request,
  res: Response,
  opts: {
    action: string;
    /** SQL SET clause; $1 is the program id, $2 the org id. */
    set: string;
    /** Extra guard on the current row, e.g. only archive something not archived. */
    precondition?: (row: { status: string; deleted_at: string | null }) => string | null;
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
    if (!allowProgramMutation(req, res, { leadUserId: row.lead_user_id == null ? null : Number(row.lead_user_id) }, opts.action)) {
      await client.query('ROLLBACK');
      return;
    }

    const blocked = opts.precondition?.(row);
    if (blocked) { await client.query('ROLLBACK'); send400(res, blocked); return; }

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
    details: (row) => ({ from_status: row.status, soft_delete: true }),
  });
});

export default router;
