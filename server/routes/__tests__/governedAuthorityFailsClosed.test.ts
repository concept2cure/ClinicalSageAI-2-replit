/**
 * An authorization gate whose failure mode is "proceed" is not a gate.
 *
 * All three governed status transitions in authoring-actions asked
 * decisionLifecycleService.checkAuthority(...) inside a try whose catch was
 * annotated non-blocking. A throw from the dynamic import or from the check
 * left the verdict unset and execution continued into the write — so a failure
 * of the authorization check RESULTED IN THE ACTION BEING PERMITTED.
 *
 * /promote-to-review was worse than fail-open-on-throw: it never consulted
 * `allowed` at all. The verdict was computed, `authority.requiresReviewerApproval`
 * was copied into the response as a descriptive field, and the artifact was
 * promoted whatever the caller's role.
 *
 * The predicate itself is sound — isActorAuthorized denies an unknown or
 * missing role — so only the plumbing needed fixing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkAuthorityImpl } = vi.hoisted(() => ({
  checkAuthorityImpl: { fn: null as null | ((a: string, r?: string) => unknown) },
}));

vi.mock('../../services/decision-lifecycle-service.js', () => ({
  get decisionLifecycleService() {
    return {
      checkAuthority: (action: string, role?: string) => {
        if (!checkAuthorityImpl.fn) throw new Error('not configured');
        return checkAuthorityImpl.fn(action, role);
      },
    };
  },
}));

import { resolveGovernedAuthority } from '../authoring-actions';

beforeEach(() => {
  checkAuthorityImpl.fn = null;
});

describe('resolveGovernedAuthority', () => {
  it('REFUSES when the authority check itself throws', async () => {
    // The defect: this path used to leave the verdict unset and fall through
    // into the governed write.
    checkAuthorityImpl.fn = () => {
      throw new Error('service unavailable');
    };
    const v = await resolveGovernedAuthority('approve-artifact', 'submission_lead');

    expect(v.allowed).toBe(false);
    expect(v.checkFailed).toBe(true);
  });

  it('says it was the CHECK that failed, not the caller’s role', async () => {
    // Two different facts. Only one of them is about the caller.
    checkAuthorityImpl.fn = () => {
      throw new Error('service unavailable');
    };
    const v = await resolveGovernedAuthority('lock-artifact', 'submission_lead');

    expect(v.reason).toMatch(/could not be completed/i);
    expect(v.reason).toMatch(/failure to CHECK/i);
  });

  it('refuses a denied role, and reports it as a role decision', async () => {
    checkAuthorityImpl.fn = () => ({
      allowed: false,
      authority: { level: 'requires-approval' },
      reason: 'Requires one of: submission_lead. Current role: viewer',
    });
    const v = await resolveGovernedAuthority('approve-artifact', 'viewer');

    expect(v.allowed).toBe(false);
    expect(v.checkFailed).toBe(false);
    expect(v.reason).toMatch(/Requires one of/);
  });

  it('allows only an explicit allowed:true', async () => {
    checkAuthorityImpl.fn = () => ({ allowed: true, authority: { level: 'delegated' } });
    await expect(
      resolveGovernedAuthority('approve-artifact', 'submission_lead').then(v => v.allowed),
    ).resolves.toBe(true);
  });

  it('treats a malformed verdict as a refusal, not an approval', async () => {
    // A check that answers with no `allowed` field has not authorised anything.
    for (const shape of [undefined, null, {}, { allowed: 'yes' }, { allowed: 1 }]) {
      checkAuthorityImpl.fn = () => shape as unknown;
      const v = await resolveGovernedAuthority('lock-artifact', 'submission_lead');
      expect(v.allowed).toBe(false);
    }
  });
});
