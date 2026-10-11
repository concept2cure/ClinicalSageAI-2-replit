/**
 * `getWorkflowStatus` must read only the caller's own artifacts.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The function ACCEPTED `organizationId?: number` and never referenced it. Both
 * of its reads filtered on project_id alone:
 *
 *     SELECT DISTINCT type FROM concept2cure_artifacts WHERE project_id = $1 …
 *     SELECT DISTINCT ctd_section FROM concept2cure_artifacts WHERE project_id = $1 …
 *
 * `concept2cure_artifacts.organization_id` is INTEGER NOT NULL
 * (db/migrations/20260311_concept2cure_artifacts.sql:10), so the column was
 * there the whole time.
 *
 * This has a wider blast radius than the CMC block next door: context
 * enrichment calls buildWorkflowContext on every turn where a submission type
 * is known, not only behind a `/cmc` slash command. The result — which artifact
 * types exist and which CTD sections carry content — is rendered into the
 * model's prompt as this project's submission progress. Given another sponsor's
 * project id, it was theirs.
 *
 * Both reads also sit in bare `catch {}` blocks, so a failure is
 * indistinguishable from "no artifacts" — which is why an unscoped read could
 * never announce itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));
vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));

import { getWorkflowStatus, buildWorkflowContext, type WorkflowStatus } from '../workflow-orchestration';
import { enrichContextForChat } from '../context-enrichment';

const artifactReads = () =>
  poolQuery.mock.calls.filter((c: unknown[]) => String(c[0]).includes('concept2cure_artifacts'));

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('getWorkflowStatus is tenant-scoped', () => {
  it('scopes every artifact read to the caller organization', async () => {
    await getWorkflowStatus(42, 'ind', 7);

    const reads = artifactReads();
    expect(reads.length, 'no artifact read was issued, so this proves nothing').toBeGreaterThan(0);
    for (const call of reads) {
      const sql = String(call[0]);
      expect(sql, `unscoped artifact read: ${sql.replace(/\s+/g, ' ').trim()}`).toMatch(
        /organization_id\s*=\s*\$/,
      );
      expect(call[1] as unknown[]).toContain(7);
    }
  });

  it('issues no artifact read at all without an organization', async () => {
    // Fail closed, matching context-enrichment's "no organization, no memory".
    // A token with no org claim genuinely reaches this code path.
    await getWorkflowStatus(42, 'ind', undefined);
    expect(artifactReads().map((c: unknown[]) => String(c[0]))).toHaveLength(0);
  });

  it('still returns the workflow definition when the org is absent', async () => {
    // Failing closed must degrade the PROGRESS, not erase the workflow itself —
    // otherwise the fix would look like "return null for everything".
    const status = await getWorkflowStatus(42, 'ind', undefined);
    expect(status, 'the workflow registry entry was dropped along with the reads').toBeTruthy();
  });

  it('returns null for a submission type with no workflow, scoped or not', async () => {
    expect(await getWorkflowStatus(42, 'not-a-real-type', 7)).toBeNull();
  });
});

describe('getWorkflowStatus marks a step complete only on evidence', () => {
  /* A step requiring no artifact, or naming no CTD section, was complete for
     every project — hasArtifacts was `requiredArtifacts.length === 0 || …` and
     hasSection `!step.ctdSection || …`. "Submit IND package to FDA" was done
     for a project with nothing in it, and AnA was told so. */
  it('with no project records, marks no step complete and no step it cannot track as done', async () => {
    const status = (await getWorkflowStatus(42, 'ind', 7))!;
    const steps = status.phases.flatMap((p) => p.steps);
    expect(steps.filter((s) => s.complete === true)).toEqual([]);
    expect(status.completedSteps).toBe(0);
    expect(status.untrackedSteps).toBeGreaterThan(0);
    for (const s of steps.filter((x) => /submit .*to fda/i.test(x.title))) {
      expect(s.complete, `"${s.title}" asserted without evidence`).not.toBe(true);
    }
  });

  it('computes progress over tracked steps only', async () => {
    const status = (await getWorkflowStatus(42, 'ind', 7))!;
    expect(status.trackedSteps + status.untrackedSteps).toBe(status.totalSteps);
    expect(status.progressPercent === null || status.progressPercent === 0).toBe(true);
  });
});

