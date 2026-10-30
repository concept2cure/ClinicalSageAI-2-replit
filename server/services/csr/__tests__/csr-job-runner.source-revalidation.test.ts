/** The real runner must not save a late model reply or bless a resumed build
 * against a different or no-longer-readable retained source. The model,
 * source reader and project policy are controlled seams; E3 target selection,
 * evidence digests, output checksums and the job state machine remain real. */
import { createHash } from 'node:crypto';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { csrBuildJobs, csrSectionOutputs } from '@shared/schema';
import { buildCsrAuthoringEvidence, type CsrAuthoringEvidence, type RetainedCsrTables } from '../cortex-authoring-context';
import type { CSRBuildRequest } from '../../csr-builder';

const mocks = vi.hoisted(() => ({ draft: vi.fn(), load: vi.fn(), scope: vi.fn(), continuation: vi.fn() }));
vi.mock('../../csr-builder', async () => ({
  ...await vi.importActual<typeof import('../../csr-builder')>('../../csr-builder'),
  draftCSRSectionWithProvenance: mocks.draft,
}));
vi.mock('../cortex-authoring-reader', () => ({ loadCsrAuthoringEvidence: mocks.load }));
vi.mock('../../submission-orchestrator-continuation.js', () => ({ continueOrchestratorRunsForCsrJob: mocks.continuation }));
vi.mock('../project-scope', () => ({
  CsrScopeError: class extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  resolveCsrScope: mocks.scope,
  resolveCsrBuildContext: vi.fn(),
}));

const PROGRAM = '0b7a1f52-1c9e-4f5a-9d43-5d1c2e8a9b10';
const OTHER_PROGRAM = '0b7a1f52-1c9e-4f5a-9d43-5d1c2e8a9b11';
const RUN = '6f2d4c1e-8a3b-4e7f-b2c9-1a0d5e6f7a8b';
const SECTION = '12.2.1';
const content = 'The retained adverse-event findings require independent scientific review.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const dialect = new PgDialect();
const info: CSRBuildRequest['studyInfo'] = {
  protocolNumber: 'PROTO-7', title: 'Study 7', phase: 'Phase 3', indication: 'Condition', sponsor: 'Sponsor',
  investigationalProduct: 'Drug X', studyDesign: 'randomized, double-blind', primaryEndpoint: 'Response',
};
const retained: RetainedCsrTables = {
  runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: false,
  studies: [{ source: { documentId: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', version: '3', sha256: 'a'.repeat(64),
    dataCutDate: '2026-06-30', studyId: 'STUDY-7', protocolNumber: 'PROTO-7', clinicalVerification: 'not-established' },
  tables: { aeOverallSummary: { title: 'Overview of TEAEs', headers: ['Category', 'Drug X'], rows: [['Any TEAE', '12 (10.5%)']] } } }],
};

interface SavedRow {
  sectionNumber: string; content: string; contentHash: string;
  lineage: Record<string, unknown> | null; model?: string | null;
}
type Job = Record<string, unknown> & { id: number; status: string; organizationId: number; projectId: number;
  requestedBy: number; studyId: string; sectionsToGenerate: string[]; studyInfoSnapshot: Record<string, unknown> };
interface FakeState {
  job: Job; persisted: SavedRow[]; inserted: SavedRow[]; allowed: boolean;
  withdrawn: boolean; changed: boolean; noTables?: boolean; cancelOnNextRead?: boolean;
  afterSave?: () => void; afterClaim?: () => void; afterOutputRead?: () => void;
}

