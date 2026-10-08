/**
 * The Summary's timeline through the streaming route (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.1, §2.2, §2.4, §2.6, §5 S4;
 * evidence docs/evidence/ANA-SUMMARY/2026-10-08/S4-summary/).
 *
 * The route, its loop, the approval gate, the turn recorder, presentStep and
 * update_plan run for real; the model is the harness's scripted gateway, which
 * streams text, summarized thinking and progress-update notes the way the
 * gateway hands them over (progress notes pass the real ProgressNotes, active
 * by the gateway's own rule, wantsProgressUpdates). Pinned:
 *   1. the timeline frames the browser receives equal the record's sealed
 *      timeline, with note references resolved;
 *   2. a round with prose and tool calls yields exactly one note before its
 *      steps, a round with none yields none; no note is staging text or
 *      reasoning; a progress-update note becomes a note; and (decision 3, A)
 *      a thinking turn's tool rounds ask for notes as AnA's words;
 *   7. declined, unanswered and authorised-then-failed steps carry heldBack
 *      and stepMessage's sentence, live and on the record;
 *   8. a turn stopped mid-round seals its cancelled steps.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll, onTestFinished } from 'vitest';

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
vi.mock('../../../services/ana/catalog-scope.js', () => ({
  catalogScope: async () => ({ programId: null }),
  documentScopeRefusal: async () => null,
}));

import { mountStreamRoute } from '../stream.js';
import { handleUpdatePlan } from '../../../services/ana/turn-plan.js';
import { INTERRUPTED_WORK_TEXT } from '../../../services/ai-gateway/progress-updates.js';
import { resolveTimeline, type TimelineEvent } from '@shared/ana/turn-timeline';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (body: Record<string, unknown> = {}): Promise<SseEvent[]> =>
  streamTurn(app, { message: 'find the stability reports and list the shelf-life claims', ...body });
const timelineOf = (events: SseEvent[]): TimelineEvent[] => events.filter(e => e.type === 'timeline').map(e => e.event);
const sealed = (outcome: 'answered' | 'stopped' = 'answered') => h.state.post.turnRecorder.seal(outcome);
const notes = (t: TimelineEvent[]) => t.filter((e): e is Extract<TimelineEvent, { kind: 'note' }> => e.kind === 'note');
const finishedOf = (t: TimelineEvent[], label: RegExp) =>
  t.find((e): e is Extract<TimelineEvent, { kind: 'step' }> => e.kind === 'step' && e.phase === 'finished' && label.test(e.label));

const search: ToolUse = { id: 'tu_s', name: 'search_project_documents', input: { query: 'shelf life' } };
const read: ToolUse = { id: 'tu_r', name: 'read_project_document', input: { document_id: 'not-a-uuid' } };
const plan = (id: string, steps: Array<[string, string]>): ToolUse => ({
  id,
  name: 'update_plan',
  input: { steps: steps.map(([title, status]) => ({ title, status })) },
});
const save: ToolUse = { id: 'tu_v', name: 'save_document_to_vault', input: { title: 'Plan', content: 'x' } };

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
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
  h.handlers.search_project_documents = async () => JSON.stringify({ ok: true, totalMatches: 3, results: [{}, {}, {}] });
  h.handlers.read_project_document = async () =>
    JSON.stringify({ ok: true, documentTitle: 'Stability report 2025', window: { start: 0, end: 4000 }, totalChars: 4000 });
  h.handlers.update_plan = handleUpdatePlan;
});
afterEach(() => {
  for (const n of ['search_project_documents', 'read_project_document', 'update_plan']) delete h.handlers[n];
  vi.restoreAllMocks();
});

describe('1. the same data live and sealed', () => {
  it('the timeline frames equal the record\'s sealed timeline, notes resolved', async () => {
    h.state.script = [
      { say: 'I will look in the Vault first.', tools: [search, plan('tu_p1', [['Find the reports', 'in_progress'], ['Read them', 'pending']])] },
      [read],
      { say: 'Both are read; the plan is done.', tools: [plan('tu_p2', [['Find the reports', 'completed'], ['Read them', 'completed']])] },
      'The shelf life is 24 months.',
    ];
    const live = timelineOf(await turn());
    const record = sealed();
    expect(record.body.schema).toBe('ana-turn-record/4');
    expect(resolveTimeline(record.body.timeline, record.blobs)).toEqual(live);

    // Every kind is there, in one order, numbered from 1.
    expect(live.map(e => e.seq)).toEqual(live.map((_, i) => i + 1));
    expect(new Set(live.map(e => e.kind))).toEqual(new Set(['note', 'step', 'task', 'end']));
    // A note is sealed as a reference to its text, never the text itself.
    const sealedNote = record.body.timeline.find((e: { kind: string }) => e.kind === 'note');
    expect(sealedNote.text).toEqual({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/), chars: 'I will look in the Vault first.'.length });
    // Tasks carry the server's ids, with Added, Started and Completed.
    const tasks = live.filter(e => e.kind === 'task').map(e => (e.kind === 'task' ? [e.task, e.change, e.title] : []));
    expect(tasks).toEqual([
      ['t1', 'added', 'Find the reports'],
      ['t1', 'started', 'Find the reports'],
      ['t2', 'added', 'Read them'],
      ['t1', 'completed', 'Find the reports'],
      ['t2', 'completed', 'Read them'],
    ]);
    // The end, and the record's steps linked to their events by handle, with dispatch times.
    expect(live[live.length - 1]).toMatchObject({ kind: 'end', outcome: 'answered', stoppedReason: null });
    const searchStep = record.body.steps.find((s: { tool: string }) => s.tool === 'search_project_documents');
    expect(searchStep).toMatchObject({ toolUseId: 'tu_s', handle: 's1', heldBack: false, usedModel: false });
    expect(Date.parse(searchStep.startedAt)).toBeLessThanOrEqual(Date.parse(searchStep.endedAt));
  });

  it('a step\'s events say only what a row says: a handle, never the tool\'s name or its id', async () => {
    h.state.script = [[search], 'Done.'];
    const live = timelineOf(await turn());
    const steps = live.filter(e => e.kind === 'step');
    expect(steps.map(e => (e.kind === 'step' ? [e.phase, e.step, e.label, e.preview] : []))).toEqual([
      ['announced', 's1', 'Searching the Vault', 'shelf life'],
      ['finished', 's1', 'Searched the Vault', 'shelf life'],
    ]);
    expect(JSON.stringify(live)).not.toMatch(/search_project_documents|tu_s/);
  });
});

describe('2. notes', () => {
  it('a round with prose and tool calls yields exactly one note, before its steps; a round with none yields none', async () => {
    h.state.script = [{ say: 'Searching the Vault for the reports.', tools: [search] }, [read], 'Done.'];
    const live = timelineOf(await turn());
    expect(notes(live).map(n => n.text)).toEqual(['Searching the Vault for the reports.']);
    const firstStep = live.findIndex(e => e.kind === 'step');
    const note = live.findIndex(e => e.kind === 'note');
    expect(note).toBeLessThan(firstStep);
    // The answer is not a note: its call called no tool.
    expect(JSON.stringify(notes(live))).not.toContain('Done.');
  });

  it('no note is staging text: a round with no prose is staged as "(Ran: …)" for the model, never noted', async () => {
    h.state.script = [[search], [read], 'Done.'];
    const live = timelineOf(await turn());
    expect(notes(live)).toEqual([]);
    expect(JSON.stringify(h.state.requests.map(r => r.messages))).toContain('(Ran:');
    expect(JSON.stringify(live)).not.toContain('(Ran:');
  });

  it('a summarized thinking block is reasoning, never a note', async () => {
    h.state.script = [{ think: 'THINK_SENTINEL_9 weighing the reports', say: 'Looking now.', tools: [search] }, 'Done.'];
    const live = timelineOf(await turn());
    expect(notes(live).map(n => n.text)).toEqual(['Looking now.']);
    expect(JSON.stringify(live)).not.toContain('THINK_SENTINEL_9');
  });

  it('a progress-update note ProgressNotes accepts is a note; its placeholder for interrupted work is not', async () => {
    h.state.script = [
      { progress: 'Here is the Vault, where every source is tracked.', tools: [search] },
      { progress: INTERRUPTED_WORK_TEXT, tools: [read] },
      'Done.',
    ];
    const live = timelineOf(await turn());
    expect(notes(live).map(n => n.text)).toEqual(['Here is the Vault, where every source is tracked.']);
  });

  it('decision 3 (A): a thinking turn\'s tool rounds ask for notes as her words, the closing round does not', async () => {
    h.state.script = [
      { think: 'reasoning', progress: 'First the Vault.', tools: [search] },
      { progress: 'Now the report itself.', tools: [read] },
      'The shelf life is 24 months.',
    ];
    // Thorough reasons on every call (reasoning.ts). Each call here offers tools; only a forced closing round would not.
    const live = timelineOf(await turn({ effort_level: 'thorough' }));
    const [first, ...rest] = h.state.requests;
    expect(first.thinking?.enabled).toBe(true);
    expect(first.notesBetweenTools).toBe(true);
    for (const r of rest) expect(r.notesBetweenTools).toBe(r.toolChoice !== 'none');
    expect(notes(live).map(n => n.text)).toEqual(['First the Vault.', 'Now the report itself.']);
  });
});

describe('7. held and failed rows carry heldBack and the stepMessage sentence', () => {
  beforeEach(() => {
    h.state.approvalOpens = true;
    h.state.script = [[save], 'Understood.'];
  });

  it.each([
    ['declined', { decided: 'denied' as const }, true, 'You declined saving a document to the Vault, so it did not run.'],
    ['no answer', null, true, "Saving a document to the Vault did not run: it needs a person's authorisation (nobody decided in time)."],
    [
      'authorised, then failed',
      { decided: 'approved' as const, error: 'the vault write failed' },
      false,
      "AnA couldn't finish saving a document to the Vault and continued without it.",
    ],
  ])('%s', async (_case, decision, heldBack, sentence) => {
    h.state.approvalDecision = decision;
    const live = timelineOf(await turn());
    const awaiting = live.find(e => e.kind === 'step' && e.phase === 'awaiting_approval');
    expect(awaiting).toMatchObject({ label: 'Saving a document to the Vault', source: 'vault' });
    const done = finishedOf(live, /a document to the Vault/);
    expect(done).toMatchObject({ status: 'error', heldBack, message: sentence });
    const step = sealed().body.steps.find((s: { tool: string }) => s.tool === 'save_document_to_vault');
    expect(step).toMatchObject({ heldBack, message: sentence });
  });
});

describe('8. stopped after cancel', () => {
  it('a turn cancelled mid-round seals its cancelled step events', async () => {
    // A read that never returns: the Stop ends it.
    const literature = h.handlers.search_literature;
    h.handlers.search_literature = () => new Promise<string>(() => undefined);
    onTestFinished(() => {
      h.handlers.search_literature = literature;
    });
    // The person presses Stop just after the search returned, while the other step still runs.
    h.handlers.search_project_documents = async () => {
      setTimeout(() => h.state.cancel?.(), 0);
      return JSON.stringify({ ok: true, totalMatches: 0, results: [] });
    };
    h.state.script = [[search, { id: 'tu_w', name: 'search_literature', input: { query: 'shelf life' } }], 'Never asked.'];
    const live = timelineOf(await turn());
    const record = sealed('stopped');
    const timeline = resolveTimeline(record.body.timeline, record.blobs);
    expect(timeline).toEqual(live);
    const stopped = timeline.filter(e => e.kind === 'step' && e.phase === 'finished' && e.status === 'cancelled');
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ label: 'Searching the literature', message: 'You stopped searching the literature before it finished.' });
    expect(timeline[timeline.length - 1]).toMatchObject({ kind: 'end', outcome: 'stopped', stoppedReason: 'cancelled' });
    expect(record.body.stoppedReason).toBe('cancelled');
  });
});
