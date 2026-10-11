/**
 * Which of AnA's tasks a step served, through the streaming route (ANA-SUMMARY
 * S5, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.1, §2.7, §5 S5;
 * evidence docs/evidence/ANA-SUMMARY/2026-10-08/S5-task-attribution/).
 *
 * The route, its loop, update_plan, the timeline emitter and the turn recorder
 * run for real; the model is the harness's scripted gateway. Pinned:
 *   1. a step carries the id of the one task in progress when it was
 *      dispatched, on every one of its timeline events and on its record
 *      (`taskId`); with two tasks in progress it carries null; an update_plan
 *      step always carries null;
 *   3. task ids hold across five update_plan calls, and a title removed and
 *      added again is a new task, whose steps carry the new id; a plan's new
 *      tasks are all added before any of them is started (the browser
 *      acceptance: four "Added task" rows, then Started and Completed).
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
vi.mock('../../../services/ana/catalog-scope.js', () => ({
  catalogScope: async () => ({ programId: null }),
  documentScopeRefusal: async () => null,
}));

import { mountStreamRoute } from '../stream.js';
import { handleUpdatePlan } from '../../../services/ana/turn-plan.js';
import type { StepEvent, TaskEvent, TimelineEvent } from '@shared/ana/turn-timeline';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (): Promise<SseEvent[]> => streamTurn(app, { message: 'find the stability reports, read them, and list the claims' });
const timelineOf = (events: SseEvent[]): TimelineEvent[] => events.filter(e => e.type === 'timeline').map(e => e.event);
const stepEvents = (t: TimelineEvent[]) => t.filter((e): e is StepEvent => e.kind === 'step');
const taskEvents = (t: TimelineEvent[]) => t.filter((e): e is TaskEvent => e.kind === 'task');

type Status = 'pending' | 'in_progress' | 'completed';
const plan = (id: string, steps: Array<[string, Status]>): ToolUse => ({
  id,
  name: 'update_plan',
  input: { steps: steps.map(([title, status]) => ({ title, status })) },
});
const search = (id: string): ToolUse => ({ id, name: 'search_project_documents', input: { query: 'shelf life' } });
const read = (id: string): ToolUse => ({ id, name: 'read_project_document', input: { document_id: 'not-a-uuid' } });

/** The task every timeline event of one step carries, by the step's tool-use id. */
function tasksOfStep(events: SseEvent[], t: TimelineEvent[], toolUseId: string): Array<string | null> {
  // The handle is opaque; the step's frames name the tool-use id, so pair by order of first appearance.
  const ids = events.filter(e => e.type === 'tool_use').map(e => e.toolUseId as string);
  const handles: string[] = [];
  for (const e of stepEvents(t)) if (!handles.includes(e.step)) handles.push(e.step);
  const handle = handles[ids.indexOf(toolUseId)];
  expect(handle, `no step for ${toolUseId}`).toBeTruthy();
  return stepEvents(t).filter(e => e.step === handle).map(e => e.task);
}

/** Each recorded step's `taskId`, by tool-use id, from the sealed record. */
function recordedTaskIds(): Map<string, string | null | undefined> {
  const record = h.state.post.turnRecorder.seal('answered');
  const steps = record.body.steps as Array<{ toolUseId?: string; taskId?: string | null }>;
  return new Map(steps.map(s => [s.toolUseId ?? '', s.taskId]));
}

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
  h.handlers.search_project_documents = async () => JSON.stringify({ ok: true, totalMatches: 3, results: [{}, {}, {}] });
  h.handlers.read_project_document = async () =>
    JSON.stringify({ ok: true, documentTitle: 'Stability report 2025', window: { start: 0, end: 4000 }, totalChars: 4000 });
  h.handlers.update_plan = handleUpdatePlan;
});
afterEach(() => {
  for (const n of ['search_project_documents', 'read_project_document', 'update_plan']) delete h.handlers[n];
  vi.restoreAllMocks();
});

