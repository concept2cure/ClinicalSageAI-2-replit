/**
 * The round-boundary re-check of a run's authority (AnA detach DT3, §2.9;
 * DT3 test 11): run-control.ts runStanding, through the socket re-check it
 * reuses (socket/sessionRecheck.ts sessionEndReasonFor). The session is
 * verifyLiveToken(token, …, { activity: false }) — not the person acting — and
 * the organisation is shouldProcessTenantInBackground. Ended, or unreadable,
 * or no credential at all: 'session_ended', with what the check found
 * (ana_runs.stopped_detail). It fails closed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  verify: vi.fn(async (_t: string, _o?: unknown, _s?: unknown) => ({ userId: 10 })),
  member: vi.fn(async () => 'member' as string),
  tenant: vi.fn(async (_id: number) => true),
}));
vi.mock('../../token-revocation', () => ({ verifyLiveToken: m.verify }));
vi.mock('../../../middleware/orgMembership', () => ({ checkOrgMembership: m.member }));
vi.mock('../../tenant/tenant-lifecycle.js', () => ({ shouldProcessTenantInBackground: m.tenant }));

import { localOnlyRunHandle, runStanding } from '../run-control.js';

const subject = { token: 'tok', userId: 10, organizationId: 1 };

beforeEach(() => {
  m.verify.mockReset().mockResolvedValue({ userId: 10 });
  m.member.mockReset().mockResolvedValue('member');
  m.tenant.mockReset().mockResolvedValue(true);
});

/* DT3 review (DP-83): every ending used to be recorded as "the session that
   started this turn ended", including a credential that expired while the
   person stayed signed in and an organisation that went read-only. The stop
   is kept (fail closed); what is recorded is the cause the check found. */
const ended = (cause: string) => ({ reason: 'session_ended', detail: { cause } });

describe('runStanding', () => {
  it('a live session in an active organisation stands — checked as not the person acting', async () => {
    expect(await runStanding(subject)).toBeNull();
    expect(m.verify).toHaveBeenCalledWith('tok', undefined, { activity: false });
    expect(m.tenant).toHaveBeenCalledWith(1);
  });

  it('a revoked, expired, signed-out or idle credential: session_ended, the credential ended', async () => {
    m.verify.mockRejectedValue(new Error('SESSION_ENDED'));
    expect(await runStanding(subject)).toEqual(ended('credential_ended'));
  });

  it('a suspended, read-only, inactive or deleting organisation: session_ended, the organisation unavailable', async () => {
    m.tenant.mockResolvedValue(false);
    expect(await runStanding(subject)).toEqual(ended('org_unavailable'));
  });

  it('a membership that is gone, or cannot be read: session_ended, the membership ended', async () => {
    m.member.mockResolvedValue('unavailable');
    expect(await runStanding(subject)).toEqual(ended('membership_ended'));
  });

  it('an organisation check that throws: session_ended, the standing unreadable (fail closed)', async () => {
    m.tenant.mockRejectedValue(new Error('posture unreadable'));
    expect(await runStanding(subject)).toEqual(ended('standing_unreadable'));
  });

  it('no credential at all: session_ended, the standing unreadable, without asking anything', async () => {
    expect(await runStanding({ ...subject, token: null })).toEqual(ended('standing_unreadable'));
    expect(m.verify).not.toHaveBeenCalled();
  });
});

/* DT3 review (IAM-35): a turn whose run row could not be opened ran every tool
   batch with no session, membership or organisation re-check. Its local
   handle now carries the same check, so it stops the same way. */
describe('a local-only run handle (no run row) for a person', () => {
  it('carries the round-boundary standing check', async () => {
    const handle = localOnlyRunHandle(subject);
    expect(handle.standing).toBeTypeOf('function');
    expect(await handle.standing!()).toBeNull();
    m.verify.mockRejectedValue(new Error('SESSION_ENDED'));
    expect(await handle.standing!()).toEqual(ended('credential_ended'));
  });

  it('with no person identified it has none (nothing to check), as before', () => {
    expect(localOnlyRunHandle().standing).toBeUndefined();
  });
});
