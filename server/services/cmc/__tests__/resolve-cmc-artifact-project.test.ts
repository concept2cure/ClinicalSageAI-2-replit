import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveProgramProjectAnchor = vi.fn();

vi.mock('../../c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...args: unknown[]) => resolveProgramProjectAnchor(...args),
}));
vi.mock('../../../db/runtime', () => ({ db: {} }));

import { resolveCmcArtifactProject } from '../resolve-cmc-artifact-project';

const ORG = 7;
const PROGRAM_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/**
 * Minimal drizzle-shaped stub: select().from().where().limit() resolves to
 * `rows`. The numeric branch org-scopes its lookup through this chain, so
 * returning a matching row models "owned by the caller" and returning [] models
 * "owned by another org / absent".
 */
function mockDb(rows: Array<{ id: number }>) {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

describe('resolveCmcArtifactProject', () => {
  beforeEach(() => {
    resolveProgramProjectAnchor.mockReset();
  });

  it('resolves a numeric projects.id only when it belongs to the caller org', async () => {
    const r = await resolveCmcArtifactProject(ORG, '42', { db: mockDb([{ id: 42 }]) });
    expect(r).toEqual({ state: 'linked', artifactProjectId: 42, via: 'numeric' });
    expect(resolveProgramProjectAnchor).not.toHaveBeenCalled();
  });

  it('refuses a numeric projects.id that belongs to another org (cross-tenant IDOR)', async () => {
    // org 7 names projects.id 999, which is owned by a DIFFERENT org, so the
    // org-scoped lookup returns no row. The pre-fix code returned
    // { state: 'linked', artifactProjectId: 999, via: 'numeric' } unconditionally
    // — that is the defect. It must now be an honest unresolved state so the CMC
    // artifact spine never resolves against another tenant's project.
    const r = await resolveCmcArtifactProject(ORG, '999', { db: mockDb([]) });
    expect(r.state).toBe('unaddressable');
    expect(r.artifactProjectId).toBeNull();
    expect(resolveProgramProjectAnchor).not.toHaveBeenCalled();
  });

  it('resolves a program uuid through the canonical anchor reader', async () => {
    resolveProgramProjectAnchor.mockResolvedValue(1234);
    const r = await resolveCmcArtifactProject(ORG, PROGRAM_UUID);
    expect(r).toEqual({ state: 'linked', artifactProjectId: 1234, via: 'program-anchor' });
    expect(resolveProgramProjectAnchor).toHaveBeenCalledWith(expect.anything(), {
      programId: PROGRAM_UUID,
      orgId: ORG,
      context: 'cmc-artifact-spine',
    });
  });

  it('reports an unanchored program as a state, not an error or an empty answer', async () => {
    // The anchor legitimately does not exist (no client workspace, ambiguous
    // workspace, or the anchor column is absent). The resolver must say so —
    // callers keep an honest degraded path instead of querying with a uuid
    // that would abort the statement.
    resolveProgramProjectAnchor.mockResolvedValue(null);
    const r = await resolveCmcArtifactProject(ORG, PROGRAM_UUID);
    expect(r.state).toBe('unanchored');
    expect(r.artifactProjectId).toBeNull();
    if (r.state === 'unanchored') expect(r.detail).toMatch(/anchor/i);
  });

  it('refuses ids that address neither spine', async () => {
    for (const bad of ['proj-cmc-1', '', '  ', '12.5', '-3', '0']) {
      const r = await resolveCmcArtifactProject(ORG, bad);
      expect(r.state, `id ${JSON.stringify(bad)}`).toBe('unaddressable');
      expect(r.artifactProjectId).toBeNull();
    }
    expect(resolveProgramProjectAnchor).not.toHaveBeenCalled();
  });
});
