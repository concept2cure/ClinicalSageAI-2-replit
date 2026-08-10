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

const router = Router();
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
const WS_CASE = `CASE
         WHEN lower(p.program_type) IN ('510k','de_novo','pma','ivd','device','cer','ide') THEN 'MDX'
         WHEN lower(p.program_type) IN ('ind','bla','biologic') THEN 'Biotech'
         WHEN lower(p.program_type) IN ('nda','maa','jnda','anda') THEN 'Pharma'
         ELSE initcap(replace(p.program_type, '_', ' '))
       END`;

/** Canonical program / product types accepted by the create endpoint. Program
 *  types line up with WS_CASE above; product types match the store's CHECK-free
 *  but conventional set (drug/biologic/device/ivd). */
const VALID_PROGRAM_TYPES = new Set([
  '510k', 'de_novo', 'pma', 'ivd', 'device', 'cer', 'ide',
  // 'cta' was mapped in PROGRAM_TO_DOC_TYPE and backed by a rule pack, but was
  // missing here — so the API rejected the one European filing a biotech running
  // trials needs most. Opened now that cta:ema carries a real CTR 536/2014
  // outline (migrations/20260806); opening it against the previous two-node pack
  // would have shipped the hollow dossier this codebase spent a migration ending.
  'ind', 'cta', 'bla', 'biologic', 'nda', 'maa', 'jnda', 'anda',
  // EU MDR / IVDR technical documentation. Thirteen registry rows offered these
  // and every one created a US NDA, because the API had no value for them to
  // land on. Backed by real packs as of migrations/20260810b.
  'mdr', 'ivdr',
]);
const VALID_PRODUCT_TYPES = new Set(['drug', 'biologic', 'device', 'ivd']);

/** Derive a product_type when the client omits it, from the program_type. */
function productTypeForProgram(programType: string): string {
  if (['510k', 'de_novo', 'pma', 'device', 'cer', 'ide'].includes(programType)) return 'device';
  if (programType === 'ivd') return 'ivd';
  if (['ind', 'bla', 'biologic'].includes(programType)) return 'biologic';
  return 'drug';
}

