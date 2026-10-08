/**
 * One step-presentation table, both tenses, redacted details — through the
 * streaming route (ANA-SUMMARY S3, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md
 * §5 S3; evidence docs/evidence/ANA-SUMMARY/2026-10-08/S3-step-labels/).
 *
 * The route, its loop, the approval gate, the turn recorder and presentStep
 * run for real; the model is the harness's scripted gateway and the handlers
 * are stand-ins. What is pinned is what the person's browser is sent:
 *   3. a tool with no register entry never reaches a frame by its name;
 *   4. a live step reads in the doing form, the finished one in the done form;
 *   5. a read announces the document it reads, by its Vault title, scoped to
 *      the open project — and an id the scope does not return has no title;
 *   6. a step whose handler made a model generation carries usedModel: true
 *      and the Model fact, from the generation capture;
 *   1. (server half) no id reaches a frame's label, preview, facts or sentence.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
const scope = vi.hoisted(() => ({ value: { programId: 'aaaaaaaa-0000-4000-8000-00000000000a' } as { programId: string | null } | { error: string } }));
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
// The open project's scope, as catalogScope decides it for the read handler.
vi.mock('../../../services/ana/catalog-scope.js', () => ({
  catalogScope: async () => scope.value,
  documentScopeRefusal: async () => null,
}));

import { mountStreamRoute } from '../stream.js';
import { pool } from '../../../db.js';
import { noteGeneration } from '../../../services/ai-gateway/generation-capture.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (): Promise<SseEvent[]> => streamTurn(app, { message: 'find the stability reports' });
const PROGRAM = 'aaaaaaaa-0000-4000-8000-00000000000a';
const IN_PROJECT = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c3d';
const OTHER_PROJECT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const useOf = (events: SseEvent[], id: string) => events.find(e => e.type === 'tool_use' && e.toolUseId === id);
const resultOf = (events: SseEvent[], id: string) => events.find(e => e.type === 'tool_result' && e.toolUseId === id);
/** What the rows are built from: never the raw input or result, which the wire still carries (handed on, §6). */
const shown = (e: SseEvent | undefined) => JSON.stringify({ label: e?.label, preview: e?.preview, facts: e?.facts, message: e?.message, source: e?.source });

