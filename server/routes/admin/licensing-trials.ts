/**
 * Master Administration — time-limited grants. Mounted under /api/admin/master.
 *
 * WHY THIS EXISTS. `module_subscriptions` gained an `expires_at` column and
 * entitlement resolution honours it: a grant can now stop overriding tier on a
 * date. Nothing could SET that date. Shipping the resolution half alone would
 * repeat a mistake this console has already made twice — a tier change whose
 * own response said "re-provision the tenant" with nothing that could, and a
 * report mode whose only output was a log line nobody would read. A capability
 * the product can read and cannot write is not a capability.
 *
 *   GET  /licensing/trials          every grant carrying an end date, live and lapsed
 *   POST /licensing/trials          open a trial, or move an existing end date
 *   POST /licensing/trials/convert  make it perpetual — the trial converted
 *   POST /licensing/trials/end      end it now
 *
 * /convert and /end act only on a grant that carries an end date (live or
 * lapsed). On a revocation, a perpetual grant or no grant at all they answer
 * 409 and write nothing — see `notATrial`.
 *
 * ── WHAT ENDING A TRIAL DOES, AND WHAT IT DOES NOT ──────────────────────────
 *
 * "End now" sets the expiry to this instant. It does NOT write a revocation.
 *
 * That distinction is the whole feature. A revocation (`enabled = false`) is a
 * denial that outranks tier: the customer loses the module even if their plan
 * includes it. A lapse removes the override and lets tier + industry answer, so
 * an organization on a plan that covers the module keeps it. Ending a trial
 * with a revocation would repossess capability the customer is paying for, and
 * it would tell them an administrator switched it off, which is a different
 * sentence and, for a trial, a false one.
 *
 * Revoking is a separate, deliberate act with its own endpoint
 * (`PATCH /tenants/:id/modules` in ./master-admin) and is not duplicated here.
 *
 * ── GOVERNANCE ──────────────────────────────────────────────────────────────
 *
 * Every write takes a reason (min 3 chars) and goes through auditService, so
 * the Part 11 chain records who changed a customer's commercial position, when
 * and why. `normalizeReason` is imported from ./master-licensing rather than
 * re-implemented: one rule for what counts as a reason.
 *
 * The whole router inherits `authMiddleware` + `requirePlatformAdmin` from its
 * mount in ./master-admin — no endpoint here does its own authorization, and
 * none may.
 *
 * @module server/routes/admin/licensing-trials
 */

import { Router, Request, Response } from 'express';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import auditService from '../../services/auditService';
import { writeModuleGrant } from '../../services/entitlements/module-grants';
import { isGrantExpired, toIsoOrNull } from '../../services/license-manager';
import { normalizeReason } from './master-licensing';

const logger = createScopedLogger('admin-licensing-trials');
const router = Router();

/** One grant that carries an end date, as the console reads it. */
export interface TrialRow {
  organizationId: number;
  organizationName: string;
  organizationSlug: string | null;
  tier: string | null;
  moduleId: string;
  moduleName: string;
  expiresAt: string | null;
  expired: boolean;
  setBy: string | null;
  setAt: string | null;
  coveredByPlan: boolean;
}

/**
 * PURE: the instant a trial should end, or an error naming what was wrong.
 *
 * Rejects a date in the past. An "expiry" already behind us is not a trial —
 * it is an immediate lapse dressed as a grant, and an operator who typed last
 * month by accident would get a success response for a change that gave the
 * customer nothing. If ending it now is genuinely what was meant, that is what
 * /licensing/trials/end is for, and it says so.
 */
export function parseTrialEnd(
  raw: unknown,
  now: Date = new Date(),
): { at: Date } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { error: 'An end date is required.' };
  }
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) {
    return { error: 'That end date could not be read. Use a calendar date.' };
  }
  if (at.getTime() <= now.getTime()) {
    return { error: 'The end date is in the past. To end a trial immediately, end it instead.' };
  }
  return { at };
}

/** The body every write here takes: which grant, and why. */
function readTarget(body: unknown): { organizationId: number; moduleId: string } | null {
  const b = (body ?? {}) as { organizationId?: unknown; moduleId?: unknown };
  const organizationId = Number(b.organizationId);
  const moduleId = typeof b.moduleId === 'string' ? b.moduleId.trim() : '';
  if (!Number.isFinite(organizationId) || !moduleId) return null;
  return { organizationId, moduleId };
}

