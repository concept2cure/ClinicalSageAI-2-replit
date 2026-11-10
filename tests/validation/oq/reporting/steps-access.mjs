/**
 * OQ-007 steps OQ-RPT-01…07: who reaches the reporting API, what the release serves, whose records a run is over,
 * and where a report's figures come from.
 */
import { step, state, FIXTURES } from './context.mjs';
import { errCode, finalEligibility, runnableTypes, runRequest, runTotal, sealOf } from './signed-acts.mjs';
import { requireIdentity } from '../../lib/credentials.mjs';

const RUNS = '/api/report-os/runs';

await step(
  {
    id: 'OQ-RPT-01',
    urs: ['URS-RPT-001'],
    title: 'Anonymous access refused',
    action: 'without Authorization: GET /api/report-os/runs, GET /api/insights-canvas/overview, GET /api/audit/reports',
    expected: 'HTTP 401/403 each',
  },
  async ({ api, expect }) => {
    const seen = [];
    for (const path of [RUNS, '/api/insights-canvas/overview', '/api/audit/reports']) {
      const r = await api('GET', path, undefined, { anonymous: true });
      expect([401, 403].includes(r.status), `${path} expected 401/403, got ${r.status}`, r.json ?? r.text);
      seen.push(`${path} ${r.status}`);
    }
    return seen.join('; ');
  },
);

await step(
  {
    id: 'OQ-RPT-02',
    urs: ['URS-RPT-002'],
    title: 'The release serves the paths the two surfaces call and refuses the rest',
    action: 'as the run identity: GET the canvas bootstrap, the run history, the bundles, the schedules and the compliance catalog; then GET /api/report-os/scopes, /api/report-os/taxonomy and /api/insights/quality',
    expected: 'the five served 200; the three no launch screen calls 403 LAUNCH_SCOPE',
  },
  async ({ api, expect, attach }) => {
    const served = [RUNS, '/api/report-os/bundles', '/api/insights-canvas/overview', '/api/insights/subscriptions', '/api/audit/reports'];
    const refused = ['/api/report-os/scopes', '/api/report-os/taxonomy', '/api/insights/quality'];
    const observed = {};
    for (const path of served) {
      const r = await api('GET', path);
      observed[path] = r.status;
      expect(r.status === 200, `${path} expected 200, got ${r.status}`, r.json);
    }
    for (const path of refused) {
      const r = await api('GET', path);
      observed[path] = `${r.status} ${errCode(r) ?? ''}`.trim();
      expect(r.status === 403 && errCode(r) === 'LAUNCH_SCOPE', `${path} expected 403 LAUNCH_SCOPE, got ${observed[path]}`, r.json);
    }
    attach('launch-scope.json', observed);
    return `served: ${served.length} × 200; refused: ${refused.length} × 403 LAUNCH_SCOPE`;
  },
);

await step(
  {
    id: 'OQ-RPT-03',
    urs: ['URS-RPT-004', 'URS-RPT-005'],
    kind: 'prerequisite',
    title: 'The catalog, and a run an engine computed',
    action: 'GET /api/insights-canvas/overview; POST /api/report-os/runs for a type the catalog marks runnable, as the canvas sends it; GET /runs/:id/rendered',
    expected: '201 with the run and its snapshot; the run is the run identity\'s, not final; the rendered report says a finalize would be admitted',
  },
  async ({ api, auth, expect, attach }) => {
    const overview = await api('GET', '/api/insights-canvas/overview');
    expect(overview.status === 200, `the bootstrap expected 200, got ${overview.status}`, overview.json);
    const data = overview.json?.data ?? {};
    state.catalog = data.reportTypes ?? [];
    state.tier = { tier: data.tier, tierResolved: data.tierResolved };
    const tried = [];
    for (const type of runnableTypes(state.catalog)) {
      const created = await api('POST', RUNS, runRequest(type));
      expect(created.status === 201, `${type.typeId} expected 201, got ${created.status}`, created.json);
      const run = created.json?.data?.run ?? {};
      const eligibility = await finalEligibility(api, run.id);
      tried.push({ typeId: type.typeId, runId: run.id, status: run.status, eligible: eligibility.eligible, reasons: eligibility.reasons });
      if (!eligibility.eligible) continue;
      expect(String(run.requestedBy) === String(auth.user.id), 'the run does not name the run identity as its requester', run);
      expect(['completed', 'partial'].includes(run.status), `a new run reads ${run.status}`, run);
      expect(Boolean(created.json?.data?.snapshot?.id), 'the run has no snapshot', created.json?.data);
      state.run = run;
      state.runType = type;
      break;
    }
    attach('runs-tried.json', tried);
    expect(Boolean(state.run), 'no runnable type produced a run a finalize would admit', tried);
    return `run ${state.run.id} (${state.runType.typeId}, ${state.runType.runScopeType} scope) ${state.run.status}; ${state.catalog.length} types in the catalog, ${tried.length} tried`;
  },
);

