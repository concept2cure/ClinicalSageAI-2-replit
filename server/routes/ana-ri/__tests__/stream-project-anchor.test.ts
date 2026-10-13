/**
 * The stream route reads the project the person is in (ana-14, 2026-10-08).
 *
 * The v2 app sends the open project as its regulatory_programs UUID. The route
 * handed that UUID to every reader keyed on the integer projects.id: memory
 * searched `project_id = '<uuid>'` on an integer column, the relational
 * reflection and the tool-run log took Number(uuid) (NaN), and the session
 * bootstrap dropped it. The route now resolves the integer once and hands it
 * to each.
 *
 * Admission is mandatory and bounded. An explicit unanchored project, a
 * failed access lookup or TURN_PROJECT_DEADLINE_MS timeout refuses the turn
 * before source context starts. Optional enrichment still reports its own
 * unavailable sources honestly after admission.
 *
 * And the person is told which context a reply is missing, and why, in plain
 * words; not "Some project context could not be loaded" on every turn, and
 * never a raw source key.
 *
 * Driven through the real route (support/stream-route-harness.ts). The
 * admission resolver is replaced to isolate propagation and deadlines.
 * Canonical live SQL permission is covered separately by the admission and
 * stream-project-private-access suites.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import httpRequest from 'supertest';

const io = vi.hoisted(() => ({
  resolve: vi.fn(),
  memory: vi.fn(),
  enrich: vi.fn(),
  prefetch: vi.fn(),
  bootstrap: vi.fn(),
  reflect: vi.fn(),
  logToolRun: vi.fn(),
}));
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
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal => ({
  ...(await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
  prefetchRouteIntelligenceContext: io.prefetch,
}));
// This suite isolates scope propagation/deadlines. Canonical SQL permission
// decisions are exercised separately in stream-project-private-access.
vi.mock('../../../services/ana/project-scope-admission', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/ana/project-scope-admission')>();
  return { ...actual, admitAnaProjectScope: async (_q: unknown, input: { projectRef: unknown; organizationId: unknown }) => {
    let id: number | null;
    try { id = await io.resolve(_q, { ref: input.projectRef, orgId: input.organizationId }); }
    catch { throw new actual.AnaProjectScopeError(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Project access unavailable'); }
    if (id == null) throw new actual.AnaProjectScopeError(409, 'ANA_PROJECT_ANCHOR_UNRESOLVED', 'Project relationship unavailable');
    return { projectId: id, programId: typeof input.projectRef === 'string' ? input.projectRef : null,
      projectRef: String(input.projectRef) };
  } };
});
vi.mock('../../../services/c2c/project-ref.js', () => ({ integerProjectForRef: io.resolve }));
vi.mock('../../../services/c2c/program-project-anchor.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  strictProjectRowForRef: io.resolve,
}));
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memory }));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({ enrichContextForChat: io.enrich }));
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: io.bootstrap }));
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: io.logToolRun }));
vi.mock('../../../services/ana-ri/relational-profile-service.js', () => ({ reflectAfterTurn: io.reflect }));
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());

import { mountStreamRoute, unavailableContextWarning, TURN_PROJECT_DEADLINE_MS } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const PROGRAM = 'd6160c9f-33d2-4be9-b779-eb27375f6e49';

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});

beforeEach(() => {
  resetHarness();
  io.resolve.mockReset().mockImplementation(async (_db: unknown, { ref }: { ref: unknown }) =>
    ref === PROGRAM ? 42 : (typeof ref === 'number' ? ref : null));
  io.memory.mockReset().mockResolvedValue({ memoryBlock: '', atoms: [], diagnostics: null });
  io.enrich.mockReset().mockResolvedValue({ block: '', sources: [], enrichmentMeta: { unavailableSources: [] } });
  io.prefetch.mockReset().mockResolvedValue({ unavailableSources: [], contextAvailabilityBlock: '' });
  io.bootstrap.mockReset().mockResolvedValue('');
  io.reflect.mockReset().mockResolvedValue(undefined);
  io.logToolRun.mockReset().mockResolvedValue(undefined);
});

describe('a program UUID reaches the project readers as its linked project id', () => {
  it('memory, prefetch, enrichment, bootstrap, the tool-run log and the reflection get 42, resolved once, org-scoped', async () => {
    h.state.script = [[{ id: 'tu_1', name: 'search_literature', input: { query: 'endpoint' } }], 'Done.'];
    await streamTurn(app, { message: 'Review the project', project_id: PROGRAM });

    expect(io.resolve).toHaveBeenCalledTimes(1);
    expect(io.resolve.mock.calls[0][1]).toMatchObject({ ref: PROGRAM, orgId: 7 });
    expect(io.memory).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
    expect(io.prefetch).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROGRAM, projectIdNumber: 42 }));
    // Enrichment keeps the UUID for the reads keyed on the program (CMC build state).
    expect(io.enrich).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROGRAM, project: { status: 'linked', id: 42 } }));
    expect(io.bootstrap).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
    expect(io.logToolRun).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
    expect(io.reflect).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
  });

  it('an explicit program without a verified relationship is refused before context', async () => {
    io.resolve.mockResolvedValue(null);
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Review the project', project_id: PROGRAM });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ANA_PROJECT_ANCHOR_UNRESOLVED');
    expect(io.memory).not.toHaveBeenCalled();
    expect(io.prefetch).not.toHaveBeenCalled();
    expect(io.enrich).not.toHaveBeenCalled();
    expect(h.state.gatewayCalls).toBe(0);
  });
});

describe('a lookup that could not tell is not "no linked project"', () => {
  it('a failed access lookup refuses the turn, without source context', async () => {
    io.resolve.mockRejectedValue(new Error('terminating connection due to administrator command'));
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: '/safety', project_id: PROGRAM });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_UNAVAILABLE');
    expect(io.enrich).not.toHaveBeenCalled();
    expect(io.prefetch).not.toHaveBeenCalled();
    expect(io.memory).not.toHaveBeenCalled();
  });

  it('an access lookup deadline refuses the turn without starting optional readers', async () => {
    io.resolve.mockImplementation(() => new Promise<never>(() => {}));
    const started = Date.now();
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Review the project', project_id: PROGRAM });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(TURN_PROJECT_DEADLINE_MS + 1500);
    expect(io.prefetch).not.toHaveBeenCalled();
    expect(io.enrich).not.toHaveBeenCalled();
    expect(io.memory).not.toHaveBeenCalled();
  }, 15_000);
});

describe('the person is told which context a reply is missing, and why', () => {
  it('names the sources in plain words on the stream', async () => {
    io.enrich.mockResolvedValue({
      block: '',
      sources: [],
      enrichmentMeta: { unavailableSources: ['project-profile', 'workflow'], unavailableReasons: { 'project-profile': 'error', workflow: 'error' } },
    });
    const events = await streamTurn(app, { message: 'Review the project', project_id: 42 });
    const warnings = events.filter(e => e.type === 'warning').map(e => e.message);

    expect(warnings).toContain('Could not read for this reply: project profile, submission workflow status. The answer does not draw on them.');
    expect(warnings.join(' ')).not.toContain('Some project context could not be loaded');
  });

  it.each([
    [['project-profile'], { 'project-profile': 'error' }, 'Could not read the project profile for this reply. The answer does not draw on it.'],
    [['project-profile'], { 'project-profile': 'timeout' }, 'The project profile took too long to read for this reply. The answer does not draw on it.'],
    [['ectd'], { ectd: 'error' }, 'Could not read the eCTD records for this reply. The answer does not draw on them.'],
    [['readiness', 'recommendations'], { readiness: 'timeout', recommendations: 'timeout' }, 'Took too long to read for this reply: readiness score, recommended next steps. The answer does not draw on them.'],
    [['project-profile', 'workflow'], { 'project-profile': 'error', workflow: 'timeout' }, 'Could not read for this reply: project profile. Took too long to read: submission workflow status. The answer does not draw on them.'],
    // A singular label that ends in "s" is still "it".
    [['workflow'], { workflow: 'error' }, 'Could not read the submission workflow status for this reply. The answer does not draw on it.'],
    [['workflow'], { workflow: 'timeout' }, 'The submission workflow status took too long to read for this reply. The answer does not draw on it.'],
    // The lookup of which project row the turn is in.
    [['project-record'], { 'project-record': 'error' }, 'Could not read the project records for this reply. The answer does not draw on them.'],
    [['project-record'], { 'project-record': 'timeout' }, 'The project records took too long to read for this reply. The answer does not draw on them.'],
    // App, slash-command, trigger and proactive keys read as the source they ran, never as the key.
    [['app:safety/safety'], undefined, 'Could not read the safety records for this reply. The answer does not draw on them.'],
    [['app:fda/ectd'], { 'app:fda/ectd': 'error' }, 'Could not read the eCTD records for this reply. The answer does not draw on them.'],
    [['cmc'], { cmc: 'error' }, 'Could not read the CMC records for this reply. The answer does not draw on them.'],
    [['cmc-build-state'], { 'cmc-build-state': 'timeout' }, 'The Module 3 build state took too long to read for this reply. The answer does not draw on it.'],
    [['iss'], { iss: 'error' }, 'Could not read the safety records for this reply. The answer does not draw on them.'],
    [['simulation'], { simulation: 'timeout' }, 'The deficiency patterns took too long to read for this reply. The answer does not draw on them.'],
    [['proactive-agent-activity'], { 'proactive-agent-activity': 'timeout' }, 'The recent agent activity took too long to read for this reply. The answer does not draw on it.'],
    [['proactive-client-journey'], { 'proactive-client-journey': 'error' }, 'Could not read the client journey summary for this reply. The answer does not draw on it.'],
    // A key with no words of its own is never shown as the key.
    [['tour-guide'], { 'tour-guide': 'timeout' }, 'The requested context took too long to read for this reply. The answer does not draw on it.'],
    // Two keys for one reader are named once.
    [['readiness', 'proactive-readiness'], { readiness: 'error', 'proactive-readiness': 'error' }, 'Could not read the readiness score for this reply. The answer does not draw on it.'],
  ] as const)('%j %j', (sources, reasons, expected) => {
    const warning = unavailableContextWarning([...sources], reasons as Record<string, 'timeout' | 'error'> | undefined);
    expect(warning).toBe(expected);
    expect(warning).not.toMatch(/!/);
  });

  it('every key the enrichment budget can record reads as plain words, never as the key', () => {
    const words = new Set([
      'project records', 'project profile', 'submission workflow status', 'readiness score', 'recommended next steps',
      'regulatory signals', 'risk forecasts', 'deficiency patterns', 'deficiency taxonomy', 'precedents',
      'claims and evidence records', 'cross-module consistency check', 'project knowledge base', 'decision records',
      'biostatistics records', 'safety records', 'CMC records', 'Module 3 build state', 'clinical study report records',
      'device records', 'diagnostics records', 'coverage and reimbursement records', 'eCTD records', 'amendment history',
      'client journey summary', 'recent agent activity', 'requested context',
    ]);
    // context-enrichment.ts: the project lookup and common reads, slash commands, composite parts,
    // app sources, natural-language triggers and the proactive greeting reads.
    const keys = [
      'project-record', 'project-profile', 'workflow', 'readiness', 'recommend', 'next', 'signals', 'simulate', 'draft',
      'consistency', 'deficiencies', 'knowledge', 'decisions', 'sap', 'power', 'dose', 'defensibility', 'design', 'safety',
      'cmc', 'cmc-build-state', 'csr', 'device', 'diagnostics', 'cms', 'ectd', 'amend', 'memo', 'brief', 'freeze', 'sign',
      'checklist', 'narrative', 'iss', 'ise', 'smpc', 'rmp', 'uspi', 'ask', 'wisdom', 'export', 'foresight', 'precedent',
      'deficiency', 'claims', 'recommendations', 'simulation', 'biostatistics', 'industry-wisdom', 'tour-guide',
      'app:foresight/foresight', 'app:precedent/precedent', 'app:fda/ectd', 'app:safety/safety', 'app:biostatistics/biostatistics',
      'proactive-readiness', 'proactive-recommendations', 'proactive-client-journey', 'proactive-agent-activity', 'constructor',
    ];
    for (const key of keys) {
      const warning = unavailableContextWarning([key], { [key]: 'error' });
      const named = /^Could not read the (.+) for this reply\. The answer does not draw on (?:it|them)\.$/.exec(warning)?.[1];
      expect(named !== undefined && words.has(named), `${key} -> ${warning}`).toBe(true);
    }
  });
});