class Selection {
  private table: unknown;
  constructor(private readonly columns?: Record<string, unknown>) {}
  from(table: unknown) { this.table = table; return this; }
  where() { return this; }
  limit() { return this; }
  then<R>(accept: (rows: unknown[]) => R | PromiseLike<R>): Promise<R> {
    const rows = this.table === csrBuildJobs
      ? this.columns && 'id' in this.columns
        ? state.job.status === 'drafting' ? [{ id: state.job.id }] : [] : [globalThis.structuredClone(state.job)]
      : this.table === csrSectionOutputs ? state.persisted.map(row => ({ ...row })) : [];
    if (this.table === csrSectionOutputs) state.afterOutputRead?.();
    return Promise.resolve(rows).then(accept);
  }
}
let state: FakeState;
const fakeDb = {
  select: (columns?: Record<string, unknown>) => new Selection(columns),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where(condition: SQL) {
    // Honor the runner's real status predicate rather than making every
    // terminal write safe in the fake. This exposes an unguarded pre-claim
    // refusal that would overwrite cancellation in PostgreSQL.
    const query = dialect.sqlToQuery(condition);
    const status = /"status"\s*=\s*\$(\d+)/.exec(query.sql);
    const admitted = !status || state.job.status === query.params[Number(status[1]) - 1];
    if (admitted) Object.assign(state.job, values);
    return Object.assign(Promise.resolve(), { returning: async () => {
      if (admitted && values.status === 'drafting') state.afterClaim?.();
      return admitted ? [{ id: state.job.id }] : [];
    } });
  } }) }),
  insert: () => ({ values: (row: SavedRow) => ({ onConflictDoUpdate() {
    const previous = state.persisted.findIndex(saved => saved.sectionNumber === row.sectionNumber);
    if (previous >= 0) state.persisted[previous] = globalThis.structuredClone(row); else state.persisted.push(globalThis.structuredClone(row));
    state.inserted.push(globalThis.structuredClone(row));
    state.afterSave?.();
    return Promise.resolve();
  } }) }),
};
vi.mock('../../../db', () => ({ get db() { return fakeDb; }, pool: { query: vi.fn() } }));

import { runCSRBuildJob } from '../csr-job-runner';
import { CsrScopeError } from '../project-scope';

function pack(sectionNumber = SECTION): CsrAuthoringEvidence {
  const source = globalThis.structuredClone(retained);
  if (state.changed) source.studies[0].tables.aeOverallSummary!.rows[0][1] = '13 (11.4%)';
  if (state.noTables) source.studies[0].tables = {};
  return buildCsrAuthoringEvidence(source, { programId: PROGRAM, runId: RUN, studyId: 'STUDY-7', sectionNumber });
}
function sourceLineage(evidence: CsrAuthoringEvidence): Record<string, unknown> {
  return { evidence: { runId: evidence.runId, studyId: evidence.studyId, sectionNumber: evidence.sectionNumber,
    evidenceDigest: evidence.evidenceDigest, sourceSha256: evidence.source.sha256, status: evidence.status,
    tables: evidence.tables.map(table => table.key), missingTables: evidence.missingTables } };
}
function seedSaved(lineage: Record<string, unknown> | null = sourceLineage(pack())) {
  state.job.status = 'failed';
  state.persisted.push({ sectionNumber: SECTION, content, contentHash: sha(content), lineage, model: 'recorded-test-model' });
}
function expectRefused(code: string) {
  const recovery = ['CSR_EVIDENCE_CHANGED', 'CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH', 'CSR_EVIDENCE_RESULTS_UNAVAILABLE'].includes(code);
  expect(state.job).toMatchObject({ status: 'failed', error: recovery
    ? { code, message: expect.stringContaining('Existing outputs were retained.') } : { message: code } });
  if (recovery) expect(state.job).toMatchObject({ error: { message: expect.stringContaining('start a new CSR build') } });
  expect(mocks.continuation).not.toHaveBeenCalled();
}

beforeEach(() => {
  state = { job: { id: 42, status: 'queued', organizationId: 1, projectId: 11, requestedBy: 5,
    studyId: 'PROTO-7', sectionsToGenerate: [SECTION], studyInfoSnapshot: { studyInfo: info,
      evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'STUDY-7' } } },
  persisted: [], inserted: [], allowed: true, withdrawn: false, changed: false };
  mocks.continuation.mockReset().mockResolvedValue([]);
  mocks.scope.mockReset().mockImplementation(async (_db: unknown, _org: number, input: { projectId?: number; programId?: string }) => {
    if (!state.allowed) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'CSR_PROJECT_ACCESS_DENIED');
    if (input.programId === OTHER_PROGRAM) throw new CsrScopeError('CSR_SCOPE_MISMATCH', 400, 'CSR_SCOPE_MISMATCH');
    return { projectId: 11, ...(input.programId ? { programId: input.programId } : {}) };
  });
  mocks.load.mockReset().mockImplementation(async (_q: unknown, _actor: unknown, input: { sectionNumber: string }) => {
    if (state.withdrawn) throw new Error('CSR_SOURCE_RECEIPT_REVOKED');
    if (state.cancelOnNextRead) state.job.status = 'cancelled';
    return pack(input.sectionNumber);
  });
  mocks.draft.mockReset().mockImplementation(async (section: { number: string }, _request: unknown, _context: unknown, evidence?: CsrAuthoringEvidence) => ({
    number: section.number, content, source: 'ai', model: 'test-drafter', tokenCost: 1,
    lineage: evidence ? sourceLineage(evidence) : null,
  }));
});

