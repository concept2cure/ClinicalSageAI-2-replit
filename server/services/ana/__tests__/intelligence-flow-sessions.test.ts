/**
 * The intelligence-flow tools over a PERSISTED session.
 *
 * The FlowState used to live only in the tool arguments, round-tripped
 * through the model on every turn — a dropped turn lost the interview. These
 * drive the real handlers against the process-wide mocked `pg` pool
 * (tests/setup.ts) and pin:
 *   • start creates a cmc_interview_sessions row for the caller's org and
 *     returns its id; without an org it says so and persists nothing;
 *   • answer loads the state by session id AND org (never from flow_state
 *     when a session_id is given), saves the step, and returns the id;
 *   • a cross-org session id is refused and nothing is written;
 *   • the stateless flow_state path still works for callers with no session;
 *   • resume reads the session back;
 *   • commit writes each plan entry through the register service's canonical
 *     create under the session's tenant and project, records the refs and
 *     marks the session committed; a refused entry stops the commit, leaves
 *     the session 'complete', and dry_run shows the plan without writing.
 */
import { describe, it, expect, beforeEach, type Mock } from 'vitest';

import { mockPool } from '../../../../tests/setup';

/* The register creates (services/cmc/register-writes.ts) are the one write
   path each register has; here they are stood in for, so these tests pin the
   executor's bookkeeping around them, not the inserts. */
type RegisterCreate = (...args: unknown[]) => Promise<{ row: { id: number }; module3Linked: boolean; module3Warning?: string }>;
/* Not hoisted: the projector imports the register service lazily, at commit
   time, so this factory runs long after module initialisation. */
const registerCreates = {
  createDrugSubstance: vi.fn<RegisterCreate>(),
  createDrugProduct: vi.fn<RegisterCreate>(),
  createContainerClosure: vi.fn<RegisterCreate>(),
  createManufacturingProcess: vi.fn<RegisterCreate>(),
  createFormulationRecord: vi.fn<RegisterCreate>(),
  createMaterialSpec: vi.fn<RegisterCreate>(),
  createCharacterizationStudy: vi.fn<RegisterCreate>(),
  /* The plan check the commit runs before its first write: every body accepted here. */
  registerBodyRefusal: vi.fn((_register: string, _body: unknown): string | null => null),
};
vi.mock('../../cmc/register-writes', () => registerCreates);


/* The runtime instruments the pool on import (server/db/poolInstrumentation
   wraps `pool.query`, keeping a bound reference to the original vi.fn). The
   executor's import graph reaches the runtime, so the vi.fn must be captured
   BEFORE the executor loads — the wrapper delegates to it, so scripting the
   original drives every query the handlers issue. */
const rawQuery = mockPool.query as unknown as Mock;
const { getToolHandler } = await import('../AnaToolExecutor');
const { startFlow } = await import('../intelligence-questions/engine.js');

const ORG = 42;
const SESSION_ID = '5f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const CTX = { organizationId: ORG, userId: 7, projectId: 91, projectType: 'pharma' as const };

type Statement = { text: string; params: unknown[] };

function sessionRow(state: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    organization_id: ORG,
    project_id: '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e',
    user_id: 7,
    flow_id: 'cmc-specification-v1',
    flow_category: 'cmc_specification',
    state,
    status: 'active',
    committed_record_refs: null,
    created_at: new Date('2026-09-06T00:00:00.000Z'),
    updated_at: new Date('2026-09-06T00:00:00.000Z'),
    ...overrides,
  };
}

/** Script the shared pool: record statements, answer by SQL shape. */
function scriptPool(answer: (text: string, params: unknown[]) => unknown[] | null) {
  const statements: Statement[] = [];
  rawQuery.mockImplementation(async (text: string, params: unknown[] = []) => {
    statements.push({ text, params });
    const rows = answer(text, params) ?? [];
    return { rows, rowCount: rows.length };
  });
  return statements;
}

