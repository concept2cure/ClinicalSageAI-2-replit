/**
 * @fileoverview Project Charter CRUD API Routes (GA-1 §C.10)
 * @module server/routes/charters
 *
 * HTTP surface for the project-charter strategy document:
 *   POST  /api/charters                              — create a draft charter
 *   GET   /api/charters/:charterId                   — org-scoped charter read
 *   POST  /api/charters/:charterId/commitments       — add a commitment (Task #20)
 *   GET   /api/charters/:charterId/commitments       — list commitments
 *
 * Task #20 update (2026-06-29) — commitments route enabled
 * --------------------------------------------------------
 * The GA-1 brief originally asked for POST /api/charters/:charterId/commitments
 * INSERTing into projectCommitments with per-entity audit rows on
 * charterAuditEvents. Both tables had been formally dropped by
 *   migrations/20260611_drop_charter_staging_tables.sql
 * (decision register #727 item 10), so the route was scoped out at first ship.
 *
 * That decision is reversed under Task #20: PATH_TO_GA §C.10 requires the
 * commitments surface, and the route now drives the rebuild migration
 *   migrations/20260629_charter_tables_rebuild.sql
 * which restores charter_sections / timeline_phases / project_commitments AND
 * adds a NEW charter_audit_events table specifically so the charter-domain
 * audit row can couple to the entity INSERT inside ONE db.transaction.
 *
 * Audit-surface dichotomy (read carefully — two surfaces, by design)
 * ------------------------------------------------------------------
 * Every charter mutation now writes TWO audit rows:
 *
 *   1. tx.insert(charterAuditEvents) — in the SAME db.transaction as the
 *      entity INSERT. Failure of either rolls back BOTH. Closes the
 *      AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY finding for the charter scope.
 *      This is the per-entity write-atomicity surface.
 *
 *   2. auditService.logAction(...) — POST-transaction, best-effort. Writes
 *      a SHA256-chained, HMAC-sealed row into the canonical audit_logs
 *      table. This is the cross-cutting tamper-evident surface; we cannot
 *      enlist it in a Drizzle-managed tx because auditService opens its
 *      own pool connection (server/services/auditService.ts:208). Wrapping
 *      logAction inside db.transaction would NOT make it atomic with the
 *      entity write — only the in-tx charter_audit_events insert does.
 *
 * Keeping both surfaces preserves the cross-system SHA256 chain integrity
 * AND gives charter mutations transactional audit coupling. The original
 * route (POST /charters, GET /:id) keeps its existing best-effort
 * audit_logs-only contract — adding a charter_audit_events row there is out
 * of scope for Task #20 and would duplicate the documented contract.
 *
 * Tenant scoping rules:
 *   - organizationId MUST be resolved from req.tenantContext / req.user.
 *     Never from the request body, query string, or HTTP headers — those are
 *     caller-controlled and would re-open the IDOR class that ectd-export.ts
 *     patched.
 *   - Cross-org access is collapsed to a generic 403 on the create path
 *     (where we have to look up the supplied projectId) and to 404 on the
 *     read path (where we cannot disambiguate "wrong org" from "no such row"
 *     without leaking existence).
 *
 * Error envelope:
 *   - 400 — malformed body / non-numeric :charterId. Validation issues are
 *     deliberately NOT returned to the client — the offending input values
 *     (productName, targetIndication, customInstructions up to 8 KiB of
 *     free-form text that may carry PHI / sponsor-confidential study data)
 *     would otherwise be echoed back in Zod's ZodIssue[].received field. Full
 *     issue array is logged server-side instead.
 *   - 401 — no JWT principal
 *   - 403 — JWT present but malformed/missing org context, OR projectId
 *     belongs to another tenant. Includes the "authenticated but principal
 *     carries no user id" case — 401 would be wrong (the JWT is signed and
 *     accepted; it is structurally malformed, not absent) and would trigger
 *     client re-login loops on a token that re-issuance cannot fix.
 *   - 404 — charter missing OR cross-org (deliberately collapsed)
 *   - 500 — handler exception; message is logged, body is { error } only
 *
 * IP attribution caveat (21 CFR §11.10(e)):
 *   audit rows record req.ip. In Express, req.ip returns the immediate socket
 *   peer unless `app.set('trust proxy', <hop count>)` is configured in the
 *   bootstrap. Behind a reverse proxy / ALB / nginx without trust proxy set,
 *   every row will pin to the proxy address and user attribution is lost.
 *   The bootstrap MUST set trust proxy for the deployment topology (correct
 *   hop count — never bare `true`) for the audit_logs.ip_address field to be
 *   meaningful. This route trusts that contract.
 */

