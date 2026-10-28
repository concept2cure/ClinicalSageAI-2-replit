/**
 * CSR async job runner — placeholder gate (fail closed).
 *
 * The legacy synchronous path (launchCSRBuild) already refuses to report a CSR
 * `complete` while any section still carries unresolved template placeholders
 * (see csr-builder-completeness.test.ts). The ASYNC job runner — the path the
 * submission orchestrator actually uses (launchCSRBuildAsync → runCSRBuildJob)
 * — set `status: 'complete'` unconditionally once every section had been
 * persisted, with no placeholder check. So when a section's AI draft threw and
 * fell back to bracketed template prose — e.g. §13 Discussion & Overall
 * Conclusions: "the benefit-risk profile of X is considered [favorable/
 * unfavorable] …" — the job read `complete` and the orchestrator assembled that
 * literal placeholder into the filing package as a finished CSR section.
 *
 * These tests drive runCSRBuildJob against an in-memory fake of the drizzle
 * client (draftCSRSectionWithProvenance is stubbed to return controlled content;
 * hasUnresolvedPlaceholders and the ICH-E3 tree stay real) and assert the fixed
 * behavior: a persisted section with an unresolved placeholder makes the job
 * terminate `failed` (with a structured error naming the section), never
 * `complete`; a clean section still terminates `complete`. They fail against the
 * old unconditional `status: 'complete'`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { csrBuildJobs, csrSectionOutputs } from '@shared/schema';

// ── Stub the section drafter (keep the placeholder primitive + tree real) ────
const { draftMock, continueMock } = vi.hoisted(() => ({
  draftMock: vi.fn(),
  continueMock: vi.fn(),
}));
vi.mock('../../submission-orchestrator-continuation.js', () => ({ continueOrchestratorRunsForCsrJob: continueMock }));
vi.mock('../project-scope', () => {
  class TestCsrScopeError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  }
  return {
    CsrScopeError: TestCsrScopeError,
    resolveCsrScope: vi.fn(async () => ({ projectId: 11, organizationId: 1 })),
    resolveCsrBuildContext: vi.fn(async () => ({ projectId: 11, organizationId: 1, requestedBy: 1 })),
  };
});
vi.mock('../../csr-builder', async () => {
  const actual = await vi.importActual<typeof import('../../csr-builder')>('../../csr-builder');
  return { ...actual, draftCSRSectionWithProvenance: draftMock };
});

// ── In-memory fake of the drizzle `db` the runner calls via requireDb() ──────
type Capture = Record<string, unknown>;
type SavedOutput = { sectionNumber: string; content: string; contentHash?: string };
function makeFakeDb(job: Record<string, unknown>, retained: SavedOutput[] = []) {
  const inserted: Array<{ sectionNumber: string; content: string }> = [];
  const persisted = retained.map(row => ({ ...row }));
  const jobUpdates: Capture[] = [];

  function selectBuilder(cols: Record<string, unknown> | undefined) {
    let table: unknown = null;
    const b: Record<string, unknown> = {
      from(t: unknown) { table = t; return b; },
      where() { return b; },
      limit() { return b; },
      then(resolve: (rows: unknown[]) => void) {
        let rows: unknown[] = [];
        if (table === csrBuildJobs) {
          // Active-drafting reads used after asynchronous model calls must
          // observe cancellation instead of returning a stale job snapshot.
          rows = cols && Object.prototype.hasOwnProperty.call(cols, 'id')
            ? (job.status === 'drafting' ? [{ id: job.id }] : [])
            : [job];
        } else if (table === csrSectionOutputs) {
          // Preserve the requested projection for retained-output reads.
          rows = persisted.map(row => {
            const projected: Record<string, unknown> = { sectionNumber: row.sectionNumber };
            if (cols && Object.prototype.hasOwnProperty.call(cols, 'content')) projected.content = row.content;
            if (cols && Object.prototype.hasOwnProperty.call(cols, 'contentHash')) {
              projected.contentHash = row.contentHash ?? createHash('sha256').update(row.content).digest('hex');
            }
            return projected;
          });
        }
        resolve(rows);
      },
    };
    return b;
  }

  const db = {
    select(cols?: Record<string, unknown>) { return selectBuilder(cols); },
    update(table: unknown) {
      return {
        set(vals: Capture) {
          return {
            where() {
              const applied = !(table === csrBuildJobs &&
                (vals.status === 'complete' || vals.status === 'failed') &&
                job.status !== 'drafting' &&
                // Pre-claim refusal paths can legitimately mark a queued/failed
                // job failed; only late drafting failures must be suppressed.
                (job.status === 'cancelled' || job.status === 'complete'));
              if (table === csrBuildJobs && applied) {
                jobUpdates.push(vals);
                Object.assign(job, vals);
              }
              const completed = Promise.resolve();
              return {
                then: completed.then.bind(completed),
                returning: async () => applied ? [{ id: job.id }] : [],
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(v: { sectionNumber: string; content: string; contentHash: string }) {
          return {
            onConflictDoUpdate() {
              inserted.push({ sectionNumber: v.sectionNumber, content: v.content });
              const existing = persisted.find(row => row.sectionNumber === v.sectionNumber);
              if (existing) existing.content = v.content;
              else persisted.push({ sectionNumber: v.sectionNumber, content: v.content });
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, inserted, persisted, jobUpdates, job };
}

let fake: ReturnType<typeof makeFakeDb>;
vi.mock('../../../db', () => ({ get db() { return fake.db; } }));

import { runCSRBuildJob } from '../csr-job-runner';

function makeJob(): Record<string, unknown> {
  return {
    id: 42,
    status: 'queued',
    organizationId: 1,
    projectId: 11,
    requestedBy: 1,
    studyId: 'STUDY-1',
    sectionsToGenerate: ['13'], // §13 Discussion & Overall Conclusions (single top-level node)
    studyInfoSnapshot: { studyInfo: { protocolNumber: 'STUDY-1', investigationalProduct: 'Drug X', indication: 'Type 2 Diabetes' } },
  };
}

/** The terminal job update is the last one carrying a `status`. */
function terminalStatus(jobUpdates: Capture[]): Capture | undefined {
  return [...jobUpdates].reverse().find(u => 'status' in u);
}