/** The title query's SQL and parameters, and the rows the Vault holds for this organisation and project. */
const titleQueries: Array<{ sql: string; params: unknown[] }> = [];
const VAULT_TITLES: Record<string, { title: string; program: string }> = {
  [IN_PROJECT]: { title: 'Stability report 2025', program: PROGRAM },
  [OTHER_PROJECT]: { title: 'Other project protocol', program: 'bbbbbbbb-0000-4000-8000-00000000000b' },
};

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
  scope.value = { programId: PROGRAM };
  titleQueries.length = 0;
  // Stands in for Postgres on the one title query: rows of the organisation, in
  // the program the SQL binds ($3) when it binds one. The SQL's own scoping is
  // proven against a real schema in step-document-titles.pglite.test.ts.
  vi.spyOn(pool as { query: (...a: unknown[]) => unknown }, 'query').mockImplementation(async (...args: unknown[]) => {
    const [sql, params = []] = args as [string, unknown[]];
    if (typeof sql === 'string' && sql.includes('FROM vault.documents d')) {
      titleQueries.push({ sql, params });
      const [ids, org, program] = params as [string[], number, string | undefined];
      const rows = ids
        .filter(id => VAULT_TITLES[id] && org === 7 && (!program || VAULT_TITLES[id].program === program))
        .map(id => ({ id, document_title: VAULT_TITLES[id].title }));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  h.handlers.search_project_documents = async () => JSON.stringify({ ok: true, totalMatches: 3, results: [{}, {}, {}] });
  h.handlers.read_project_document = async () =>
    JSON.stringify({ ok: true, documentTitle: 'Stability report 2025', window: { start: 0, end: 4812, text: '…' }, totalChars: 60000 });
});

afterEach(() => {
  for (const n of ['search_project_documents', 'read_project_document', 'compute_sample_size', 'sentinel_tool_xyz']) delete h.handlers[n];
  vi.restoreAllMocks();
});

describe('S3 through the stream route', () => {
  it('4. tense: the live step reads "Searching the Vault", the finished one "Searched the Vault", with "shelf life" beneath', async () => {
    h.state.script = [[{ id: 'tu_s', name: 'search_project_documents', input: { query: 'shelf life' } }], 'Done.'];
    const events = await turn();
    expect(useOf(events, 'tu_s')).toMatchObject({ label: 'Searching the Vault', source: 'vault', preview: 'shelf life' });
    const r = resultOf(events, 'tu_s');
    expect(r).toMatchObject({ label: 'Searched the Vault', source: 'vault', preview: 'shelf life', status: 'success' });
    expect(r?.facts).toEqual(
      expect.arrayContaining([
        { name: 'Searched for', value: 'shelf life' },
        { name: 'Found', value: '3 matches' },
        expect.objectContaining({ name: 'Took' }),
      ]),
    );
    expect(r?.message).toBeUndefined();
  });

  it('5. a read is announced by the title of its document, scoped to the open project', async () => {
    h.state.script = [[{ id: 'tu_r', name: 'read_project_document', input: { document_id: IN_PROJECT } }], 'Done.'];
    const events = await turn();
    expect(useOf(events, 'tu_r')?.label).toBe('Reading "Stability report 2025"');
    expect(resultOf(events, 'tu_r')?.label).toBe('Read "Stability report 2025"');
    const plan = events.find(e => e.type === 'step')?.plan;
    expect(plan).toEqual([{ tool: 'read_project_document', label: 'Reading "Stability report 2025"' }]);
    // One query, for the organisation and the open project's program.
    expect(titleQueries).toHaveLength(1);
    expect(titleQueries[0].params).toEqual([[IN_PROJECT], 7, PROGRAM]);
  });

  it('5. a document id outside the open project yields no title', async () => {
    h.state.script = [[{ id: 'tu_o', name: 'read_project_document', input: { document_id: OTHER_PROJECT } }], 'Done.'];
    const events = await turn();
    expect(useOf(events, 'tu_o')?.label).toBe('Reading a Vault document');
    expect(shown(useOf(events, 'tu_o'))).not.toContain('Other project protocol');
  });

  it('5. a project with no program (the read would be refused) yields no title at all', async () => {
    scope.value = { error: 'The open project has no program.' };
    h.state.script = [[{ id: 'tu_n', name: 'read_project_document', input: { document_id: IN_PROJECT } }], 'Done.'];
    const events = await turn();
    expect(useOf(events, 'tu_n')?.label).toBe('Reading a Vault document');
    expect(titleQueries).toHaveLength(0);
  });

  it('3. a tool with no register entry never reaches a frame by its name', async () => {
    h.handlers.sentinel_tool_xyz = async () => JSON.stringify({ ok: true });
    h.state.approvalOpens = true;
    h.state.approvalDecision = { decided: 'approved', result: { ok: true } };
    h.state.script = [[{ id: 'tu_x', name: 'sentinel_tool_xyz', input: { query: 'q' } }], 'Done.'];
    const events = await turn();
    const use = useOf(events, 'tu_x');
    const result = resultOf(events, 'tu_x');
    expect(use?.label).toBe('Running a step');
    expect(result?.label).toBe('Ran a step');
    const plan = events.find(e => e.type === 'step')?.plan;
    for (const text of [shown(use), shown(result), JSON.stringify(plan?.map((p: { label: string }) => p.label))]) {
      expect(text).not.toMatch(/sentinel/i);
    }
  });

  it('6. a step whose handler made a model generation carries usedModel: true and the Model fact', async () => {
    h.handlers.compute_sample_size = async () => {
      // What gateway.route() does on a generation that succeeds (generation-capture.ts).
      noteGeneration({ content: 'A model wrote this.' });
      return JSON.stringify({ n: 214 });
    };
    h.state.script = [[{ id: 'tu_m', name: 'compute_sample_size', input: {} }], 'Done.'];
    const events = await turn();
    const r = resultOf(events, 'tu_m');
    expect(r?.source).toBe('engine');
    expect(r?.usedModel).toBe(true);
    expect(r?.facts).toContainEqual({ name: 'Model', value: 'a model was used in this step' });
  });

  it('6. control: the same engine step with no generation carries usedModel: false and no Model fact', async () => {
    h.handlers.compute_sample_size = async () => JSON.stringify({ n: 214 });
    h.state.script = [[{ id: 'tu_e', name: 'compute_sample_size', input: {} }], 'Done.'];
    const events = await turn();
    const r = resultOf(events, 'tu_e');
    expect(r?.usedModel).toBe(false);
    expect(r?.label).toBe('Computed the sample size');
    expect(JSON.stringify(r?.facts)).not.toContain('Model');
  });

  it('1. (server half) no id reaches what a row is built from', async () => {
    h.handlers.search_project_documents = async () =>
      JSON.stringify({ ok: true, authoringDocId: IN_PROJECT, programId: PROGRAM, results: [{ id: OTHER_PROJECT }] });
    h.state.script = [[{ id: 'tu_i', name: 'search_project_documents', input: { document_id: IN_PROJECT, query: IN_PROJECT } }], 'Done.'];
    const events = await turn();
    expect(shown(useOf(events, 'tu_i'))).not.toMatch(UUID_RE);
    expect(shown(resultOf(events, 'tu_i'))).not.toMatch(UUID_RE);
    expect(resultOf(events, 'tu_i')?.facts).toEqual(expect.arrayContaining([{ name: 'Found', value: '1 result' }]));
  });
});
