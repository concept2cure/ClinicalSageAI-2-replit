/**
 * Tenant-isolation contract test — workflow templates.
 *
 * Second instance of the Nano Banana cache class, found while sweeping for it.
 * server/services/WorkflowService.ts held a process-global LRU keyed
 * `template:${templateId}` with no tenant in the key, sitting in front of a
 * lookup that filtered on the primary key alone:
 *
 *     .where(eq(workflowTemplates.id, templateId))
 *
 * `public.workflow_templates` is not RLS-protected (the 20260206 migration
 * enables row-level security on the unrelated `orchestration.*` run tables), so
 * that query was the only tenant boundary there was, and it had none. Two
 * defects, either one sufficient on its own:
 *
 *   1. GET /api/module-integration/templates/:id returned any organization's
 *      template — name, description, and every step with its approver ids.
 *   2. The cache in front of it stored a row fetched for organization A under a
 *      key shared by all organizations. A filtered query does not help if the
 *      cache ahead of it does not say whose row it holds.
 *
 * And a third, downstream: startWorkflow stamped the new `document_workflows`
 * row with `template.organizationId` — the org of a row the CALLER chose —
 * rather than the caller's own. A user in one organization could file a
 * workflow record inside another organization's tenancy.
 *
 * The fake database below honours the WHERE clause it is handed, so an
 * unfiltered query returns the row exactly as PostgreSQL would without RLS.
 * That is what makes these tests fail against the pre-fix service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tables are identified by NAME, not by object identity.
 *
 * `vi.resetModules()` below gives the service under test a fresh copy of the
 * schema module, so its `workflowTemplates` is a different object from any this
 * file could import. Drizzle stamps the table name under a global-registry
 * symbol, which survives that.
 */
const DRIZZLE_NAME = Symbol.for('drizzle:Name');
const tableName = (table: unknown): string =>
  (table as any)?.[DRIZZLE_NAME] ?? '';

const TEMPLATES = 'workflow_templates';
const STEPS = 'workflow_steps';

const ORG_A = 7;
const ORG_B = 991;
const TEMPLATE_ID = 5;

/**
 * Pull the (column, bound value) pairs out of a drizzle condition.
 *
 * The conditions under test are conjunctions of `eq(column, value)`, whose
 * query chunks emit the column and its parameter in order — verified against
 * drizzle directly: `and(eq(id,5), eq(organizationId,7))` walks to
 * columns ["id","organization_id"], params [5,7].
 */
function readEqualities(condition: any): Record<string, unknown> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && node.table) columns.push(node.name);
    if ('value' in node && node.encoder) params.push(node.value);
    for (const chunk of node.queryChunks ?? []) walk(chunk);
  };
  walk(condition);
  const out: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    out[col] = params[i];
  });
  return out;
}

interface DbTrace {
  selects: Array<{ table: string; filter: Record<string, unknown> }>;
  updates: Array<{ table: string; filter: Record<string, unknown>; values: any }>;
  inserts: Array<{ table: string; values: any }>;
}

/**
 * Minimal drizzle-shaped stand-in that actually applies the WHERE it is given.
 * Rows are the fixture; a query with no `organization_id` predicate sees every
 * row, which is precisely how the unfixed code leaked.
 */
function makeFakeDb(rows: { templates: any[]; steps: any[] }) {
  const trace: DbTrace = { selects: [], updates: [], inserts: [] };
  let nextId = 100;

  const rowsFor = (table: unknown): any[] => {
    if (tableName(table) === TEMPLATES) return rows.templates;
    if (tableName(table) === STEPS) return rows.steps;
    return [];
  };

  const applyFilter = (candidates: any[], filter: Record<string, unknown>) =>
    candidates.filter(row =>
      Object.entries(filter).every(([col, value]) => {
        if (col === 'id') return row.id === value;
        if (col === 'organization_id') return row.organizationId === value;
        if (col === 'template_id') return row.templateId === value;
        return true;
      })
    );

  const selectBuilder = () => {
    let table: unknown;
    let filter: Record<string, unknown> = {};
    const q: any = {
      from(t: unknown) {
        table = t;
        return q;
      },
      where(condition: any) {
        filter = readEqualities(condition);
        return q;
      },
      limit() {
        return q;
      },
      orderBy() {
        return q;
      },
      then(resolve: any, reject: any) {
        trace.selects.push({ table: tableName(table), filter });
        return Promise.resolve(applyFilter(rowsFor(table), filter)).then(resolve, reject);
      },
    };
    return q;
  };

  const insertBuilder = (table: unknown) => {
    let values: any;
    const settle = () => {
      trace.inserts.push({ table: tableName(table), values });
      return [{ id: (nextId += 1), ...(values ?? {}) }];
    };
    const q: any = {
      values(v: any) {
        values = v;
        return q;
      },
      returning() {
        return Promise.resolve(settle());
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(settle()).then(resolve, reject);
      },
    };
    return q;
  };

  const updateBuilder = (table: unknown) => {
    let values: any;
    let filter: Record<string, unknown> = {};
    const settle = () => {
      trace.updates.push({ table: tableName(table), filter, values });
      return applyFilter(rowsFor(table), filter).map(row => ({ ...row, ...values }));
    };
    const q: any = {
      set(v: any) {
        values = v;
        return q;
      },
      where(condition: any) {
        filter = readEqualities(condition);
        return q;
      },
      returning() {
        return Promise.resolve(settle());
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(settle()).then(resolve, reject);
      },
    };
    return q;
  };

  const handle: any = {
    select: () => selectBuilder(),
    insert: (t: unknown) => insertBuilder(t),
    update: (t: unknown) => updateBuilder(t),
    delete: () => ({ where: () => Promise.resolve([]) }),
    transaction: (fn: any) => fn(handle),
  };

  return { db: handle, trace };
}

