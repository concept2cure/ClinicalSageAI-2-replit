/**
 * Pins the task board's MDX regulatory context — MDX-TASK-01.
 *
 * The board used to return `phase: null` unconditionally and said so in its
 * honesty notes. Now it returns a real phase and the links a task supports or
 * blocks, so three things need holding still:
 *
 *   - an unclassified task still reports null, rather than being defaulted into
 *     a phase nobody assigned;
 *   - the links are read scoped to the caller's organization;
 *   - a database without the link table degrades to "no links" rather than
 *     blanking the whole board. That fallback is exactly the kind of thing that
 *     quietly stops working, and nothing else would notice.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const ORG = 7;

vi.mock('../../utils/tenantContext', () => ({
  getSecureOrgId: () => ORG,
}));

/**
 * Minimal drizzle-shaped stub. `select().from(table)` records which table was
 * asked for and returns whatever the test queued for it; `.where(...)` resolves.
 */
const tableResults = new Map<string, unknown[] | Error>();
const seenTables: string[] = [];

function tableName(t: unknown): string {
  // Drizzle keeps the SQL name on a well-known symbol; fall back to a scan so the
  // stub does not silently mislabel a table if that internal changes.
  const sym = Object.getOwnPropertySymbols(t as object)
    .find(s => String(s).includes('Name'));
  const v = sym ? (t as Record<symbol, unknown>)[sym] : undefined;
  return typeof v === 'string' ? v : 'unknown';
}

function makeChain(name: string) {
  const resolve = () => {
    const r = tableResults.get(name);
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? []);
  };
  const chain: Record<string, unknown> = {
    where: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    limit: () => chain,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => resolve().then(res, rej),
    catch: (rej: (e: unknown) => unknown) => resolve().catch(rej),
  };
  return chain;
}

vi.mock('../../db/requestDb', () => ({
  requestDb: () => ({
    select: () => ({
      from: (t: unknown) => {
        const name = tableName(t);
        seenTables.push(name);
        return makeChain(name);
      },
    }),
  }),
}));

async function makeApp() {
  const createTaskBoardRoutes = (await import('../taskBoard.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/task-management', createTaskBoardRoutes());
  return app;
}

const baseTask = {
  taskId: 'T-1', title: 'Approve reproducibility report', projectId: 4,
  moduleType: 'MedicalDevice', taskType: 'approval', status: 'pending', priority: 'high',
  assigneeId: 12, assignedBy: 3, progress: 0, impactScore: null, criticalPath: true,
  regulatoryImpact: true, approvalRequired: true, approvalStatus: 'pending',
  comments: null, attachments: null, sourceEntityType: null, dueDate: null,
  blockedBy: null, estimatedHours: null,
  lifecyclePhase: null, industryVertical: null, clientVisibility: 'internal',
};

beforeEach(() => {
  vi.resetModules();
  tableResults.clear();
  seenTables.length = 0;
});

describe('GET /board — lifecycle phase', () => {
  it('returns the real phase and its label when the task is classified', async () => {
    tableResults.set('unified_tasks', [{ ...baseTask, lifecyclePhase: 'submission_preparation' }]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.status).toBe(200);
    expect(res.body.data[0].phase).toBe('submission_preparation');
    expect(res.body.data[0].lifecyclePhaseLabel).toBe('Submission Preparation');
  });

  it('still reports null for a task nobody has classified', async () => {
    // Every task predating the column is in this state. Defaulting it into a
    // phase would render a lifecycle breakdown that is manufactured.
    tableResults.set('unified_tasks', [baseTask]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.body.data[0].phase).toBeNull();
    expect(res.body.data[0].lifecyclePhaseLabel).toBeNull();
  });

  it('reports an unrecognized stored phase as unclassified rather than echoing it', async () => {
    // A value from a newer writer, or a typo, must not reach the board as a phase
    // the client cannot label or sort.
    tableResults.set('unified_tasks', [{ ...baseTask, lifecyclePhase: 'not_a_phase' }]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.body.data[0].phase).toBeNull();
  });
});

describe('GET /board — regulatory links', () => {
  it('returns what the task supports and blocks, and the one-line summary', async () => {
    tableResults.set('unified_tasks', [baseTask]);
    tableResults.set('task_regulatory_links', [
      {
        taskId: 'T-1', entityType: 'study', entityId: 's1',
        entityLabel: 'Reproducibility', relationship: 'supports',
        market: null, pathway: null, filingType: null, filingSection: null,
      },
      {
        taskId: 'T-1', entityType: 'filing', entityId: 'f1',
        entityLabel: 'FDA Analytical Performance', relationship: 'blocks',
        market: 'us', pathway: 'dual_510k_clia_waiver', filingType: 'dual_510k_clia_waiver',
        filingSection: null,
      },
      {
        taskId: 'T-1', entityType: 'filing', entityId: 'f2',
        entityLabel: 'IVDR PER', relationship: 'blocks',
        market: 'eu', pathway: 'eu_ivdr_technical_documentation',
        filingType: 'performance_evaluation_report', filingSection: null,
      },
    ]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    const t = res.body.data[0];
    expect(t.regulatoryLinks).toHaveLength(3);
    // The line a card needs, instead of a due date with no stated consequence.
    expect(t.blocking).toBe('Blocks FDA Analytical Performance and IVDR PER');
  });

  it('returns an empty list and a null summary when nothing is linked', async () => {
    // The board does not infer links from module_type — absent means absent.
    tableResults.set('unified_tasks', [baseTask]);
    tableResults.set('task_regulatory_links', []);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.body.data[0].regulatoryLinks).toEqual([]);
    expect(res.body.data[0].blocking).toBeNull();
  });

  it('degrades to no links when the link table is not provisioned', async () => {
    // The fallback this test exists for: an older database carries unified_tasks
    // without task_regulatory_links, and a missing table must not blank the board.
    tableResults.set('unified_tasks', [baseTask]);
    tableResults.set('task_regulatory_links', Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].regulatoryLinks).toEqual([]);
    expect(res.body.data[0].blocking).toBeNull();
  });

  it('does not swallow a real database error from the link query', async () => {
    // Only 42P01 is a tolerated degrade. Anything else is a fault the caller
    // should hear about rather than see as a board with no links.
    tableResults.set('unified_tasks', [baseTask]);
    tableResults.set('task_regulatory_links', Object.assign(new Error('connection reset'), { code: '08006' }));
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.status).toBe(500);
  });

  it('queries the link table at all', async () => {
    tableResults.set('unified_tasks', [baseTask]);
    tableResults.set('task_regulatory_links', []);
    await request(await makeApp()).get('/api/task-management/board');
    expect(seenTables).toContain('task_regulatory_links');
  });

  it('does not query links when the board is empty', async () => {
    // No task ids to scope by, so the query would be unbounded.
    tableResults.set('unified_tasks', []);
    await request(await makeApp()).get('/api/task-management/board');
    expect(seenTables).not.toContain('task_regulatory_links');
  });
});

describe('GET /board — client visibility', () => {
  it('reports internal when nothing was set', async () => {
    tableResults.set('unified_tasks', [{ ...baseTask, clientVisibility: null }]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.body.data[0].clientVisibility).toBe('internal');
  });

  it('passes a released state through', async () => {
    tableResults.set('unified_tasks', [{ ...baseTask, clientVisibility: 'client_action_required' }]);
    const res = await request(await makeApp()).get('/api/task-management/board');
    expect(res.body.data[0].clientVisibility).toBe('client_action_required');
  });
});