describe('the retained source stays admitted across CSR drafting and resume', () => {
  it('preserves cancellation when the pre-claim project-policy await rejects', async () => {
    mocks.scope.mockImplementationOnce(async () => {
      state.job.status = 'cancelled';
      throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'CSR_PROJECT_ACCESS_DENIED');
    });
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.job.error).toBeUndefined();
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(state.persisted).toEqual([]);
    expect(mocks.continuation).not.toHaveBeenCalled();
  });

  it('does not overwrite cancellation with a stale study-identity refusal', async () => {
    state.job.studyInfoSnapshot.studyInfo = { ...info, protocolNumber: 'OTHER-PROTOCOL' };
    mocks.scope.mockImplementationOnce(async () => { state.job.status = 'cancelled'; return { projectId: 11 }; });
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.job.error).toBeUndefined();
    expect(state.persisted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('does not overwrite cancellation with an invalid-selection refusal after its claim', async () => {
    state.job.sectionsToGenerate = ['not-an-e3-section'];
    state.afterClaim = () => { state.job.status = 'cancelled'; };
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.job.error).toBeNull();
    expect(state.persisted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('preserves cancellation and damaged saved work when its integrity read finishes late', async () => {
    seedSaved(); state.persisted[0].contentHash = '0'.repeat(64);
    const before = globalThis.structuredClone(state.persisted);
    state.afterOutputRead = () => { state.job.status = 'cancelled'; };
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.job.error).toBeNull();
    expect(state.persisted).toEqual(before);
    expect(state.inserted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it('refuses a persisted source program that does not anchor the numeric target, even for the same protocol', async () => {
    state.job.studyInfoSnapshot.evidenceSource = { programId: OTHER_PROGRAM, runId: RUN, studyId: 'STUDY-7' };
    await runCSRBuildJob(42);
    expectRefused('CSR_SCOPE_MISMATCH');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.persisted).toEqual([]);
  });

  it('does not save a reply after its source was withdrawn during the model call', async () => {
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.withdrawn = true; return reply; });
    await runCSRBuildJob(42);
    expectRefused('CSR_SOURCE_RECEIPT_REVOKED');
    expect(state.persisted).toEqual([]);
  });

  it('does not save a reply when its source-table digest changed during the model call', async () => {
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.changed = true; return reply; });
    await runCSRBuildJob(42);
    expectRefused('CSR_EVIDENCE_CHANGED');
    expect(state.persisted).toEqual([]);
  });

  it('does not save a late reply after the requester loses current project access', async () => {
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.allowed = false; return reply; });
    await runCSRBuildJob(42);
    expectRefused('CSR_PROJECT_ACCESS_DENIED');
    expect(state.persisted).toEqual([]);
  });

});