/**
 * What the grant row for (organization, module) is right now, as far as the
 * trial actions are concerned. Only `timed` — enabled, carrying an end date,
 * live or already lapsed — is something /convert and /end may act on.
 */
type TrialTarget =
  | { state: 'timed'; expiresAt: string | null }
  | { state: 'none' | 'revoked' | 'perpetual' };

async function readTrialTarget(organizationId: number, moduleId: string): Promise<TrialTarget> {
  const result = await query(
    `SELECT enabled, expires_at FROM module_subscriptions
      WHERE organization_id = $1 AND module_id = $2`,
    [organizationId, moduleId],
  );
  const row = result.rows[0];
  if (!row) return { state: 'none' };
  if (row.enabled !== true) return { state: 'revoked' };
  if (row.expires_at == null) return { state: 'perpetual' };
  return { state: 'timed', expiresAt: toIsoOrNull(row.expires_at) };
}

/**
 * Why /convert or /end refuses a grant that is not time-limited.
 *
 * Added 2026-09-22 (tests/db/licensing-trials.dbtest.ts, reproduced on real
 * PostgreSQL). Both actions are ONE upsert with `enabled = true`, and neither
 * looked at the row first. So on a REVOCATION — the console listed a trial, a
 * second administrator revoked the module through the toggle, the first then
 * pressed End or Convert on the row still on their screen — the revocation was
 * overwritten: `enabled` went back to true, the catalog's subscriptionState
 * went from 'disabled' to 'none' (End) or 'enabled' (Convert, perpetually), the
 * customer had the module again, and the audit trail recorded it as a trial
 * ending or converting. Where no row existed at all, Convert minted a perpetual
 * grant recorded as a "conversion", and End minted a lapsed one. And End on a
 * perpetual grant (a trial another operator had just converted) took away what
 * had been sold. None of those is a trial action; each is now a 409 that
 * writes nothing.
 *
 * The check is a read before the write, so a change landing in the
 * milliseconds between the two is not caught; the stale-screen window it
 * closes is minutes long.
 */
function notATrial(target: TrialTarget, verb: 'end' | 'convert'): string | null {
  switch (target.state) {
    case 'timed':
      return null;
    case 'none':
      return `There is no time-limited grant of this module for this tenant, so there is nothing to ${verb}.`;
    case 'revoked':
      return 'This module is revoked for this tenant. A revocation is not a trial, so it was left as it is.';
    case 'perpetual':
      return `This grant has no end date, so there is no trial to ${verb}. It was left as it is.`;
  }
}

/** Both the tenant and the module must exist before anything is written. */
async function assertTargetExists(
  organizationId: number,
  moduleId: string,
): Promise<string | null> {
  const org = await query('SELECT id FROM organizations WHERE id = $1', [organizationId]);
  if (!org.rows.length) return 'Tenant not found.';
  const mod = await query('SELECT module_id FROM available_modules WHERE module_id = $1', [
    moduleId,
  ]);
  if (!mod.rows.length) return 'Unknown module.';
  return null;
}

