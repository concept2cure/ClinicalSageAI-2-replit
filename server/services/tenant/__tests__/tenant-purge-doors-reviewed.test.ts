/**
 * Every door the tenant purge opens is on the reviewed SECURITY DEFINER
 * allowlist, so the deploy does not take it away from the runtime role (D6,
 * 2026-10-29; docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * Each deploy runs revokeUnreviewedDefinerExecute
 * (scripts/db/provision-app-role.mjs) after the migration set. It REVOKEs
 * EXECUTE from app_service on every definer function the allowlist does not
 * name. The purge runs as app_service (tenants-simple.ts, in the platform
 * scope) and calls each door whenever its table exists. So a door missing from
 * the list fails every purge with 42501 "permission denied for function".
 * purge_tenant_vault_seals (VR-19, 20261029d) was missing, and the purge of
 * every tenant on a deployed database failed there.
 *
 * tests/db/security-definer-functions.dbtest.ts cannot see this. It fails on
 * an unlisted definer function the runtime role can call, and after the
 * revoke an unlisted door is one it cannot call. This file pins the other
 * direction for the purge: what the purge must be able to call, it can.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PURGE_DOORS } from '../tenant-offboarding';

vi.mock('../../../middleware/orgMembership', () => ({ invalidateOrgMembershipCache: vi.fn() }));

const allowlist = JSON.parse(readFileSync('scripts/db/security-definer-allowlist.json', 'utf8')) as {
  functions: Record<string, { status: string; reason: string }>;
};

/** Each door's function, plus the Vault versions door purgeVaultVersions calls. */
const DOOR_FUNCTIONS = [...PURGE_DOORS.map((d) => d.fn), 'purge_tenant_vault_records'];

describe('the tenant purge can call every door it opens', () => {
  it.each(DOOR_FUNCTIONS)('public.%s(p_org integer) is reviewed, so the deploy leaves app_service its EXECUTE', (fn) => {
    const entry = allowlist.functions[`public.${fn}(p_org integer)`];
    expect(entry, `${fn} is not on scripts/db/security-definer-allowlist.json`).toBeDefined();
    expect(['reviewed', 'reviewed-risk']).toContain(entry.status);
    expect(entry.reason.trim().length).toBeGreaterThan(20);
  });
});