beforeEach(() => {
  draftMock.mockReset();
  continueMock.mockReset().mockResolvedValue([]);
});

const sectionDraft = (number: string, content: string) => ({ number, content, source: 'template', model: null, tokenCost: 0, lineage: null });
const progressValues = () => fake.jobUpdates.filter(update => typeof update.progress === 'number').map(update => update.progress);

describe('runCSRBuildJob — requested saved-output coverage', () => {
  it.each(['', ' \n\t '])('refuses completion when the requested draft has no usable content (%j)', async content => {
    fake = makeFakeDb({ ...makeJob(), sectionsToGenerate: ['6'] });
    draftMock.mockResolvedValue(sectionDraft('6', content));

    await runCSRBuildJob(42);

    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'failed', progress: 0,
      error: { reason: 'missing_section_outputs', sections: ['6'] } });
    expect(fake.inserted).toEqual([]);
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('preserves valid partial outputs and counts only requested rows through an explicit resume', async () => {
    const retained = [
      { sectionNumber: '1', content: 'Original title page prepared by the investigator.' },
      { sectionNumber: '4', content: 'An unrelated retained abbreviations section.' },
      { sectionNumber: '7', content: 'An unrelated retained introduction.' },
    ];
    fake = makeFakeDb({ ...makeJob(), status: 'failed', sectionsToGenerate: ['1', '6', '13'] }, retained);
    draftMock.mockImplementation(async (section: { number: string }) => sectionDraft(section.number,
      section.number === '6' ? '' : 'Recorded discussion awaiting scientific review.'));

    await runCSRBuildJob(42);

    expect(draftMock.mock.calls.map(call => (call[0] as { number: string }).number)).toEqual(['6', '13']);
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'failed', progress: 66,
      error: { reason: 'missing_section_outputs', sections: ['6'] } });
    expect(progressValues()).toEqual([33, 66, 66]);
    expect(fake.persisted).toEqual([...retained, { sectionNumber: '13', content: 'Recorded discussion awaiting scientific review.' }]);
    expect(continueMock).not.toHaveBeenCalled();

    fake.jobUpdates.length = 0;
    draftMock.mockClear().mockImplementation(async (section: { number: string }) => sectionDraft(section.number,
      'Recorded investigator and administrative source details.'));
    await runCSRBuildJob(42);

    expect(draftMock.mock.calls.map(call => (call[0] as { number: string }).number)).toEqual(['6']);
    expect(progressValues()).toEqual([66, 100, 100]);
    expect(fake.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(fake.persisted.slice(0, retained.length)).toEqual(retained);
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('repairs a retained blank row only on explicit resume while preserving valid saved text', async () => {
    const title = { sectionNumber: '1', content: 'Original title page.' };
    fake = makeFakeDb({ ...makeJob(), status: 'failed', sectionsToGenerate: ['1', '6'] },
      [title, { sectionNumber: '6', content: '\n\t ' }]);
    draftMock.mockResolvedValue(sectionDraft('6', ''));

    await runCSRBuildJob(42);

    expect(draftMock).toHaveBeenCalledOnce();
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'failed', progress: 50,
      error: { reason: 'missing_section_outputs', sections: ['6'] } });
    expect(fake.persisted).toEqual([title, { sectionNumber: '6', content: '\n\t ' }]);
    expect(continueMock).not.toHaveBeenCalled();

    draftMock.mockClear().mockResolvedValue(sectionDraft('6', 'Source-prepared investigator and administration details.'));
    await runCSRBuildJob(42);

    expect(draftMock).toHaveBeenCalledOnce();
    expect(fake.persisted).toEqual([title,
      { sectionNumber: '6', content: 'Source-prepared investigator and administration details.' }]);
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'complete', progress: 100 });
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });
});

