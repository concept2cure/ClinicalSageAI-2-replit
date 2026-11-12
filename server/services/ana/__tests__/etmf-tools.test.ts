/**
 * eTMF AnA tools (C2C-08) — registration + input guards.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
// 2026-09-28: a confirm-class call now also needs an editor role, read from
// organization_users (AnaToolExecutor writeRoleRefusal). The database is mocked
// here, so the confirming person is modelled as a 'member'. The role gate itself
// is tested in confirmed-write-role-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
beforeEach(() => resolveSignerOrgRole.mockClear());

// The deployed trial master file store, doubled (eTMF convergence E4 step 2): what readTrialTmf and listTmfArtifacts
// answer for a study. Each answer is the real assessment (tmf-completeness.ts) over the filings below.
const store = vi.hoisted(() => ({ readTrialTmf: vi.fn(), listTmfArtifacts: vi.fn() }));
vi.mock('../../etmf/tmf-artifact-persistence.js', async (original) => ({ ...(await original<object>()), ...store }));

import { getToolHandler } from '../AnaToolExecutor';
import { assessTmfCompleteness } from '../../etmf/tmf-completeness';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_tmf', 'classify_tmf_artifact', 'review_tmf_completeness', 'get_tmf_view'];

describe('eTMF AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('eTMF AnA tools — context + input guards', () => {
  it('create_tmf refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_tmf')!({ title: 'X' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry now refuses a confirm-class call with no identified
    // member before the handler (and its own tenant + user guard) runs.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('classify_tmf_artifact validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('classify_tmf_artifact')!({ tmf_file_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/artifact_name are required/);
  });
  it('review_tmf_completeness reads only for an identified person, and only a named study', async () => {
    const noOne = JSON.parse(await getToolHandler('review_tmf_completeness')!({ study_id: 'S-1' }, { organizationId: 1 } as any));
    expect(noOne.code).toBe('PROJECT_ACTOR_REQUIRED');
    const noStudy = JSON.parse(await getToolHandler('review_tmf_completeness')!({ tmf_file_id: 3 }, { organizationId: 1, userId: 5 } as any));
    expect(noStudy.code).toBe('TMF_STUDY_ID_REQUIRED');
    expect(store.readTrialTmf).not.toHaveBeenCalled();
  });
});

/* eTMF convergence E4 step 2 (2026-11-12): get_tmf_view and review_tmf_completeness read the deployed store. They read
   the retired store's tmf_files and tmf_artifacts, which no deploy creates, and answered a percentage of statuses a
   person typed. "Ask AnA which gaps an inspector would raise", on the trial master file page, calls them. */
describe('AnA reads a study\'s trial master file from the deployed store', () => {
  const STUDY = { id: 1, studyId: 'S-1', programId: 'p-1', protocolId: 'PROT-1', title: 'Phase 2 study', phase: '2', indication: 'x', status: 'draft' };
  const ctx = { organizationId: 1, userId: 5 } as any;
  beforeEach(() => {
    const completeness = assessTmfCompleteness({ providedArtifacts: ['protocol'], scope: 'essential', documentEvidence: { protocol: 'verified' }, notApplicable: ['tmf_plan'] });
    store.readTrialTmf.mockReset().mockResolvedValue({ study: STUDY, filings: [], completeness: { ...completeness, study: STUDY } });
    store.listTmfArtifacts.mockReset().mockResolvedValue([
      { id: 'f1', artifactCode: 'protocol', zoneNumber: 2, documentRef: 'vault://d1', notApplicableReason: null, filedByName: 'Dana Reyes', filedAt: '2026-11-12T00:00:00.000Z',
        document: { id: 'd1', title: 'Protocol v1', version: '1.0', current: true, lifecycleStage: 'approved' } },
      { id: 'f2', artifactCode: 'tmf_plan', zoneNumber: 1, documentRef: null, notApplicableReason: 'Covered by the sponsor-level plan.', filedByName: 'Dana Reyes', filedAt: '2026-11-12T00:00:00.000Z', document: null },
    ]);
  });

  it('get_tmf_view with study_id: the store\'s readiness and counts as they are, the filings, and the declarations apart', async () => {
    const out = JSON.parse(await getToolHandler('get_tmf_view')!({ study_id: 'S-1' }, ctx));
    expect(store.readTrialTmf).toHaveBeenCalledWith('S-1', { organizationId: 1, userId: 5 }, 'essential');
    expect(out).toMatchObject({ ok: true, readiness: 'not ready', study: { studyId: 'S-1' } });
    expect(out.completeness.summary).toMatchObject({ totalNotApplicable: 1 });
    expect(out.filings.map((f: any) => f.artifactCode)).toEqual(['protocol']);
    expect(out.filings[0]).toMatchObject({ documentEvidence: 'verified', filedBy: 'Dana Reyes', document: { lifecycleStage: 'approved' } });
    expect(out.notApplicable).toEqual([expect.objectContaining({ artifactCode: 'tmf_plan', reason: 'Covered by the sponsor-level plan.', declaredBy: 'Dana Reyes' })]);
    expect(out.message).toMatch(/Readiness: not ready\./);
    expect(out.message).toMatch(/1 declared not applicable to this study, each with a reason/);
    expect(JSON.stringify(out)).not.toMatch(/completenessPct|%/);
  });

  it('get_tmf_view named by the retired store\'s id is refused, never read as "list everything"', async () => {
    const out = JSON.parse(await getToolHandler('get_tmf_view')!({ tmf_file_id: 3 }, ctx));
    expect(out.code).toBe('TMF_STUDY_ID_REQUIRED');
    expect(store.readTrialTmf).not.toHaveBeenCalled();
  });

  it('review_tmf_completeness answers the same readiness, and a study the person cannot open is the store\'s own refusal', async () => {
    const out = JSON.parse(await getToolHandler('review_tmf_completeness')!({ study_id: 'S-1', scope: 'all' }, ctx));
    expect(store.readTrialTmf).toHaveBeenCalledWith('S-1', { organizationId: 1, userId: 5 }, 'all');
    expect(out).toMatchObject({ ok: true, readiness: 'not ready' });
    const { TmfArtifactError } = await import('../../etmf/tmf-study-access');
    store.readTrialTmf.mockRejectedValueOnce(new TmfArtifactError('STUDY_NOT_FOUND', 'No study with this id is in a project you can open. Nothing was read or changed.'));
    const refused = JSON.parse(await getToolHandler('review_tmf_completeness')!({ study_id: 'S-9' }, ctx));
    expect(refused).toEqual({ error: 'No study with this id is in a project you can open. Nothing was read or changed.', code: 'STUDY_NOT_FOUND' });
  });
});
