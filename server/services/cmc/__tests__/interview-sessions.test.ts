/**
 * Durable CMC interview sessions — the tenant-scoped store for the guided
 * interview's FlowState.
 *
 * What these pin:
 *   • every statement is org-scoped in its WHERE clause — a session id the
 *     model produced must still belong to the caller's tenant to be readable
 *     or writable, and a cross-org id reads as NOT FOUND, never as a row;
 *   • nothing is queried without an organization (fail closed before the
 *     database, not after);
 *   • the status machine: active → complete → committed, active/complete →
 *     abandoned, enforced in the UPDATE predicate so a stale caller cannot
 *     regress a committed session;
 *   • partial commit bookkeeping writes the refs WITHOUT moving the status.
 *
 * The pool is a scripted fake: it records every statement and answers from a
 * script, so the SQL and its parameters are asserted directly.
 */
import { describe, it, expect } from 'vitest';

import {
  createInterviewSession,
  loadInterviewSession,
  saveInterviewSessionState,
  completeInterviewSession,
  abandonInterviewSession,
  recordCommittedRecordRefs,
  markInterviewSessionCommitted,
  InterviewSessionError,
  type Queryable,
} from '../interview-sessions';
import type { FlowState } from '../../../../shared/types/intelligence-questions';

const ORG = 42;
const SESSION_ID = '5f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';

function flowState(overrides: Partial<FlowState> = {}): FlowState {
  return {
    flowId: 'cmc-specification-v1',
    flowCategory: 'cmc_specification',
    currentNodeId: 'substance_identification',
    answers: {},
    completedNodes: [],
    issues: [],
    startedAt: '2026-09-06T00:00:00.000Z',
    complete: false,
    sectionProgress: {},
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    organization_id: ORG,
    project_id: 'prog-1',
    user_id: 7,
    flow_id: 'cmc-specification-v1',
    flow_category: 'cmc_specification',
    state: flowState(),
    status: 'active',
    committed_record_refs: null,
    created_at: new Date('2026-09-06T00:00:00.000Z'),
    updated_at: new Date('2026-09-06T00:00:00.000Z'),
    ...overrides,
  };
}

interface Scripted { match: RegExp; rows: unknown[] }

/** A pool stand-in that records statements and answers from a script. */
function fakePool(script: Scripted[] = []) {
  const statements: Array<{ text: string; params: unknown[] }> = [];
  const q: Queryable = {
    async query(text: string, params: unknown[] = []) {
      statements.push({ text, params });
      const hit = script.find(s => s.match.test(text));
      const rows = hit ? hit.rows : [];
      return { rows, rowCount: rows.length };
    },
  };
  return { q, statements };
}

