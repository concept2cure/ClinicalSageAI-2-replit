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
const WORKFLOWS = 'document_workflows';
const APPROVALS = 'workflow_approvals';
const HISTORY = 'workflow_history';

const ORG_A = 7;
const ORG_B = 991;
const TEMPLATE_ID = 5;
const WORKFLOW_ID = 60;
const APPROVAL_ID = 70;
const DOCUMENT_ID = 1234;

/**
 * Pull the (column, bound value) pairs out of a drizzle condition.
 *
 * A drizzle condition walks to an ordered token stream — verified against
 * drizzle directly: `and(eq(documentId,1234), eq(organizationId,7),
 * isNull(completedAt), isNull(rejectedAt))` yields
 * col document_id, param 1234, col organization_id, param 7,
 * col completed_at, col rejected_at.
 *
 * So a column pairs with the parameter that immediately follows it. A
 * predicate carrying no parameter — `isNull(col)` — leaves its column
 * unpaired and is simply not modelled here, which is right: this fake only
 * needs the equality predicates, because those are where the tenant lives.
 * Pairing columns and params as two flat positional lists would misalign the
 * moment an isNull appeared, and silently mis-model the filter.
 */
function readEqualities(condition: any): Record<string, unknown> {
  const tokens: Array<{ kind: 'col' | 'param'; value: unknown }> = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && node.table) {
      tokens.push({ kind: 'col', value: node.name });
    } else if ('value' in node && node.encoder) {
      tokens.push({ kind: 'param', value: node.value });
    }
    for (const chunk of node.queryChunks ?? []) walk(chunk);
  };
  walk(condition);

  const out: Record<string, unknown> = {};
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i].kind === 'col' && tokens[i + 1].kind === 'param') {
      out[tokens[i].value as string] = tokens[i + 1].value;
    }
  }
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
interface FixtureRows {
  templates: any[];
  steps: any[];
  workflows?: any[];
  approvals?: any[];
  history?: any[];
}