describe('runCSRBuildJob — retained target selections and progress', () => {
  it.each([['999'], ['13', '999']])('refuses unsupported retained selection %j without drafting or continuation', async (...sections: string[]) => {
    fake = makeFakeDb({ ...makeJob(), sectionsToGenerate: sections });
    draftMock.mockImplementation(async (section: { number: string }) => sectionDraft(section.number, 'A saved discussion.'));

    await runCSRBuildJob(42);

    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'failed', progress: 0,
      error: { reason: 'invalid_section_selection' } });
    expect(fake.inserted).toEqual([]);
    expect(draftMock).not.toHaveBeenCalled();
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('retains the existing placeholder refusal for saved target text without redrafting it', async () => {
    fake = makeFakeDb({ ...makeJob(), status: 'failed' }, [{ sectionNumber: '13', content: '[DATA TO BE INSERTED]' }]);
    await runCSRBuildJob(42);
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'failed', error: { reason: 'unresolved_placeholders', sections: ['13'] } });
    expect(fake.persisted).toEqual([{ sectionNumber: '13', content: '[DATA TO BE INSERTED]' }]);
    expect(draftMock).not.toHaveBeenCalled();
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('does not let unrelated retained placeholder rows block an otherwise covered explicit subset', async () => {
    fake = makeFakeDb({ ...makeJob(), status: 'failed' }, [
      { sectionNumber: '13', content: 'Source-prepared discussion awaiting review.' },
      { sectionNumber: '14', content: '[DATA TO BE INSERTED]' },
    ]);
    await runCSRBuildJob(42);
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({ status: 'complete', progress: 100 });
    expect(progressValues()).toEqual([100, 100]);
    expect(draftMock).not.toHaveBeenCalled();
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('preserves the existing full-build meaning of an empty retained selection', async () => {
    fake = makeFakeDb({ ...makeJob(), sectionsToGenerate: [] });
    draftMock.mockImplementation(async (section: { number: string }) => sectionDraft(section.number, 'Source-prepared working text.'));
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(draftMock.mock.calls.map(call => (call[0] as { number: string }).number)).toEqual(expect.arrayContaining(['1', '6', '13', '16']));
    expect(fake.persisted.length).toBeGreaterThan(16);
    expect(progressValues().every(value => typeof value === 'number' && value >= 0 && value <= 100)).toBe(true);
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('drafts a duplicate supported subset only once', async () => {
    fake = makeFakeDb({ ...makeJob(), sectionsToGenerate: ['13', '13'] });
    draftMock.mockResolvedValue(sectionDraft('13', 'Source-prepared discussion.'));
    await runCSRBuildJob(42);
    expect(fake.job).toMatchObject({ status: 'complete', progress: 100 });
    expect(draftMock).toHaveBeenCalledOnce();
    expect(fake.inserted).toEqual([{ sectionNumber: '13', content: 'Source-prepared discussion.' }]);
    expect(continueMock).toHaveBeenCalledExactlyOnceWith(42, 1);
  });

  it('resets stale progress before retrying targets when retained rows are unrelated or blank', async () => {
    fake = makeFakeDb({ ...makeJob(), status: 'failed', progress: 100, sectionsToGenerate: ['6'] }, [
      { sectionNumber: '1', content: 'Unrelated retained title page.' },
      { sectionNumber: '6', content: '\n\t ' },
    ]);
    const progressAtDraft: unknown[] = [];
    draftMock.mockImplementation(async () => {
      progressAtDraft.push(fake.job.progress);
      return sectionDraft('6', '');
    });
    await runCSRBuildJob(42);
    expect(progressAtDraft).toEqual([0]);
    expect(fake.job).toMatchObject({ status: 'failed', progress: 0, error: { reason: 'missing_section_outputs', sections: ['6'] } });
    expect(continueMock).not.toHaveBeenCalled();
  });
});

describe('runCSRBuildJob — terminal integrity and cancellation', () => {
  it('rejects an altered retained hash without overwriting the source section', async () => {
    const original = { sectionNumber: '13', content: 'Final reported safety findings.', contentHash: '0'.repeat(64) };
    fake = makeFakeDb({ ...makeJob(), status: 'failed' }, [original]);
    await runCSRBuildJob(42);
    expect(terminalStatus(fake.jobUpdates)).toMatchObject({
      status: 'failed', error: { reason: 'saved_section_integrity_failed' },
    });
    expect(fake.persisted).toEqual([original]);
    expect(draftMock).not.toHaveBeenCalled();
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('does not turn a cancelled job into failed when a late AI call rejects', async () => {
    fake = makeFakeDb(makeJob());
    draftMock.mockImplementation(async () => {
      fake.job.status = 'cancelled';
      throw new Error('Late model failure');
    });
    await runCSRBuildJob(42);
    expect(fake.job.status).toBe('cancelled');
    expect(fake.jobUpdates.some(update => update.status === 'failed')).toBe(false);
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('cannot complete or continue a job cancelled during an AI call', async () => {
    fake = makeFakeDb(makeJob());
    draftMock.mockImplementation(async () => {
      fake.job.status = 'cancelled';
      return sectionDraft('13', 'Recorded discussion, not yet approved.');
    });
    await runCSRBuildJob(42);
    expect(fake.job.status).toBe('cancelled');
    expect(fake.inserted).toEqual([]);
    expect(fake.jobUpdates.some(update => update.status === 'complete')).toBe(false);
    expect(continueMock).not.toHaveBeenCalled();
  });
});

describe('runCSRBuildJob — placeholder gate', () => {
  it('marks the job FAILED (not complete) when a section still has an unresolved placeholder', async () => {
    fake = makeFakeDb(makeJob());
    // The exact §13 template-fallback sentence: an unresolved benefit-risk verdict.
    draftMock.mockResolvedValue({
      number: '13',
      content:
        'BENEFIT-RISK ASSESSMENT\nBased on the efficacy and safety data from this study, ' +
        'the benefit-risk profile of Drug X is considered [favorable/unfavorable] for the treatment of Type 2 Diabetes.',
      source: 'template',
      model: null,
      tokenCost: 0,
      lineage: null,
    });

    await runCSRBuildJob(42);

    const terminal = terminalStatus(fake.jobUpdates);
    expect(terminal?.status).toBe('failed');
    expect(terminal?.status).not.toBe('complete');
    const err = terminal?.error as { reason?: string; sections?: string[] } | undefined;
    expect(err?.reason).toBe('unresolved_placeholders');
    expect(err?.sections).toContain('13');
    expect(continueMock).not.toHaveBeenCalled();
  });

  it('marks the job COMPLETE when the section is placeholder-free', async () => {
    fake = makeFakeDb(makeJob());
    draftMock.mockResolvedValue({
      number: '13',
      content:
        'BENEFIT-RISK ASSESSMENT\nBased on the efficacy and safety data from this study, the ' +
        'benefit-risk profile of Drug X is favorable for the treatment of Type 2 Diabetes.',
      source: 'ai',
      model: 'test-model',
      tokenCost: 10,
      lineage: null,
    });

    await runCSRBuildJob(42);

    const terminal = terminalStatus(fake.jobUpdates);
    expect(terminal?.status).toBe('complete');
    expect(terminal?.progress).toBe(100);
    expect(continueMock).toHaveBeenCalledWith(42, makeJob().organizationId);
  });
  it('does not relabel completed CSR work as failed when dependent continuation is unavailable', async () => {
    fake = makeFakeDb(makeJob());
    draftMock.mockResolvedValue({ number: '13', content: 'The benefit-risk profile is favorable.', source: 'ai', model: 'test-model', tokenCost: 10, lineage: null });
    continueMock.mockRejectedValue(new Error('continuation database unavailable'));
    await runCSRBuildJob(42);
    expect(terminalStatus(fake.jobUpdates)?.status).toBe('complete');
    expect(continueMock).toHaveBeenCalledTimes(1);
  });

});
