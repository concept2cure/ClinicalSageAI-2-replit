/** Actual runCSRBuildJob under deterministic DB/provider doubles. The driver
 * evaluates every WHERE predicate (including timestamps), snapshots reads,
 * and rolls back transactions. It does NOT prove PostgreSQL locking or RLS;
 * those require the existing DB suites and hosted qualification. SYNTHETIC. */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { beforeEach, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const table = (name: string, keys: string[]) => Object.assign({ name },
    Object.fromEntries(keys.map(key => [key, { name: key }])));
  return {
    jobs: table('jobs', ['id', 'organizationId', 'projectId', 'status', 'startedAt', 'updatedAt']),
    sections: table('sections', ['id', 'jobId', 'organizationId', 'sectionNumber', 'content', 'contentHash', 'lineage']),
    db: null as any,
    draft: null as any,
    scope: null as any,
    writeScope: null as any,
    draftCalls: [] as string[],
    continuations: [] as number[],
  };
});
vi.mock('drizzle-orm', () => ({
  eq: (column: { name: string }, value: unknown) => ({ op: 'eq', key: column.name, value }),
  isNull: (column: { name: string }) => ({ op: 'null', key: column.name }),
  and: (...items: unknown[]) => ({ op: 'and', items }),
}));
vi.mock('@shared/schema', () => ({ csrBuildJobs: h.jobs, csrSectionOutputs: h.sections }));
vi.mock('../../../db', () => ({ get db() { return h.db; } }));
vi.mock('../project-scope', () => ({
  CsrScopeError: class extends Error {},
  resolveCsrScope: (...args: unknown[]) => h.scope(...args),
  resolveCsrBuildContext: async () => ({ projectId: 11, requestedBy: 5 }),
}));
vi.mock('../../csr-builder', () => ({
  csrSectionSelectionRefusal: () => null,
  resolveCSRDraftTargets: (selection?: string[]) => (selection ?? ['13'])
    .map(number => ({ number, title: 'Synthetic source section' })),
  hasUnresolvedPlaceholders: (text: string) => text.includes('[MISSING]'),
  draftCSRSectionWithProvenance: (section: { number: string }) => {
    h.draftCalls.push(section.number);
    return h.draft(section);
  },
}));
vi.mock('../cortex-authoring-context', () => ({
  csrSectionTableKeys: () => [],
  parseCsrEvidenceSelection: (value: unknown) => value,
}));
vi.mock('../csr-job-evidence', () => ({
  verifyCsrJobWriteScope: (...args: unknown[]) => h.writeScope(...args),
  readCsrJobEvidence: async () => { throw new Error('No clinical evidence in this concurrency fixture'); },
  assertCsrJobEvidenceUnchanged: () => {},
  assertSavedCsrJobEvidence: () => {},
}));
vi.mock('../../submission-orchestrator-continuation.js', () => ({
  continueOrchestratorRunsForCsrJob: async (jobId: number) => { h.continuations.push(jobId); return []; },
}));
import { runCSRBuildJob } from '../csr-job-runner';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const draft = (text: string, number = '13') => ({
  number, content: text, source: 'template', model: null, tokenCost: 0, lineage: null,
});
const seededJob = () => ({
  id: 42, organizationId: 7, projectId: 11, requestedBy: 5, studyId: 'SYN-1',
  status: 'queued', progress: 0, startedAt: null, completedAt: null, error: null,
  sectionsToGenerate: ['13'], updatedAt: new Date(),
  studyInfoSnapshot: { studyInfo: { protocolNumber: 'SYN-1' } },
});
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const comparable = (value: unknown) => value instanceof Date ? value.getTime() : value;
function matches(predicate: any, row: Record<string, unknown>): boolean {
  if (!predicate) return true;
  if (predicate.op === 'and') return predicate.items.every((item: unknown) => matches(item, row));
  if (predicate.op === 'null') return row[predicate.key] == null;
  if (predicate.op === 'eq') return comparable(row[predicate.key]) === comparable(predicate.value);
  throw new Error('The test driver must not silently ignore an unknown WHERE predicate');
}
function memoryDb() {
  const state = {
    job: seededJob() as Record<string, any>,
    outputs: [] as Array<Record<string, any>>,
    writes: [] as Array<{ table: string; tx: boolean; values: Record<string, unknown> }>,
    inTransaction: false, commits: 0, rollbacks: 0,
    beforeTransaction: null as null | (() => void),
    beforeInsert: null as null | (() => void),
    beforeSectionsRead: null as null | (() => void),
  };
  const project = (row: Record<string, any>, columns?: Record<string, any>) =>
    structuredClone(columns ? Object.fromEntries(Object.entries(columns).map(([key, col]) => [key, row[col.name]])) : row);
  const lazy = (execute: () => unknown) => {
    let result: Promise<any> | undefined;
    const run = () => result ??= Promise.resolve().then(execute);
    return {
      then: (yes: any, no: any) => run().then(yes, no),
      returning: (columns?: Record<string, any>) => run().then(rows => rows.map((row: any) => project(row, columns))),
    };
  };
  const db = {
    state,
    select(columns?: Record<string, any>) {
      let table: any, predicate: any, limit = Infinity;
      const result: any = {
        from(value: unknown) { table = value; return result; },
        where(value: unknown) { predicate = value; return result; },
        limit(value: number) { limit = value; return result; },
        then(yes: any, no: any) {
          return Promise.resolve().then(() => {
            if (table === h.sections) state.beforeSectionsRead?.();
            return (table === h.jobs ? [state.job] : state.outputs)
              .filter(row => matches(predicate, row)).slice(0, limit).map(row => project(row, columns));
          }).then(yes, no);
        },
      };
      return result;
    },
    update(table: any) {
      return { set: (values: Record<string, unknown>) => ({ where: (predicate: unknown) => lazy(() => {
        assert.equal(table, h.jobs);
        if (!matches(predicate, state.job)) return [];
        state.writes.push({ table: 'jobs', tx: state.inTransaction, values: structuredClone(values) });
        Object.assign(state.job, structuredClone(values));
        return [state.job];
      }) }) };
    },
    insert(table: any) {
      return { values: (values: Record<string, any>) => ({ onConflictDoUpdate: () => lazy(() => {
        assert.equal(table, h.sections);
        state.beforeInsert?.();
        state.writes.push({ table: 'sections', tx: state.inTransaction, values: structuredClone(values) });
        const previous = state.outputs.find(row => row.jobId === values.jobId && row.sectionNumber === values.sectionNumber);
        if (previous) Object.assign(previous, structuredClone(values));
        else state.outputs.push(structuredClone(values));
        return [];
      }) }) };
    },
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      state.beforeTransaction?.();
      const snapshot = structuredClone({ job: state.job, outputs: state.outputs, writes: state.writes });
      state.inTransaction = true;
      try {
        const result = await fn(db);
        state.commits++;
        return result;
      } catch (error) {
        state.job = snapshot.job; state.outputs = snapshot.outputs; state.writes = snapshot.writes;
        state.rollbacks++;
        throw error;
      } finally { state.inTransaction = false; }
    },
  };
  return db;
}

