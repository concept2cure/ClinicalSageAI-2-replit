/**
 * requireEntitlement — HTTP enforcement for the MDX/global entitlement matrix.
 *
 * The tier matrix (mdx-entitlements.ts) shipped pure and tested but UNENFORCED:
 * no route consulted it. This middleware is the enforcement seam, rolled out on
 * the PROGRAM_QUOTA_MODE warn-convention (services/c2c/program-access.ts):
 *
 *   ENTITLEMENTS_ENFORCE=off   (default) — no-op, zero queries. Enforcement has
 *                              never been on, so it ships dark; flipping it on
 *                              is a deliberate operator act, not a deploy side
 *                              effect.
 *   ENTITLEMENTS_ENFORCE=warn  — evaluate + log the would-be denial, set the
 *                              X-Entitlement-Warning response header, allow.
 *                              The observation mode an operator runs before
 *                              turning enforcement on.
 *   ENTITLEMENTS_ENFORCE=on    — deny with 403 { error:'NOT_ENTITLED',
 *                              requiredTier, capability } when the org's plan
 *                              does not unlock the capability.
 *
 * Resolved per-request so the flip needs no reboot (same as the c2c modes).
 *
 * TIER RESOLUTION — honest about unknowns. The org's tier is read from
 * organizations.tier (the same source the capability resolver's layer 0 uses).
 * Deliberately NOT via resolveCapabilities alone: that resolver defaults a
 * failed/unknown tier lookup to 'standard', which silently converts "we don't
 * know" into "entitled". A gate must keep the unknown visible, so the lookup
 * here returns tier:null with the reason, and the mode decides: warn → allowed
 * (logged, headered), on → blocked with the reason. Never a fabricated tier.
 *
 * TOGGLE GRANTS still count. When the tier verdict alone would deny, the
 * composed resolver (resolver.ts) is consulted so a feature_toggles pilot grant
 * below tier keeps working — only a grant whose `source` is 'toggle' is
 * honored, so the resolver's own default-tier fallback can never smuggle an
 * allow through this path.
 *
 * Read paths stay open by design: this is applied only to the capability's
 * mutating/producing routes (build/official/assemble, device-profile write).
 *
 * @module server/services/entitlements/require-entitlement
 */

import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { featureTier, isEntitled, isTier } from './mdx-entitlements.js';
import { resolveCapabilities } from './resolver.js';
import type { FeatureKey, Tier } from './types';

const logger = createScopedLogger('require-entitlement');

export type EntitlementsEnforceMode = 'off' | 'warn' | 'on';

/** Response header carrying the would-be denial in warn mode. */
export const ENTITLEMENT_WARNING_HEADER = 'X-Entitlement-Warning';

/**
 * Resolve the enforcement mode. Defaults to 'off' — the matrix has never been
 * enforced, so enforcement starts as an explicit operator decision (mirrors
 * resolveProgramQuotaMode's reasoning for not enforcing on deploy).
 */
export function resolveEntitlementsEnforceMode(
  env: NodeJS.ProcessEnv = process.env,
): EntitlementsEnforceMode {
  const explicit = (env.ENTITLEMENTS_ENFORCE || '').trim().toLowerCase();
  if (explicit === 'on' || explicit === 'warn' || explicit === 'off') return explicit;
  return 'off';
}

export interface OrgTierLookup {
  /** The org's real plan tier, or null when it genuinely cannot be known. */
  tier: Tier | null;
  /** Why the tier is unknown (null when `tier` resolved). */
  reason: string | null;
}

/**
 * Read the org's plan tier from organizations.tier — the same column the
 * capability resolver reads — but WITHOUT the resolver's default-to-standard:
 * a missing row, an unrecognized value, or a failed query returns tier:null
 * with the reason, so the caller can treat "unknown" as its own state instead
 * of a silently invented plan.
 */
