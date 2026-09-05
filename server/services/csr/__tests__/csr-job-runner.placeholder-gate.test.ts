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
import { csrBuildJobs, csrSectionOutputs } from '@shared/schema';

// ── Stub the section drafter (keep the placeholder primitive + tree real) ────
const { draftMock } = vi.hoisted(() => ({
  draftMock: vi.fn(),
}));
vi.mock('../../csr-builder', async () => {
  const actual = await vi.importActual<typeof import('../../csr-builder')>('../../csr-builder');
  return { ...actual, draftCSRSectionWithProvenance: draftMock };
});

// ── In-memory fake of the drizzle `db` the runner calls via requireDb() ──────
type Capture = Record<string, unknown>;
function makeFakeDb(job: Record<string, unknown>) {
  const inserted: Array<{ sectionNumber: string; content: string }> = [];
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
          rows = [job];
        } else if (table === csrSectionOutputs) {
          // The gate read selects { sectionNumber, content }; the earlier
          // already-persisted read selects only { sectionNumber }.
          rows = cols && Object.prototype.hasOwnProperty.call(cols, 'content')
            ? inserted.map(r => ({ sectionNumber: r.sectionNumber, content: r.content }))
            : inserted.map(r => ({ sectionNumber: r.sectionNumber }));
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
              if (table === csrBuildJobs) jobUpdates.push(vals);
              return Promise.resolve();
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(v: { sectionNumber: string; content: string }) {
          return {
            onConflictDoUpdate() {
              inserted.push({ sectionNumber: v.sectionNumber, content: v.content });
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, inserted, jobUpdates };
}

let fake: ReturnType<typeof makeFakeDb>;
vi.mock('../../../db', () => ({ get db() { return fake.db; } }));

import { runCSRBuildJob } from '../csr-job-runner';

function makeJob(): Record<string, unknown> {
  return {
    id: 42,
    status: 'queued',
    organizationId: 1,
    projectId: null,
    requestedBy: 1,
    studyId: 'STUDY-1',
    sectionsToGenerate: ['13'], // §13 Discussion & Overall Conclusions (single top-level node)
    studyInfoSnapshot: { studyInfo: { investigationalProduct: 'Drug X', indication: 'Type 2 Diabetes' } },
  };
}

/** The terminal job update is the last one carrying a `status`. */
function terminalStatus(jobUpdates: Capture[]): Capture | undefined {
  return [...jobUpdates].reverse().find(u => 'status' in u);
}

beforeEach(() => {
  draftMock.mockReset();
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
  });
});