/** A template owned by ORG_A, plus its steps. */
const fixture = () => ({
  templates: [
    {
      id: TEMPLATE_ID,
      name: 'ACME-401 dossier review',
      description: 'internal approval chain',
      organizationId: ORG_A,
      moduleType: 'cer',
      isActive: true,
    },
  ],
  steps: [
    {
      id: 1,
      templateId: TEMPLATE_ID,
      order: 1,
      approverType: 'user',
      approverIds: [42],
      requiredActions: [],
    },
  ],
});

let WorkflowService: any;

beforeEach(async () => {
  // Fresh module instance per test — the template cache is module-global, and a
  // cache that survived between tests would let one test's entry answer the
  // next test's read.
  vi.resetModules();
  WorkflowService = (await import('../../services/WorkflowService')).WorkflowService;
});

describe('Workflow templates — cross-tenant reads', () => {
  it('does not return another organization\'s template', async () => {
    const { db } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    const mine = await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);
    expect(mine).toBeTruthy();
    expect(mine.name).toBe('ACME-401 dossier review');

    const theirs = await service.getWorkflowTemplate(TEMPLATE_ID, ORG_B);
    expect(theirs).toBeNull();
  });

  it('filters the lookup on organization, not on the primary key alone', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);

    const templateSelect = trace.selects.find(s => s.table === TEMPLATES);
    expect(templateSelect).toBeDefined();
    expect(templateSelect!.filter).toMatchObject({
      id: TEMPLATE_ID,
      organization_id: ORG_A,
    });
  });

  it('does not serve one organization a template cached for another', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);
    const queriesAfterA = trace.selects.filter(s => s.table === TEMPLATES).length;

    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_B);
    const queriesAfterB = trace.selects.filter(s => s.table === TEMPLATES).length;

    // The decisive assertion: organization B's read must reach the database on
    // its own behalf, not be answered out of a bucket organization A filled.
    expect(queriesAfterB).toBeGreaterThan(queriesAfterA);
  });

  it('still caches a repeat read for the same organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);
    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);

    expect(trace.selects.filter(s => s.table === TEMPLATES).length).toBe(1);
  });

  it('fails closed with no organization: no row, and no query at all', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(service.getWorkflowTemplate(TEMPLATE_ID, null)).resolves.toBeNull();
    await expect(service.getWorkflowTemplate(TEMPLATE_ID, undefined)).resolves.toBeNull();
    await expect(service.getWorkflowTemplate(TEMPLATE_ID, '')).resolves.toBeNull();
    expect(trace.selects).toHaveLength(0);
  });
});

describe('Workflow templates — cache invalidation follows the scoped key', () => {
  it('re-reads after an update rather than serving the stale cached template', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);
    const before = trace.selects.filter(s => s.table === TEMPLATES).length;

    await service.updateWorkflowTemplate(TEMPLATE_ID, { name: 'renamed' }, 'user-1', ORG_A);
    await service.getWorkflowTemplate(TEMPLATE_ID, ORG_A);

    const after = trace.selects.filter(s => s.table === TEMPLATES).length;
    expect(after).toBeGreaterThan(before);
  });

  it('scopes the update itself to the organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.updateWorkflowTemplate(TEMPLATE_ID, { name: 'renamed' }, 'user-1', ORG_B);

    const update = trace.updates.find(u => u.table === TEMPLATES);
    expect(update).toBeDefined();
    expect(update!.filter).toMatchObject({ id: TEMPLATE_ID, organization_id: ORG_B });
  });
});

describe('Workflow start — the tenant comes from the caller', () => {
  it('refuses to start a workflow from another organization\'s template', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(
      service.startWorkflow(1234, TEMPLATE_ID, 'user-1', ORG_B, {}),
    ).rejects.toThrow(/not found/i);

    // Nothing may have been filed into ORG_A's tenancy on ORG_B's behalf.
    expect(trace.inserts).toHaveLength(0);
  });

  it('stamps the new workflow with the caller\'s organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.startWorkflow(1234, TEMPLATE_ID, 'user-1', ORG_A, { note: 'kickoff' });

    const workflowInsert = trace.inserts[0];
    expect(workflowInsert.values.organizationId).toBe(ORG_A);
    // metadata stays metadata; it is not the channel the tenant travels on.
    expect(workflowInsert.values.metadata).toEqual({ note: 'kickoff' });
  });

  it('fails closed when the caller has no organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(
      service.startWorkflow(1234, TEMPLATE_ID, 'user-1', null, {}),
    ).rejects.toThrow(/organization context/i);
    expect(trace.inserts).toHaveLength(0);
  });
});
