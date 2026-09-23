/**
 * An account's lockout that cannot be read is not an account that is unlocked.
 *
 * ── The defect this pins (VSR-001, follow-up to F-27, reproduced 2026-09-23) ──
 * auth-security-service.isAccountLocked read users.failed_login_attempts and
 * users.locked_until, and answered { locked: false } on ANY error. Sign-in
 * consults it before comparing a password, and the signing ceremony's wiring
 * (part11/reverify-signer-deps.ts) consults it before every signature. So when
 * the read failed (a lost connection, or the lockout columns missing, which is
 * ledger C-20's schema drift) the lockout silently stopped existing: a locked
 * account signed in and signed. reverifySigner refuses a lockout it cannot read
 * (ACCOUNT_STATE_UNKNOWN), and its unit test injects a throwing dependency; the
 * production wiring could never throw, so that refusal was unreachable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ readFails: false }));

// One chain for the lockout's select/update. The read either returns an
// unlocked account or fails as a database does when the columns are missing.
vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => {
    if (h.readFails) throw Object.assign(new Error('column "locked_until" does not exist'), { code: '42703' });
    return [{ failedLoginAttempts: 0, lockedUntil: null }];
  };
  chain.set = () => chain;
  return { db: { select: () => chain, update: () => chain } };
});

import { isAccountLocked } from '../auth-security-service';
import { reverifySigner, type ReverifySignerDeps } from '../part11/reverify-signer';

beforeEach(() => {
  h.readFails = false;
});

describe('the lockout read', () => {
  it('answers not-locked for an account whose lockout it read', async () => {
    expect(await isAccountLocked(7)).toMatchObject({ locked: false });
  });

  it('fails, rather than answering not-locked, when the lockout cannot be read', async () => {
    h.readFails = true;
    await expect(isAccountLocked(7), 'an unreadable lockout read as "not locked"').rejects.toThrow();
  });
});

describe('the signing ceremony, wired to it', () => {
  it('refuses a signature whose account lockout cannot be read (ACCOUNT_STATE_UNKNOWN)', async () => {
    h.readFails = true;
    // The production wiring's lockout dependency, over this read.
    const deps: ReverifySignerDeps = {
      loadPasswordHash: async () => 'stored-hash',
      comparePassword: async () => true,
      isMfaEnabled: async () => false,
      verifyMfaToken: async () => false,
      isAccountActive: async () => true,
      isAccountLocked: async (userId) => (await isAccountLocked(userId)).locked,
      recordFailedAttempt: async () => {},
      warn: () => {},
    };
    const r = await reverifySigner(7, { password: 'right' }, deps);
    expect(r, 'a signature went through on an unreadable lockout').toMatchObject({
      ok: false,
      status: 401,
      code: 'ACCOUNT_STATE_UNKNOWN',
    });
  });
});