const call = async (name: string, input: Record<string, unknown>, ctx?: Record<string, unknown>) => {
  const handler = getToolHandler(name);
  expect(handler, `${name} registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, ctx as never));
};

beforeEach(() => {
  rawQuery.mockReset();
  rawQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('start_intelligence_flow', () => {
  it('persists the session for the caller’s org and returns its id', async () => {
    const statements = scriptPool((text, params) =>
      /INSERT INTO cmc_interview_sessions/.test(text) ? [sessionRow(JSON.parse(String(params[5])))] : null,
    );

    const out = await call('start_intelligence_flow', { document_type: 'cmc' }, CTX);

    expect(out.error).toBeUndefined();
    expect(out.status).toBe('intelligence_question');
    expect(out.session_id).toBe(SESSION_ID);
    expect(out.persistence).toMatch(/^persisted/);
    const insert = statements.find(s => /INSERT INTO cmc_interview_sessions/.test(s.text))!;
    expect(insert.params[0]).toBe(ORG);
    expect(insert.params[1]).toBe('91');
    expect(insert.params[2]).toBe(7);
    expect(insert.params[4]).toBe('cmc_specification');
    expect(JSON.parse(String(insert.params[5])).currentNodeId).toBe('substance_identification');
  });

  it('without an organization it runs stateless, persists nothing, and says so', async () => {
    const statements = scriptPool(() => null);
    const out = await call('start_intelligence_flow', { document_type: 'cmc' }, {});
    expect(out.status).toBe('intelligence_question');
    expect(out.session_id).toBeNull();
    expect(out.persistence).toMatch(/^not persisted/);
    expect(statements.filter(s => /cmc_interview_sessions/.test(s.text))).toEqual([]);
  });

  it('fails closed when the session cannot be persisted — the interview is not started', async () => {
    scriptPool(() => null); // the INSERT returns no row
    const out = await call('start_intelligence_flow', { document_type: 'cmc' }, CTX);
    expect(out.error).toMatch(/could not be persisted/);
    expect(out.session_id).toBeUndefined();
  });
});

describe('answer_intelligence_question', () => {
  const started = startFlow('cmc_specification', { organizationId: ORG, userId: 7, projectId: '91', clientType: 'pharma' });
  const firstAnswers = {
    inn_name: 'Examplumab',
    chemical_name: '(2S)-2-amino-3-(4-hydroxyphenyl)propanoic acid',
    molecular_formula: 'C6H12O6',
    molecular_weight: 180.16,
  };

  it('with a session_id: loads the state from the session (org-scoped), saves the step, ignores flow_state', async () => {
    const statements = scriptPool((text, params) => {
      if (/SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)) return [sessionRow(started.state)];
      if (/UPDATE cmc_interview_sessions/.test(text)) return [sessionRow(JSON.parse(String(params[2])))];
      return null;
    });

    const out = await call(
      'answer_intelligence_question',
      {
        session_id: SESSION_ID,
        node_id: 'substance_identification',
        answers: firstAnswers,
        // A stale / foreign flow_state must be ignored when a session is named.
        flow_state: { ...started.state, currentNodeId: 'stability_program', flowCategory: 'protocol_development' },
      },
      CTX,
    );

    expect(out.error).toBeUndefined();
    expect(out.status).toBe('intelligence_question');
    expect(out.session_id).toBe(SESSION_ID);
    expect(out.question.node.id).toBe('substance_classification');

    const load = statements.find(s => /SELECT[\s\S]*FROM cmc_interview_sessions/.test(s.text))!;
    expect(load.params).toEqual([SESSION_ID, ORG]);
    const save = statements.find(s => /UPDATE cmc_interview_sessions/.test(s.text))!;
    expect(save.text).toMatch(/status = 'active'/);
    expect(save.params[1]).toBe(ORG);
    const saved = JSON.parse(String(save.params[2]));
    expect(saved.currentNodeId).toBe('substance_classification');
    expect(saved.answers.substance_identification).toEqual(firstAnswers);
  });

  it('a validation failure returns the same question and saves nothing', async () => {
    const statements = scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text) ? [sessionRow(started.state)] : null,
    );
    const out = await call(
      'answer_intelligence_question',
      { session_id: SESSION_ID, node_id: 'substance_identification', answers: { inn_name: 'X' } },
      CTX,
    );
    expect(out.status).toBe('intelligence_question');
    expect(out.question.node.id).toBe('substance_identification');
    expect(out.question.newIssues.some((i: any) => i.checkId.startsWith('validation_'))).toBe(true);
    expect(statements.filter(s => /UPDATE cmc_interview_sessions/.test(s.text))).toEqual([]);
  });

  it('a session id of another organization is refused and nothing is written', async () => {
    const statements = scriptPool(() => null); // the org-scoped SELECT matches nothing
    const out = await call(
      'answer_intelligence_question',
      { session_id: SESSION_ID, node_id: 'substance_identification', answers: firstAnswers },
      { ...CTX, organizationId: ORG + 1 },
    );
    expect(out.error).toMatch(/No interview session/);
    expect(statements.filter(s => /UPDATE/.test(s.text))).toEqual([]);
  });

  it('a session_id without an organization context is refused before the database', async () => {
    const statements = scriptPool(() => null);
    const out = await call(
      'answer_intelligence_question',
      { session_id: SESSION_ID, node_id: 'substance_identification', answers: firstAnswers },
      {},
    );
    expect(out.error).toMatch(/organization context/);
    expect(statements).toEqual([]);
  });

  it('a session that is already complete refuses further answers', async () => {
    scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)
        ? [sessionRow({ ...started.state, complete: true }, { status: 'complete' })]
        : null,
    );
    const out = await call(
      'answer_intelligence_question',
      { session_id: SESSION_ID, node_id: 'substance_identification', answers: firstAnswers },
      CTX,
    );
    expect(out.error).toMatch(/is complete/);
    expect(out.session_status).toBe('complete');
  });

  it('a step that cannot be recorded does not count', async () => {
    scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text) ? [sessionRow(started.state)] : null, // the UPDATE matches nothing
    );
    const out = await call(
      'answer_intelligence_question',
      { session_id: SESSION_ID, node_id: 'substance_identification', answers: firstAnswers },
      CTX,
    );
    expect(out.error).toMatch(/could not be recorded/);
    expect(out.status).toBeUndefined();
  });

  it('without a session_id the stateless flow_state contract still works, touching no session', async () => {
    const statements = scriptPool(() => null);
    const out = await call(
      'answer_intelligence_question',
      { flow_state: started.state, node_id: 'substance_identification', answers: firstAnswers },
      CTX,
    );
    expect(out.error).toBeUndefined();
    expect(out.status).toBe('intelligence_question');
    expect(out.session_id).toBeNull();
    expect(out.question.node.id).toBe('substance_classification');
    expect(statements.filter(s => /cmc_interview_sessions/.test(s.text))).toEqual([]);
  });

  it('with neither a session_id nor a flow_state it says what is missing', async () => {
    const out = await call('answer_intelligence_question', { node_id: 'substance_identification', answers: {} }, CTX);
    expect(out.error).toMatch(/session_id/);
  });
});

describe('resume_intelligence_flow', () => {
  it('reads the session back and returns the current question', async () => {
    const started = startFlow('cmc_specification', { organizationId: ORG, userId: 7, projectId: '91', clientType: 'pharma' });
    const midway = {
      ...started.state,
      currentNodeId: 'synthetic_route',
      completedNodes: ['substance_identification', 'substance_classification', 'physicochemical_properties'],
    };
    const statements = scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text) ? [sessionRow(midway)] : null,
    );

    const out = await call('resume_intelligence_flow', { session_id: SESSION_ID }, CTX);

    expect(out.error).toBeUndefined();
    expect(out.status).toBe('intelligence_question');
    expect(out.session_id).toBe(SESSION_ID);
    expect(out.session_status).toBe('active');
    expect(out.project_id).toBe('6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e');
    expect(out.question.node.id).toBe('synthetic_route');
    expect(out.question.progress.completedNodes).toBe(3);
    expect(statements[0].params).toEqual([SESSION_ID, ORG]);
  });

  it('requires a session_id', async () => {
    const out = await call('resume_intelligence_flow', {}, CTX);
    expect(out.error).toMatch(/session_id is required/);
  });
});

describe('commit_intelligence_flow', () => {
  const completeState = {
    flowId: 'cmc-specification-v1',
    flowCategory: 'cmc_specification',
    currentNodeId: 'container_closure',
    answers: {
      container_closure: {
        container_system_name: '10 mL vial / 20 mm stopper',
        primary_packaging: '10 mL Type I borosilicate glass vial',
        closure_description: '20 mm bromobutyl stopper with aluminum flip-off seal',
        el_assessment: 'no',
      },
    },
    completedNodes: ['container_closure'],
    issues: [],
    startedAt: '2026-09-06T00:00:00.000Z',
    complete: true,
    sectionProgress: {},
  };

  it('dry_run returns the plan — register, write path, body — and writes nothing', async () => {
    const statements = scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text) ? [sessionRow(completeState, { status: 'complete' })] : null,
    );
    const out = await call('commit_intelligence_flow', { session_id: SESSION_ID, dry_run: true }, CTX);
    expect(out.status).toBe('commit_plan');
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].register).toBe('container_closure');
    expect(out.entries[0].path).toBe('/api/cmc/container-closures');
    expect(out.entries[0].body.systemName).toBe('10 mL vial / 20 mm stopper');
    expect(out.entries[0].body).not.toHaveProperty('extractablesLeachables');
    expect(statements.filter(s => /UPDATE/.test(s.text))).toEqual([]);
  });

  it('commits every plan entry through the register creates under the session tenant and project, and marks the session committed', async () => {
    let nextId = 100;
    for (const [name, create] of Object.entries(registerCreates)) {
      if (!name.startsWith('create')) continue;
      create.mockReset();
      (create as ReturnType<typeof vi.fn<RegisterCreate>>).mockImplementation(async () => ({ row: { id: nextId++ }, module3Linked: true }));
    }
    const statements = scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)
        ? [sessionRow(completeState, { status: 'complete' })]
        : /UPDATE cmc_interview_sessions/.test(text)
          ? [sessionRow(completeState, { status: 'committed' })]
          : null,
    );
    const out = await call('commit_intelligence_flow', { session_id: SESSION_ID }, CTX);
    expect(out.error).toBeUndefined();
    expect(out.status).toBe('intelligence_flow_committed');
    const calls = Object.entries(registerCreates).filter(([name]) => name.startsWith('create')).flatMap(([, c]) => c.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    for (const [orgId, body, link] of calls) {
      expect(orgId).toBe(ORG);
      // The SESSION's project (the stored row's program uuid), not the caller's context.
      expect(body).toMatchObject({ projectId: '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e' });
      expect(link).toEqual({ projectId: '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e' });
    }
    expect(statements.some(s => /status = 'committed'/.test(s.text))).toBe(true);
  });

  it('a refused entry stops the commit with the refusal, leaves the session complete, and reports what did land', async () => {
    let nextId = 200;
    for (const [name, create] of Object.entries(registerCreates)) {
      if (!name.startsWith('create')) continue;
      create.mockReset();
      (create as ReturnType<typeof vi.fn<RegisterCreate>>).mockImplementation(async () => ({ row: { id: nextId++ }, module3Linked: true }));
    }
    registerCreates.createContainerClosure.mockRejectedValue(
      new Error('Qualification is a governed action and is recorded with a signature. POST /api/cmc/container-closures/:id/qualify with a reason and re-authentication.'),
    );
    const statements = scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)
        ? [sessionRow(completeState, { status: 'complete' })]
        : /SET status = 'committing'/.test(text)
          ? [sessionRow(completeState, { status: 'committing' })]
          : /UPDATE cmc_interview_sessions/.test(text)
            ? [sessionRow(completeState, { status: 'complete' })]
            : null,
    );
    const out = await call('commit_intelligence_flow', { session_id: SESSION_ID }, CTX);
    expect(out.status).toBeUndefined();
    expect(out.code).toBe('WRITE_FAILED');
    expect(out.failed.register).toBe('container_closure');
    expect(out.failed.error).toMatch(/governed action/);
    expect(out.session_status).toBe('complete');
    expect(statements.some(s => /status = 'committed'/.test(s.text))).toBe(false);
  });

  it('refuses a session that is not complete', async () => {
    scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)
        ? [sessionRow({ ...completeState, complete: false }, { status: 'active' })]
        : null,
    );
    const out = await call('commit_intelligence_flow', { session_id: SESSION_ID }, CTX);
    expect(out.code).toBe('SESSION_NOT_COMPLETE');
  });

  it('refuses a session with no project when none is supplied', async () => {
    scriptPool((text) =>
      /SELECT[\s\S]*FROM cmc_interview_sessions/.test(text)
        ? [sessionRow(completeState, { status: 'complete', project_id: null })]
        : null,
    );
    const out = await call('commit_intelligence_flow', { session_id: SESSION_ID }, { organizationId: ORG, userId: 7 });
    expect(out.code).toBe('PROJECT_REQUIRED');
  });
});
