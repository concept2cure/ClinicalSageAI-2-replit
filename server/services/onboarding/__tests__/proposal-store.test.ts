/**
 * Onboarding proposal store — the trust boundary for the governed commit (P3).
 *
 * The property under test: a commit can only ever apply what the SERVER
 * proposed. A caller may name ids and supply edited values; it can never inject
 * provenance, confidence, or a value the server never extracted.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveRun, resolveApprovals, discardRun, __resetRuns } from '../proposal-store';
import type { OnboardingIngestResult, OnboardingProposalField } from '@shared/types/onboarding-ingest';

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

const OWNER = { userId: 7, organizationId: 2 };

beforeEach(() => __resetRuns());

describe('proposal store — commit trust boundary', () => {
  it('resolves an approval against the SERVER’s own proposal, not the request', () => {
    const runId = saveRun(OWNER, result([field()]));
    const out = resolveApprovals(OWNER, runId, [{ id: 'f1' }]);
    expect(out.ok).toBe(true);
    expect(out.approvals).toHaveLength(1);
    // Provenance + confidence come from the stored record.
    expect(out.approvals[0].proposal.provenance.file).toBe('profile.pdf');
    expect(out.approvals[0].proposal.confidence).toBeCloseTo(0.93);
    expect(out.approvals[0].value).toBe('Meridian Therapeutics');
    expect(out.approvals[0].humanEdited).toBe(false);
  });

  it('cannot commit an id the server never proposed — it is reported, not applied', () => {
    const runId = saveRun(OWNER, result([field()]));
    const out = resolveApprovals(OWNER, runId, [{ id: 'forged-id', value: 'Attacker Corp' }]);
    expect(out.approvals).toHaveLength(0);
    expect(out.unknownIds).toEqual(['forged-id']);
  });

  it('accepts a human edit but records it as such, preserving AnA’s original', () => {
    const runId = saveRun(OWNER, result([field()]));
    const out = resolveApprovals(OWNER, runId, [{ id: 'f1', value: 'Typed By Hand Inc' }]);
    expect(out.approvals[0].value).toBe('Typed By Hand Inc');
    expect(out.approvals[0].humanEdited).toBe(true);
    expect(out.approvals[0].proposal.extractedValue).toBe('Meridian Therapeutics');
  });

  it('refuses a run belonging to another user or another org (non-leaky)', () => {
    const runId = saveRun(OWNER, result([field()]));
    const otherUser = resolveApprovals({ userId: 99, organizationId: 2 }, runId, [{ id: 'f1' }]);
    const otherOrg = resolveApprovals({ userId: 7, organizationId: 999 }, runId, [{ id: 'f1' }]);
    expect(otherUser.ok).toBe(false);
    expect(otherOrg.ok).toBe(false);
    // Same message as a missing run — never confirms someone else's run exists.
    expect(otherUser.error).toBe(otherOrg.error);
  });

  it('expires a stale review session rather than serving old proposals', () => {
    const t0 = 1_000_000;
    const runId = saveRun(OWNER, result([field()]), t0);
    const later = t0 + 31 * 60 * 1000;
    const out = resolveApprovals(OWNER, runId, [{ id: 'f1' }], later);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/expired/i);
  });

  it('never writes a blank value', () => {
    const runId = saveRun(OWNER, result([field({ extractedValue: '' , value: '' })]));
    const out = resolveApprovals(OWNER, runId, [{ id: 'f1', value: '   ' }]);
    expect(out.approvals).toHaveLength(0);
  });

  it('ignores duplicate approvals of the same id', () => {
    const runId = saveRun(OWNER, result([field()]));
    const out = resolveApprovals(OWNER, runId, [{ id: 'f1' }, { id: 'f1', value: 'Second Try' }]);
    expect(out.approvals).toHaveLength(1);
    expect(out.approvals[0].value).toBe('Meridian Therapeutics');
  });

  it('leaves nothing behind after a run is discarded', () => {
    const runId = saveRun(OWNER, result([field()]));
    discardRun(runId);
    expect(resolveApprovals(OWNER, runId, [{ id: 'f1' }]).ok).toBe(false);
  });
});