await step(
  {
    id: 'OQ-RPT-04',
    urs: ['URS-RPT-004'],
    title: 'A run request carries no figure',
    action: 'POST the same run with status "final", a confidence, blockers and a summary in the body; read its seal',
    expected: '201; the stored run carries the engine\'s status and confidence, not the request\'s, and none of the supplied content; it is not sealed',
    dependsOn: ['OQ-RPT-03'],
  },
  async ({ api, expect, attach }) => {
    const supplied = { status: 'final', confidence: 97, blockers: [{ provider: 'supplied', reason: 'supplied-by-request' }], dependencySummary: { summary: { suppliedByRequest: true } }, summary: { suppliedByRequest: true } };
    const r = await api('POST', RUNS, { ...runRequest(state.runType), ...supplied });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const run = r.json?.data?.run ?? {};
    const text = JSON.stringify(r.json);
    attach('supplied-and-stored.json', { supplied, stored: { status: run.status, confidence: run.confidence, blockers: run.blockers } });
    expect(run.status === state.run.status && run.status !== 'final', `the run reads ${run.status}; the engine's run read ${state.run.status}`, run);
    expect(run.confidence === state.run.confidence, `confidence ${run.confidence} differs from the engine's ${state.run.confidence}`, run);
    expect(!/suppliedByRequest|supplied-by-request/.test(text), 'the stored run carries content the request supplied', run);
    const seal = await sealOf(api, run.id);
    expect(seal.status === 200 && seal.view.sealed === false, 'a run requested as final reads sealed', seal.view);
    return `run ${run.id} ${run.status}, confidence ${run.confidence} (the engine's); nothing supplied was stored; sealed: false`;
  },
);

await step(
  {
    id: 'OQ-RPT-05',
    urs: ['URS-RPT-004'],
    title: 'A type no engine computes is not run',
    action: 'POST a run for a catalog type marked not computed, for a prediction type and for an unknown type, over the run identity\'s own program',
    expected: '422 REPORT_TYPE_NOT_COMPUTED; 422 PREDICTION_NOT_A_RUN; 404; the run history total unchanged',
    dependsOn: ['OQ-RPT-03'],
  },
  async ({ api, expect, deviation }) => {
    if (!FIXTURES.ownProgramId) deviation('not executed — OQ_QMS_PROGRAM_ID (a program the run identity owns) not supplied; the project-scoped refusals need one.');
    const overProject = (type) => type.allowedScopes?.includes('project');
    const notComputed = state.catalog.find((t) => t.availabilityState === 'not-computed' && t.family !== 'prediction' && overProject(t));
    const prediction = state.catalog.find((t) => t.family === 'prediction' && overProject(t));
    expect(Boolean(notComputed && prediction), 'the catalog lists no not-computed type or no prediction type over a project', { notComputed, prediction });
    const before = await runTotal(api);
    const ask = (reportTypeId) => api('POST', RUNS, { scopeType: 'project', programId: FIXTURES.ownProgramId, reportTypeId });
    const a = await ask(notComputed.typeId);
    expect(a.status === 422 && errCode(a) === 'REPORT_TYPE_NOT_COMPUTED', `${notComputed.typeId} expected 422 REPORT_TYPE_NOT_COMPUTED, got ${a.status} ${errCode(a)}`, a.json);
    const b = await ask(prediction.typeId);
    expect(b.status === 422 && errCode(b) === 'PREDICTION_NOT_A_RUN', `${prediction.typeId} expected 422 PREDICTION_NOT_A_RUN, got ${b.status} ${errCode(b)}`, b.json);
    const c = await ask('oq007.no_such_report');
    expect(c.status === 404, `an unknown type expected 404, got ${c.status}`, c.json);
    const after = await runTotal(api);
    expect(after === before, `a refused request created a run: ${before} → ${after}`, { before, after });
    return `${notComputed.typeId} 422 REPORT_TYPE_NOT_COMPUTED; ${prediction.typeId} 422 PREDICTION_NOT_A_RUN; unknown type 404; runs ${before} → ${after}`;
  },
);

