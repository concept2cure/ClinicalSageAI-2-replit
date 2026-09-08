import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRecordGovernedAction, mockPersistSignature } = vi.hoisted(() => ({
  mockRecordGovernedAction: vi.fn(async () => ({
    actionId: 'act_1',
    auditId: 'aud_1',
    sha256Chain: 'c'.repeat(64),
  })),
  mockPersistSignature: vi.fn(async () => ({ id: 1, signedAt: new Date() })),
}));
vi.mock('../../../../routes/c2c/actions', () => ({
  recordGovernedAction: mockRecordGovernedAction,
  verifyReauth: vi.fn(),
}));
vi.mock('../../../part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  persistGovernedActionSignature: mockPersistSignature,
}));

import { applySignedFiling, canTransition, computeDecisionDue } from '../estar-submission-service';

/**
 * Pure lifecycle-helper tests. DB CRUD (create-from-catalog, list/get/advance)
 * is exercised by the route/integration layer (needs a live pool); here we pin
 * the transition rules and the review-clock math.
 */

describe('canTransition (eSTAR submission lifecycle)', () => {
  it('permits the forward path draft → filed → under_review → decision', () => {
    expect(canTransition('draft', 'filed')).toBe(true);
    expect(canTransition('filed', 'under_review')).toBe(true);
    expect(canTransition('under_review', 'decision')).toBe(true);
  });

  it('allows the additional-info round trip', () => {
    expect(canTransition('under_review', 'additional_info')).toBe(true);
    expect(canTransition('additional_info', 'under_review')).toBe(true);
  });

  it('allows withdrawal from any non-terminal status', () => {
    expect(canTransition('draft', 'withdrawn')).toBe(true);
    expect(canTransition('filed', 'withdrawn')).toBe(true);
    expect(canTransition('under_review', 'withdrawn')).toBe(true);
  });

  it('treats decision and withdrawn as terminal', () => {
    expect(canTransition('decision', 'under_review')).toBe(false);
    expect(canTransition('withdrawn', 'filed')).toBe(false);
  });

  it('rejects illegal jumps (draft → decision, filed → draft)', () => {
    expect(canTransition('draft', 'decision')).toBe(false);
    expect(canTransition('filed', 'draft')).toBe(false);
    expect(canTransition('draft', 'under_review')).toBe(false);
  });
});

describe('computeDecisionDue (review clock)', () => {
  it('adds reviewGoalDays to filedAt', () => {
    const filed = new Date('2026-01-01T00:00:00.000Z');
    const due = computeDecisionDue(filed, 90);
    expect(due?.toISOString()).toBe('2026-04-01T00:00:00.000Z'); // +90 days
  });

  it('returns null when there is no review clock (meeting-based requests)', () => {
    const filed = new Date('2026-01-01T00:00:00.000Z');
    expect(computeDecisionDue(filed, null)).toBeNull();
    expect(computeDecisionDue(filed, undefined)).toBeNull();
    expect(computeDecisionDue(filed, 0)).toBeNull();
  });
});

/**
 * Filing is a signature, not a status change.
 *
 * `PATCH /submissions/:id` moved a filing to `filed` with a filedAt the CLIENT
 * chose, a free-text tracking number, and no link to any artifact
 * (docs/reports/device-market-readiness-2026-09-07.md §5). Three things were
 * wrong with that at once: a Part 11 record whose date is supplied by the party
 * being recorded is a backdating hole; "filed" pointed at nothing, so nobody
 * could open what was filed; and the most consequential act in the workflow —
 * declaring a submission made to FDA — required no signature at all.
 *
 * These pin the governed filing on a fake client, so the SQL and the two Part 11
 * writes are observable without a database.
 */
describe('applySignedFiling', () => {
  const ID = '0f0d5a9e-0000-4000-8000-000000000001';
  const DOC = 'a2b4c6d8-0000-4000-8000-000000000002';
  const HASH = 'a'.repeat(64);
  const NOW = new Date('2026-09-07T12:00:00.000Z');

  /** A pg-shaped fake that answers the artifact SELECT and the UPDATE. */
  function makeClient(opts: { artifact?: unknown[]; updated?: unknown[] } = {}) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/FROM vault\.documents/i.test(sql)) {
          return { rows: opts.artifact ?? [{ content_hash: HASH }] };
        }
        if (/UPDATE estar_submissions/i.test(sql)) {
          return { rows: opts.updated ?? [{ id: ID }] };
        }
        return { rows: [] };
      }),
    };
    return { client, calls };
  }

  const params = {
    id: ID,
    organizationId: 2,
    userId: 7,
    fromStatus: 'draft' as const,
    reviewGoalDays: 90,
    artifactDocumentId: DOC,
    reason: 'Filed the cleared 510(k) package with CDRH.',
    meaning: 'approval',
    authenticationMethod: 'password',
    secondFactorVerified: false,
    ipAddress: '10.0.0.1',
    fdaTrackingNumber: 'K260001',
    now: NOW,
  };

  beforeEach(() => vi.clearAllMocks());

  it('binds the filing to the vault row, and to the hash the VAULT holds', async () => {
    const { client, calls } = makeClient();

    await applySignedFiling(client, params);

    /* The artifact is resolved org-scoped — a document id alone proves nothing. */
    const lookup = calls.find((c) => /FROM vault\.documents/i.test(c.sql))!;
    expect(lookup.params).toEqual([DOC, 2]);

    const update = calls.find((c) => /UPDATE estar_submissions/i.test(c.sql))!;
    expect(update.params).toContain(DOC);
    expect(update.params).toContain(HASH);
    /* Server clock, not the caller's. */
    expect(update.params).toContain(NOW);
    /* Only a row still in the status we validated moves. */
    expect(update.params).toContain('draft');
    expect(update.sql).toMatch(/organization_id\s*=/i);
  });

  it('refuses an artifact that is not in this organization vault', async () => {
    const { client } = makeClient({ artifact: [] });
    await expect(applySignedFiling(client, params)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mockRecordGovernedAction).not.toHaveBeenCalled();
    expect(mockPersistSignature).not.toHaveBeenCalled();
  });

  it('signs nothing when the row moved underneath it', async () => {
    const { client } = makeClient({ updated: [] });
    await expect(applySignedFiling(client, params)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockRecordGovernedAction).not.toHaveBeenCalled();
    expect(mockPersistSignature).not.toHaveBeenCalled();
  });

  it('records the governed action and an electronic signature bound to the artifact', async () => {
    const { client } = makeClient();

    await applySignedFiling(client, params);

    expect(mockRecordGovernedAction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        orgId: 2,
        userId: 7,
        command: 'sign',
        target: `estar-submission:${ID}`,
        reason: params.reason,
        payload: expect.objectContaining({ meaning: 'approval', artifactSha256: HASH }),
      }),
    );
    expect(mockPersistSignature).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        orgId: 2,
        userId: 7,
        target: `estar-submission:${ID}`,
        authenticationMethod: 'password',
        secondFactorVerified: false,
        binding: expect.objectContaining({
          digest: HASH,
          basis: 'filed-estar-artifact-sha256',
        }),
      }),
    );
    /* The signature is written AFTER the row it attests to. */
    const order = [
      mockRecordGovernedAction.mock.invocationCallOrder[0],
      mockPersistSignature.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);
  });
});
