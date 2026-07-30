/**
 * Tenant admission guard — the runtime half of the RLS enforcement posture.
 *
 * server/db/rlsEnforcement.ts decides the posture at BOOT, and deliberately
 * permits an explicit `RLS_ENFORCE=off`/`shadow` for staged rollouts. That is a
 * defensible position while a deployment holds ONE tenant: with no second
 * organization, a policy that never filters costs nothing real.
 *
 * It stops being defensible the moment a second organization exists — and
 * nothing noticed, because that happens long after boot. The pilot go/no-go gate
 * states the rule ("RLS_ENFORCE=on is REQUIRED before a second organization is
 * created — this gate turns HARD the moment one is") but a gate is a script a
 * human runs before opening a pilot, not a control in the running system. Six
 * different code paths can insert an organization; none of them consulted the
 * isolation posture.
 *
 * This module is the enforcement point those paths call.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { organizations } from '@shared/schema';
import { assertTenantIsolationBeforeNewOrg } from './rlsEnforcement';

/**
 * Throw unless this deployment may admit another tenant right now.
 *
 * Counts existing organizations and defers the decision to the pure predicate in
 * rlsEnforcement.ts (which permits the founding tenant, no-ops in local
 * development/test, and requires `RLS_ENFORCE=on` from the second organization
 * onward in any deployed environment).
 *
 * FAILS CLOSED on an indeterminate count. If the organizations table cannot be
 * counted we do not know whether this would be tenant #1 or tenant #12, and
 * guessing "probably the first" is exactly the assumption that turns a
 * defense-in-depth gap into a cross-tenant leak. Callers should let this
 * propagate — refusing to create an organization is recoverable, silently
 * creating one into an unisolated deployment is not.
 *
 * Call BEFORE the insert, inside the same request that performs it.
 */
export async function assertCanAdmitNewTenant(): Promise<void> {
  let existingOrgCount: number;
  try {
    if (!db) throw new Error('database handle is not initialized');
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizations);
    const n = Number(row?.count);
    if (!Number.isFinite(n)) throw new Error('organization count was not a number');
    existingOrgCount = n;
  } catch (err) {
    throw new Error(
      '[tenant-admission] FAIL-CLOSED: could not determine how many organizations exist, so ' +
        'whether this deployment is about to become multi-tenant without row filtering is unknown. ' +
        `Refusing to create the organization. Cause: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  assertTenantIsolationBeforeNewOrg(existingOrgCount);
}