describe('enrichment reuses the real workflow snapshot', () => {
  it('issues the two tenant-scoped workflow SELECTs once for a /workflow turn', async () => {
    const result = await enrichContextForChat({
      message: '/workflow', projectId: 42, project: { status: 'linked', id: 42 },
      submissionType: 'ind', organizationId: 7,
    });
    const workflowReads = artifactReads().filter(c => /SELECT DISTINCT (type|ctd_section) FROM/.test(String(c[0])));
    expect(workflowReads).toHaveLength(2);
    for (const call of workflowReads) {
      expect(String(call[0])).toContain('organization_id = $2');
      expect(call[1]).toEqual([42, 7]);
    }
    expect(result.block.split('## Submission Workflow:')).toHaveLength(3);
    expect(result.block).toContain('0/');
  });

  it('still issues no workflow artifact SELECT without a tenant', async () => {
    await enrichContextForChat({
      message: '/workflow', projectId: 42, project: { status: 'linked', id: 42 }, submissionType: 'ind',
    });
    expect(artifactReads()).toHaveLength(0);
  });
});

// Fixed outputs captured from the sequential implementation at 21ed751.
// Keep the completion flags, first unfinished step, blockers, and prompt exact.
const expectedIndStatus: WorkflowStatus = {
  type: "ind",
  name: "Investigational New Drug Application",
  totalSteps: 21,
  trackedSteps: 20,
  untrackedSteps: 1,
  completedSteps: 6,
  currentPhase: "Module 1 — Administrative",
  nextStep: {"id": "ind-21", "phase": "module-1", "title": "Cover letter", "description": "IND cover letter with sponsor info, drug name, phase, protocol list", "ctdSection": "1.2", "requiredArtifacts": ["cover_letter"], "commands": ["/draft 1.2"], "roles": ["ra_lead"], "depends": ["ind-1"], "criticalPath": true},
  criticalBlockers: ["Cover letter", "Investigator brochure", "Drug Substance (3.2.S)", "Drug Product (3.2.P)", "Quality Overall Summary (2.3)"],
  progressPercent: 30,
  phases: [
    { name: "Pre-IND Preparation", steps: [
      {"id": "ind-1", "title": "Define regulatory strategy", "complete": true, "critical": true},
      {"id": "ind-2", "title": "Pre-IND meeting request", "complete": true, "critical": true},
      {"id": "ind-3", "title": "Nonclinical data package", "complete": true, "critical": true},
    ] },
    { name: "Module 1 — Administrative", steps: [
      {"id": "ind-4", "title": "Form FDA 1571", "complete": true, "critical": true},
      {"id": "ind-21", "title": "Cover letter", "complete": false, "critical": true},
      {"id": "ind-5", "title": "Form 1572 (Investigators)", "complete": false, "critical": false},
      {"id": "ind-6", "title": "Investigator brochure", "complete": false, "critical": true},
    ] },
    { name: "Module 3 — Quality (CMC)", steps: [
      {"id": "ind-12", "title": "Drug Substance (3.2.S)", "complete": false, "critical": true},
      {"id": "ind-13", "title": "Drug Product (3.2.P)", "complete": false, "critical": true},
    ] },
    { name: "Module 5 — Clinical", steps: [
      {"id": "ind-14", "title": "Clinical protocol", "complete": true, "critical": true},
      {"id": "ind-15", "title": "Statistical Analysis Plan", "complete": true, "critical": true},
    ] },
    { name: "Module 2 — CTD Summaries", steps: [
      {"id": "ind-7", "title": "Quality Overall Summary (2.3)", "complete": false, "critical": true},
      {"id": "ind-10", "title": "Nonclinical Written Summaries (2.6)", "complete": false, "critical": false},
      {"id": "ind-8", "title": "Nonclinical Overview (2.4)", "complete": false, "critical": true},
      {"id": "ind-11", "title": "Clinical Summary (2.7)", "complete": false, "critical": true},
      {"id": "ind-9", "title": "Clinical Overview (2.5)", "complete": false, "critical": true},
    ] },
    { name: "Pre-Submission Review", steps: [
      {"id": "ind-16", "title": "Full dossier preflight", "complete": false, "critical": true},
      {"id": "ind-17", "title": "Risk assessment", "complete": false, "critical": true},
      {"id": "ind-18", "title": "Reviewer question prep", "complete": false, "critical": false},
      {"id": "ind-19", "title": "Freeze and sign", "complete": null, "critical": true},
      {"id": "ind-20", "title": "Submit", "complete": false, "critical": true},
    ] },
  ],
};