/** A tester-friendly, org-unique program code derived from the product/name. */
function baseCodeFrom(productName: string, name: string): string {
  const src = (productName || name || 'PRJ').trim();
  // Keep an existing "BX-204"-style code intact; else initials of the words.
  const cleaned = src.replace(/[^A-Za-z0-9\- ]/g, '').trim();
  if (/^[A-Za-z]{1,4}[- ]?\d{2,4}$/.test(cleaned)) {
    return cleaned.replace(/\s+/g, '-').toUpperCase();
  }
  const initials = cleaned.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 4).toUpperCase();
  return initials || 'PRJ';
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
        ORDER BY p.updated_at DESC
        LIMIT $2 OFFSET $3`,
      [orgId, limit + 1, offset],
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
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
    console.error('[c2c/projects] GET /', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/c2c/projects ────────────────────────────────────────────────────
//
// Create a real regulatory program from the v2 New-Project wizard. Persists to
// `regulatory_programs` — the SAME table the portfolio list reads — so a
// tester's new project appears live immediately and survives reload, instead of
// the old client-only `window.C2C_PROJECT` stub that vanished on refresh.
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
  let productType = str(body.productType).toLowerCase();
  if (!productType) productType = productTypeForProgram(programType);
  if (!VALID_PRODUCT_TYPES.has(productType)) {
    return send400(res, `productType must be one of: ${[...VALID_PRODUCT_TYPES].join(', ')}`);
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
      return res.status(503).json({ error: 'PENDING_STORE' });
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

  const targetAgencies = JSON.stringify([primaryAgency]);
  const metadata = JSON.stringify({
    createdVia: 'v2-new-project-wizard',
    ...(submissionTypeId ? { submissionTypeId } : {}),
    ...(teamMembers.length ? { teamMemberNames: teamMembers } : {}),
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
          metadata, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::json, $8, $9, 'active', 'planning', $10,
               $11::timestamp, 0, $12, $13::json, $14::json, $15, $15)
       RETURNING id`,
      [
        orgId, name, code, programType, productType, primaryAgency,
        targetAgencies, productName, indication, priority,
        targetSubmissionDate, userId, JSON.stringify(teamMembers), metadata, createdBy,
      ],
    );

  const client = await pool.connect();
  let newId: string;
  // The code actually persisted — `base`, or the disambiguated retry code. The
  // audit row below records what was written, not what was first attempted.
  let createdCode = base;
  let scaffold: ScaffoldResult = { documentId: null, sectionCount: 0 };
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
      const occurredAt = new Date().toISOString();
      const target = `regulatory_program:${newId}`;
      const auditDetails = {
        project_id: newId,
        name,
        code: createdCode,
        program_type: programType,
        product_type: productType,
        primary_agency: primaryAgency,
        created_via: 'v2-new-project-wizard',
      };
      const payloadHash = hashPayload(auditDetails);
      const { sha256Chain, hmacSeal } = await computeAuditChainSealed(client, {
        action: 'c2c.project.create',
        actor_id: userId,
        target,
        payload_hash: payloadHash,
        occurred_at: occurredAt,
      });
      await client.query(
        `INSERT INTO audit_logs
           (id, tenant_id, user_id, action, table_name, record_id, actor_id, target,
            target_type, target_id, payload_hash, sha256_chain, occurred_at, hmac_seal,
            new_values)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::json)`,
        [
          randomUUID(), orgId, userId, 'c2c.project.create', 'regulatory_programs', newId,
          userId, target, 'regulatory_program', newId, payloadHash, sha256Chain, occurredAt,
          hmacSeal, JSON.stringify(auditDetails),
        ],
      );

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
    return res.status(201).json({
      data: rows[0],
      meta: {
        created: true,
        documentId: scaffold.documentId,
        scaffoldedSections: scaffold.sectionCount,
        ...(scaffold.skipped ? { scaffoldSkipped: scaffold.skipped, scaffoldDetail: scaffold.detail } : {}),
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({ error: 'PENDING_STORE' });
    }
    console.error('[c2c/projects] POST /', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    // Columns verified against migrations/20260524_program_workbench_schema.sql
    // (the previous projection referenced sponsor_name / lead_indication /
    // filing_date / pdufa_date / completion_percentage, none of which exist on
    // regulatory_programs — the read 500'd with 42703 on a real schema).
    const { rows } = await pool.query(
      `SELECT
         p.id, p.code, p.name, p.program_type, p.status, p.phase, p.priority,
         p.description, p.product_name, p.indication, p.intended_use,
         p.primary_agency, p.target_agencies,
         p.target_submission_date, p.actual_submission_date, p.approval_date,
         p.progress_percent, p.lead_user_id, p.team_members,
         p.created_at, p.updated_at
       FROM regulatory_programs p
       WHERE p.id = $1 AND p.organization_id = $2 AND p.deleted_at IS NULL
       LIMIT 1`,
      [id, orgId],
    );

    if (rows.length === 0) return send404(res);
    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    console.error('[c2c/projects] GET /:id/workstreams', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    console.error('[c2c/projects] GET /:id/drafts', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    logger.error('GET /:id/team failed', {
      programId: String(req.params.id),
      error: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code ?? null,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    // c2c_project_pinned_evidence may not exist in all environments yet.
    console.error('[c2c/projects] GET /:id/evidence', err);
    return res.json({ evidence: [] });
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
    console.error('[c2c/projects] POST /:id/evidence', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    console.error('[c2c/projects] DELETE /:id/evidence/:evId', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
         al.occurred_at, al.ip_address
       FROM audit_logs al
       WHERE al.tenant_id = $2
         AND (al.record_id = $1 OR al.new_values->>'project_id' = $1)
       ORDER BY al.occurred_at DESC NULLS LAST
       LIMIT $3`,
      [req.params.id, orgId, limit],
    );

    return res.json({ activity: rows });
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/activity', err);
    // audit_logs schema varies; degrade gracefully.
    return res.json({ activity: [] });
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
                (content -> 'paragraphs') IS NOT NULL AS has_content
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
    console.error('[c2c/projects] GET /:id/vault-structure', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    const sources = await listClientDocuments(orgId, { programId });
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
    });
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/sources', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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
    console.error('[c2c/projects] GET /:id/source-changes', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
