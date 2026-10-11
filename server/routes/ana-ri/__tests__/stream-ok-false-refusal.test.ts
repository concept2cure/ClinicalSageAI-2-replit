/**
 * A tool that answers `{ ok: false, reason }` is a failed step, with that
 * sentence, everywhere the stream judges it (ANA-SUMMARY S4, the defect S3
 * found; docs/evidence/ANA-SUMMARY/2026-10-08/S4-summary/).
 *
 * Through the real route, loop, recorder and presentation: the step's status
 * on the frame and in the record, the status sentence the person reads, the
 * adaptation note the next model call is given, and the tool-run telemetry.
 * A check whose `ok` is its verdict stays a step that succeeded.
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
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (): Promise<SseEvent[]> => streamTurn(app, { message: 'list what the Vault holds' });
const resultOf = (events: SseEvent[], id: string) => events.find(e => e.type === 'tool_result' && e.toolUseId === id);
const REASON = 'The open project has no program, so its Vault cannot be listed.';

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
});
afterEach(() => {
  delete h.handlers.list_project_documents;
  delete h.handlers.check_grounding;
});

describe('{ ok: false, reason } through the stream route', () => {
  it('is a failed step, with that sentence on its record, in the model\'s note and in the telemetry', async () => {
    h.handlers.list_project_documents = async () => JSON.stringify({ ok: false, refused: true, reason: REASON });
    h.state.script = [[{ id: 'tu_l', name: 'list_project_documents', input: {} }], 'Done.'];
    const events = await turn();

    const r = resultOf(events, 'tu_l');
    expect(r?.status).toBe('error');
    // The sentence the person reads is stepMessage's, word for word; the doing
    // form, because nothing was listed.
    expect(r?.label).toBe('Listing the Vault documents');
    expect(r?.message).toBe("AnA couldn't finish listing the Vault documents and continued without it.");

    // The record keeps the tool's own sentence as the step's error.
    const sealed = h.state.post.turnRecorder.seal('answered');
    const step = sealed.body.steps.find((s: { tool: string }) => s.tool === 'list_project_documents');
    expect(step).toMatchObject({ status: 'error', error: REASON });

    // The next model call is told the step failed, in that sentence.
    const followUp = JSON.stringify(h.state.requests[1]?.messages ?? []);
    expect(followUp).toContain('[Adaptation note]');
    expect(followUp).toContain(REASON);

    // The tool-run telemetry row says the same.
    expect(h.state.toolRunLogs).toContainEqual({ toolName: 'list_project_documents', status: 'error', errorMessage: REASON });
  });

  it('control: a check whose ok is its verdict stays a step that succeeded', async () => {
    h.handlers.check_grounding = async () =>
      JSON.stringify({ engine: 'deterministic', ok: false, groundingScore: 0.5, totalClaims: 2, ungroundedClaims: [{}], message: '1 of 2 UNGROUNDED' });
    h.state.script = [[{ id: 'tu_g', name: 'check_grounding', input: { text: 'x' } }], 'Done.'];
    const events = await turn();
    expect(resultOf(events, 'tu_g')?.status).toBe('success');
    expect(h.state.toolRunLogs).toContainEqual({ toolName: 'check_grounding', status: 'success', errorMessage: undefined });
  });
});
