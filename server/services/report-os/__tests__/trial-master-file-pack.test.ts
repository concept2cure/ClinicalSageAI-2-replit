/**
 * The trial master file report pack (`etmf.completeness_pack`) reads the deployed store, as the person who runs it
 * (eTMF convergence E4 step 1, docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md §5; P-74, P-75, P-124 item 5).
 *
 * Until 2026-11-12 its case counted `tmf_files` and `tmf_artifacts` (the second store, on no deploy path) for the whole
 * organization with no person named, and reported `finalPct` from statuses a person typed. On a deployed database
 * the run failed on a missing table.
 *
 * Here the project-access rule, the study list and the store's read are doubled; each study's answer is the real
 * assessment (tmf-completeness.ts) over its filings, so every figure is the service's own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessTmfCompleteness, type TmfDocumentEvidence } from '../../etmf/tmf-completeness';

const H = vi.hoisted(() => ({
  anchors: [] as Array<{ programId: string; projectId: number; clientWorkspaceId: number | null }>,
  designs: {} as Record<string, Array<{ studyId: string }>>,
  tmf: {} as Record<string, unknown>,
  readError: null as unknown,
  query: vi.fn(),
  stillCurrent: vi.fn(),
}));

vi.mock('../../../db', () => ({ pool: { query: H.query } }));
vi.mock('../../c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'ProgramReadAccessError'; }
  }
  return {
    ProgramReadAccessError,
    getCurrentAccessibleProgramScope: vi.fn(async () => ({ reconciliationRequired: false, programIds: H.anchors.map((a) => a.programId) })),
    verifiedProgramAnchors: vi.fn(() => H.anchors),
    requireProgramScopeStillCurrent: H.stillCurrent,
  };
});
vi.mock('../../study-design/study-design-repository', () => ({
  listStudyDesigns: vi.fn(async (_org: number, opts: { programId: string }) => H.designs[opts.programId] ?? []),
}));
vi.mock('../../etmf/tmf-artifact-persistence', () => {
  class TmfArtifactError extends Error { constructor(readonly code: string, message: string) { super(message); } }
  return {
    TmfArtifactError,
    readTrialTmf: vi.fn(async (studyId: string) => {
      if (H.readError) throw H.readError;
      return H.tmf[studyId];
    }),
  };
});

import { computeDomainReport } from '../research-compliance-report-providers';
import { ReportTypeNotComputed, computeRunForType } from '../compute-run';
import { TrialMasterFilePackUnavailable } from '../trial-master-file-pack';

const ORG = 7;
const P1 = '0a000000-0000-4000-8000-00000000000a';
const P2 = '0b000000-0000-4000-8000-00000000000b';
const actor = { recordContext: { executor: { query: vi.fn() } as never, userId: 5 } };
const account = { scopeType: 'account', scopeId: String(ORG), ...actor };

type Row = { code: string; evidence?: TmfDocumentEvidence; notApplicable?: string };
/** A study's TrialTmf, as readTrialTmf answers it: its filings, and the service's assessment of them. */
function trialTmf(studyId: string, programId: string, rows: Row[]) {
  const filed = rows.filter((r) => !r.notApplicable);
  const completeness = assessTmfCompleteness({
    providedArtifacts: filed.map((r) => r.code), scope: 'essential',
    documentEvidence: Object.fromEntries(filed.map((r) => [r.code, r.evidence ?? 'verified'])),
    notApplicable: rows.filter((r) => r.notApplicable).map((r) => r.code),
  });
  const study = { id: 1, studyId, programId, protocolId: `PROT-${studyId}`, title: `Study ${studyId}`, phase: '2', indication: 'x', status: 'draft' };
  return {
    study,
    filings: rows.map((r, i) => ({ id: `f${i}`, artifactCode: r.code, documentRef: r.notApplicable ? null : 'vault://d', notApplicableReason: r.notApplicable ?? null })),
    completeness: { ...completeness, study },
  };
}

beforeEach(() => {
  H.anchors = [{ programId: P1, projectId: 11, clientWorkspaceId: null }, { programId: P2, projectId: 12, clientWorkspaceId: null }];
  H.designs = {};
  H.tmf = {};
  H.readError = null;
  H.query.mockReset();
  H.stillCurrent.mockReset().mockResolvedValue(undefined);
});

