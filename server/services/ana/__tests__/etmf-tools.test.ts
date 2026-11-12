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
const store = vi.hoisted(() => ({ readTrialTmf: vi.fn(), listTmfArtifacts: vi.fn(), recordTmfArtifactFiling: vi.fn() }));
vi.mock('../../etmf/tmf-artifact-persistence.js', async (original) => ({ ...(await original<object>()), ...store }));

import { getToolHandler } from '../AnaToolExecutor';
import { assessTmfCompleteness } from '../../etmf/tmf-completeness';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

// create_tmf, seed_tmf, update_tmf_artifact_status and review_tmf_completeness retired on 2026-11-12 (E4 step 3):
// tmf-tools-retired.test.ts.
const TOOLS = ['classify_tmf_artifact', 'get_tmf_view'];

describe('eTMF AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('eTMF AnA tools — context + input guards', () => {
  it('a confirm-class call with no identified member is refused before its handler runs', async () => {
    const out = JSON.parse(await getToolHandler('classify_tmf_artifact')!({ tmf_file_id: 1, artifact_name: 'Protocol' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry refuses a confirm-class call with no identified member before the handler runs.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('classify_tmf_artifact validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('classify_tmf_artifact')!({ tmf_file_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/artifact_name are required/);
  });
  it('get_tmf_view reads only for an identified person', async () => {
    const noOne = JSON.parse(await getToolHandler('get_tmf_view')!({ study_id: 'S-1' }, { organizationId: 1 } as any));
    expect(noOne.code).toBe('PROJECT_ACTOR_REQUIRED');
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

  it('reads the scope asked for, and a study the person cannot open is the store\'s own refusal', async () => {
    await getToolHandler('get_tmf_view')!({ study_id: 'S-1', scope: 'all' }, ctx);
    expect(store.readTrialTmf).toHaveBeenCalledWith('S-1', { organizationId: 1, userId: 5 }, 'all');
    const { TmfArtifactError } = await import('../../etmf/tmf-study-access');
    store.readTrialTmf.mockRejectedValueOnce(new TmfArtifactError('STUDY_NOT_FOUND', 'No study with this id is in a project you can open. Nothing was read or changed.'));
    const refused = JSON.parse(await getToolHandler('get_tmf_view')!({ study_id: 'S-9' }, ctx));
    expect(refused).toEqual({ error: 'No study with this id is in a project you can open. Nothing was read or changed.', code: 'STUDY_NOT_FOUND' });
  });
});

/* E4 step 3, L-1 (2026-11-12; P-124 item 5): classify_tmf_artifact files a record of a study's trial master file through
   the deployed store (recordTmfArtifactFiling), with the person's confirmation and reason. It wrote the retired
   store's tmf_artifacts with a typed status. The store's own filing (study admission, Vault write role, reason floor,
   chained audit row in one transaction) is proven on PostgreSQL in tests/db/etmf-governed-filing.dbtest.ts. */
describe('classify_tmf_artifact files through the deployed store', () => {
  const confirmed = { organizationId: 1, userId: 5, humanConfirmed: true } as any;
  const WHY = 'Signed protocol received from the sponsor.';
  const call = async (input: Record<string, unknown>) => JSON.parse(await getToolHandler('classify_tmf_artifact')!(input, confirmed));
  beforeEach(() => {
    store.recordTmfArtifactFiling.mockReset().mockImplementation(async (i: any) => ({ id: 'f-1', documentRef: i.documentRef }));
  });

  it('files the record the name is, for the study, against the Vault document, with the person\'s reason', async () => {
    const out = await call({ study_id: 'S-1', artifact_name: 'Protocol and amendments', document_id: 'd1', reason: WHY });
    expect(store.recordTmfArtifactFiling).toHaveBeenCalledWith(
      { trialId: 'S-1', artifactCode: 'protocol', documentRef: 'vault://d1', reason: WHY }, { organizationId: 1, userId: 5 });
    expect(out).toMatchObject({ ok: true, filingId: 'f-1', artifactCode: 'protocol', zone: 2 });
    expect(out.message).toMatch(/^Filed Protocol and amendments \(zone 2\) for study S-1 against Vault document d1\./);
  });

  it('a record noted with no document is said not to count as filed', async () => {
    const out = await call({ study_id: 'S-1', artifact_name: 'protocol', reason: WHY });
    expect(store.recordTmfArtifactFiling.mock.calls[0][0]).toMatchObject({ documentRef: null });
    expect(out.message).toMatch(/with no document: it does not count as filed/);
  });

  it.each([
    ['holiday-photos-notes', /matches no record of the DIA TMF Reference Model/],
    ['Monitoring visit report site 04', /belongs in zone \d+ \(.+\) but is not one of its records|matches no record|names records of two zones/],
  ])('"%s" is no record of the reference model: refused, nothing filed, AnA asks which record', async (name, why) => {
    const out = await call({ study_id: 'S-1', artifact_name: name, reason: WHY });
    expect(out.code).toBe('TMF_RECORD_NOT_NAMED');
    expect(out.error).toMatch(why);
    expect(out.error).toMatch(/Ask the user which record it is/);
    expect(store.recordTmfArtifactFiling).not.toHaveBeenCalled();
  });

  it('without the person\'s reason nothing is filed', async () => {
    const out = await call({ study_id: 'S-1', artifact_name: 'protocol' });
    expect(out.error).toBeTruthy();
    expect(store.recordTmfArtifactFiling).not.toHaveBeenCalled();
  });

  it('a refusal of the store is passed on with its code', async () => {
    const { TmfArtifactError } = await import('../../etmf/tmf-study-access');
    store.recordTmfArtifactFiling.mockRejectedValueOnce(new TmfArtifactError('DOCUMENT_NOT_IN_PROJECT', "That Vault document is not held in this study's project."));
    const out = await call({ study_id: 'S-1', artifact_name: 'protocol', document_id: 'd9', reason: WHY });
    expect(out).toEqual({ error: "That Vault document is not held in this study's project.", code: 'DOCUMENT_NOT_IN_PROJECT' });
  });
});