export async function lookupOrgTier(organizationId: number): Promise<OrgTierLookup> {
  try {
    const res = await pool.query<{ tier: string | null }>(
      `SELECT tier FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (res.rows.length === 0) return { tier: null, reason: 'organization not found' };
    const raw = res.rows[0].tier;
    if (!isTier(raw)) return { tier: null, reason: `unrecognized tier ${JSON.stringify(raw)}` };
    return { tier: raw, reason: null };
  } catch (err) {
    return {
      tier: null,
      reason: `tier lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * First VALID numeric org id wins — a present-but-non-numeric candidate must
 * not poison resolution of the later ones (same contract as the 510(k) device
 * routes' resolver). Includes `resolvedOrganizationId` so a route that already
 * ran its own org gate (requireEditorAccess) is not re-derived differently.
 */
function resolveOrgId(req: Request): number | null {
  const r = req as unknown as {
    resolvedOrganizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
    tenantId?: unknown;
  };
  for (const candidate of [
    r.resolvedOrganizationId,
    r.tenantContext?.organizationId,
    r.user?.organizationId,
    r.tenantId,
  ]) {
    const n = Number(candidate);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/**
 * The gate's evaluation core, shared with non-middleware callers (e.g. the
 * AnA streaming route's Live Drive per-request flag, which cannot use an
 * Express gate because entitlement decides an SSE event, not a 403). Runs the
 * EXACT decision the middleware enforces — matrix tier first, then a
 * 'toggle'-sourced pilot grant — and never fabricates a tier.
 */
export interface EntitlementEvaluation {
  /** True when the org's plan (or a pilot toggle grant) unlocks the feature. */
  allowed: boolean;
  /** True when `allowed` came from a feature_toggles pilot grant below tier. */
  viaToggle: boolean;
  /** The matrix minimum for the feature (null = unknown key, a wiring bug). */
  requiredTier: Tier | null;
  /** The org's real plan tier, or null when it genuinely cannot be known. */
  tier: Tier | null;
  /** Why the tier is unknown (null when `tier` resolved). */
  reason: string | null;
  /** Human-readable denial detail (null when allowed). */
  detail: string | null;
}

export async function evaluateOrgEntitlement(
  feature: FeatureKey,
  organizationId: number | null,
): Promise<EntitlementEvaluation> {
  // The real minimum tier from the matrix — never fabricated. A null here
  // means the key is not in the matrix at all (a wiring bug, not a customer
  // state); it is treated as an unverifiable entitlement below.
  const requiredTier = featureTier(feature);

  const { tier, reason } =
    requiredTier === null
      ? { tier: null, reason: `unknown capability key '${String(feature)}'` }
      : organizationId === null
        ? { tier: null, reason: 'organization context missing' }
        : await lookupOrgTier(organizationId);

  if (tier !== null && isEntitled(feature, tier)) {
    return { allowed: true, viaToggle: false, requiredTier, tier, reason: null, detail: null };
  }

  // Tier alone denies (or is unknown with a KNOWN org): honor a pilot
  // feature_toggles grant below tier via the composed resolver. Only a
  // 'toggle'-sourced enable counts — the resolver defaults an unknown tier
  // to 'standard', and that fabricated tier verdict must not open the gate.
  if (requiredTier !== null && organizationId !== null && tier !== null) {
    try {
      const caps = await resolveCapabilities(organizationId);
      const row = caps.features.find((f) => f.feature === feature);
      if (row?.enabled && row.source === 'toggle') {
        return { allowed: true, viaToggle: true, requiredTier, tier, reason, detail: null };
      }
    } catch (err) {
      // Resolver failure grants nothing; the tier verdict stands.
      logger.warn('toggle-grant resolution failed; tier verdict stands', {
        feature,
        organizationId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const detail =
    tier === null
      ? `tier unknown (${reason})`
      : `tier '${tier}' is below the '${requiredTier}' minimum`;
  return { allowed: false, viaToggle: false, requiredTier, tier, reason, detail };
}

/**
 * Gate a route on `feature` per the mode above. Applied AFTER auth/org
 * middleware so it evaluates the same org the route will act for.
 */
export function requireEntitlement(feature: FeatureKey) {
  return async function requireEntitlementMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const mode = resolveEntitlementsEnforceMode();
    if (mode === 'off') return next();

    const organizationId = resolveOrgId(req);
    const { allowed, requiredTier, tier, reason, detail } = await evaluateOrgEntitlement(
      feature,
      organizationId,
    );
    if (allowed) return next();

    if (mode === 'warn') {
      logger.warn(
        `Entitlement '${feature}' not satisfied but allowed (mode=warn). ` +
          "This request would be refused with 403 NOT_ENTITLED in 'on' mode.",
        { feature, requiredTier, organizationId, tier, reason },
      );
      res.setHeader(
        ENTITLEMENT_WARNING_HEADER,
        `${feature}: ${detail}; allowed (ENTITLEMENTS_ENFORCE=warn)`,
      );
      return next();
    }

    // mode === 'on' — fail closed. Unknown tier blocks here (we cannot verify
    // the entitlement) and is allowed in warn above. The raw reason is logged;
    // only the evaluator's fixed sentences are copy a client may see.
    if (tier === null) {
      logger.warn(`Entitlement '${feature}' could not be verified; refused (mode=on).`, {
        feature,
        requiredTier,
        organizationId,
        reason,
      });
    }
    return res.status(403).json({
      error: 'NOT_ENTITLED',
      capability: feature,
      requiredTier,
      message:
        tier === null
          ? `Entitlement for '${feature}' could not be verified${clientSafeReason(reason)}.` +
            (requiredTier ? ` This capability requires the '${requiredTier}' plan or above.` : '')
          : `This capability requires the '${requiredTier}' plan or above (current plan: '${tier}').`,
    });
  };
}

/**
 * The evaluator's fixed unknown-tier sentences — the only `reason` values a 403
 * body may repeat. Every other reason ('tier lookup failed: <driver text>',
 * 'unrecognized tier ...', 'unknown capability key ...') carries database or
 * wiring detail and stays in the log.
 */
const CLIENT_SAFE_REASONS: ReadonlySet<string> = new Set([
  'organization not found',
  'organization context missing',
]);

function clientSafeReason(reason: string | null): string {
  return reason !== null && CLIENT_SAFE_REASONS.has(reason) ? ` — ${reason}` : '';
}
