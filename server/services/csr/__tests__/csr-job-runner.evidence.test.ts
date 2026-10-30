/**
 * CSR job runner — results sections drafted over retained engine tables
 * (docs/design/CSR_END_TO_END_2026-10-29.md, slice 2).
 *
 * A job bound to a retained Submission Center run drafts each results section
 * with that section's evidence pack (cortex-authoring-context), and every
 * figure the model writes must reconcile, cell by cell, to the table it names
 * (reconcileCsrTableClaims). Rule 2: the engine supplies the numbers, the
 * model narrates them. A figure off by one fails the section closed — the
 * draft is not stored, its template (with placeholders) is, the lineage says
 * why, and the job ends failed: unresolved_placeholders. Once the figure
 * matches the cell, the same job resumes to complete, and the section records
 * the model id and token cost the gateway reported (no longer model:null,
 * tokenCost:0).
 *
 * Real: the runner, the builder's drafter and outline, the evidence pack,
 * reconciliation and the unsupplied-statistics guard. Stubbed: the drizzle db,
 * the project scope check, the retained-table reader (the source receipt is
 * the one input) and the AI gateway (a model test seam; production drafting
 * stays closed until PQ).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { csrBuildJobs, csrSectionOutputs } from '@shared/schema';
import { buildCsrAuthoringEvidence, CsrAuthoringContextError, type RetainedCsrTables } from '../cortex-authoring-context';

const { chatMock, loadMock, continueMock } = vi.hoisted(() => ({ chatMock: vi.fn(), loadMock: vi.fn(), continueMock: vi.fn() }));
vi.mock('../../../lib/unified-ai-client.js', () => ({ ai: { chat: chatMock, complete: vi.fn() } }));
vi.mock('../cortex-authoring-reader', () => ({ loadCsrAuthoringEvidence: loadMock }));
vi.mock('../../submission-orchestrator-continuation.js', () => ({ continueOrchestratorRunsForCsrJob: continueMock }));
vi.mock('../project-scope', () => ({
  CsrScopeError: class extends Error { constructor(readonly code: string, readonly status: number, m: string) { super(m); } },
  resolveCsrScope: vi.fn(async () => ({ projectId: 11, organizationId: 1 })),
  resolveCsrBuildContext: vi.fn(async () => ({ projectId: 11, organizationId: 1, requestedBy: 5 })),
}));

type Row = { sectionNumber: string; content: string; contentHash: string; aiGenerated?: boolean; model?: string | null; tokenCost?: number; lineage?: Record<string, any> | null };
function makeFakeDb(job: Record<string, any>) {
  const persisted: Row[] = [];
  const select = (cols?: Record<string, unknown>) => {
    let table: unknown;
    const b: any = {
      from(t: unknown) { table = t; return b; }, where() { return b; }, limit() { return b; },
      then(resolve: (rows: unknown[]) => void) {
        if (table === csrBuildJobs) resolve(cols && 'id' in cols ? (job.status === 'drafting' ? [{ id: job.id }] : []) : [job]);
        else if (table === csrSectionOutputs) resolve(persisted.map(r => ({ ...r })));
        else resolve([]);
      },
    };
    return b;
  };
  const db = {
    select,
    update: () => ({ set: (vals: Record<string, unknown>) => ({ where() {
      Object.assign(job, vals);
      const done = Promise.resolve();
      return { then: done.then.bind(done), returning: async () => [{ id: job.id }] };
    } }) }),
    insert: () => ({ values: (v: Row) => ({ onConflictDoUpdate() {
      const i = persisted.findIndex(r => r.sectionNumber === v.sectionNumber);
      if (i >= 0) persisted[i] = { ...v }; else persisted.push({ ...v });
      return Promise.resolve();
    } }) }),
  };
  return { db, persisted, job };
}
let fake: ReturnType<typeof makeFakeDb>;
vi.mock('../../../db', () => ({ get db() { return fake.db; }, pool: { query: vi.fn() } }));

import { runCSRBuildJob } from '../csr-job-runner';
import { CsrScopeError, resolveCsrScope } from '../project-scope';

const PROGRAM = '0b7a1f52-1c9e-4f5a-9d43-5d1c2e8a9b10';
const RUN = '6f2d4c1e-8a3b-4e7f-b2c9-1a0d5e6f7a8b';
const RETAINED: RetainedCsrTables = {
  runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', version: '3', sha256: 'a'.repeat(64), dataCutDate: '2026-06-30',
      studyId: 'STUDY-7', protocolNumber: 'PROTO-7', clinicalVerification: 'not-established' },
    tables: {
      analysisPopulations: { title: 'Analysis populations', headers: ['Population', 'Drug X', 'Placebo'], rows: [['Safety', '114', '112']] },
      aeOverallSummary: { title: 'Overview of TEAEs', headers: ['Category', 'Drug X', 'Placebo'], rows: [['Any TEAE', '12 (10.5%)', '9 (8.0%)']] },
    },
  }],
};
const CLAIM = { table: 'aeOverallSummary', row: 0, column: 1, value: '12 (10.5%)' };
const block = (claims: unknown[]) => `\n\`\`\`csr-claims\n${JSON.stringify(claims)}\n\`\`\``;
const reply = (content: string) => ({ content, model: 'claude-opus-5-5', resolvedModel: 'claude-opus-5-5-20261001', usage: { totalTokens: 1234 } });

/** A stub model: §12.2.1 states the any-TEAE rate as `rate`, the rest state no figure. */
function modelWriting(rate: string, claims: unknown[] = [CLAIM]) {
  chatMock.mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
    const user = messages.find(m => m.role === 'user')!.content;
    if (user.startsWith('Draft ICH E3 Section 12.2.1:')) {
      return reply(`Treatment-emergent adverse events were reported by ${rate} of patients who received Drug X.${block(claims)}`);
    }
    return reply('Adverse events are presented by system organ class and preferred term in the section 14 tables.');
  });
}

