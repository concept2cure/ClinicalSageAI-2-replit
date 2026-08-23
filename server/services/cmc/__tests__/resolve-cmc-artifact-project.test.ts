import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveProgramProjectAnchor = vi.fn();

vi.mock('../../c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...args: unknown[]) => resolveProgramProjectAnchor(...args),
}));
vi.mock('../../../db/runtime', () => ({ db: {} }));

import { resolveCmcArtifactProject } from '../resolve-cmc-artifact-project';

const ORG = 7;
const PROGRAM_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('resolveCmcArtifactProject', () => {
  beforeEach(() => {
    resolveProgramProjectAnchor.mockReset();
  });

  it('passes a numeric legacy projects.id straight through', async () => {
    const r = await resolveCmcArtifactProject(ORG, '42');
    expect(r).toEqual({ state: 'linked', artifactProjectId: 42, via: 'numeric' });
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