await step(
  {
    id: 'OQ-RPT-06',
    urs: ['URS-RPT-003'],
    title: 'Another organisation\'s run and project are not found',
    action: 'with another organisation\'s run id: GET the run, its rendered report, its seal and its export; then POST a run over that organisation\'s project tracking record, over its program, and over its account',
    expected: 'the four reads 404; the run over its project 404; over its program 409 PROGRAM_NOT_ANCHORED (the answer for a program with no tracking record here); over its account 403 REPORT_ACCOUNT_SCOPE_MISMATCH; no run created',
    dependsOn: ['OQ-RPT-03'],
  },
  async ({ api, expect, deviation, attach }) => {
    const { foreignRunId, foreignTrackingProjectId, foreignProgramId } = FIXTURES;
    if (!foreignRunId || !foreignTrackingProjectId || !foreignProgramId) {
      deviation('not executed — OQ_FOREIGN_REPORT_RUN_ID, OQ_FOREIGN_TRACKING_PROJECT_ID or OQ_FOREIGN_PROJECT_ID not supplied (docs/evidence/W3/2026-11-10/setup/fixtures-reporting.mjs writes them).');
    }
    const before = await runTotal(api);
    const observed = {};
    for (const suffix of ['', '/rendered', '/seal', '/export.pdf']) {
      const r = await api('GET', `${RUNS}/${foreignRunId}${suffix}`);
      observed[`GET run${suffix}`] = r.status;
      expect(r.status === 404, `GET ${RUNS}/${foreignRunId}${suffix} expected 404, got ${r.status}`, r.json);
    }
    const type = 'readiness.executive_digest';
    const overProject = await api('POST', RUNS, { scopeType: 'project', scopeId: foreignTrackingProjectId, reportTypeId: type });
    expect(overProject.status === 404, `a run over another organisation's project expected 404, got ${overProject.status}`, overProject.json);
    const overProgram = await api('POST', RUNS, { scopeType: 'project', programId: foreignProgramId, reportTypeId: type });
    expect(overProgram.status === 409 && errCode(overProgram) === 'PROGRAM_NOT_ANCHORED', `a run over another organisation's program expected 409 PROGRAM_NOT_ANCHORED, got ${overProgram.status} ${errCode(overProgram)}`, overProgram.json);
    const otherOrg = String(Number(state.run.organizationId) === 1 ? 2 : 1);
    const overAccount = await api('POST', RUNS, { scopeType: 'account', scopeId: otherOrg, reportTypeId: state.runType.typeId });
    expect(overAccount.status === 403 && errCode(overAccount) === 'REPORT_ACCOUNT_SCOPE_MISMATCH', `a run over another organisation's account expected 403 REPORT_ACCOUNT_SCOPE_MISMATCH, got ${overAccount.status} ${errCode(overAccount)}`, overAccount.json);
    const after = await runTotal(api);
    expect(after === before, `a refused request created a run: ${before} → ${after}`, { before, after });
    attach('tenancy.json', { ...observed, overProject: overProject.status, overProgram: `${overProgram.status} ${errCode(overProgram)}`, overAccount: `${overAccount.status} ${errCode(overAccount)}`, runs: { before, after } });
    return `run ${foreignRunId} of another organisation: 4 reads 404; a run over its project 404, its program 409 PROGRAM_NOT_ANCHORED, its account 403 REPORT_ACCOUNT_SCOPE_MISMATCH; runs ${before} → ${after}`;
  },
);

await step(
  {
    id: 'OQ-RPT-07',
    urs: ['URS-RPT-005'],
    title: 'A read-only member reads the run history and creates no run',
    action: 'as the viewer (OQ_VIEWER): GET /api/report-os/runs; POST the run request',
    expected: 'the read 200; the write 403; the run history total unchanged',
    dependsOn: ['OQ-RPT-03'],
  },
  async ({ api, apiAs, expect, deviation, baseUrl }) => {
    const viewer = await requireIdentity({ deviation, expect }, baseUrl, 'OQ_VIEWER', 'a read-only member is needed to observe the write refusal.');
    const asViewer = apiAs(viewer.session);
    const before = await runTotal(api);
    const read = await asViewer('GET', RUNS);
    expect(read.status === 200, `the viewer's read expected 200, got ${read.status}`, read.json);
    const write = await asViewer('POST', RUNS, runRequest(state.runType));
    expect(write.status === 403, `the viewer's run expected 403, got ${write.status}`, write.json);
    const after = await runTotal(api);
    expect(after === before, `the viewer's refused run was created: ${before} → ${after}`, { before, after });
    return `the viewer's read 200; the write 403; runs ${before} → ${after}`;
  },
);

/** Named so run.mjs imports this module with a `from` clause, and so the next module can wait for it. */
export const ACCESS_STEPS = 'steps-access.mjs';