describe('1. a step carries the one task in progress at dispatch', () => {
  it('the single in-progress task\'s id; null with two in progress; null for update_plan, always', async () => {
    h.state.script = [
      [plan('tu_p1', [['Find the reports', 'in_progress'], ['Read them', 'pending']])],
      // One task in progress: the search serves it; the plan call beside it does not.
      [search('tu_s1'), plan('tu_p2', [['Find the reports', 'in_progress'], ['Read them', 'pending']])],
      [plan('tu_p3', [['Find the reports', 'in_progress'], ['Read them', 'in_progress']])],
      // Two in progress: the read cannot be said to serve either.
      [read('tu_r1')],
      [plan('tu_p4', [['Find the reports', 'completed'], ['Read them', 'completed']])],
      'The shelf life is 24 months.',
    ];
    const events = await turn();
    const t = timelineOf(events);
    const find = taskEvents(t).find(e => e.title === 'Find the reports')!.task;
    expect(find).toBe('t1');

    expect(tasksOfStep(events, t, 'tu_s1')).toEqual(['t1', 't1']);
    expect(tasksOfStep(events, t, 'tu_r1')).toEqual([null, null]);
    for (const p of ['tu_p1', 'tu_p2', 'tu_p3', 'tu_p4']) {
      expect(new Set(tasksOfStep(events, t, p)), p).toEqual(new Set([null]));
    }
    // The record keeps the same attribution on the step.
    const recorded = recordedTaskIds();
    expect(recorded.get('tu_s1')).toBe('t1');
    expect(recorded.get('tu_r1')).toBeNull();
    expect(recorded.get('tu_p2')).toBeNull();
  });

  it('before any plan, a step serves no task', async () => {
    h.state.script = [[search('tu_s0')], 'Done.'];
    const events = await turn();
    expect(tasksOfStep(events, timelineOf(events), 'tu_s0')).toEqual([null, null]);
    expect(recordedTaskIds().get('tu_s0')).toBeNull();
  });
});

describe('3. task ids across five update_plan calls', () => {
  it('hold for each task while it is in the plan; a title removed and added again is a new task', async () => {
    h.state.script = [
      [plan('tu_p1', [['Find', 'in_progress'], ['Read', 'pending'], ['List', 'pending']])],
      [plan('tu_p2', [['Find', 'completed'], ['Read', 'in_progress'], ['List', 'pending']])],
      [plan('tu_p3', [['Find', 'completed'], ['Read', 'completed'], ['List', 'in_progress']])],
      // The read is dispatched while "List" (t3) is the one in progress; the plan beside it drops "List".
      [read('tu_r1'), plan('tu_p4', [['Find', 'completed'], ['Read', 'completed']])],
      [plan('tu_p5', [['Find', 'completed'], ['Read', 'completed'], ['List', 'in_progress']])],
      [search('tu_s1')],
      'Three claims.',
    ];
    const events = await turn();
    const t = timelineOf(events);
    const changes = taskEvents(t).map(e => `${e.change} ${e.title} ${e.task}`);
    // A plan's new tasks are added first, then its starts and completions, in the plan's order.
    expect(changes).toEqual([
      'added Find t1', 'added Read t2', 'added List t3',
      'started Find t1',
      'completed Find t1', 'started Read t2',
      'completed Read t2', 'started List t3',
      'removed List t3',
      'added List t4', 'started List t4',
    ]);
    // Each task keeps one id while it is in the plan.
    for (const title of ['Find', 'Read']) {
      expect(new Set(taskEvents(t).filter(e => e.title === title).map(e => e.task)).size, title).toBe(1);
    }
    expect(tasksOfStep(events, t, 'tu_r1')).toEqual(['t3', 't3']);
    expect(tasksOfStep(events, t, 'tu_s1')).toEqual(['t4', 't4']);
    const recorded = recordedTaskIds();
    expect(recorded.get('tu_r1')).toBe('t3');
    expect(recorded.get('tu_s1')).toBe('t4');
  });
});
