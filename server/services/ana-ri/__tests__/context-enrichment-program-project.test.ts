/**
 * AnA reads the project it is in (ana-14, 2026-10-08).
 *
 * The v2 app names the open project by its regulatory_programs UUID. The
 * enrichment readers key on the integer projects.id, and took the UUID raw:
 * getProjectIntelligence(Number(uuid)) is NaN and Postgres refuses it (22P02),
 * so every project-scoped turn marked the project profile unavailable and the
 * person read "Some project context could not be loaded"; the domain memory
 * reads ran `project_id = '<uuid>'` and failed in silence. The deadline suite
 * beside this one uses integer id 42 in every case, which is why it never
 * showed. These cases send the UUID.
 *
 * Three answers are kept apart: a linked project is read; a program with no
 * linked project reads nothing and asserts nothing about its records (the
 * model is told why); a lookup that could not tell (failed, or ran out of
 * time) is reported as 'project-record', with why, and is never read as "no
 * linked project", which used to give the model "No safety data found for
 * this project yet" when nobody had looked.
 *
 * Real here: enrichContextForChat, its budget, the strict resolution
 * (program-project-anchor.ts strictProjectRowForRef) and the anchor reader.
 * Replaced: the database (`h.query`, which refuses a non-integer project id
 * the way Postgres does), the profile reader, the workflow reader and the
 * live readiness engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  summary: vi.fn(),
  workflow: vi.fn(),
  readiness: vi.fn(),
  query: vi.fn(),
  /** The projects rows linked to the program (projects.regulatory_program_id). */
  anchorRows: [] as Array<{ id: number; clientWorkspaceId: number | null }>,
  /** What a project_memory_entries read does once its id is valid. */
  memory: null as null | (() => Promise<{ rows: unknown[] }>),
}));
// The anchor reader takes a raw `{ query }` connection as well as Drizzle.
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: h.summary }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: h.workflow }));
vi.mock('../../intelligence/readiness-scoring-engine.js', () => ({ computeReadinessScore: h.readiness }));
import { enrichContextForChat } from '../context-enrichment';

const PROGRAM = 'd6160c9f-33d2-4be9-b779-eb27375f6e49';
const PROFILE = {
  regulatoryStrategy: 'Retain stability arm', riskFactors: [], openQuestions: [], keyDecisions: [],
  learnedInsights: [], documentStats: { totalIngested: 2 }, memoryEntryCount: 3,
};
const integerRefused = (value: unknown) =>
  Object.assign(new Error(`invalid input syntax for type integer: "${String(value)}"`), { code: '22P02' });
const stalled = () => new Promise<never>(() => {});

const connectionLost = () => Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
/** "Nothing recorded", said of a project: only a read that completed and found no rows may say it. */
const AFFIRMATIVE_ABSENCE = /No [\w /-]+ data found for this project yet/;

const anchorReads = () => h.query.mock.calls.filter(([sql]) => /regulatory_program_id = \$1/.test(String(sql)));
const memoryReads = () => h.query.mock.calls.filter(([sql]) => String(sql).includes('project_memory_entries'));

beforeEach(() => {
  h.anchorRows = [{ id: 42, clientWorkspaceId: null }];
  h.memory = null;
  h.summary.mockReset().mockImplementation(async (id: unknown) => {
    if (!Number.isInteger(id)) throw integerRefused(id);
    return PROFILE;
  });
  h.workflow.mockReset().mockImplementation(async (id: unknown) => {
    if (!Number.isInteger(id)) throw integerRefused(id);
    return 'Workflow context';
  });
  // The live engine is unavailable unless a case says otherwise: readiness falls back to project memory.
  h.readiness.mockReset().mockImplementation(async () => { throw new Error('readiness engine unavailable'); });
  h.query.mockReset().mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/regulatory_program_id = \$1/.test(sql)) return { rows: h.anchorRows };
    if (sql.includes('project_memory_entries')) {
      if (typeof params[0] !== 'number') throw integerRefused(params[0]);
      return h.memory ? h.memory() : { rows: [] };
    }
    return { rows: [] };
  });
});
afterEach(() => { vi.useRealTimers(); });

const SEARCH = 'Search my connected repositories for documents relevant to this project.';
const MODULE_25 = 'Draft the Module 2.5 clinical overview for Vorelinib BX-512.';

