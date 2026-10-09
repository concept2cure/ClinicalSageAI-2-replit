/**
 * 2026-09-23 (W5/D7, round-3 review): the working / verdict split for
 * coauthor_documents.status, and the load-time check that ties the working
 * allowlist to the leaf resolver's own finalized rule.
 *
 * The routes' behaviour is pinned end-to-end on PGlite in
 * server/routes/__tests__/coauthorPutStatus.test.ts; this file pins the
 * vocabulary and shows the partition check failing on the case it exists to
 * catch — the resolver starting to count a working state as filable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../db', () => ({ db: {} }));

afterEach(() => {
  vi.doUnmock('../../ectd/leaf-source-resolver.js');
  vi.resetModules();
});

describe('coauthor status vocabulary', () => {
  it('splits the documented vocabulary into working states and verdicts', async () => {
    const m = await import('../coauthor-status-write');
    expect([...m.COAUTHOR_WORKING_STATUSES]).toEqual(['draft', 'in-progress', 'in_progress', 'review']);
    expect([...m.COAUTHOR_VERDICT_STATUSES]).toEqual(['approved', 'finalized', 'signed', 'locked']);
  });

  it('plans a working state as a canonical set, and everything else as a restate', async () => {
    const { planCoauthorStatusWrite } = await import('../coauthor-status-write');
    expect(planCoauthorStatusWrite(undefined)).toEqual({ kind: 'none' });
    expect(planCoauthorStatusWrite(42)).toEqual({ kind: 'invalid' });
    expect(planCoauthorStatusWrite(' In-Progress ')).toEqual({ kind: 'set', value: 'in-progress' });
    expect(planCoauthorStatusWrite('Approved')).toEqual({
      kind: 'restate',
      normalized: 'approved',
      requested: 'Approved',
    });
    expect(planCoauthorStatusWrite('whatever')).toMatchObject({ kind: 'restate', normalized: 'whatever' });
  });

  it('treats verdicts as verdicts whatever their spelling', async () => {
    const { isCoauthorVerdictStatus } = await import('../coauthor-status-write');
    for (const s of ['approved', ' Approved', 'FINALIZED', 'signed ', 'Locked']) {
      expect(isCoauthorVerdictStatus(s), s).toBe(true);
    }
    for (const s of ['draft', 'review', 'in_progress', '', null, 'published']) {
      expect(isCoauthorVerdictStatus(s), String(s)).toBe(false);
    }
  });

  it('refuses a status carrying control characters as invalid, rather than letting Postgres fail on it', async () => {
    // 2026-09-23 (W5/D7, round-3 review): a NUL inside the value was a 500.
    const { planCoauthorStatusWrite } = await import('../coauthor-status-write');
    expect(planCoauthorStatusWrite('appro\u0000ved')).toEqual({ kind: 'invalid' });
    expect(planCoauthorStatusWrite('draft\u0007')).toEqual({ kind: 'invalid' });
    // Surrounding whitespace is still just trimmed.
    expect(planCoauthorStatusWrite('\tdraft\n')).toEqual({ kind: 'set', value: 'draft' });
  });

  it('refuses to load if the resolver counts a working state as finalized', async () => {
    vi.doMock('../../ectd/leaf-source-resolver.js', () => ({
      isFinalizedStatus: (status: string) => ['approved', 'finalized', 'review'].includes(status),
    }));
    await expect(import('../coauthor-status-write')).rejects.toThrow(/'review' must be exactly one of working or verdict/);
  });
});

/* 2026-09-23 (W5/D7, co-author close): the refusal said every verdict copy
   "was signed off for a filing" and that an edit "would file text nobody
   approved". A 'finalized' copy comes from its author's freeze — no signature,
   no approval — so the refusal states only what each status says. */
describe('the read-only refusal states only what the status says', () => {
  it.each(['approved', 'finalized', 'signed', 'locked'])('%s', async (status) => {
    const { coauthorReadOnlyRefusal } = await import('../coauthor-status-write');
    const { message } = coauthorReadOnlyRefusal(status).body as { message: string };
    expect(message).toContain(`placed into a filing as ${status}`);
    expect(message).toContain(`the text that was ${status}`);
    expect(message).not.toMatch(/signed off|nobody approved/);
    if (status === 'finalized' || status === 'locked') expect(message).not.toMatch(/\bsigned\b|\bapproved\b/);
  });
});