async function record(
  req: Request,
  organizationId: number,
  moduleId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await auditService.logAction({
    tenantId: organizationId,
    userId: req.userId,
    action: 'data_modify',
    resourceType: 'module_subscription',
    resourceId: `${organizationId}:${moduleId}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    details: { masterAdminAction: action, moduleId, ...details },
  });
}

// ─── GET /licensing/trials ───────────────────────────────────────────────────

/**
 * Every grant that carries an end date, live and lapsed together.
 *
 * Lapsed ones are NOT filtered out. They are the rows somebody has to act on —
 * convert, extend, or leave — and a list that showed only live trials would
 * present "nothing expiring" to an operator whose customers had already lost
 * access. Expiry is computed here, from the same function entitlement
 * resolution uses, rather than by a SQL predicate against the database clock.
 */
router.get('/licensing/trials', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ms.organization_id, ms.module_id, ms.enabled, ms.expires_at,
              ms.expiry_set_by, ms.expiry_set_at,
              o.name AS organization_name, o.slug AS organization_slug, o.tier,
              o.industry_mode,
              am.name AS module_name, am.metadata
         FROM module_subscriptions ms
         JOIN organizations o ON o.id = ms.organization_id
         LEFT JOIN available_modules am ON am.module_id = ms.module_id
        WHERE ms.expires_at IS NOT NULL AND ms.enabled = true
        ORDER BY ms.expires_at ASC`,
    );

    const now = new Date();
    const trials: TrialRow[] = result.rows.map((r: any) => ({
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      organizationSlug: r.organization_slug,
      tier: r.tier ?? null,
      moduleId: r.module_id,
      moduleName: r.module_name ?? r.module_id,
      expiresAt: toIsoOrNull(r.expires_at),
      expired: isGrantExpired(r.expires_at, now),
      setBy: r.expiry_set_by ?? null,
      setAt: toIsoOrNull(r.expiry_set_at),
      /**
       * What the organization keeps once this lapses. A lapse falls through to
       * tier, so a trial of a module the plan already covers costs the customer
       * nothing — and an operator chasing a renewal should not be chasing that
       * one. Read from the same packaging metadata the catalog uses.
       */
      coveredByPlan: coveredByTier(r.metadata, r.tier, r.industry_mode),
    }));

    return res.json({
      trials,
      live: trials.filter((t) => !t.expired).length,
      lapsed: trials.filter((t) => t.expired).length,
    });
  } catch (err) {
    logger.error('trial list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load time-limited grants.' });
  }
});

const TIER_LEVEL: Record<string, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

/**
 * PURE: would this organization's plan still include the module once the grant
 * lapses? Mirrors `isAvailable` in license-manager's getModuleCatalog — tier
 * (inclusive upward) AND industry — rule for rule, spelling for spelling.
 *
 * Amended 2026-09-22 (tests/db/licensing-trials.dbtest.ts, reproduced on real
 * PostgreSQL against the real resolution). This compared TIER ONLY, and it
 * lower-cased both sides where resolution does not. So:
 *   - a module offered only to medtech, trialled by a biotech organization,
 *     was reported covered ("the workspace still has it") while
 *     canAccessModule refused it — "not offered for the biotech industry";
 *   - an organization whose tier is stored as 'Professional' (the billing
 *     webhook writes it verbatim; organizations.tier has no CHECK) was reported
 *     covered for a professional module while resolution, which reads an
 *     unrecognised spelling as standard, refused it.
 * In both, the console told the operator a lapse cost the customer nothing
 * while the customer had lost the module — the one case this flag exists to
 * surface. The rule is the customer's resolution, not a tidier copy of it; the
 * dbtest compares the two row by row, so any drift between them fails there.
 */
export function coveredByTier(
  metadata: unknown,
  tier: string | null,
  industryMode: string | null = null,
): boolean {
  const meta = (metadata ?? {}) as { tiers?: unknown; industries?: unknown };
  const tiers = Array.isArray(meta.tiers) ? (meta.tiers as string[]) : [];
  const industries = Array.isArray(meta.industries) ? (meta.industries as string[]) : [];
  // license-manager getLicenseInfo: `org.tier || 'standard'`, `org.industry_mode || 'biotech'`.
  const level = TIER_LEVEL[tier || 'standard'] ?? 1;
  const tierMatch = tiers.length === 0 || tiers.some((t) => level >= (TIER_LEVEL[t] ?? 99));
  const industryMatch = industries.length === 0 || industries.includes(industryMode || 'biotech');
  return tierMatch && industryMatch;
}

// ─── POST /licensing/trials — open a trial, or move its end date ─────────────