import { createHash } from 'crypto';

import { Router, Request, Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';

import { requestDb, type RequestDb } from '../db/requestDb';
import { projects } from '@shared/schema';
import {
  projectCharters,
  projectCommitments,
  charterAuditEvents,
} from '@shared/schema/project-charter';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('charters');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the request's organizationId from JWT-bound context only.
 * Mirrors the precedence used by ectd-export.ts and csr-jobs.ts: tenantContext
 * (populated by the tenancy middleware) takes priority, falling back to the
 * auth principal.
 *
 * Returns null when context is missing — the caller MUST emit 401 in that case
 * rather than defaulting to a tenant id.
 */
function resolveOrganizationId(req: Request): number | null {
  const reqAny = req as any;
  const candidate =
    reqAny.tenantContext?.organizationId ?? reqAny.user?.organizationId;
  if (candidate == null) return null;
  const n = Number(candidate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resolve the requesting user's id if available (used for attribution only). */
function resolveUserId(req: Request): number | undefined {
  const user = (req as any).user;
  const raw = user?.id ?? user?.userId;
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Distinguish unauthenticated (no JWT principal at all) from
 * authenticated-but-missing-org. 401 for the former, 403 for the latter — per
 * HTTP semantics and the ectd-export.ts pattern.
 *
 * Returns { orgId, userId } on success, or null after writing the response.
 */
function requireTenant(
  req: Request,
  res: Response,
): { orgId: number; userId: number } | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const orgId = resolveOrganizationId(req);
  if (orgId == null) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  const userId = resolveUserId(req);
  if (userId == null) {
    // Authenticated but the principal carries no usable user id — refuse
    // rather than write an audit row with a NULL actor and poison the trail.
    // 403, not 401: the JWT was accepted; this is a malformed claim, not a
    // missing one. 401 would push the client into a re-login loop on a token
    // whose re-issuance can't fix it, and would obscure the real issue
    // (auth-issuer misconfiguration) from ops dashboards.
    res.status(403).json({ error: 'Principal missing user id' });
    return null;
  }
  return { orgId, userId };
}

/**
 * Parse and validate a :charterId path param. Returns the numeric id on
 * success or null when the param is missing / non-numeric / non-positive.
 * Callers MUST emit 400 on null — never fall through to a DB query with NaN.
 */
function parseCharterIdParam(raw: unknown): number | null {
  const s = String(raw ?? '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Closed enums mirroring the documented value sets in
 * shared/schema/project-charter.ts:66-67. The DB column is plain TEXT (no
 * CHECK constraint shipped in migration 0012), so Zod is the only gate
 * preventing a caller from POSTing `{submissionType:'PIZZA'}`. Downstream
 * pathway intelligence (indConfig / ndaConfig / k510Config / ...) keys off
 * submissionType and silently no-ops on unknown values; the timeline / AnA
 * context derivations then misbehave. Enforce the enum at the edge.
 *
 * When the schema gains formal enum types these arrays should be replaced
 * with the imported union — keep in lockstep until then.
 */
const SUBMISSION_TYPES = [
  'IND', 'NDA', 'BLA', '510K', 'PMA', 'MAA', 'DE_NOVO', 'EUA', 'IVDR',
] as const;
const REGULATORY_REGIONS = [
  'FDA', 'EMA', 'PMDA', 'MHRA', 'HealthCanada', 'TGA', 'NMPA',
] as const;

/**
 * Inbound POST body. Intentionally a narrow subset of the full
 * insertProjectCharterSchema: callers supply only the classification fields
 * that pin the pathway. organizationId, createdBy, version, approvalStatus
 * are server-owned and stripped here so a malicious body can never override
 * them. customInstructions is the only free-form text accepted at create time
 * (it flows into the AnA context; everything else is metadata). Length caps
 * are Zod-enforced input hygiene — the underlying columns are unbounded TEXT.
 */
const createCharterBodySchema = z.object({
  projectId: z.number().int().positive(),
  submissionType: z.enum(SUBMISSION_TYPES),
  regulatoryRegion: z.enum(REGULATORY_REGIONS),
  productName: z.string().min(1).max(256),
  targetIndication: z.string().max(512).optional(),
  customInstructions: z.string().max(8192).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/charters — create a draft charter
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res);
  if (!tenant) return; // response already written

  const parsed = createCharterBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // Do NOT echo parsed.error.issues to the client: ZodIssue.received carries
    // the offending input value, and customInstructions (8 KiB free text)
    // may contain PHI / sponsor-confidential study data. Log the full issue
    // list server-side for triage and return a generic 400.
    log.warn('Invalid charter payload', {
      issues: parsed.error.issues,
      organizationId: tenant.orgId,
    });
    return res.status(400).json({ error: 'Invalid charter payload' });
  }
  const body = parsed.data;

  try {
    const d = requestDb(req);

    // Org-scoped project existence check. A miss here can mean either "no
    // such project anywhere" or "project belongs to another tenant" — both
    // collapse to 403 so we don't leak existence of cross-org project ids.
    // 403 (not 404) because the caller IS authenticated; "you can't see
    // this resource" is the honest answer regardless of which org owns it.
    const ownedProject = await d
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, body.projectId),
          eq(projects.organizationId, tenant.orgId),
        ),
      )
      .limit(1);

    if (ownedProject.length === 0) {
      return res.status(403).json({ error: 'Project not accessible' });
    }

    // 21 CFR 11.70(b) content-integrity hash seeded at v1. Storing the empty
    // string as a sentinel makes "never hashed" indistinguishable from
    // "hashed to empty content", and a draft charter is queryable via GET
    // immediately on creation — the hash chain MUST start now. Canonical
    // JSON over the server-resolved write set (sorted keys, no whitespace)
    // so the same v1 snapshot deterministically reproduces this digest.
    const snapshot = {
      customInstructions: body.customInstructions ?? null,
      indication: body.targetIndication ?? null,
      productName: body.productName,
      regulatoryRegion: body.regulatoryRegion,
      submissionType: body.submissionType,
      version: 1,
    };
    const contentHash = createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex');

    // INSERT and audit are NOT in the same tx — auditService.logAction
    // swallows its own DB errors (auditService.ts:264) so wrapping in
    // db.transaction would not gain transactional coupling. The "best-effort
    // audit + batch gap-detector" pattern is the documented codebase
    // convention; upgrading audit to be transactional for charter.created
    // requires changing auditService and is tracked as a separate follow-up
    // (AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY).
    const inserted = await d
      .insert(projectCharters)
      .values({
        organizationId: tenant.orgId,
        projectId: body.projectId,
        submissionType: body.submissionType,
        regulatoryRegion: body.regulatoryRegion,
        productName: body.productName,
        indication: body.targetIndication,
        customInstructions: body.customInstructions,
        approvalStatus: 'draft',
        contentHash,
        version: 1,
        createdBy: tenant.userId,
        updatedBy: tenant.userId,
      })
      .returning();

    const newCharter = inserted[0];
    if (!newCharter) {
      // Should be unreachable — RETURNING on a successful INSERT always
      // yields one row. Guard so a future Drizzle behaviour change can't
      // silently return a 201 with undefined ids.
      throw new Error('Charter INSERT returned no row');
    }

    // Audit AFTER the INSERT so we have the real id to attribute. Wrapped in
    // its own try/catch: auditService.logAction normally swallows errors
    // internally, but a cold-start init failure or unhandled promise rejection
    // upstream of that try could still throw synchronously. If audit throws
    // here the charter row is already committed and the client needs the id
    // to retry or reconcile — surface it on a 201 and log the audit gap
    // server-side rather than losing the id in a 500.
    //
    // details payload covers the full set of fields written (per §11.10(e)
    // attribution: "what was created"). customInstructions can be 8 KiB of
    // free-form text — record its SHA-256 instead of the value so the audit
    // row stays small and PHI-safe while still proving what was persisted.
    const customInstructionsHash = body.customInstructions
      ? createHash('sha256').update(body.customInstructions).digest('hex')
      : null;
    try {
      await auditService.logAction({
        organizationId: tenant.orgId,
        userId: tenant.userId,
        action: 'charter.created',
        resourceType: 'charter',
        resourceId: newCharter.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        details: {
          projectId: body.projectId,
          submissionType: body.submissionType,
          regulatoryRegion: body.regulatoryRegion,
          productName: body.productName,
          indication: body.targetIndication ?? null,
          customInstructionsHash,
          approvalStatus: 'draft',
          version: 1,
          contentHash,
        },
      });
    } catch (auditErr) {
      log.error('charter.created audit write threw — row created without audit', {
        err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        charterId: newCharter.id,
        organizationId: tenant.orgId,
      });
    }

    return res.status(201).json({
      charterId: newCharter.id,
      status: newCharter.approvalStatus ?? 'draft',
    });
  } catch (err) {
    log.error('Failed to create charter', {
      err: err instanceof Error ? err.message : String(err),
      organizationId: tenant.orgId,
      projectId: body.projectId,
    });
    return res.status(500).json({ error: 'Failed to create charter' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/charters/:charterId — org-scoped read
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:charterId', async (req: Request, res: Response) => {
  const charterId = parseCharterIdParam(req.params.charterId);
  if (charterId == null) {
    return res.status(400).json({ error: 'Valid numeric charter id required' });
  }

  const tenant = requireTenant(req, res);
  if (!tenant) return;

  try {
    const d = requestDb(req);

    // Org-scoped SELECT. Cross-org and not-found collapse to 404 — leaking
    // existence ("this id IS a charter, just not yours") would give an
    // attacker a tenant-membership oracle.
    //
    // Note: PATH_TO_GA §C.10 mentions a LEFT JOIN against charterSections
    // for a section count. That table was dropped by
    // migrations/20260611_drop_charter_staging_tables.sql; there is no
    // section count to return. Surface the charter row as-is.
    const rows = await d
      .select()
      .from(projectCharters)
      .where(
        and(
          eq(projectCharters.id, charterId),
          eq(projectCharters.organizationId, tenant.orgId),
        ),
      )
      .limit(1);

    const charter = rows[0];
    if (!charter) {
      return res.status(404).json({ error: 'Charter not found' });
    }

    // Read attribution per 21 CFR Part 11 §11.10(e). Writes to the unified
    // chained audit_logs table, NOT a per-entity charter_audit_events table
    // (which was never migrated — see module header). Best-effort: errors
    // inside auditService.logAction are caught and logged internally, never
    // propagated to the request.
    //
    // details captures the integrity coordinates of the disclosed view
    // (version + approvalStatus + contentHash) so a later 11.70(b)
    // integrity audit can reproduce exactly what the user saw without
    // re-querying — the row could have mutated between this read and the
    // audit replay.
    try {
      await auditService.logAction({
        organizationId: tenant.orgId,
        userId: tenant.userId,
        action: 'charter.read',
        resourceType: 'charter',
        resourceId: charter.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        details: {
          projectId: charter.projectId,
          version: charter.version,
          approvalStatus: charter.approvalStatus,
          contentHash: charter.contentHash,
        },
      });
    } catch (auditErr) {
      log.error('charter.read audit write threw — read served without audit', {
        err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        charterId: charter.id,
        organizationId: tenant.orgId,
      });
    }

    return res.json(charter);
  } catch (err) {
    log.error('Failed to read charter', {
      err: err instanceof Error ? err.message : String(err),
      organizationId: tenant.orgId,
      charterId,
    });
    return res.status(500).json({ error: 'Failed to read charter' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Commitments sub-resource — Task #20 / PATH_TO_GA §C.10
// ─────────────────────────────────────────────────────────────────────────────
//
// Backed by project_commitments (rebuilt by migrations/20260629) and
// charter_audit_events (new in migrations/20260629). The audit row is written
// inside the SAME db.transaction as the entity INSERT (closes
// AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY for the charter scope). The
// canonical audit_logs row is best-effort, post-transaction, and intentionally
// kept for cross-system tamper-evident chaining.
//
// Cross-org charterId access is collapsed to 404 (existence-info-leak
// prevention) — the same pattern the charter GET uses.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Closed enum mirroring shared/schema/project-charter.ts:projectCommitments
 * (the 20-or-so regulatory-specific categories listed inline as comments on
 * the `category` column). The DB column is TEXT with no CHECK constraint, so
 * Zod is the only gate against an arbitrary category. When the schema gains
 * a formal enum these arrays should be replaced with the imported union.
 */
const COMMITMENT_CATEGORIES = [
  'regulatory_submission',
  'agency_engagement',
  'agency_meeting',
  'regulatory_approval',
  'clinical_hold_response',
  'fda_deficiency_response',
  'document_delivery',
  'quality_assurance',
  'team_deliverable',
  'evidence_gathering',
  'manufacturing_commitment',
  'nonclinical_commitment',
  'clinical_commitment',
  'data_integrity',
  'ectd_assembly',
  'safety_report',
  'pediatric_commitment',
  'rems_commitment',
  'post_market_commitment',
] as const;

const COMMITMENT_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Inbound POST body. Mirrors the contract in the task brief:
 *   { category, title, dueDate, owner, priority?, requiresSignature? }
 *
 * `owner` accepts either { userId } (maps to ownerUserId) or { role } (maps
 * to ownerRole). Refinement guarantees one of the two is present so a
 * commitment is never created completely unassigned.
 *
 * `dueDate` is ISO-8601 with timezone offset; coerced to Date in the handler
 * so Drizzle hands Postgres a typed timestamptz literal.
 *
 * Length caps mirror createCharterBodySchema — defence against arbitrary-size
 * payloads on text columns.
 */
const createCommitmentBodySchema = z
  .object({
    category: z.enum(COMMITMENT_CATEGORIES),
    title: z.string().min(1).max(512),
    description: z.string().max(8192).optional(),
    dueDate: z
      .string()
      .datetime({ offset: true })
      .describe('ISO-8601 timestamp with timezone'),
    owner: z.union([
      z.object({ userId: z.number().int().positive() }),
      z.object({ role: z.string().min(1).max(128) }),
    ]),
    priority: z.enum(COMMITMENT_PRIORITIES).optional(),
    requiresSignature: z.boolean().optional(),
  })
  .strict();

/**
 * Resolve charter ownership in the caller's tenant. Returns the charter row
 * (with the fields the commitment INSERT references) or null when the
 * charter does not exist OR belongs to another tenant. Both cases collapse
 * to a 404 at the caller to deny a tenant-membership oracle.
 */
async function loadOwnedCharter(
  d: RequestDb,
  charterId: number,
  organizationId: number,
): Promise<{ id: number; organizationId: number; projectId: number } | null> {
  const rows = await d
    .select({
      id: projectCharters.id,
      organizationId: projectCharters.organizationId,
      projectId: projectCharters.projectId,
    })
    .from(projectCharters)
    .where(
      and(
        eq(projectCharters.id, charterId),
        eq(projectCharters.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Compute the per-row integrity digest for a charter_audit_events row.
 *
 * Canonical projection (sorted keys, no whitespace) so the same logical event
 * deterministically reproduces this digest. The DB CHECK constraint
 * (`event_hash ~ '^[0-9a-f]{64}$'`) rejects a NULL / malformed digest so a
 * caller cannot accidentally insert an unverifiable audit row.
 */
function computeCharterAuditEventHash(input: {
  charterId: number;
  entityType: string;
  entityId: number;
  eventType: string;
  actorUserId: number;
  occurredAt: string;
  afterValue: unknown;
}): string {
  // Stable key order — construct in alphabetical order so the digest is
  // reproducible from the row itself.
  const canonical = {
    actorUserId: input.actorUserId,
    afterValue: input.afterValue ?? null,
    charterId: input.charterId,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/charters/:charterId/commitments — add a commitment
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:charterId/commitments', async (req: Request, res: Response) => {
  const charterId = parseCharterIdParam(req.params.charterId);
  if (charterId == null) {
    return res.status(400).json({ error: 'Valid numeric charter id required' });
  }

  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const parsed = createCommitmentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // Per the createCharter pattern: do NOT echo ZodIssue.received to the
    // client — the title / description fields may carry sponsor-confidential
    // study data. Log issues server-side; return a generic 400.
    log.warn('Invalid commitment payload', {
      issues: parsed.error.issues,
      charterId,
      organizationId: tenant.orgId,
    });
    return res.status(400).json({ error: 'Invalid commitment payload' });
  }
  const body = parsed.data;

  try {
    const d = requestDb(req);

    // Resolve charter in the caller's tenant. Miss-or-cross-org → 404
    // (existence-info-leak collapse used by GET /:id). We need the
    // charter's projectId to populate the commitment row, so this lookup
    // is mandatory.
    const ownedCharter = await loadOwnedCharter(d, charterId, tenant.orgId);
    if (!ownedCharter) {
      return res.status(404).json({ error: 'Charter not found' });
    }

    // Owner mapping: payload accepts either { userId } or { role }; persist
    // into the matching column. Refinement guarantees one is present.
    const ownerUserId =
      'userId' in body.owner ? body.owner.userId : null;
    const ownerRole = 'role' in body.owner ? body.owner.role : null;

    // dueDate validated as ISO-8601 with timezone offset. Convert to Date so
    // Drizzle emits a typed timestamptz literal.
    const dueDate = new Date(body.dueDate);

    // ──────────────────────────────────────────────────────────────────────
    // TRANSACTIONAL INSERT — entity + per-entity audit row in one tx.
    //
    // Closes AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY (task #21 finding) for
    // the charter scope. The per-entity audit row CANNOT silently drift
    // from the entity row because both are written atomically. A failure
    // of either insert rolls back the other — the charter's internal audit
    // trail is complete-by-construction.
    //
    // The cross-cutting audit_logs write (auditService.logAction) is kept
    // post-tx as a best-effort companion for SHA256-chain integrity across
    // the whole system. See the file header for the rationale.
    // ──────────────────────────────────────────────────────────────────────
    const txResult = await d.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(projectCommitments)
        .values({
          organizationId: tenant.orgId,
          projectId: ownedCharter.projectId,
          charterId: ownedCharter.id,
          title: body.title,
          description: body.description ?? null,
          category: body.category,
          source: 'manual',
          dueDate,
          status: 'pending',
          priority: body.priority ?? 'medium',
          ownerUserId,
          ownerRole,
          requiresSignature: body.requiresSignature ?? false,
          createdBy: tenant.userId,
        })
        .returning();

      const commitment = insertedRows[0];
      if (!commitment) {
        // Unreachable under normal Drizzle behaviour — RETURNING on a
        // successful INSERT always yields one row. Throwing here aborts
        // the transaction (the audit row never lands) and the caller gets
        // a 500.
        throw new Error('Commitment INSERT returned no row');
      }

      const occurredAt = new Date();
      const afterValue = {
        category: body.category,
        title: body.title,
        dueDate: dueDate.toISOString(),
        ownerUserId,
        ownerRole,
        priority: body.priority ?? 'medium',
        requiresSignature: body.requiresSignature ?? false,
        status: 'pending',
        source: 'manual',
      };

      const eventHash = computeCharterAuditEventHash({
        charterId: ownedCharter.id,
        entityType: 'commitment',
        entityId: commitment.id,
        eventType: 'created',
        actorUserId: tenant.userId,
        occurredAt: occurredAt.toISOString(),
        afterValue,
      });

      await tx.insert(charterAuditEvents).values({
        organizationId: tenant.orgId,
        charterId: ownedCharter.id,
        entityType: 'commitment',
        entityId: commitment.id,
        eventType: 'created',
        actorUserId: tenant.userId,
        actorRole: ownerRole ?? null,
        occurredAt,
        beforeValue: null,
        afterValue,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        reason: null,
        signatureMeaning: null,
        eventHash,
      });

      return commitment;
    });

    // ──────────────────────────────────────────────────────────────────────
    // Cross-cutting audit_logs row — best-effort, POST-tx.
    //
    // SHA256-chained audit_logs is the system-wide tamper-evident surface.
    // It cannot participate in the Drizzle tx above (auditService opens
    // its own pool connection — see file header). A failure here is
    // logged; the 201 still ships because the transactional
    // charter_audit_events row IS the §11.10(e) coverage of record for the
    // charter graph.
    // ──────────────────────────────────────────────────────────────────────
    try {
      await auditService.logAction({
        organizationId: tenant.orgId,
        userId: tenant.userId,
        action: 'charter.commitment.created',
        resourceType: 'charter_commitment',
        resourceId: txResult.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        details: {
          charterId: ownedCharter.id,
          projectId: ownedCharter.projectId,
          category: body.category,
          title: body.title,
          dueDate: dueDate.toISOString(),
          ownerUserId,
          ownerRole,
          priority: body.priority ?? 'medium',
          requiresSignature: body.requiresSignature ?? false,
          status: 'pending',
        },
      });
    } catch (auditErr) {
      log.error(
        'charter.commitment.created audit_logs write threw — in-tx audit row stands',
        {
          err:
            auditErr instanceof Error ? auditErr.message : String(auditErr),
          charterId: ownedCharter.id,
          commitmentId: txResult.id,
          organizationId: tenant.orgId,
        },
      );
    }

    return res.status(201).json({
      commitmentId: txResult.id,
      status: 'open',
    });
  } catch (err) {
    log.error('Failed to create commitment', {
      err: err instanceof Error ? err.message : String(err),
      organizationId: tenant.orgId,
      charterId,
    });
    return res.status(500).json({ error: 'Failed to create commitment' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/charters/:charterId/commitments — list commitments
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:charterId/commitments', async (req: Request, res: Response) => {
  const charterId = parseCharterIdParam(req.params.charterId);
  if (charterId == null) {
    return res.status(400).json({ error: 'Valid numeric charter id required' });
  }

  const tenant = requireTenant(req, res);
  if (!tenant) return;

  try {
    const d = requestDb(req);

    // The commitments SELECT is org-scoped (organizationId + charterId), so
    // a cross-org probe yields [] — indistinguishable from "charter exists
    // but has no commitments". That collapse is the desired
    // tenant-membership-oracle denial for this surface (no separate
    // up-front charter ownership check needed).
    const rows = await d
      .select()
      .from(projectCommitments)
      .where(
        and(
          eq(projectCommitments.charterId, charterId),
          eq(projectCommitments.organizationId, tenant.orgId),
        ),
      )
      .orderBy(desc(projectCommitments.createdAt));

    return res.json({ commitments: rows });
  } catch (err) {
    log.error('Failed to list commitments', {
      err: err instanceof Error ? err.message : String(err),
      organizationId: tenant.orgId,
      charterId,
    });
    return res.status(500).json({ error: 'Failed to list commitments' });
  }
});

export default router;