function makeFakeDb(rows: FixtureRows) {
  const trace: DbTrace = { selects: [], updates: [], inserts: [] };
  let nextId = 100;

  const rowsFor = (table: unknown): any[] => {
    switch (tableName(table)) {
      case TEMPLATES: return rows.templates;
      case STEPS: return rows.steps;
      case WORKFLOWS: return rows.workflows ?? [];
      case APPROVALS: return rows.approvals ?? [];
      case HISTORY: return rows.history ?? [];
      default: return [];
    }
  };

  // Snake-cased column -> the camelCased field drizzle maps it to. A column
  // this fake does not model is not filtered on, never silently dropped.
  const COLUMN_TO_FIELD: Record<string, string> = {
    id: 'id',
    organization_id: 'organizationId',
    template_id: 'templateId',
    workflow_id: 'workflowId',
    document_id: 'documentId',
  };

  const applyFilter = (candidates: any[], filter: Record<string, unknown>) =>
    candidates.filter(row =>
      Object.entries(filter).every(([col, value]) => {
        const field = COLUMN_TO_FIELD[col];
        return field ? row[field] === value : true;
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
    // getDocumentWorkflow follows its scoped lookup with a relational query.
    // Stubbed so the method's own try/catch does not swallow a missing surface
    // and return null for a reason that has nothing to do with tenancy.
    query: {
      documentWorkflows: {
        findFirst: async () => (rows.workflows ?? [])[0] ?? null,
      },
    },
  };

  return { db: handle, trace };
}

/**
 * Everything below belongs to ORG_A: a template and its single step, an active
 * workflow on that template, the pending approval for its one step, and a
 * history row. ORG_B owns nothing here.
 */
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
  workflows: [
    {
      id: WORKFLOW_ID,
      documentId: DOCUMENT_ID,
      templateId: TEMPLATE_ID,
      organizationId: ORG_A,
      status: 'active',
      currentStep: 1,
      completedAt: null,
      rejectedAt: null,
    },
  ],
  approvals: [
    {
      id: APPROVAL_ID,
      workflowId: WORKFLOW_ID,
      stepId: 1,
      stepOrder: 1,
      status: 'pending',
      assignedTo: ['42'],
      assignmentType: 'user',
    },
  ],
  history: [
    { id: 1, workflowId: WORKFLOW_ID, action: 'workflow_started', performedBy: 'user-1' },
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

describe('Workflow approvals and history — reads are tenant-scoped', () => {
  it('does not return another organization\'s approvals', async () => {
    const { db } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    const mine = await service.getWorkflowApprovals(WORKFLOW_ID, ORG_A);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(APPROVAL_ID);

    const theirs = await service.getWorkflowApprovals(WORKFLOW_ID, ORG_B);
    expect(theirs).toEqual([]);
  });

  it('does not return another organization\'s workflow history', async () => {
    const { db } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    const mine = await service.getWorkflowHistory(WORKFLOW_ID, ORG_A);
    expect(mine).toHaveLength(1);

    // workflow_history is the audit trail of a governed approval chain — who
    // signed off what, when, with which comment.
    const theirs = await service.getWorkflowHistory(WORKFLOW_ID, ORG_B);
    expect(theirs).toEqual([]);
  });

  it('scopes the document-workflow lookup to the caller\'s organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await service.getDocumentWorkflow(DOCUMENT_ID, ORG_A);

    // Asserted on the emitted WHERE rather than the return value. This method
    // wraps its work in a try/catch that returns null on any error, so a null
    // result can mean "scoped correctly and found nothing" or "blew up on the
    // way" — the filter is the thing actually under test.
    const lookup = trace.selects.find(s => s.table === WORKFLOWS);
    expect(lookup).toBeDefined();
    expect(lookup!.filter).toMatchObject({
      document_id: DOCUMENT_ID,
      organization_id: ORG_A,
    });
  });

  it('finds no document workflow for an organization that owns none', async () => {
    const { db } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(service.getDocumentWorkflow(DOCUMENT_ID, ORG_B)).resolves.toBeNull();
  });

  it('fails closed with no organization on every id-addressed read', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(service.getWorkflowApprovals(WORKFLOW_ID, null)).resolves.toEqual([]);
    await expect(service.getWorkflowHistory(WORKFLOW_ID, null)).resolves.toEqual([]);
    await expect(service.getDocumentWorkflow(DOCUMENT_ID, null)).resolves.toBeNull();
    expect(trace.selects).toHaveLength(0);
  });
});

describe('Workflow approvals — a governed sign-off cannot cross tenants', () => {
  it('refuses to approve another organization\'s step, and writes nothing', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(
      service.approveWorkflowStep(APPROVAL_ID, 'user-b', 'looks fine', ORG_B),
    ).rejects.toThrow(/not found/i);

    // The pre-fix order marked the approval 'approved' and only afterwards
    // fetched the workflow, unfiltered. Nothing may be written before
    // ownership is known.
    expect(trace.updates).toHaveLength(0);
    expect(trace.inserts).toHaveLength(0);
  });

  it('refuses to reject another organization\'s step, and writes nothing', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(
      service.rejectWorkflowStep(APPROVAL_ID, 'user-b', 'no', ORG_B),
    ).rejects.toThrow(/not found/i);

    expect(trace.updates).toHaveLength(0);
    expect(trace.inserts).toHaveLength(0);
  });

  it('reports a foreign approval as "not found", never as "not pending"', async () => {
    // A completed approval owned by ORG_A. ORG_B must learn nothing about its
    // status — the ownership check runs before the pending check.
    const rows = fixture();
    rows.approvals[0].status = 'approved';
    const { db } = makeFakeDb(rows);
    const service = new WorkflowService(db);

    await expect(
      service.approveWorkflowStep(APPROVAL_ID, 'user-b', '', ORG_B),
    ).rejects.toThrow(/not found/i);
  });

  it('still approves a step inside the caller\'s own organization', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    const result = await service.approveWorkflowStep(APPROVAL_ID, 'user-a', 'approved', ORG_A);

    expect(result.isCompleted).toBe(true);
    const approvalUpdate = trace.updates.find(u => u.table === APPROVALS);
    expect(approvalUpdate!.values.status).toBe('approved');
    // The workflow write carries the tenant predicate, not just the id.
    const workflowUpdate = trace.updates.find(u => u.table === WORKFLOWS);
    expect(workflowUpdate!.filter).toMatchObject({ id: WORKFLOW_ID, organization_id: ORG_A });
  });

  it('fails closed with no organization on approve and reject', async () => {
    const { db, trace } = makeFakeDb(fixture());
    const service = new WorkflowService(db);

    await expect(
      service.approveWorkflowStep(APPROVAL_ID, 'user-a', '', null),
    ).rejects.toThrow(/organization context/i);
    await expect(
      service.rejectWorkflowStep(APPROVAL_ID, 'user-a', '', undefined),
    ).rejects.toThrow(/organization context/i);
    expect(trace.updates).toHaveLength(0);
    expect(trace.inserts).toHaveLength(0);
  });
});