describe('createInterviewSession', () => {
  it('inserts an org-scoped row carrying the FlowState and returns the session', async () => {
    const { q, statements } = fakePool([{ match: /INSERT INTO cmc_interview_sessions/, rows: [sessionRow()] }]);
    const state = flowState();

    const session = await createInterviewSession(
      { organizationId: ORG, userId: 7, projectId: 'prog-1', state },
      q,
    );

    expect(statements).toHaveLength(1);
    expect(statements[0].text).toMatch(/INSERT INTO cmc_interview_sessions/);
    expect(statements[0].params[0]).toBe(ORG);
    expect(statements[0].params[1]).toBe('prog-1');
    expect(statements[0].params[2]).toBe(7);
    expect(statements[0].params[3]).toBe('cmc-specification-v1');
    expect(statements[0].params[4]).toBe('cmc_specification');
    expect(JSON.parse(String(statements[0].params[5]))).toEqual(state);

    expect(session.id).toBe(SESSION_ID);
    expect(session.organizationId).toBe(ORG);
    expect(session.status).toBe('active');
    expect(session.state.flowId).toBe('cmc-specification-v1');
  });

  it('refuses without an organization — before touching the database', async () => {
    const { q, statements } = fakePool();
    await expect(
      createInterviewSession({ organizationId: null, userId: 7, projectId: null, state: flowState() }, q),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_REQUIRED' });
    expect(statements).toHaveLength(0);
  });

  it('refuses a state that is not a FlowState', async () => {
    const { q, statements } = fakePool();
    await expect(
      createInterviewSession({ organizationId: ORG, userId: 7, projectId: null, state: { nope: true } as never }, q),
    ).rejects.toMatchObject({ code: 'SESSION_STATE_INVALID' });
    expect(statements).toHaveLength(0);
  });

  it('fails closed when the insert returns no row', async () => {
    const { q } = fakePool();
    await expect(
      createInterviewSession({ organizationId: ORG, userId: 7, projectId: null, state: flowState() }, q),
    ).rejects.toBeInstanceOf(InterviewSessionError);
  });
});

describe('loadInterviewSession', () => {
  it('reads by id AND organization, and parses the stored state', async () => {
    const stored = flowState({ currentNodeId: 'synthetic_route', completedNodes: ['substance_identification'] });
    const { q, statements } = fakePool([
      // A jsonb column comes back parsed from pg; a text-mocked pool may hand
      // back a string. Both must read.
      { match: /SELECT[\s\S]*FROM cmc_interview_sessions/, rows: [sessionRow({ state: JSON.stringify(stored) })] },
    ]);

    const session = await loadInterviewSession({ organizationId: ORG, sessionId: SESSION_ID }, q);

    expect(statements[0].text).toMatch(/WHERE id = \$1 AND organization_id = \$2/);
    expect(statements[0].params).toEqual([SESSION_ID, ORG]);
    expect(session.state.currentNodeId).toBe('synthetic_route');
    expect(session.state.completedNodes).toEqual(['substance_identification']);
  });

  it('a session of another organization is NOT FOUND (fail closed, no leak)', async () => {
    // The fake answers nothing for a mismatched org, exactly as the org-scoped
    // WHERE clause would. The error must not distinguish "exists elsewhere".
    const { q } = fakePool([]);
    await expect(
      loadInterviewSession({ organizationId: ORG + 1, sessionId: SESSION_ID }, q),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('refuses a malformed session id before querying (no 22P02 from the database)', async () => {
    const { q, statements } = fakePool();
    await expect(
      loadInterviewSession({ organizationId: ORG, sessionId: "1 OR 1=1" }, q),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_ID' });
    expect(statements).toHaveLength(0);
  });

  it('refuses without an organization before querying', async () => {
    const { q, statements } = fakePool();
    await expect(
      loadInterviewSession({ organizationId: undefined, sessionId: SESSION_ID }, q),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_REQUIRED' });
    expect(statements).toHaveLength(0);
  });

  it('refuses a stored state that cannot be read as a FlowState', async () => {
    const { q } = fakePool([{ match: /SELECT/, rows: [sessionRow({ state: '{not json' })] }]);
    await expect(
      loadInterviewSession({ organizationId: ORG, sessionId: SESSION_ID }, q),
    ).rejects.toMatchObject({ code: 'SESSION_STATE_INVALID' });
  });
});

describe('saveInterviewSessionState', () => {
  it('updates the state of an ACTIVE session of this org only', async () => {
    const next = flowState({ currentNodeId: 'substance_classification', completedNodes: ['substance_identification'] });
    const { q, statements } = fakePool([{ match: /UPDATE cmc_interview_sessions/, rows: [sessionRow({ state: next })] }]);

    const session = await saveInterviewSessionState({ organizationId: ORG, sessionId: SESSION_ID, state: next }, q);

    const upd = statements[0];
    expect(upd.text).toMatch(/UPDATE cmc_interview_sessions/);
    expect(upd.text).toMatch(/organization_id = \$2/);
    expect(upd.text).toMatch(/status = 'active'/);
    expect(upd.params[0]).toBe(SESSION_ID);
    expect(upd.params[1]).toBe(ORG);
    expect(JSON.parse(String(upd.params[2]))).toEqual(next);
    expect(session.state.currentNodeId).toBe('substance_classification');
  });

  it('refuses to save a COMPLETE state as an ordinary step (completion is explicit)', async () => {
    const { q, statements } = fakePool();
    await expect(
      saveInterviewSessionState({ organizationId: ORG, sessionId: SESSION_ID, state: flowState({ complete: true }) }, q),
    ).rejects.toMatchObject({ code: 'SESSION_STATE_INVALID' });
    expect(statements).toHaveLength(0);
  });

  it('a session that is not active (or not this org’s) is NOT WRITABLE — the answer is not silently dropped', async () => {
    const { q } = fakePool([]);
    await expect(
      saveInterviewSessionState({ organizationId: ORG, sessionId: SESSION_ID, state: flowState() }, q),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_WRITABLE' });
  });
});

describe('completeInterviewSession', () => {
  it('moves an active session to complete with the terminal state', async () => {
    const done = flowState({ complete: true, completedNodes: ['a', 'b'] });
    const { q, statements } = fakePool([{ match: /UPDATE cmc_interview_sessions/, rows: [sessionRow({ state: done, status: 'complete' })] }]);

    const session = await completeInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, state: done }, q);

    expect(statements[0].text).toMatch(/SET state = \$3::jsonb,\s*status = 'complete'/);
    expect(statements[0].text).toMatch(/WHERE id = \$1 AND organization_id = \$2 AND status = 'active'/);
    expect(session.status).toBe('complete');
  });

  it('refuses a state that is not complete', async () => {
    const { q, statements } = fakePool();
    await expect(
      completeInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, state: flowState() }, q),
    ).rejects.toMatchObject({ code: 'SESSION_STATE_INVALID' });
    expect(statements).toHaveLength(0);
  });
});

describe('abandonInterviewSession', () => {
  it('abandons an active or complete session of this org; a committed one is untouchable', async () => {
    const { q, statements } = fakePool([{ match: /UPDATE/, rows: [sessionRow({ status: 'abandoned' })] }]);
    const session = await abandonInterviewSession({ organizationId: ORG, sessionId: SESSION_ID }, q);
    expect(statements[0].text).toMatch(/status = 'abandoned'/);
    expect(statements[0].text).toMatch(/status IN \('active', 'complete'\)/);
    expect(statements[0].params).toEqual([SESSION_ID, ORG]);
    expect(session.status).toBe('abandoned');
  });

  it('reports NOT WRITABLE when nothing matched', async () => {
    const { q } = fakePool([]);
    await expect(abandonInterviewSession({ organizationId: ORG, sessionId: SESSION_ID }, q))
      .rejects.toMatchObject({ code: 'SESSION_NOT_WRITABLE' });
  });
});

describe('commit bookkeeping', () => {
  const refs = [
    { key: 'container_closure:container_closure', register: 'container_closure', id: 12, module3Linked: true, committedAt: '2026-09-06T00:00:00.000Z' },
  ];

  it('recordCommittedRecordRefs writes the refs of a PARTIAL commit without moving the status', async () => {
    const { q, statements } = fakePool([{ match: /UPDATE/, rows: [sessionRow({ status: 'complete', committed_record_refs: refs })] }]);
    const session = await recordCommittedRecordRefs({ organizationId: ORG, sessionId: SESSION_ID, refs }, q);
    expect(statements[0].text).toMatch(/SET committed_record_refs = \$3::jsonb/);
    expect(statements[0].text).not.toMatch(/status = 'committed'/);
    expect(statements[0].text).toMatch(/AND status = 'complete'/);
    expect(JSON.parse(String(statements[0].params[2]))).toEqual(refs);
    expect(session.status).toBe('complete');
    expect(session.committedRecordRefs).toEqual(refs);
  });

  it('markInterviewSessionCommitted moves complete → committed with the refs', async () => {
    const { q, statements } = fakePool([{ match: /UPDATE/, rows: [sessionRow({ status: 'committed', committed_record_refs: refs })] }]);
    const session = await markInterviewSessionCommitted({ organizationId: ORG, sessionId: SESSION_ID, refs }, q);
    expect(statements[0].text).toMatch(/status = 'committed'/);
    expect(statements[0].text).toMatch(/AND status = 'complete'/);
    expect(statements[0].params[1]).toBe(ORG);
    expect(session.status).toBe('committed');
  });

  it('markInterviewSessionCommitted refuses an empty ref list — a commit that wrote nothing is not a commit', async () => {
    const { q, statements } = fakePool();
    await expect(markInterviewSessionCommitted({ organizationId: ORG, sessionId: SESSION_ID, refs: [] }, q))
      .rejects.toMatchObject({ code: 'COMMIT_REFS_REQUIRED' });
    expect(statements).toHaveLength(0);
  });
});