describe('the trial master file pack reads the deployed store, as the person who runs it', () => {
  it('counts each study of the projects the person can open, from the store\'s own assessment; it reads no retired table', async () => {
    H.designs = { [P1]: [{ studyId: 'S-1' }], [P2]: [{ studyId: 'S-2' }] };
    H.tmf = {
      'S-1': trialTmf('S-1', P1, [{ code: 'protocol' }, { code: 'tmf_plan', evidence: 'no_document' }, { code: 'monitoring_plan', notApplicable: 'Single-country study.' }]),
      'S-2': trialTmf('S-2', P2, [{ code: 'protocol', evidence: 'unresolved' }]),
    };
    const result = await computeDomainReport('etmf.completeness_pack', ORG, account);
    expect(H.query).not.toHaveBeenCalled();
    expect(result!.provider).toMatchObject({ provider: 'etmf', status: 'ready' });
    expect(result!.accessProjectIds).toEqual([11, 12]);
    expect(result!.computedScope).toBe('organization');
    const s = result!.summary as Record<string, any>;
    expect(s).toMatchObject({ studies: 2, studiesWithAFiling: 2, filings: 3, studiesNotReady: 2, studiesReady: 0, essentialRecordsNotApplicable: 1 });
    expect(s.filingsByDocumentEvidence).toEqual({ verified: 1, no_document: 1, unresolved: 1, unverifiable: 0 });
    const s1 = s.byStudy.find((r: any) => r.study === 'S-1');
    expect(s1).toMatchObject({ filings: 2, present: 1, notApplicable: 1, filedWithoutAVerifiedDocument: 1, ready: 'no' });
    expect(s1.required + s1.notApplicable).toBe(s.byStudy.find((r: any) => r.study === 'S-2').required);
    // Nothing of the retired pack's figures: no stated status, no percentage.
    expect(s).not.toHaveProperty('finalPct');
    expect(s).not.toHaveProperty('byStatus');
    expect(s).not.toHaveProperty('tmfFiles');
    expect(H.stillCurrent).toHaveBeenCalled();
  });

  it('is refused with no person named: a trial master file is read as someone', async () => {
    await expect(computeDomainReport('etmf.completeness_pack', ORG, { scopeType: 'account', scopeId: String(ORG) }))
      .rejects.toMatchObject({ name: 'TrialMasterFilePackUnavailable', code: 'TMF_PACK_ACTOR_REQUIRED' });
  });

  it('is computed for one project or this organization, and refuses any other scope or an unverified project', async () => {
    await expect(computeDomainReport('etmf.completeness_pack', ORG, { scopeType: 'study', scopeId: 'S-1', ...actor }))
      .rejects.toBeInstanceOf(TrialMasterFilePackUnavailable);
    await expect(computeDomainReport('etmf.completeness_pack', ORG, { scopeType: 'project', scopeId: '99', ...actor }))
      .rejects.toMatchObject({ code: 'TMF_PACK_PROJECT_UNVERIFIED' });
  });

  it('a project run reads only that project\'s studies', async () => {
    H.designs = { [P1]: [{ studyId: 'S-1' }], [P2]: [{ studyId: 'S-2' }] };
    H.tmf = { 'S-1': trialTmf('S-1', P1, [{ code: 'protocol' }]), 'S-2': trialTmf('S-2', P2, [{ code: 'protocol' }]) };
    const result = await computeDomainReport('etmf.completeness_pack', ORG, { scopeType: 'project', scopeId: '12', ...actor });
    expect(result!.computedScope).toBe('project');
    expect((result!.summary as any).byStudy.map((r: any) => r.study)).toEqual(['S-2']);
    expect(result!.accessProjectIds).toEqual([12]);
  });

  it('no study and no filing are each said as what they are, never as zeros', async () => {
    const none = await computeDomainReport('etmf.completeness_pack', ORG, account);
    expect(none!.provider).toMatchObject({ status: 'missing', blocker: expect.stringMatching(/has a protocol-design study, so there is no trial master file/) });
    H.designs = { [P1]: [{ studyId: 'S-1' }] };
    H.tmf = { 'S-1': trialTmf('S-1', P1, []) };
    const unfiled = await computeDomainReport('etmf.completeness_pack', ORG, account);
    expect(unfiled!.provider).toMatchObject({ status: 'missing', blocker: expect.stringMatching(/No trial master file filing is recorded/) });
  });

  it('a study read that fails is an error, never a study left out of the count', async () => {
    H.designs = { [P1]: [{ studyId: 'S-1' }] };
    H.readError = new Error('connection reset');
    await expect(computeDomainReport('etmf.completeness_pack', ORG, account)).rejects.toThrow('connection reset');
  });

  it('a project at the study list\'s cap is refused, not truncated', async () => {
    H.designs = { [P1]: Array.from({ length: 200 }, (_, i) => ({ studyId: `S-${i}` })) };
    await expect(computeDomainReport('etmf.completeness_pack', ORG, account)).rejects.toMatchObject({ code: 'TMF_PACK_STUDY_LIMIT' });
  });

  it('a run with no person is answered as a report not computed, not as an error or an empty register', async () => {
    await expect(computeRunForType({ engine: 'domain', typeId: 'etmf.completeness_pack', organizationId: ORG, scopeType: 'account', scopeId: String(ORG) }))
      .rejects.toBeInstanceOf(ReportTypeNotComputed);
  });
});
