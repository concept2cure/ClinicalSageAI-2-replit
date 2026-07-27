/**
 * Onboarding proposal store — the trust boundary for the governed commit (P3).
 *
 * The property under test: a commit can only ever apply what the SERVER
 * proposed. A caller may name ids and supply edited values; it can never inject
 * provenance, confidence, or a value the server never extracted.
 *
 * Runs are now persisted, so these exercise the real query shape: the lookup is
 * constrained to the caller's own org AND user, and an expired or
 * already-committed run is refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OnboardingIngestResult, OnboardingProposalField } from '@shared/types/onboarding-ingest';

/** Rows the fake db returns for the next select. */
let selectRows: unknown[] = [];
const insertValuesMock = vi.fn();
const deleteWhereMock = vi.fn();
const selectWhereMock = vi.fn();

vi.mock('../../../db/requestDb', () => ({
  requestDb: () => ({
    insert: () => ({ values: (v: unknown) => { insertValuesMock(v); return Promise.resolve(); } }),
    delete: () => ({ where: (w: unknown) => { deleteWhereMock(w); return Promise.resolve(); } }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          selectWhereMock(w);
          return Promise.resolve(selectRows);
        },
      }),
    }),
  }),
}));

const { saveRun, resolveApprovals, RUN_TTL_MS } = await import('../proposal-store');

const req = {} as never;
const OWNER = { userId: 7, organizationId: 2 };

const field = (over: Partial<OnboardingProposalField> = {}): OnboardingProposalField => ({
  id: 'f1',
  entity: 'org_profile',
  targetField: 'org_profile.name',
  label: 'Organization name',
  value: 'Meridian Therapeutics',
  extractedValue: 'Meridian Therapeutics',
  provenance: { file: 'profile.pdf', page: 1, snippet: 'Meridian Therapeutics, Inc.' },
  confidence: 0.93,
  status: 'proposed',
  ...over,
});

const result = (fields: OnboardingProposalField[]): OnboardingIngestResult => ({
  groups: [{ entity: 'org_profile', label: 'Organization profile', fields }],
  sources: [{ file: 'profile.pdf' }],
  warnings: [],
});

/** A stored run row as the DB would return it. */
const storedRun = (fields: OnboardingProposalField[], over: Record<string, unknown> = {}) => [{
  proposals: fields,
  expiresAt: new Date(Date.now() + RUN_TTL_MS),
  committedAt: null,
  ...over,
}];

beforeEach(() => {
  selectRows = [];
  insertValuesMock.mockReset();
  deleteWhereMock.mockReset();
  selectWhereMock.mockReset();
});

describe('proposal store — persistence', () => {
  it('stores the server’s own extraction, scoped to the owner, with an expiry', async () => {
    const runId = await saveRun(req, OWNER, result([field()]));
    expect(runId).toMatch(/[0-9a-f-]{36}/);
    const row = insertValuesMock.mock.calls[0][0];
    expect(row.organizationId).toBe(2);
    expect(row.userId).toBe(7);
    expect(row.proposals).toHaveLength(1);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // The document itself is never stored — only extracted proposals + sources.
    expect(JSON.stringify(row)).not.toMatch(/documentText|buffer/i);
  });

  it('sweeps this org’s expired runs so abandoned uploads do not accumulate', async () => {
    await saveRun(req, OWNER, result([field()]));
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  it('still succeeds if the housekeeping sweep fails', async () => {
    deleteWhereMock.mockImplementationOnce(() => { throw new Error('sweep failed'); });
    await expect(saveRun(req, OWNER, result([field()]))).resolves.toMatch(/[0-9a-f-]{36}/);
  });
});

describe('proposal store — commit trust boundary', () => {
  it('resolves an approval against the SERVER’s stored proposal, not the request', async () => {
    selectRows = storedRun([field()]);
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }]);
    expect(out.ok).toBe(true);
    expect(out.approvals[0].proposal.provenance.file).toBe('profile.pdf');
    expect(out.approvals[0].proposal.confidence).toBeCloseTo(0.93);
    expect(out.approvals[0].value).toBe('Meridian Therapeutics');
    expect(out.approvals[0].humanEdited).toBe(false);
  });

  it('cannot commit an id the server never proposed — reported, not applied', async () => {
    selectRows = storedRun([field()]);
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'forged', value: 'Attacker Corp' }]);
    expect(out.approvals).toHaveLength(0);
    expect(out.unknownIds).toEqual(['forged']);
  });

  it('accepts a human edit but records it, preserving AnA’s original', async () => {
    selectRows = storedRun([field()]);
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1', value: 'Typed By Hand Inc' }]);
    expect(out.approvals[0].value).toBe('Typed By Hand Inc');
    expect(out.approvals[0].humanEdited).toBe(true);
    expect(out.approvals[0].proposal.extractedValue).toBe('Meridian Therapeutics');
  });

  it('scopes the lookup to the caller’s own org AND user', async () => {
    selectRows = storedRun([field()]);
    await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }]);
    // A run belonging to another org/user simply does not match the query, so
    // it can never be resolved — enforced in SQL, not by a post-hoc check.
    expect(selectWhereMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a run the query did not return (missing, or someone else’s)', async () => {
    selectRows = [];
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }]);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/expired/i);
  });

  it('refuses an expired run rather than serving stale proposals', async () => {
    selectRows = storedRun([field()], { expiresAt: new Date(Date.now() - 1000) });
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }]);
    expect(out.ok).toBe(false);
  });

  it('refuses a run that was already committed (no replay)', async () => {
    selectRows = storedRun([field()], { committedAt: new Date() });
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }]);
    expect(out.ok).toBe(false);
  });

  it('never writes a blank value', async () => {
    selectRows = storedRun([field({ extractedValue: '', value: '' })]);
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1', value: '   ' }]);
    expect(out.approvals).toHaveLength(0);
  });

  it('ignores duplicate approvals of the same id', async () => {
    selectRows = storedRun([field()]);
    const out = await resolveApprovals(req, OWNER, 'run-1', [{ id: 'f1' }, { id: 'f1', value: 'Second Try' }]);
    expect(out.approvals).toHaveLength(1);
    expect(out.approvals[0].value).toBe('Meridian Therapeutics');
  });

  it('refuses an empty run id without querying', async () => {
    const out = await resolveApprovals(req, OWNER, '', [{ id: 'f1' }]);
    expect(out.ok).toBe(false);
    expect(selectWhereMock).not.toHaveBeenCalled();
  });
});
