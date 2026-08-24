/**
 * The one place a per-organization module grant is written.
 *
 * ── Why this was extracted ───────────────────────────────────────────────────
 *
 * `module_subscriptions` is the override that outranks tier in entitlement
 * resolution, and until now exactly one route knew how to write it: the module
 * toggle in `server/routes/admin/master-admin.ts`, with the INSERT ... ON
 * CONFLICT and its enabled_at/disabled_at/enabled_by/disabled_by bookkeeping
 * inline in the handler.
 *
 * It was not the only one. Three more inline upserts of the same row existed —
 * the customer-facing admin toggle in `server/routes/module-subscriptions.ts`,
 * the tier provisioning that runs at checkout and on the subscription webhook
 * in `server/services/billing.ts`, and the master-admin toggle — and two more
 * callers now need it (opening a time-limited trial, approving a member's
 * access request). A correction to one would have applied to a fifth of the
 * product.
 *
 * That was not hypothetical. NONE of the three touched `expires_at`. On an
 * organization whose trial of a module had lapsed, the row already holds a past
 * date, so writing `enabled = true` beside it produced a grant that was
 * instantly expired: resolution ignored the override and the rail stayed
 * locked, while every one of those paths reported success. The billing one was
 * the worst — a customer could buy a plan that included the module, have the
 * payment clear, and still not get it.
 *
 * All of them are migrated onto this function and their copies deleted, which
 * is what makes the required `expiresAt` below actually fix anything.
 *
 * ── The decision this function refuses to make for you ───────────────────────
 *
 * `expiresAt` is REQUIRED, not optional, and that is deliberate.
 *
 * If it defaulted to "leave whatever is there", turning a module back on for an
 * organization whose trial had lapsed would write `enabled = true` on a row
 * still carrying a past date — instantly expired, resolving as no override at
 * all. The operator's action would appear to succeed and do nothing. That is
 * the silent no-op this codebase keeps finding and removing.
 *
 * If it defaulted to `null`, a caller who merely meant to touch some other
 * field would silently convert a live trial into a perpetual grant — a
 * commercial giveaway by omission.
 *
 * Neither default is safe, so there is none: pass `null` for a perpetual grant
 * or an instant for a time-limited one, and say which you meant.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 *
 * No authorization and no audit write. Both belong to the caller: the routes
 * that use this sit behind different guards, and the audit record needs the
 * caller's own action name and reason. A service that logged its own audit
 * entry would produce a record that says "a module changed" without saying
 * which decision changed it.
 *
 * @module server/services/entitlements/module-grants
 */

import { query } from '../../db';

export interface ModuleGrantWrite {
  organizationId: number;
  moduleId: string;
  /** true grants the override, false records an explicit revocation. */
  enabled: boolean;
  /** Who did it, for the row itself. The reason lives in the audit trail. */
  actorEmail: string | null;
  /**
   * When the grant stops overriding tier + industry. `null` is perpetual.
   * Required — see the module note on why there is no default.
   *
   * Only meaningful when `enabled` is true: a revocation does not lapse, and
   * this function clears the date on a revocation rather than leaving a
   * dangling end-date on a row that says "off".
   */
  expiresAt: Date | string | null;
}

export interface ModuleGrantRow {
  organization_id: number;
  module_id: string;
  enabled: boolean;
  expires_at: Date | string | null;
  updated_at: Date | string;
}

/**
 * Grant or revoke a module for one organization.
 *
 * Idempotent on (organization_id, module_id). Returns the row as written, so a
 * caller reports what the database actually holds rather than what it sent.
 */
export async function writeModuleGrant(input: ModuleGrantWrite): Promise<ModuleGrantRow> {
  const { organizationId, moduleId, enabled, actorEmail } = input;
  // A revocation carries no end date — see ModuleGrantWrite.expiresAt.
  const expiresAt = enabled ? (input.expiresAt ?? null) : null;

  const result = await query(
    `INSERT INTO module_subscriptions
       (organization_id, module_id, enabled, enabled_at, disabled_at, enabled_by, disabled_by,
        expires_at, expiry_set_by, expiry_set_at, updated_at)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN NULL ELSE now() END,
             CASE WHEN $3 THEN $4 END, CASE WHEN $3 THEN NULL ELSE $4 END,
             $5, CASE WHEN $5 IS NOT NULL THEN $4 END, CASE WHEN $5 IS NOT NULL THEN now() END,
             now())
     ON CONFLICT (organization_id, module_id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           enabled_at = CASE WHEN EXCLUDED.enabled THEN now() ELSE module_subscriptions.enabled_at END,
           disabled_at = CASE WHEN EXCLUDED.enabled THEN NULL ELSE now() END,
           enabled_by = CASE WHEN EXCLUDED.enabled THEN $4 ELSE module_subscriptions.enabled_by END,
           disabled_by = CASE WHEN EXCLUDED.enabled THEN NULL ELSE $4 END,
           -- Written unconditionally, including to NULL. The caller has stated
           -- which it means; carrying the old date forward is the silent no-op
           -- this signature exists to prevent.
           expires_at = EXCLUDED.expires_at,
           expiry_set_by = CASE WHEN EXCLUDED.expires_at IS NOT NULL THEN $4 END,
           expiry_set_at = CASE WHEN EXCLUDED.expires_at IS NOT NULL THEN now() END,
           updated_at = now()
     RETURNING organization_id, module_id, enabled, expires_at, updated_at`,
    [organizationId, moduleId, enabled, actorEmail, expiresAt],
  );

  return result.rows[0] as ModuleGrantRow;
}
