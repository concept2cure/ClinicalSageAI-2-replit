/**
 * @fileoverview Project Charter CRUD API Routes (GA-1 §C.10)
 * @module server/routes/charters
 *
 * HTTP surface for the project-charter strategy document:
 *   POST  /api/charters              — create a draft charter against an org-owned project
 *   GET   /api/charters/:charterId   — org-scoped charter read
 *
 * Scope deviation from PATH_TO_GA §C.10
 * --------------------------------------
 * The GA-1 brief asks for a third route, POST /api/charters/:charterId/commitments,
 * INSERTing into projectCommitments with per-entity audit rows on charterAuditEvents.
 * Both of those tables were formally DROPPED by
 *   migrations/20260611_drop_charter_staging_tables.sql
 * (decision register issue #727, item 10 — staged-but-never-queried tables).
 * The shared/schema/project-charter.ts module header records the drop. The brief's
 * own constraint ("NO new DB tables — schema already shipped") forbids re-creating
 * them here, so a commitments route would be dead on arrival (every INSERT would
 * fault on a missing relation). Scoped out until a follow-up adds the migration +
 * the schema definitions back.
 *
 * Per-entity audit table charterAuditEvents was likewise never migrated. This file
 * uses the canonical audit surface instead — auditService.logAction writes a
 * SHA256-chained, HMAC-sealed row into audit_logs (21 CFR Part 11 §11.10(e),
 * §11.70). That table IS the tamper-evident audit log; a separate
 * charter_audit_events table would just be a parallel uplift with no extra
 * compliance value.
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
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db';
import { projects } from '@shared/schema';
import { projectCharters } from '@shared/schema/project-charter';
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

function requireDb(): NonNullable<typeof db> {
  if (!db) {
    throw new Error('[charters] Drizzle db is not initialized');
  }
  return db;
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
    const d = requireDb();

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
    const d = requireDb();

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

export default router;
