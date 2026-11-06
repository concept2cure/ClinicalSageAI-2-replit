/** A combined report must not seal an earlier project's observed-stale facts. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeRecordSnapshot } from '../../qms/project-evidence';

const h = vi.hoisted(() => ({ collect: vi.fn(), scope: vi.fn(), anchors: vi.fn(), current: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../../qms/project-evidence', () => ({
  readQualityProjectEvidence: h.collect,
  QualityEvidenceUnavailable: class extends Error {},
}));
vi.mock('../../c2c/current-program-access', () => ({
  getCurrentAccessibleProgramScope: h.scope, verifiedProgramAnchors: h.anchors, requireProgramScopeStillCurrent: h.current,
}));

import { computeDomainReport } from '../research-compliance-report-providers';
import { computeDomainRun } from '../report-engine';

const TYPE = 'compliance.audit_assurance_pack';
const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
const q = { query: vi.fn() }, recordContext = { userId: 5, executor: q };
const snapshot = (key: string, sourceScope: 'project' | 'organization' = 'project'): NativeRecordSnapshot => ({
  key, title: key, text: JSON.stringify({ observation: `${key} initially collected` }), version: null,
  sourceScope, lifecycle: 'open', native: { kind: 'capa_records', id: key },
});
const first = snapshot('project-a'), second = snapshot('project-b'), organization = snapshot('organization', 'organization');

beforeEach(() => {
  vi.resetAllMocks();
  h.scope.mockResolvedValue({ actor: { userId: 5, role: 'member' }, programIds: [A, B], reconciliationRequired: false });
  h.anchors.mockReturnValue([{ programId: A, projectId: 11, clientWorkspaceId: 71 }, { programId: B, projectId: 12, clientWorkspaceId: 72 }]);
  h.current.mockResolvedValue(undefined);
  h.collect.mockImplementation(async (_q, input) => input.programId === A ? [first, organization] : [second, organization]);
});

describe('combined Quality report collection freshness', () => {
  it.each([
    ['changed text', [{ ...first, text: '{"observation":"Changed while project B loaded"}' }, organization]],
    ['changed lifecycle', [{ ...first, lifecycle: 'closed_not_effective' }, organization]],
    ['changed title', [{ ...first, title: 'Corrected current title' }, organization]],
    ['changed version', [{ ...first, version: '2' }, organization]],
    ['changed native identity', [{ ...first, native: { ...first.native, id: 'another-record' } }, organization]],
    ['changed native family', [{ ...first, native: { ...first.native, kind: 'capa_actions' } }, organization]],
    ['changed authored binding', [{ ...first, native: { ...first.native, authoringDocumentId: B } }, organization]],
    ['changed scope', [{ ...first, sourceScope: 'organization' as const }, organization]],
    ['removed record', [organization]],
    ['new record', [first, snapshot('new-project-a-record'), organization]],
    ['duplicate current key', [first, first]],
  ])('refuses %s in project A observed after collecting project B', async (_case, changed) => {
    let laterProjectCollected = false;
    h.collect.mockImplementation(async (_q, input) => {
      if (input.programId === B) { laterProjectCollected = true; return [second, organization]; }
      return laterProjectCollected ? changed : [first, organization];
    });
    await expect(computeDomainRun(TYPE, 7, 'account', '7', { recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('retains exact stable facts, scopes and partial status regardless of collection order', async () => {
    let reads = 0;
    h.collect.mockImplementation(async (_q, input) => {
      reads += 1;
      const records = input.programId === A ? [first, organization] : [second, organization];
      return reads <= 2 ? records : [...records].reverse();
    });
    const report = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext });
    expect(report).toMatchObject({ accessProjectIds: [11, 12], provider: { status: 'partial' },
      summary: { projectEvidenceSnapshots: 2, organizationEvidenceSnapshots: 1,
        qualityEvidence: { records: [organization, first, second] } } });
    expect(h.current).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5 }, await h.scope.mock.results[0].value);
  });

  it('refuses a newly added record in a project that was empty on initial collection', async () => {
    let laterProjectCollected = false;
    h.collect.mockImplementation(async (_q, input) => {
      if (input.programId === B) { laterProjectCollected = true; return [second, organization]; }
      return laterProjectCollected ? [first] : [];
    });
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('refuses changed explicit organization context when no project is accessible', async () => {
    h.anchors.mockReturnValue([]);
    h.collect.mockResolvedValueOnce([organization]).mockResolvedValueOnce([{ ...organization, lifecycle: 'withdrawn' }]);
    await expect(computeDomainRun(TYPE, 7, 'account', '7', { recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('refuses duplicate initial keys instead of collapsing ambiguous native observations', async () => {
    h.collect.mockImplementation(async (_q, input) => input.programId === A ? [first, first, organization] : [second, organization]);
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('refuses record migration between projects even when the global record set would be unchanged', async () => {
    let reads = 0;
    h.collect.mockImplementation(async (_q, input) => {
      reads += 1;
      const originalOwner = input.programId === A;
      return [(reads <= 2 ? originalOwner : !originalOwner) ? first : second, organization];
    });
    await expect(computeDomainRun(TYPE, 7, 'account', '7', { recordContext })).rejects.toThrow(/changed during collection/);
  });

  it('rechecks project access after the final native freshness collection', async () => {
    let reads = 0, permissionRevoked = false;
    h.collect.mockImplementation(async (_q, input) => {
      reads += 1;
      if (reads === 4) permissionRevoked = true;
      return input.programId === A ? [first, organization] : [second, organization];
    });
    h.current.mockImplementation(async () => {
      if (permissionRevoked) throw Object.assign(new Error('Access changed'), { code: 'PROJECT_ACCESS_CHANGED' });
    });
    await expect(computeDomainRun(TYPE, 7, 'account', '7', { recordContext })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
  });
});
