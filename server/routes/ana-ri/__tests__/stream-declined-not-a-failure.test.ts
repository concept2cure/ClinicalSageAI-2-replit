/**
 * A person's "no" is not a failure to work around (row 74, finding F1).
 *
 * The end-to-end capture (docs/evidence/ANA-AGENTS/2026-09-27/E2E-stand-in/)
 * found it: after a person declined a governed action, the next model call
 * carried "[Adaptation note] 1 of 1 tool call failed this round: … try an
 * alternative tool", and the person was shown "AnA couldn't finish …". The
 * decline was filed as an ordinary tool error, so the model was told to find
 * another way to do the thing a person had just refused, and the person was
 * told AnA had failed rather than that they had said no.
 *
 * Pinned here, through the real route:
 *   - a declined, unanswered or person-only action is not in the adaptation
 *     note, and the person is told what happened in their terms;
 *   - an action a person APPROVED that then failed is still a failure to
 *     adapt to (the control: the fix must not hide real errors).
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());

vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (): Promise<SseEvent[]> => streamTurn(app, { message: 'save the plan to the vault' });
const save: ToolUse = { id: 'tu_s', name: 'save_document_to_vault', input: { title: 'Plan', content: 'x' } };
const resultFor = (events: SseEvent[], id: string) => events.find((e) => e.type === 'tool_result' && e.toolUseId === id);
const adaptationNoteSent = () =>
  h.state.requests.slice(1).some((r) => JSON.stringify(r.messages).includes('[Adaptation note]'));

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});

beforeEach(() => {
  resetHarness();
  // Each wait "takes" the time it was allowed (the harness's clock).
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
  h.state.approvalOpens = true;
  h.state.script = [[save], 'Understood.'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a person declining a governed action', () => {
  it('is not sent back to the model as a failure to work around', async () => {
    h.state.approvalDecision = { decided: 'denied' };
    await turn();
    expect(h.state.handlerCalls.save_document_to_vault, 'the declined write ran').toBeUndefined();
    expect(h.state.requests.length).toBeGreaterThan(1);
    expect(adaptationNoteSent(), 'the model was told to try an alternative').toBe(false);
  });

  it('is shown to the person as their decision, not as AnA failing', async () => {
    h.state.approvalDecision = { decided: 'denied' };
    const events = await turn();
    const r = resultFor(events, 'tu_s');
    expect(r?.message ?? '').not.toMatch(/couldn't finish/i);
    expect(r?.message ?? '').toMatch(/declined/i);
  });

  it('nobody answering in time is not a failure to work around either', async () => {
    h.state.approvalDecision = null; // never answered: the window closes
    await turn();
    expect(h.state.handlerCalls.save_document_to_vault).toBeUndefined();
    expect(adaptationNoteSent()).toBe(false);
  });
});

describe('control: an approved action that then fails is still a failure', () => {
  it('stays in the adaptation note, so a real error is not hidden', async () => {
    h.state.approvalDecision = { decided: 'approved', error: 'the vault write failed' };
    await turn();
    expect(adaptationNoteSent(), 'a real failure was hidden').toBe(true);
  });
});
