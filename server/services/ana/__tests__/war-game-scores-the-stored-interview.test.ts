/**
 * start_war_game scores the stored interview, never answers the model composes
 * (CLAUDE.md Rule 2; ONE_DESIGN_PLAN S4; a finding of session 019ZvHmh,
 * relayed by the founder, 2026-11-01).
 *
 * The handler passed `input.answers`, which the model writes, straight to
 * runWarGame, and recorded the resulting overallScore and overallAssessment
 * as WAR_GAME_RUN in the audit log. A readiness score computed over answers
 * nobody gave was recorded as if it described the project's interview.
 *
 * It now takes the interview's session_id and loads the stored session
 * through loadInterviewSession, as answer_intelligence_question,
 * resume_intelligence_flow and commit_intelligence_flow already do. Without a
 * session it refuses and records nothing; answers in the call are not used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  loadInterviewSession: vi.fn(),
  auditLog: vi.fn(),
}));
vi.mock('../../cmc/interview-sessions.js', async (orig) => ({
  ...(await orig<typeof import('../../cmc/interview-sessions.js')>()),
  loadInterviewSession: h.loadInterviewSession,
}));
vi.mock('../../auditService.js', async (orig) => ({
  ...(await orig<typeof import('../../auditService.js')>()),
  auditLog: h.auditLog,
}));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';
import { runWarGame } from '../intelligence-questions/war-game/engine';

const CTX = { organizationId: 7, userId: 3 } as never;
/** What the person answered in the stored interview. */
const STORED = { scope: { hasProtocol: 'no' } };
/** What a model might compose instead. */
const COMPOSED = { scope: { hasProtocol: 'yes', everythingReady: 'yes' } };
const SESSION = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001', organizationId: 7, projectId: null, userId: 3,
  flowId: 'csr-report-flow', flowCategory: 'csr_report', status: 'complete', committedRecordRefs: null,
  state: { flowId: 'csr-report-flow', flowCategory: 'csr_report', currentNodeId: 'end', answers: STORED },
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
};
const run = async (input: Record<string, unknown>) => JSON.parse(await getToolHandler('start_war_game')!(input, CTX));
const audited = () => h.auditLog.mock.calls.map((c) => c[0]).filter((r) => r?.action === 'WAR_GAME_RUN');

beforeEach(() => {
  h.loadInterviewSession.mockReset().mockResolvedValue(SESSION);
  h.auditLog.mockReset();
});

describe('start_war_game takes no answers from the call', () => {
  it('without a session it refuses, scores nothing and records no WAR_GAME_RUN', async () => {
    const out = await run({ war_game_category: 'csr', source_flow_id: 'csr-report-flow', answers: COMPOSED });
    expect(out).toMatchObject({ status: 'needs_parameters', missing: ['session_id'] });
    expect(out.war_game_report).toBeUndefined();
    expect(audited()).toEqual([]);
  });

  it('with a session it scores the stored answers, whatever the call carries', async () => {
    const out = await run({ war_game_category: 'csr', session_id: SESSION.id, answers: COMPOSED });
    expect(h.loadInterviewSession).toHaveBeenCalledWith({ organizationId: 7, sessionId: SESSION.id });
    const expected = runWarGame('csr', SESSION.flowId, STORED);
    expect(out).toMatchObject({ success: true, session_id: SESSION.id, answersInCallIgnored: true });
    expect(out.war_game_report.overallScore).toBe(expected.overallScore);
    expect(out.war_game_report.findings.map((f: { id: string }) => f.id)).toEqual(expected.findings.map((f) => f.id));
  });

  it('records the stored interview it scored', async () => {
    await run({ war_game_category: 'csr', session_id: SESSION.id });
    const [row] = audited();
    expect(row.details).toMatchObject({ sessionId: SESSION.id, sourceFlowId: SESSION.flowId });
  });

  it('refuses an abandoned interview, and one that cannot be read, without recording a run', async () => {
    h.loadInterviewSession.mockResolvedValueOnce({ ...SESSION, status: 'abandoned' });
    expect(await run({ war_game_category: 'csr', session_id: SESSION.id })).toMatchObject({ session_status: 'abandoned' });
    h.loadInterviewSession.mockRejectedValueOnce(new Error('Interview session not found'));
    const out = await run({ war_game_category: 'csr', session_id: SESSION.id });
    expect(out.error).toMatch(/not found/);
    expect(out.war_game_report).toBeUndefined();
    expect(audited()).toEqual([]);
  });
});

describe('the definition asks for the session, not the answers', () => {
  it('takes session_id, has no answers field, and says it reads the stored interview', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'start_war_game')!;
    const schema = def.input_schema as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties)).not.toContain('answers');
    expect(schema.required).toContain('session_id');
    expect(def.description).toMatch(/stored interview/i);
  });
});
