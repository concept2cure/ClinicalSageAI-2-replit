import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { resolveOutlineForType } from '../../regulatory/canonicalDocumentStore';
import { getMandatoryArtifacts } from '../../regulatory/requiredArtifactMatrix';

const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, getPool: () => ({ query: vi.fn() }) }));
vi.mock('../../regulatory/submissionPackageInventory', () => ({ loadSavedSubmissionInventory: h.load }));
const program = '0a000000-0000-4000-8000-00000000000a';
const input = {
  submissionType: 'US_NDA', projectId: 'another-project',
  sections: resolveOutlineForType('US_NDA').filter(s => s.required).map(s => ({ code: s.code, status: 'approved', documentIds: ['made-up'] })),
  artifacts: getMandatoryArtifacts('US_NDA').map(a => ({ type: a.artifactType, status: 'approved', documentId: 'made-up' })),
};
const context = { organizationId: 42, userId: 7, projectRef: program };
const call = async (params: Record<string, unknown>, ctx?: typeof context) => JSON.parse(await getToolHandler('assess_submission_package')!(params, ctx));

beforeEach(() => {
  h.load.mockReset();
  h.load.mockResolvedValue({ programId: program, sections: [], artifacts: [], notices: [] });
});

describe('Anna submission package assessment uses saved project evidence', () => {
  it('requires an active project by default even if the model supplies a project id and approvals', async () => {
    const out = await call(input);
    expect(out.status).toBe('needs_project');
    expect(h.load).not.toHaveBeenCalled();
  });

  it('ignores model approval and project claims when a project is open', async () => {
    const out = await call(input, context);
    expect(out.status).toBe('computed');
    expect(out.assessmentBasis).toBe('saved_canonical_projection');
    expect(out.result.metadata.projectId).toBe(program);
    expect(out.result.metadata.packageComplete).toBe(false);
    expect(out.result.metadata.completedSections).toBe(0);
    expect(h.load).toHaveBeenCalledWith(expect.objectContaining({ context, registryId: 'US_NDA' }));
  });

  it('explicit hypothetical scenarios cannot certify a completed client package', async () => {
    const out = await call({ ...input, mode: 'hypothetical' }, context);
    expect(out.status).toBe('hypothetical');
    expect(out.result.metadata.packageComplete).toBe(false);
    expect(out.result.metadata.sourceIdentitiesPresent).toBe(false);
    expect(out.instruction).toMatch(/hypothetical/i);
    expect(h.load).not.toHaveBeenCalled();
  });

  it.each([{ sections: [null] }, { artifacts: [{ type: 'csr', status: 7 }] }, { sections: [{ code: '1', status: 'approved', documentIds: [null] }] }])('invalid hypothetical rows produce an actionable refusal', async bad => {
    const out = await call({ ...input, ...bad, mode: 'hypothetical' }, context);
    expect(out.status).toBe('needs_parameters');
    expect(out.result).toBeUndefined();
  });

  it('does not turn a failed saved-record read into an empty successful assessment', async () => {
    h.load.mockRejectedValue(new Error('database unavailable'));
    const out = await call(input, context);
    expect(out.status).toBe('error');
    expect(out.result).toBeUndefined();
    expect(out.error).toMatch(/read|assess/i);
  });

  it('reports the assessment limit without suggesting an endlessly failing retry', async () => {
    h.load.mockRejectedValue(Object.assign(new Error('Use the governed Submission Center inventory for this larger package.'), { name: 'SubmissionInventoryScopeLimit' }));
    const out = await call(input, context);
    expect(out.status).toBe('needs_parameters');
    expect(out.message).toMatch(/Submission Center/);
    expect(out.result).toBeUndefined();
  });

  it('refuses a project that cannot be resolved in this tenant', async () => {
    h.load.mockResolvedValue(null);
    const out = await call(input, context);
    expect(out.status).toBe('needs_project');
    expect(out.result).toBeUndefined();
  });

  it('asks for a recognized filing scope before any project read', async () => {
    expect((await call({ ...input, submissionType: 'invented' }, context)).status).toBe('needs_parameters');
    expect(h.load).not.toHaveBeenCalled();
  });
});