function makeJob() {
  return {
    id: 42, status: 'queued', organizationId: 1, projectId: 11, requestedBy: 5, studyId: 'PROTO-7', sectionsToGenerate: ['12.2'],
    studyInfoSnapshot: { studyInfo: { protocolNumber: 'PROTO-7', title: 'Study 7', phase: 'Phase 3', indication: 'Condition', sponsor: 'Sponsor',
      investigationalProduct: 'Drug X', studyDesign: 'randomized, double-blind', primaryEndpoint: 'Response' },
    evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'STUDY-7' } },
  };
}
const row = (n: string) => fake.persisted.find(r => r.sectionNumber === n)!;

beforeEach(() => {
  chatMock.mockReset(); continueMock.mockReset().mockResolvedValue([]);
  vi.mocked(resolveCsrScope).mockReset().mockResolvedValue({ projectId: 11 });
  loadMock.mockReset().mockImplementation(async (_q: unknown, _actor: unknown, selection: any) => buildCsrAuthoringEvidence(RETAINED, selection));
});

describe('a run-bound CSR job drafts §12.2 over the retained tables', () => {
  it('refuses an AE percentage off by one, records why, then completes once the figure matches the cell', async () => {
    fake = makeFakeDb(makeJob());
    modelWriting('11.5%');
    await runCSRBuildJob(42);

    // The run is admitted before work; each model call is bracketed by the
    // exact section pack. A placeholder refuses completion before its final
    // source checks, so no release/continuation is implied by these reads.
    expect(loadMock.mock.calls.map(c => c[2].sectionNumber)).toEqual([
      '2', '12.2.1', '12.2.1', '12.2.2', '12.2.2', '12.2.3', '12.2.3', '12.2.4', '12.2.4',
    ]);
    expect(loadMock.mock.calls[0][1]).toEqual({ organizationId: 1, userId: 5 });
    expect(loadMock.mock.calls.every(call => call[4]?.requireCurrent === true)).toBe(true);
    const evidenceMessage = (chatMock.mock.calls[0][0] as Array<{ content: string }>).at(-1)!.content;
    expect(JSON.parse(evidenceMessage)).toMatchObject({ type: 'retained_csr_evidence', evidence: { sectionNumber: '12.2.1' } });
    expect(fake.job).toMatchObject({ status: 'failed', error: { reason: 'unresolved_placeholders', sections: ['12.2.1'] } });
    expect(row('12.2.1')).toMatchObject({ aiGenerated: false, model: null, tokenCost: 0 });
    expect(row('12.2.1').content).not.toContain('11.5%');
    expect(row('12.2.1').lineage).toMatchObject({ rejectedModelDraft: { reason: 'unreconciled_figures', statistics: [{ kind: 'percentage', text: '11.5%' }] },
      evidence: { runId: RUN, studyId: 'STUDY-7', tables: ['analysisPopulations', 'aeOverallSummary'] } });
    expect(row('12.2.2')).toMatchObject({ aiGenerated: true, model: 'claude-opus-5-5-20261001', tokenCost: 1234 });

    modelWriting('10.5%');
    chatMock.mockClear();
    await runCSRBuildJob(42);

    expect(chatMock).toHaveBeenCalledOnce();
    expect(fake.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    const accepted = row('12.2.1');
    expect(accepted).toMatchObject({ aiGenerated: true, model: 'claude-opus-5-5-20261001', tokenCost: 1234 });
    expect(accepted.content).toBe('Treatment-emergent adverse events were reported by 10.5% of patients who received Drug X.');
    expect(accepted.contentHash).toBe(createHash('sha256').update(accepted.content).digest('hex'));
    expect(accepted.lineage).toMatchObject({ reconciliation: { status: 'matches', basis: 'exact_retained_table_cell',
      findings: [{ status: 'matches', table: 'aeOverallSummary', row: 0, column: 1, expected: '12 (10.5%)' }] } });
    expect(accepted.lineage).not.toHaveProperty('rejectedModelDraft');
    // Slice 5 (2026-10-30): the claim receipts bind each figure to its cell, this exact text and the pack digest.
    expect(accepted.lineage).toMatchObject({ claimReceipts: { schema: 'c2c.csr-claim-receipts.v1', runId: RUN, studyId: 'STUDY-7',
      sectionNumber: '12.2.1', outputSha256: accepted.contentHash, evidenceDigest: (accepted.lineage as { evidence: { evidenceDigest: string } }).evidence.evidenceDigest,
      claims: [{ table: 'aeOverallSummary', row: 0, column: 1, value: '12 (10.5%)' }] } });
  });

  it('refuses a claim whose value is not the cell it names', async () => {
    fake = makeFakeDb(makeJob());
    modelWriting('11.5%', [{ ...CLAIM, value: '12 (11.5%)' }]);
    await runCSRBuildJob(42);
    expect(row('12.2.1').lineage).toMatchObject({ rejectedModelDraft: { reason: 'unreconciled_claims',
      findings: [{ status: 'mismatch', expected: '12 (10.5%)' }] } });
    expect(fake.job).toMatchObject({ status: 'failed', error: { reason: 'unresolved_placeholders' } });
  });

  // Review 2026-10-29: the statistic patterns alone missed a numerator written
  // "13 of 114 patients" and a rate written "11.5 percent", so an invented
  // figure passed beside a claimed one. In an evidence-bound section every
  // number in the prose must be a claimed cell's (or the study information's).
  it.each([
    ['an unclaimed numerator beside a claimed denominator', '13 of 114 patients (10.5%)'],
    ['a rate written in words rather than with a percent sign', '11.5 percent'],
  ])('refuses %s', async (_label, rate) => {
    fake = makeFakeDb(makeJob());
    modelWriting(rate, [CLAIM, { table: 'analysisPopulations', row: 0, column: 1, value: '114' }]);
    await runCSRBuildJob(42);
    expect(row('12.2.1')).toMatchObject({ aiGenerated: false, model: null });
    expect(row('12.2.1').lineage?.rejectedModelDraft?.reason).toBe('unreconciled_figures');
    expect(fake.job).toMatchObject({ status: 'failed', error: { reason: 'unresolved_placeholders' } });
  });

  it('refuses a figure stated with no claim at all', async () => {
    fake = makeFakeDb(makeJob());
    modelWriting('10.5%', []);
    await runCSRBuildJob(42);
    expect(row('12.2.1').lineage?.rejectedModelDraft?.reason).toBe('unreconciled_figures');
  });

  it('fails the job closed, drafting nothing, when the retained source no longer verifies', async () => {
    fake = makeFakeDb(makeJob());
    loadMock.mockRejectedValue(Object.assign(new Error('CSR_SOURCE_RECEIPT_REVOKED'), { status: 409 }));
    modelWriting('10.5%');
    await runCSRBuildJob(42);
    // Admission now fails before a section is selected or a model is called.
    expect(fake.job).toMatchObject({ status: 'failed', error: { message: 'CSR_SOURCE_RECEIPT_REVOKED', section: null } });
    expect(chatMock).not.toHaveBeenCalled();
    expect(fake.persisted).toEqual([]);
  });

  it('refuses evidence retained for another protocol', async () => {
    fake = makeFakeDb({ ...makeJob(), studyId: 'PROTO-8', studyInfoSnapshot: { ...makeJob().studyInfoSnapshot,
      studyInfo: { ...makeJob().studyInfoSnapshot.studyInfo, protocolNumber: 'PROTO-8' } } });
    modelWriting('10.5%');
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { message: 'CSR_EVIDENCE_STUDY_MISMATCH' } });
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('refuses a reply the gateway cannot attribute to a model', async () => {
    fake = makeFakeDb(makeJob());
    chatMock.mockResolvedValue({ content: 'Adverse events are presented in the section 14 tables.', model: '', usage: { totalTokens: 10 } });
    await runCSRBuildJob(42);
    // §12.2.1 falls to its template; §12.2.2–12.2.4 have none and stay unsaved.
    expect(fake.persisted.map(r => r.sectionNumber)).toEqual(['12.2.1']);
    expect(row('12.2.1')).toMatchObject({ aiGenerated: false, model: null });
    expect(row('12.2.1').lineage).toMatchObject({ rejectedModelDraft: { reason: 'model_unattributed' } });
    expect(fake.job).toMatchObject({ status: 'failed', error: { reason: 'missing_section_outputs', sections: ['12.2.2', '12.2.3', '12.2.4'] } });
  });
});

const singleJob = () => ({ ...makeJob(), sectionsToGenerate: ['13'] });
function savedDiscussion(): Row {
  const evidence = buildCsrAuthoringEvidence(RETAINED, { programId: PROGRAM, runId: RUN, studyId: 'STUDY-7', sectionNumber: '13' });
  const content = 'Recorded discussion retained for scientific review.';
  return { sectionNumber: '13', content, contentHash: createHash('sha256').update(content).digest('hex'),
    lineage: { evidence: { runId: evidence.runId, studyId: evidence.studyId, sectionNumber: evidence.sectionNumber,
      sourceSha256: evidence.source.sha256, evidenceDigest: evidence.evidenceDigest } } };
}
function changeEvidence() {
  const changed = globalThis.structuredClone(RETAINED);
  changed.studies[0].source.sha256 = 'b'.repeat(64);
  loadMock.mockImplementation(async (_q: unknown, _actor: unknown, selection: any) => buildCsrAuthoringEvidence(changed, selection));
}

describe('current source admission across asynchronous CSR drafting', () => {
  it.each(['CSR_SOURCE_DATA_UNAVAILABLE', 'CSR_SOURCE_APPROVAL_REQUIRED', 'CSR_SOURCE_CHANGED'])('refuses a late model result after %s without saving it', async code => {
    fake = makeFakeDb(singleJob());
    chatMock.mockImplementation(async () => {
      loadMock.mockRejectedValue(new CsrAuthoringContextError(code, 409));
      return reply('A source-supported discussion awaiting scientific review.');
    });
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { code, message: code } });
    expect(fake.persisted).toEqual([]);
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('refuses a changed source digest between the model request and section save', async () => {
    fake = makeFakeDb(singleJob());
    chatMock.mockImplementation(async () => { changeEvidence(); return reply('A source-supported discussion awaiting scientific review.'); });
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { code: 'CSR_EVIDENCE_CHANGED' } });
    expect(fake.persisted).toEqual([]);
    expect(continueMock).not.toHaveBeenCalled();
  });

  it.each([true, false])('rechecks current edit access after the model even when evidence-bound=%s', async bound => {
    const job = singleJob();
    if (!bound) {
      delete (job.studyInfoSnapshot as { evidenceSource?: unknown }).evidenceSource;
      // Discussion requires results. Use a real metadata-only narrative target
      // so this control reaches the model and its late edit-access recheck.
      job.sectionsToGenerate = ['9.1'];
    }
    fake = makeFakeDb(job);
    chatMock.mockImplementation(async () => {
      vi.mocked(resolveCsrScope).mockRejectedValue(new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'Current project edit access was revoked'));
      return reply('A source-supported discussion awaiting scientific review.');
    });
    await runCSRBuildJob(42);
    expect(chatMock).toHaveBeenCalledOnce();
    expect(fake.job).toMatchObject({ status: 'failed', error: { code: 'CSR_PROJECT_ACCESS_DENIED' } });
    expect(fake.persisted).toEqual([]);
    expect(continueMock).not.toHaveBeenCalled();
  });
});