const expectedIndPrompt = `

## Submission Workflow: Investigational New Drug Application
**Progress:** 6/20 tracked steps (30%); 1 step(s) are not tracked and may or may not have happened — ask, do not assume
**Current Phase:** Module 1 — Administrative

**Next Step:** Cover letter
> IND cover letter with sponsor info, drug name, phase, protocol list
Suggested commands: /draft 1.2
Responsible: ra_lead

**Critical Blockers (5):**
- Cover letter
- Investigator brochure
- Drug Substance (3.2.S)
- Drug Product (3.2.P)
- Quality Overall Summary (2.3)

**Phases:**
- Pre-IND Preparation: 3/3 tracked
- Module 1 — Administrative: 1/4 tracked
- Module 3 — Quality (CMC): 0/2 tracked
- Module 5 — Clinical: 2/2 tracked
- Module 2 — CTD Summaries: 0/5 tracked
- Pre-Submission Review: 0/4 tracked · 1 not tracked

Use this workflow status to guide the user. Tell them what to do next, which commands to use, and flag blockers. Be directive.`;

type Rows = { rows: Array<Record<string, unknown>> };
const healthyWorkflowRows: Rows[] = [
  { rows: [{ type: 'strategy_note' }, { type: 'form_1571' }, { type: 'sap' }] },
  { rows: [{ ctd_section: '1.6.1' }, { ctd_section: '4.2' }, { ctd_section: null }, { ctd_section: '' }] },
];
const workflowSql = [
  `SELECT DISTINCT type FROM concept2cure_artifacts
          WHERE organization_id = $2 AND project_id = $1 AND status != 'deleted'`,
  `SELECT DISTINCT ctd_section FROM concept2cure_artifacts
          WHERE organization_id = $2 AND project_id = $1
            AND content IS NOT NULL AND LENGTH(content) > 100`,
];
const readIndex = (sql: string) => sql.includes('SELECT DISTINCT type') ? 0 : 1;
const completedIds = (status: WorkflowStatus) =>
  status.phases.flatMap(phase => phase.steps).filter(step => step.complete === true).map(step => step.id);
const deferredRows = () => {
  let resolve!: (value: Rows) => void;
  const promise = new Promise<Rows>(r => { resolve = r; });
  return { promise, resolve };
};

const useWorkflowFakeTimers = () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
};

describe('workflow reads overlap while preserving status and prompt meaning', () => {
  useWorkflowFakeTimers();

  it.each([
    { mode: 'status', first: 0 },
    { mode: 'status', first: 1 },
    { mode: 'prompt', first: 0 },
    { mode: 'prompt', first: 1 },
  ])('starts both reads before settlement and preserves $mode when read $first finishes first', async ({ mode, first }) => {
    const reads = [deferredRows(), deferredRows()];
    poolQuery.mockImplementation((sql: string) => reads[readIndex(sql)].promise);
    const settled = vi.fn();
    const pending = mode === 'status'
      ? getWorkflowStatus(42, 'IND', 7).then(settled)
      : buildWorkflowContext(42, 'IND', 7).then(settled);
    try {
      // No read has resolved: serial await cannot pass this admission check.
      expect(poolQuery).toHaveBeenCalledTimes(2);
      expect(poolQuery.mock.calls.map(call => call[0])).toEqual(workflowSql);
      expect(poolQuery.mock.calls.map(call => call[1])).toEqual([[42, 7], [42, 7]]);
      reads[first].resolve(healthyWorkflowRows[first]);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      const last = 1 - first;
      reads[last].resolve(healthyWorkflowRows[last]);
      await pending;
      expect(settled).toHaveBeenCalledTimes(1);
      expect(settled.mock.calls[0][0]).toEqual(mode === 'status' ? expectedIndStatus : expectedIndPrompt);
    } finally {
      reads.forEach((read, index) => read.resolve(healthyWorkflowRows[index]));
      await pending;
    }
  });

  it.each([[125, 750], [750, 125]])('finishes after the slowest scripted read (%sms, %sms)', async (artifactMs, sectionMs) => {
    const delays = [artifactMs, sectionMs];
    poolQuery.mockImplementation((sql: string) => {
      const index = readIndex(sql);
      return new Promise<Rows>(resolve => setTimeout(() => resolve(healthyWorkflowRows[index]), delays[index]));
    });
    const settled = vi.fn();
    const pending = getWorkflowStatus(42, 'ind', 7).then(settled);
    try {
      await vi.advanceTimersByTimeAsync(749);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(settled.mock.calls[0][0]).toEqual(expectedIndStatus);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      // Also drain the sequential baseline when the regression check fails.
      await vi.advanceTimersByTimeAsync(artifactMs + sectionMs);
      await pending;
    }
  });
});

