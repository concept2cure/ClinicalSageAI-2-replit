/**
 * A data subject request cannot be marked completed without evidence.
 *
 * `completeDataSubjectRequest` used to take free text and set
 * status='completed'. It erased nothing, exported nothing, rectified nothing —
 * the row was the entire outcome. For an erasure request that row asserts under
 * GDPR Art. 17 that the subject's personal data is gone, while Art. 5(2) puts
 * the burden on the controller to DEMONSTRATE it.
 *
 * Prose cannot carry that burden, and the reason is specific rather than
 * stylistic: "no personal data was found for this subject" and "nobody looked"
 * are the same sentence. The structured evidence separates them, because a
 * subject who genuinely holds no data still yields `rows: 0` across the scopes
 * that were searched, and an empty scope list means none were.
 *
 * These tests are the enforcement, since no executor exists yet: until one
 * does, the function fails closed and nothing can be marked completed. That is
 * the true state of affairs and the point of the change — the platform must not
 * record a right as honoured when it has no account of honouring it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const query = vi.fn();
// The service imports `pool` from '../../db', so the mock must use the
// specifier that resolves to that same module from here.
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import {
  completeDataSubjectRequest,
  type DataSubjectRequestExecution,
} from '../gdprComplianceService';

/** Evidence that would satisfy an erasure request. */
const GOOD_ERASURE: DataSubjectRequestExecution = {
  action: 'erased',
  scopes: [
    { scope: 'users', rows: 1 },
    { scope: 'audit_logs', rows: 12 },
    { scope: 'documents', rows: 0 },
  ],
  performedBy: 'privacy-job:erase-2026-09-05',
};

/** Answers the type lookup, then the UPDATE. */
function dbFor(requestType: string) {
  query.mockImplementation(async (sql: string) => {
    // ensureTables() probes for MISSING tables: it returns a row per absent
    // table, so an empty result is the "all present" answer.
    if (/to_regclass/i.test(String(sql))) return { rows: [] };
    if (/SELECT request_type/i.test(String(sql))) return { rows: [{ request_type: requestType }] };
    return {
      rows: [
        {
          id: '1',
          data_subject_id: 'ds-1',
          request_type: requestType,
          status: 'completed',
          received_at: new Date().toISOString(),
          response_deadline: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          response_details: 'done',
          execution_evidence: null,
          organization_id: '1',
        },
      ],
    };
  });
}

describe('completeDataSubjectRequest — evidence of execution', () => {
  beforeEach(() => {
    query.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to complete an erasure with no evidence at all', async () => {
    dbFor('erasure');
    await expect(
      // The old signature: free text and nothing else.
      (completeDataSubjectRequest as any)('1', 'Deleted the user account.'),
    ).rejects.toThrow(/no record of what was carried out/i);
  });

  it('refuses evidence that lists no searched scope', async () => {
    dbFor('erasure');
    await expect(
      completeDataSubjectRequest('1', 'done', { ...GOOD_ERASURE, scopes: [] }),
    ).rejects.toThrow(/no searched scope/i);
  });

  it('accepts a subject who genuinely holds no data, when the scopes were searched', async () => {
    // rows: 0 everywhere is a true outcome and must remain completable —
    // otherwise the fix would block honest cases and get switched off.
    dbFor('erasure');
    const result = await completeDataSubjectRequest('1', 'No data held for this subject.', {
      ...GOOD_ERASURE,
      scopes: [
        { scope: 'users', rows: 0 },
        { scope: 'documents', rows: 0 },
      ],
    });
    expect(result.status).toBe('completed');
  });

  it('refuses an action that satisfies a different right', async () => {
    // Exporting a subject's data does not erase it; the row would read
    // "completed" with the data still in place.
    dbFor('erasure');
    await expect(
      completeDataSubjectRequest('1', 'Sent them a copy.', {
        ...GOOD_ERASURE,
        action: 'exported',
      }),
    ).rejects.toThrow(/satisfied by 'erased'/i);
  });

  it('refuses a malformed scope entry', async () => {
    dbFor('erasure');
    await expect(
      completeDataSubjectRequest('1', 'done', {
        ...GOOD_ERASURE,
        scopes: [{ scope: '', rows: 3 }],
      }),
    ).rejects.toThrow(/malformed/i);
    await expect(
      completeDataSubjectRequest('1', 'done', {
        ...GOOD_ERASURE,
        scopes: [{ scope: 'users', rows: -1 }],
      }),
    ).rejects.toThrow(/malformed/i);
  });

  it('refuses evidence that does not say who carried it out', async () => {
    dbFor('erasure');
    await expect(
      completeDataSubjectRequest('1', 'done', { ...GOOD_ERASURE, performedBy: '   ' }),
    ).rejects.toThrow(/who or what/i);
  });

  it('persists the evidence rather than only the prose', async () => {
    dbFor('erasure');
    await completeDataSubjectRequest('1', 'Erased.', GOOD_ERASURE);

    const update = query.mock.calls.find((c) => /UPDATE gdpr_data_subject_requests/i.test(String(c[0])));
    expect(update, 'no UPDATE was issued').toBeTruthy();
    const stored = JSON.parse((update![1] as unknown[])[1] as string);
    expect(stored.action).toBe('erased');
    expect(stored.scopes).toHaveLength(3);
    expect(stored.performedBy).toBe('privacy-job:erase-2026-09-05');
    // Stamped even when the caller does not supply one, so the record has a time.
    expect(typeof stored.performedAt).toBe('string');
  });

  it('holds each request type to the action that right requires', async () => {
    for (const [type, action] of [
      ['access', 'exported'],
      ['portability', 'exported'],
      ['rectification', 'rectified'],
      ['restriction', 'restricted'],
      ['objection', 'decision_recorded'],
    ] as const) {
      dbFor(type);
      await expect(
        completeDataSubjectRequest('1', 'done', {
          action,
          scopes: [{ scope: 'users', rows: 1 }],
          performedBy: 'operator',
        }),
      ).resolves.toBeTruthy();

      dbFor(type);
      await expect(
        completeDataSubjectRequest('1', 'done', {
          action: action === 'exported' ? 'erased' : 'exported',
          scopes: [{ scope: 'users', rows: 1 }],
          performedBy: 'operator',
        }),
      ).rejects.toThrow(/satisfied by/i);
    }
  });
});