router.post('/licensing/trials', async (req: Request, res: Response) => {
  try {
    const target = readTarget(req.body);
    if (!target) return res.status(400).json({ error: 'A tenant and a module are required.' });

    const reason = normalizeReason((req.body ?? {}).reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const end = parseTrialEnd((req.body ?? {}).until);
    if ('error' in end) return res.status(400).json({ error: end.error });

    const missing = await assertTargetExists(target.organizationId, target.moduleId);
    if (missing) return res.status(404).json({ error: missing });

    const previous = await query(
      `SELECT enabled, expires_at FROM module_subscriptions
        WHERE organization_id = $1 AND module_id = $2`,
      [target.organizationId, target.moduleId],
    );
    const previousExpiry = toIsoOrNull(previous.rows[0]?.expires_at);

    const row = await writeModuleGrant({
      organizationId: target.organizationId,
      moduleId: target.moduleId,
      enabled: true,
      actorEmail: req.userEmail ?? null,
      expiresAt: end.at,
    });

    await record(req, target.organizationId, target.moduleId, 'tenant.trial_set', {
      expiresAt: end.at.toISOString(),
      previousExpiry,
      reason,
    });

    return res.json({
      organizationId: row.organization_id,
      moduleId: row.module_id,
      expiresAt: toIsoOrNull(row.expires_at),
      previousExpiry,
      /* Said plainly because it is the thing most likely to be misread: this
         grant STOPS on the date. It does not renew, and nothing sweeps it —
         entitlement resolution simply stops honouring the override. */
      note: 'This grant stops overriding the plan on the end date. What the plan itself includes is unaffected.',
    });
  } catch (err) {
    logger.error('trial set failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to set the end date.' });
  }
});

// ─── POST /licensing/trials/convert — the trial became a sale ────────────────

router.post('/licensing/trials/convert', async (req: Request, res: Response) => {
  try {
    const target = readTarget(req.body);
    if (!target) return res.status(400).json({ error: 'A tenant and a module are required.' });

    const reason = normalizeReason((req.body ?? {}).reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const missing = await assertTargetExists(target.organizationId, target.moduleId);
    if (missing) return res.status(404).json({ error: missing });

    const current = await readTrialTarget(target.organizationId, target.moduleId);
    const refusal = notATrial(current, 'convert');
    if (refusal) return res.status(409).json({ error: refusal });
    const previousExpiry = current.state === 'timed' ? current.expiresAt : null;

    /* Deliberately allowed on an ALREADY-LAPSED grant: converting one is how a
       customer who renewed late gets their module back, and refusing it would
       send the operator to the toggle — a different audit action that records
       "module switched on" instead of "trial converted", losing the fact that
       this was a renewal. */
    const row = await writeModuleGrant({
      organizationId: target.organizationId,
      moduleId: target.moduleId,
      enabled: true,
      actorEmail: req.userEmail ?? null,
      expiresAt: null,
    });

    await record(req, target.organizationId, target.moduleId, 'tenant.trial_converted', {
      previousExpiry,
      reason,
    });

    return res.json({
      organizationId: row.organization_id,
      moduleId: row.module_id,
      expiresAt: null,
      previousExpiry,
      note: 'This grant is now perpetual. It no longer has an end date.',
    });
  } catch (err) {
    logger.error('trial convert failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to convert the grant.' });
  }
});

// ─── POST /licensing/trials/end — stop it now ────────────────────────────────

router.post('/licensing/trials/end', async (req: Request, res: Response) => {
  try {
    const target = readTarget(req.body);
    if (!target) return res.status(400).json({ error: 'A tenant and a module are required.' });

    const reason = normalizeReason((req.body ?? {}).reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const missing = await assertTargetExists(target.organizationId, target.moduleId);
    if (missing) return res.status(404).json({ error: missing });

    const refusal = notATrial(await readTrialTarget(target.organizationId, target.moduleId), 'end');
    if (refusal) return res.status(409).json({ error: refusal });

    const at = new Date();
    /* enabled STAYS true and the expiry moves to now — see the module header.
       Writing `enabled: false` here would be a revocation, which outranks tier
       and would take the module away from a customer whose plan includes it. */
    const row = await writeModuleGrant({
      organizationId: target.organizationId,
      moduleId: target.moduleId,
      enabled: true,
      actorEmail: req.userEmail ?? null,
      expiresAt: at,
    });

    await record(req, target.organizationId, target.moduleId, 'tenant.trial_ended', {
      endedAt: at.toISOString(),
      reason,
    });

    return res.json({
      organizationId: row.organization_id,
      moduleId: row.module_id,
      expiresAt: toIsoOrNull(row.expires_at),
      note: 'The grant no longer overrides the plan. Anything the plan itself includes is unchanged.',
    });
  } catch (err) {
    logger.error('trial end failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to end the grant.' });
  }
});

export default router;