describe('a program UUID reads the project linked to it', () => {
  it('reads the profile and workflow of the linked project, org-scoped, and reports nothing unavailable', async () => {
    const result = await enrichContextForChat({ message: SEARCH, projectId: PROGRAM, organizationId: 7, submissionType: 'IND' });

    expect(anchorReads()).toHaveLength(1);
    expect(anchorReads()[0][1]).toEqual([PROGRAM, 7]);
    expect(h.summary).toHaveBeenCalledWith(42, 7);
    expect(h.workflow).toHaveBeenCalledWith(42, 'IND', 7);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.sources).toContain('project-profile');
    expect(result.block).toContain('Retain stability arm');
    expect(result.block).not.toContain('Enrichment context unavailable');
  });

  it('a program with no linked project is an honest empty: nothing read, nothing unavailable, and the model is told why', async () => {
    h.anchorRows = [];
    const result = await enrichContextForChat({ message: SEARCH, projectId: PROGRAM, organizationId: 7, submissionType: 'IND' });

    expect(h.summary).not.toHaveBeenCalled();
    expect(h.workflow).not.toHaveBeenCalled();
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.block).not.toContain('Enrichment context unavailable');
    expect(result.enrichmentMeta?.hasProjectContext).toBe(true);
    // Nothing was read, so the model is told that, and told not to infer either way.
    expect(result.block).toContain('## Project records');
    expect(result.block).toContain('no linked project record');
    expect(result.block).toContain('submission workflow progress');
    expect(result.block).toContain('Do not state or imply that this project has, or lacks, any recorded data');
  });

  it('a database without the anchor column is no linked project, not a failure', async () => {
    h.query.mockImplementation(async (sql: string) => {
      if (/regulatory_program_id = \$1/.test(sql)) throw Object.assign(new Error('column "regulatory_program_id" does not exist'), { code: '42703' });
      return { rows: [] };
    });
    const result = await enrichContextForChat({ message: SEARCH, projectId: PROGRAM, organizationId: 7 });

    expect(h.summary).not.toHaveBeenCalled();
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });

  it('eCTD project memory is read by the integer project id, never the UUID', async () => {
    const result = await enrichContextForChat({ message: MODULE_25, projectId: PROGRAM, organizationId: 7 });

    expect(memoryReads().length).toBeGreaterThan(0);
    for (const [, params] of memoryReads()) expect((params as unknown[])[0]).toBe(42);
    expect(result.enrichmentMeta?.sourcesFailed).not.toContain('ectd');
    expect(result.sources).toContain('ectd');
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });

  it.each(['/safety', '/cmc', '/csr', '/device', '/cms', '/diagnostics', '/ectd', MODULE_25])(
    'with no linked project, %s reads no memory and says nothing about what is recorded; it is not a failure',
    async message => {
      h.anchorRows = [];
      const result = await enrichContextForChat({ message, projectId: PROGRAM, organizationId: 7 });

      expect(memoryReads()).toHaveLength(0);
      expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
      // Nobody looked, so no "No {domain} data found for this project yet".
      expect(result.block).not.toMatch(AFFIRMATIVE_ABSENCE);
      expect(result.block).toContain('no linked project record');
    },
  );

  it('the CMC build state keeps the program UUID; CMC memory takes the integer', async () => {
    await enrichContextForChat({ message: '/cmc', projectId: PROGRAM, organizationId: 7 });

    const buildState = h.query.mock.calls.filter(([sql]) => /cmc_module3_sections|cmc_source_objects/.test(String(sql)));
    expect(buildState.length).toBeGreaterThan(0);
    for (const [, params] of buildState) expect(params).toEqual([PROGRAM, 7]);
    expect(memoryReads().length).toBeGreaterThan(0);
    for (const [, params] of memoryReads()) expect((params as unknown[])[0]).toBe(42);
  });

  it('a project the caller already resolved is used as given, with no second lookup', async () => {
    const result = await enrichContextForChat({ message: SEARCH, projectId: PROGRAM, project: { status: 'linked', id: 42 }, organizationId: 7 });

    expect(anchorReads()).toHaveLength(0);
    expect(h.summary).toHaveBeenCalledWith(42, 7);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });

  it('an integer project id is still itself, with no lookup', async () => {
    await enrichContextForChat({ message: SEARCH, projectId: 42, organizationId: 7 });
    expect(anchorReads()).toHaveLength(0);
    expect(h.summary).toHaveBeenCalledWith(42, 7);
  });
});