beforeEach(() => {
  h.db = memoryDb(); h.draftCalls = []; h.continuations = [];
  h.scope = async () => ({ projectId: 11 });
  h.writeScope = async () => {};
  h.draft = async ({ number }: { number: string }) => draft('Synthetic current-attempt text.', number);
});

it('saves the section and its progress in one short transaction before completing', async () => {
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'complete');
  assert.equal(h.db.state.outputs[0].contentHash, hash('Synthetic current-attempt text.'));
  assert.equal(h.db.state.writes.find((write: any) => write.table === 'sections').tx, true);
  assert.equal(h.db.state.commits, 1);
  assert.deepEqual(h.continuations, [42]);
});

it('discards a late model response after recovery has started a replacement attempt', async () => {
  const first = deferred<any>(), second = deferred<any>();
  const firstEntered = deferred(), secondEntered = deferred();
  // Force both attempts beyond the current clock to test strict monotonicity,
  // not the accidental fact that two test calls happened a millisecond apart.
  h.db.state.job.startedAt = new Date(Date.now() + 60_000);
  h.draft = () => {
    if (h.draftCalls.length === 1) { firstEntered.resolve(); return first.promise; }
    secondEntered.resolve(); return second.promise;
  };
  const old = runCSRBuildJob(42); await firstEntered.promise;
  const firstToken = h.db.state.job.startedAt.getTime();
  h.db.state.job.status = 'queued'; // same existing recovery transition
  const current = runCSRBuildJob(42); await secondEntered.promise;
  const secondToken = h.db.state.job.startedAt.getTime();
  assert.ok(secondToken > firstToken, 'attempt token must change despite clock skew');
  first.resolve(draft('Obsolete provider response.')); await old;
  assert.equal(h.db.state.job.status, 'drafting');
  assert.equal(h.db.state.outputs.length, 0);
  assert.equal(h.db.state.job.startedAt.getTime(), secondToken);
  second.resolve(draft('Replacement worker response.')); await current;
  assert.equal(h.db.state.outputs[0].content, 'Replacement worker response.');
  assert.equal(h.db.state.job.status, 'complete');
  assert.deepEqual(h.continuations, [42]);
});

