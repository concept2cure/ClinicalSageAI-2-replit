/**
 * `logAuditEntry` had three outcomes and one observable result.
 *
 * WO-16C #133, in the largest of this repository's void-returning audit
 * mechanisms: 46 call sites across ten route files, every one of which discards
 * an outcome — because there was none to keep. `Promise<void>` with a catch that
 * logs and returns normally means a caller cannot tell a written
 * `regulatory_audit_logs` row from a lost one, and cannot be blamed for not
 * trying.
 *
 * Three things happen behind that signature:
 *
 *   WRITTEN        the row committed.
 *   UNATTRIBUTED   the org or the user could not be resolved, so the row was
 *                  written with the sentinel 0 that `regulatory_audit_logs`'
 *                  NOT NULL columns force. The function already logs a warning
 *                  about it — the row is a dangling reference presented as an
 *                  attribution, which its own comment calls out at length — but
 *                  the CALLER was told nothing, so a governed action recorded
 *                  against a non-existent org looked identical to a real one.
 *   FAILED         the INSERT threw and was swallowed.
 *
 * The write policy is unchanged: still best-effort, still writes the sentinel
 * rather than dropping a governed action out of the trail, still never throws.
 * Whether an unattributable action should be recorded-as-unknown or refused is a
 * Part 11 decision for an owner, and this does not pre-empt it — it makes the
 * choice visible to the code that would have to act on it.
 *
 * Failure is injected at the dependency: the INSERT rejects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DB = vi.hoisted(() => ({ throws: null as string | null, inserted: [] as unknown[] }));

vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: async (row: unknown) => {
        if (DB.throws) throw new Error(DB.throws);
        DB.inserted.push(row);
      },
    }),
  },
}));

import { logAuditEntry } from '../shared';

function reqWith(over: Record<string, unknown> = {}) {
  return {
    headers: { 'user-agent': 'vitest' },
    userId: 7,
    userEmail: 'qa@sponsor.example',
    userRole: 'author',
    organizationId: 9,
    ...over,
  } as never;
}

beforeEach(() => {
  DB.throws = null;
  DB.inserted.length = 0;
});

describe('logAuditEntry reports which of its three outcomes happened', () => {
  it('a committed row is reported as written, and attributed', async () => {
    const out = await logAuditEntry(reqWith(), 'CREATE', 'artifact', 'art-1');

    expect(out.written).toBe(true);
    expect(out.attributed).toBe(true);
    expect(DB.inserted).toHaveLength(1);
  });

  it('an unresolvable actor is reported as unattributed, not as a clean write', async () => {
    // The sentinel 0 is still written — dropping a governed action out of the
    // trail would be worse — but the caller can now tell.
    const out = await logAuditEntry(reqWith({ userId: undefined }), 'UPDATE', 'artifact', 'art-1');

    expect(out.written).toBe(true);
    expect(out.attributed).toBe(false);
    expect(DB.inserted).toHaveLength(1);
  });

  it('a rejected INSERT is reported as not written, and still does not throw', async () => {
    DB.throws = 'relation "regulatory_audit_logs" does not exist';

    const out = await logAuditEntry(reqWith(), 'DELETE', 'artifact', 'art-1');

    expect(out.written).toBe(false);
    expect(DB.inserted).toHaveLength(0);
    // The store's own text stays in the log line, never in the outcome.
    expect(JSON.stringify(out)).not.toContain('does not exist');
  });

  it('a failed write and an unattributed one are different answers', async () => {
    DB.throws = 'db down';
    const failed = await logAuditEntry(reqWith(), 'CREATE', 'artifact', 'a');
    DB.throws = null;
    const unattributed = await logAuditEntry(reqWith({ organizationId: undefined }), 'CREATE', 'artifact', 'a');

    expect(failed.written).toBe(false);
    expect(unattributed.written).toBe(true);
    expect(unattributed.attributed).toBe(false);
    expect(failed).not.toEqual(unattributed);
  });
});