describe('a project lookup that could not tell is reported, never read as "no linked project"', () => {
  it.each(['/safety', '/cmc', '/csr', MODULE_25])('a failed lookup on %s marks the project records unavailable and asserts no absence', async message => {
    h.query.mockImplementation(async (sql: string) => {
      if (/regulatory_program_id = \$1/.test(sql)) throw connectionLost();
      return { rows: [] };
    });
    const result = await enrichContextForChat({ message, projectId: PROGRAM, organizationId: 7 });

    expect(result.enrichmentMeta?.unavailableSources).toEqual(['project-record']);
    expect(result.enrichmentMeta?.unavailableReasons).toEqual({ 'project-record': 'error' });
    expect(result.block).toContain('Enrichment context unavailable: project-record (read failed)');
    expect(result.block).not.toMatch(AFFIRMATIVE_ABSENCE);
    // Could not tell is not "no linked project": the model is not told there is none.
    expect(result.block).not.toContain('no linked project record');
    expect(memoryReads()).toHaveLength(0);
    expect(h.summary).not.toHaveBeenCalled();
  });

  it('an unresolved project from the caller is reported with its reason, and nothing is looked up again', async () => {
    const result = await enrichContextForChat({
      message: '/safety', projectId: PROGRAM, project: { status: 'unresolved', reason: 'timeout' }, organizationId: 7,
    });

    expect(anchorReads()).toHaveLength(0);
    expect(result.enrichmentMeta?.unavailableReasons).toEqual({ 'project-record': 'timeout' });
    expect(result.block).toContain('project-record (took too long to read)');
    expect(result.block).not.toMatch(AFFIRMATIVE_ABSENCE);
  });

  it('a program with no organization to scope its lookup is could-not-tell, not "no linked project"', async () => {
    const result = await enrichContextForChat({ message: '/safety', projectId: PROGRAM });

    expect(anchorReads()).toHaveLength(0);
    expect(result.enrichmentMeta?.unavailableReasons).toEqual({ 'project-record': 'error' });
    expect(result.block).not.toMatch(AFFIRMATIVE_ABSENCE);
  });
});

describe('a request that reads several sources reports each on its own', () => {
  it('/submit keeps the readiness it read when only the eCTD memory read fails, and names only eCTD', async () => {
    h.readiness.mockResolvedValue({ overallScore: 61, trend: { direction: 'up' }, predictions: null, dimensions: {}, gaps: [] });
    h.memory = async () => { throw connectionLost(); };
    const result = await enrichContextForChat({ message: '/submit', projectId: 42, organizationId: 7 });

    expect(result.block).toContain('Overall Score: 61/100');
    expect(result.enrichmentMeta?.unavailableSources).toEqual(['ectd']);
    expect(result.enrichmentMeta?.unavailableReasons).toEqual({ ectd: 'error' });
    expect(result.block).not.toContain('No eCTD data found');
  });

  it('/cmc keeps the Module 3 build state when the CMC memory read fails, and names only the CMC records', async () => {
    h.memory = async () => { throw connectionLost(); };
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes('project_memory_entries')) return h.memory!();
      if (sql.includes('cmc_source_objects')) return { rows: [{ source_type: 'batch_record', cnt: 2 }] };
      return { rows: [] };
    });
    const result = await enrichContextForChat({ message: '/cmc', projectId: PROGRAM, project: { status: 'linked', id: 42 }, organizationId: 7 });

    expect(result.block).toContain('## Module 3 Build State');
    expect(result.block).toContain('batch_record (2)');
    expect(result.enrichmentMeta?.unavailableSources).toEqual(['cmc']);
    expect(result.block).not.toContain('No CMC data found');
  });
});

describe('a source that could not be read is reported, with why', () => {
  it('a failed domain-memory read marks the source unavailable instead of passing as empty', async () => {
    h.memory = async () => { throw Object.assign(new Error('terminating connection'), { code: '57P01' }); };
    const result = await enrichContextForChat({ message: MODULE_25, projectId: 42, organizationId: 7 });

    expect(result.enrichmentMeta?.unavailableSources).toContain('ectd');
    expect(result.enrichmentMeta?.unavailableReasons?.ectd).toBe('error');
    expect(result.block).toContain('Enrichment context unavailable: ectd (read failed)');
    // Never the affirmative absence on a failed read.
    expect(result.block).not.toContain('No eCTD data found');
  });

  it('records a timeout as a timeout and a failure as a failure', async () => {
    vi.useFakeTimers();
    h.summary.mockImplementation(stalled);
    h.workflow.mockRejectedValue(new Error('workflow read failed'));
    const settled = vi.fn();
    const pending = enrichContextForChat({ message: SEARCH, projectId: 42, organizationId: 7, submissionType: 'IND' }).then(settled);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    const result = settled.mock.calls[0][0];

    expect(result.enrichmentMeta.unavailableReasons).toEqual({ 'project-profile': 'timeout', workflow: 'error' });
    expect(result.block).toContain('project-profile (took too long to read)');
    expect(result.block).toContain('workflow (read failed)');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a project lookup that cannot finish marks the project record unavailable and reads nothing', async () => {
    vi.useFakeTimers();
    h.query.mockImplementation(async (sql: string) => {
      if (/regulatory_program_id = \$1/.test(sql)) return stalled();
      return { rows: [] };
    });
    const settled = vi.fn();
    const pending = enrichContextForChat({ message: SEARCH, projectId: PROGRAM, organizationId: 7 }).then(settled);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    const result = settled.mock.calls[0][0];

    expect(h.summary).not.toHaveBeenCalled();
    expect(result.enrichmentMeta.unavailableReasons).toEqual({ 'project-record': 'timeout' });
    expect(result.block).toContain('Enrichment context unavailable: project-record (took too long to read)');
    expect(vi.getTimerCount()).toBe(0);
  });
});