describe('current retained sources on CSR resume and explicit recovery', () => {
  it.each(['withdrawn', 'changed', 'missing-provenance'])('a fully populated resume still refuses %s evidence and preserves saved work', async mode => {
    fake = makeFakeDb({ ...singleJob(), status: 'failed' });
    const saved = savedDiscussion();
    if (mode === 'missing-provenance') saved.lineage = {};
    fake.persisted.push(saved);
    const before = globalThis.structuredClone(fake.persisted);
    if (mode === 'withdrawn') loadMock.mockRejectedValue(new CsrAuthoringContextError('CSR_SOURCE_DATA_UNAVAILABLE', 409));
    if (mode === 'changed') changeEvidence();
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { code: mode === 'withdrawn'
      ? 'CSR_SOURCE_DATA_UNAVAILABLE' : 'CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH' } });
    expect(fake.persisted).toEqual(before);
    expect(chatMock).not.toHaveBeenCalled();
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('revalidates a fully populated resume and completes without another model call when provenance still matches', async () => {
    fake = makeFakeDb({ ...singleJob(), status: 'failed' });
    fake.persisted.push(savedDiscussion());
    const before = globalThis.structuredClone(fake.persisted);
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'complete', progress: 100 });
    expect(loadMock).toHaveBeenCalled();
    expect(loadMock.mock.calls.every(call => call[4]?.requireCurrent === true)).toBe(true);
    expect(fake.persisted).toEqual(before);
    expect(chatMock).not.toHaveBeenCalled();
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('does not bypass source withdrawal when the selected section has no table mapping', async () => {
    fake = makeFakeDb({ ...singleJob(), sectionsToGenerate: ['6'] });
    loadMock.mockRejectedValue(new CsrAuthoringContextError('CSR_SOURCE_DATA_UNAVAILABLE', 409));
    chatMock.mockResolvedValue(reply('Recorded administration information.'));
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { code: 'CSR_SOURCE_DATA_UNAVAILABLE', section: null } });
    expect(chatMock).not.toHaveBeenCalled();
    expect(fake.persisted).toEqual([]);
  });

  it('retains earlier sections when a later model result loses source eligibility and permits explicit recovery', async () => {
    fake = makeFakeDb(makeJob());
    let calls = 0;
    chatMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) loadMock.mockRejectedValue(new CsrAuthoringContextError('CSR_SOURCE_DATA_UNAVAILABLE', 409));
      return reply('Recorded adverse-event discussion awaiting scientific review.');
    });
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'failed', error: { code: 'CSR_SOURCE_DATA_UNAVAILABLE' } });
    expect(fake.persisted.map(output => output.sectionNumber)).toEqual(['12.2.1']);
    const retained = globalThis.structuredClone(fake.persisted[0]);
    loadMock.mockImplementation(async (_q: unknown, _actor: unknown, selection: any) => buildCsrAuthoringEvidence(RETAINED, selection));
    chatMock.mockClear().mockResolvedValue(reply('Recorded adverse-event discussion awaiting scientific review.'));
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'complete' });
    expect(fake.persisted[0]).toEqual(retained);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});