describe('saved CSR source evidence on resume and completion', () => {
  it('revalidates source access on a fully populated resume and preserves all saved work on refusal', async () => {
    seedSaved(); const before = globalThis.structuredClone(state.persisted); state.withdrawn = true;
    await runCSRBuildJob(42);
    expectRefused('CSR_SOURCE_RECEIPT_REVOKED');
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.persisted).toEqual(before);
    expect(state.inserted).toEqual([]);
  });

  it('refuses to reuse saved narrative whose exact evidence digest differs from the readable current pack', async () => {
    seedSaved(); const before = globalThis.structuredClone(state.persisted); state.changed = true;
    await runCSRBuildJob(42);
    expectRefused('CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH');
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.persisted).toEqual(before);
  });

  it('does not treat missing source lineage on a saved run-bound results section as verified', async () => {
    seedSaved(null); const before = globalThis.structuredClone(state.persisted);
    await runCSRBuildJob(42);
    expectRefused('CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH');
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.persisted).toEqual(before);
  });

  it('refuses completion if the source is withdrawn after the final section was saved', async () => {
    state.afterSave = () => { state.withdrawn = true; };
    await runCSRBuildJob(42);
    expectRefused('CSR_SOURCE_RECEIPT_REVOKED');
    expect(state.persisted).toHaveLength(1);
    expect(state.persisted[0]).toMatchObject({ content, contentHash: sha(content) });
  });

  it('reuses an unchanged, verified saved section without a model call or rewriting its provenance', async () => {
    seedSaved(); const before = globalThis.structuredClone(state.persisted);
    await runCSRBuildJob(42);
    expect(state.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(state.persisted).toEqual(before);
    expect(state.inserted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalled();
    expect(mocks.load.mock.calls.every(call => call[4]?.requireCurrent === true)).toBe(true);
    expect(mocks.continuation).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('saves and completes an unchanged source-supported draft', async () => {
    await runCSRBuildJob(42);
    expect(state.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(state.persisted).toHaveLength(1);
    expect(state.persisted[0].lineage).toMatchObject(sourceLineage(pack()));
    expect(mocks.draft).toHaveBeenCalledOnce();
    expect(mocks.continuation).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

});

describe('CSR progress when cancellation finishes during retained-output admission', () => {
  it('preserves the cancelled job progress before drafting can begin', async () => {
    state.afterOutputRead = () => { state.job.status = 'cancelled'; state.job.progress = 42; };
    await runCSRBuildJob(42);
    expect(state.job).toMatchObject({ status: 'cancelled', progress: 42, error: null });
    expect(state.persisted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.continuation).not.toHaveBeenCalled();
  });
});

describe('CSR cancellation and unsupported bindings', () => {
  it('preserves cancellation while a model call is outstanding', async () => {
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.job.status = 'cancelled'; return reply; });
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.persisted).toEqual([]);
    expect(mocks.continuation).not.toHaveBeenCalled();
  });

  it('preserves cancellation while the late source recheck is outstanding', async () => {
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.cancelOnNextRead = true; return reply; });
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.persisted).toEqual([]);
    expect(mocks.continuation).not.toHaveBeenCalled();
  });

  it('does not start a model call if cancellation happens during its source read', async () => {
    mocks.load.mockImplementation(async (_q: unknown, _actor: unknown, input: { sectionNumber: string }) => {
      if (input.sectionNumber === SECTION) state.job.status = 'cancelled';
      return pack(input.sectionNumber);
    });
    await runCSRBuildJob(42);
    expect(state.job.status).toBe('cancelled');
    expect(state.persisted).toEqual([]);
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.continuation).not.toHaveBeenCalled();
  });

  it('does not reinterpret a malformed retained binding as an unbound metadata build', async () => {
    state.job.studyInfoSnapshot.evidenceSource = null;
    await runCSRBuildJob(42);
    expectRefused('CSR_EVIDENCE_SELECTION_INVALID');
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.persisted).toEqual([]);
  });

  it('also rechecks current project permission before saving an unbound metadata section', async () => {
    delete state.job.studyInfoSnapshot.evidenceSource;
    state.job.sectionsToGenerate = ['1'];
    const draft = mocks.draft.getMockImplementation()!;
    mocks.draft.mockImplementation(async (...args) => { const reply = await draft(...args); state.allowed = false; return reply; });
    await runCSRBuildJob(42);
    expectRefused('CSR_PROJECT_ACCESS_DENIED');
    expect(state.persisted).toEqual([]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('does not grandfather a clean legacy results finding over an empty retained evidence pack', async () => {
    state.noTables = true;
    seedSaved(); const before = globalThis.structuredClone(state.persisted);
    await runCSRBuildJob(42);
    expectRefused('CSR_EVIDENCE_RESULTS_UNAVAILABLE');
    expect(state.persisted).toEqual(before);
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(state.inserted).toEqual([]);
  });

  it('can draft supported title metadata without requiring unavailable clinical result tables', async () => {
    state.noTables = true;
    state.job.sectionsToGenerate = ['1'];
    mocks.draft.mockResolvedValue({ number: '1', content: 'Recorded study title and administrative information.',
      source: 'ai', model: 'test-drafter', tokenCost: 1, lineage: null });
    await runCSRBuildJob(42);
    expect(state.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(state.persisted).toHaveLength(1);
    expect(state.persisted[0]).toMatchObject({ sectionNumber: '1', content: 'Recorded study title and administrative information.' });
    expect(mocks.draft).toHaveBeenCalledOnce();
  });
});