describe('workflow reads preserve independent failure defaults', () => {
  useWorkflowFakeTimers();

  it.each([
    { failed: 0, failure: 'throw' },
    { failed: 0, failure: 'reject' },
    { failed: 1, failure: 'throw' },
    { failed: 1, failure: 'reject' },
  ])('retains the surviving evidence when read $failed fails by $failure', async ({ failed, failure }) => {
    const survivor = deferredRows();
    poolQuery.mockImplementation((sql: string) => {
      if (readIndex(sql) !== failed) return survivor.promise;
      if (failure === 'throw') throw new Error('query threw synchronously');
      return Promise.reject(new Error('query rejected'));
    });
    const settled = vi.fn();
    const pending = getWorkflowStatus(42, 'ind', 7).then(settled);
    try {
      expect(poolQuery).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      survivor.resolve(healthyWorkflowRows[1 - failed]);
      await pending;
      const status = settled.mock.calls[0][0] as WorkflowStatus;
      expect(completedIds(status)).toEqual(failed === 0 ? ['ind-2', 'ind-3'] : ['ind-1', 'ind-4', 'ind-14', 'ind-15']);
      expect(status.completedSteps).toBe(failed === 0 ? 2 : 4);
      expect(status.progressPercent).toBe(failed === 0 ? 10 : 20);
      expect(status.nextStep?.id).toBe(failed === 0 ? 'ind-1' : 'ind-2');
      expect(status.criticalBlockers[0]).toBe(failed === 0 ? 'Define regulatory strategy' : 'Pre-IND meeting request');
    } finally {
      survivor.resolve(healthyWorkflowRows[1 - failed]);
      await pending;
    }
  });

  it.each(['throw', 'reject'])('retains both original empty defaults when both reads %s', async failure => {
    const emptyStatus = await getWorkflowStatus(42, 'ind', undefined);
    poolQuery.mockImplementation(() => {
      if (failure === 'throw') throw new Error('query threw synchronously');
      return Promise.reject(new Error('query rejected'));
    });
    expect(await getWorkflowStatus(42, 'ind', 7)).toEqual(emptyStatus);
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });
});

describe('workflow reads preserve scope and guards', () => {
  useWorkflowFakeTimers();

  it('keeps concurrent tenant/project evidence separate and reads fresh evidence again', async () => {
    const rowsByScope = new Map<string, Rows[]>([
      ['[42,7]', [{ rows: [{ type: 'strategy_note' }] }, { rows: [] }]],
      ['[42,8]', [{ rows: [{ type: 'sap' }] }, { rows: [{ ctd_section: '4.2' }] }]],
      ['["uuid-project",7]', [{ rows: [] }, { rows: [{ ctd_section: '3.2.P' }] }]],
    ]);
    poolQuery.mockImplementation((sql: string, args: unknown[]) => Promise.resolve(rowsByScope.get(JSON.stringify(args))![readIndex(sql)]));
    const [a, b, c] = await Promise.all([
      getWorkflowStatus(42, 'ind', 7),
      getWorkflowStatus(42, 'ind', 8),
      getWorkflowStatus('uuid-project', 'ind', 7),
    ]);
    expect(completedIds(a!)).toEqual(['ind-1']);
    expect(completedIds(b!)).toEqual(['ind-3', 'ind-14', 'ind-15']);
    expect(completedIds(c!)).toEqual(['ind-13']);
    for (const args of [[42, 7], [42, 8], ['uuid-project', 7]]) {
      expect(poolQuery.mock.calls.filter(call => JSON.stringify(call[1]) === JSON.stringify(args))).toHaveLength(2);
    }
    rowsByScope.set('[42,7]', [{ rows: [{ type: 'form_1571' }] }, { rows: [{ ctd_section: '1.6.1' }] }]);
    const fresh = await getWorkflowStatus(42, 'ind', 7);
    expect(poolQuery).toHaveBeenCalledTimes(8);
    expect(completedIds(fresh!)).toEqual(['ind-2', 'ind-4']);
    expect(completedIds(a!)).toEqual(['ind-1']);
  });

  it.each([undefined, 0, -1, NaN, Infinity, -Infinity])('reads nothing for invalid organization %s', async organizationId => {
    const status = await getWorkflowStatus(42, 'ind', organizationId);
    expect(status).toBeTruthy();
    expect(status!.completedSteps).toBe(0);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('reads nothing for an unknown workflow and preserves its empty prompt', async () => {
    expect(await getWorkflowStatus(42, 'not-a-real-type', 7)).toBeNull();
    expect(await buildWorkflowContext(42, 'not-a-real-type', 7)).toBe('');
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
