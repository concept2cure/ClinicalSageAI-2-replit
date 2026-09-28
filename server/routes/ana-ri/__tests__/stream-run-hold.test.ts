/**
 * The stream's pause, through the real route, after its wait moved into the
 * turn's shared hold (services/ana/run-hold.ts; row 74, slice S3).
 *
 * The move must change nothing a person or client can see. So this suite is a
 * PARITY suite: it passes against the stream as it was before the move (the
 * inline while-paused loop) and after it, and each case is the behaviour the
 * old loop had:
 *
 *   - a run that is not paused runs its round with no pause frames;
 *   - a paused run holds the round, says `paused` once and `resumed` once,
 *     each with the round, and then runs it;
 *   - a run cancelled while paused says `cancelled` and runs nothing more;
 *   - a pause nobody answers is resumed as abandoned at MAX_PAUSE_MS, once,
 *     and the round then runs.
 *
 * The run row is scripted at the run-control seam; the loop, the checkpoint
 * and the hold are real. The harness is support/stream-route-harness.ts (row
 * 74, slice S4), the live-drive-turn.test.ts pattern moved into one place.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The mocks are the shared route harness's (support/stream-route-harness.ts);
// each factory is reached through a dynamic import, so the harness and the
// mocked modules share one state.
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
import { MAX_PAUSE_MS } from '../../../services/ana/run-status.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);

function turn(): Promise<SseEvent[]> {
  return streamTurn(app, { message: 'which screens are there?' });
}

const CONTROL = new Set(['paused', 'resumed', 'cancelled']);
const controlFrames = (events: SseEvent[]) => events.filter(e => CONTROL.has(e.type));
const ONE_ROUND = () => [[{ id: 'tu_1', name: 'list_app_screens', input: {} }], 'Here they are.'];

beforeEach(() => {
  resetHarness();
  h.state.script = ONE_ROUND();
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the stream pause, unchanged by the move', () => {
  it('a run that is not paused runs its round with no pause frames', async () => {
    h.state.statuses = ['running'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([]);
    expect(h.state.toolRuns).toBe(1);
    expect(h.state.wakes).toEqual([]);
  });

  it('a paused run holds the round, says paused once and resumed once, then runs it', async () => {
    h.state.statuses = ['paused', 'paused', 'paused', 'running'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'resumed', round: 1 },
    ]);
    expect(h.state.wakes).toEqual([5_000, 5_000, 5_000]);
    expect(h.state.toolRuns).toBe(1);
    expect(h.state.gatewayCalls).toBe(2);
    expect(h.state.resumeAbandoned).toBe(0);
  });

  it('a run cancelled while paused says cancelled and runs nothing more', async () => {
    h.state.statuses = ['paused', 'cancelled'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'cancelled', round: 1 },
    ]);
    expect(h.state.toolRuns, 'the held step ran after a cancel').toBe(0);
    expect(h.state.gatewayCalls, 'a model call followed a cancel').toBe(1);
  });

  it('a pause nobody answers is resumed as abandoned once, at MAX_PAUSE_MS, and the round runs', async () => {
    h.state.statuses = ['paused'];
    const events = await turn();
    expect(h.state.resumeAbandoned).toBe(1);
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'resumed', round: 1 },
    ]);
    // Every wait is the 5 s ceiling, and the hold gave up only once the ceiling passed.
    expect(h.state.wakes.every(ms => ms === 5_000)).toBe(true);
    expect(h.state.clockOffset).toBeGreaterThanOrEqual(MAX_PAUSE_MS);
    expect(h.state.clockOffset).toBeLessThanOrEqual(MAX_PAUSE_MS + 5_000);
    expect(h.state.toolRuns).toBe(1);
  });
});