it('does not let an old provider failure fail the replacement drafting attempt', async () => {
  const first = deferred<any>(), second = deferred<any>();
  const firstEntered = deferred(), secondEntered = deferred();
  h.draft = () => {
    if (h.draftCalls.length === 1) { firstEntered.resolve(); return first.promise; }
    secondEntered.resolve(); return second.promise;
  };
  const old = runCSRBuildJob(42); await firstEntered.promise;
  h.db.state.job.status = 'queued';
  const current = runCSRBuildJob(42); await secondEntered.promise;
  first.reject(new Error('Private provider payload must not affect replacement')); await old;
  assert.equal(h.db.state.job.status, 'drafting');
  assert.equal(h.db.state.job.error, null);
  second.resolve(draft('Current output after earlier failure.')); await current;
  assert.equal(h.db.state.job.status, 'complete');
  assert.deepEqual(h.continuations, [42]);
});

it('discards model output after cancellation, preserving cancellation as terminal', async () => {
  h.draft = async () => { h.db.state.job.status = 'cancelled'; return draft('Late output.'); };
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'cancelled');
  assert.equal(h.db.state.outputs.length, 0);
  assert.deepEqual(h.continuations, []);
});

it('closes the final ownership-check-to-section-write gap', async () => {
  const takeover = () => {
    h.db.state.beforeTransaction = null; h.db.state.beforeInsert = null;
    h.db.state.job.startedAt = new Date(h.db.state.job.startedAt.getTime() + 1);
    h.db.state.job.progress = 73;
    h.db.state.outputs = [{ jobId: 42, organizationId: 7, sectionNumber: '13',
      content: 'Already saved by the replacement.', contentHash: hash('Already saved by the replacement.') }];
  };
  // Fixed worker: replacement wins just before the short transaction's
  // conditional UPDATE. Old worker: replacement wins just before its naked
  // INSERT, exposing exactly the check-then-write race under test.
  h.db.state.beforeTransaction = takeover; h.db.state.beforeInsert = takeover;
  await runCSRBuildJob(42);
  assert.equal(h.db.state.outputs[0].content, 'Already saved by the replacement.');
  assert.equal(h.db.state.job.progress, 73);
  assert.equal(h.db.state.job.status, 'drafting');
  assert.deepEqual(h.continuations, []);
});

it('does not claim a recurring queued state from an obsolete pre-claim read', async () => {
  const token = new Date(Date.now() + 10_000);
  h.scope = async () => { h.db.state.job.startedAt = token; return { projectId: 11 }; };
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'queued');
  assert.equal(h.db.state.job.startedAt.getTime(), token.getTime());
  assert.deepEqual(h.draftCalls, []);
});

it('records an initial saved-output read failure instead of stranding the claimed job', async () => {
  h.db.state.beforeSectionsRead = () => { throw new Error('Raw storage failure with private data'); };
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'failed');
  assert.equal(h.db.state.job.error.message, 'CSR_BUILD_STEP_FAILED');
  assert.ok(!JSON.stringify(h.db.state.job.error).includes('private data'));
  assert.deepEqual(h.draftCalls, []);
});

it('rolls progress back when the section upsert fails', async () => {
  h.db.state.beforeInsert = () => { throw new Error('Storage write refused'); };
  await runCSRBuildJob(42);
  assert.equal(h.db.state.rollbacks, 1);
  assert.equal(h.db.state.outputs.length, 0);
  assert.equal(h.db.state.job.progress, 0);
  assert.equal(h.db.state.job.status, 'failed');
  assert.deepEqual(h.continuations, []);
});

it('preserves valid retained sections during an explicit resume', async () => {
  h.db.state.job.status = 'failed'; h.db.state.job.sectionsToGenerate = ['1', '13'];
  h.db.state.outputs = [{ organizationId: 7, jobId: 42, sectionNumber: '1', content: 'Retained title.', contentHash: hash('Retained title.') }];
  await runCSRBuildJob(42);
  assert.deepEqual(h.draftCalls, ['13']);
  assert.equal(h.db.state.outputs[0].content, 'Retained title.');
  assert.equal(h.db.state.job.status, 'complete');
});

it('does not complete or continue a replacement job after delayed final authorization', async () => {
  let checks = 0;
  h.writeScope = async () => {
    if (++checks === 2) {
      h.db.state.job.startedAt = new Date(h.db.state.job.startedAt.getTime() + 1);
      h.db.state.job.progress = 35;
    }
  };
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'drafting');
  assert.equal(h.db.state.job.progress, 35);
  assert.deepEqual(h.continuations, []);
});

it('retains the placeholder completion refusal under attempt fencing', async () => {
  h.draft = async () => draft('[MISSING]');
  await runCSRBuildJob(42);
  assert.equal(h.db.state.job.status, 'failed');
  assert.equal(h.db.state.job.error.reason, 'unresolved_placeholders');
  assert.deepEqual(h.continuations, []);
});
