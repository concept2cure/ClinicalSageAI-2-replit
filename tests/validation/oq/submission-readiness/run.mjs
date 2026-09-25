/**
 * OQ-005 — Operational Qualification: Submission Readiness.
 * Protocol: docs/validation/OQ-005-SUBMISSION-READINESS.md. Requirements: docs/validation/URS-005-SUBMISSION-READINESS.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { createProgram, ingestPdf, createSubmissionWithSequence } from '../../lib/fixtures.mjs';

const run = await createRun({
  app: 'SUBMISSION-READINESS',
  appLabel: 'Submission Readiness',
  protocolId: 'OQ-005',
  protocolTitle: 'Operational Qualification — Submission Readiness',
});
const { step, state } = run;
const stamp = helpers.stamp();

/** Launch scope as the server reports it (the navigation payload OQ-SRDY-08 reads). */
async function launchScopeEnforced(api) {
  const nav = await api('GET', '/api/module-subscriptions/navigation');
  return nav.status === 200 && nav.json?.launchScope?.enforced === true;
}

await step(
  {
    id: 'OQ-SRDY-00',
    kind: 'prerequisite',
    urs: [],
    title: 'Prerequisite: program, vault document, submission, sequence with one leaf',
    action: 'POST projects / vault ingest / submissions / sequences / leaves',
    expected: 'All created through the public API',
  },
  async ({ api, expect }) => {
    const p = await createProgram(api, expect, `OQ-005 Readiness program ${stamp}`);
    state.programId = p.id;
    state.programName = p.title ?? p.name;
    state.projectAnchorId = p.projectAnchorId;
    state.projectAnchorSkipped = p.projectAnchorSkipped;
    state.projectAnchorDetail = p.projectAnchorDetail;
    const ing = await ingestPdf(api, expect, { programId: p.id, title: `OQ-005 Protocol ${stamp}` });
    // The sequence goes on the PROGRAM's canonical submission (intake's spine),
    // so OQ-SRDY-07 exercises "the open program's sequence" rather than a
    // submission the program does not own (VSR-001 F-8).
    expect(p.spineSubmissionId != null, 'intake reported no canonical submission for the program', p);
    const { submission, sequence } = await createSubmissionWithSequence(api, expect, {
      title: `OQ-005 IND ${stamp}`,
      submissionId: p.spineSubmissionId,
    });
    state.submission = submission;
    state.sequence = sequence;
    const leaf = await api('PUT', `/api/submissions/sequences/${sequence.id}/leaves`, {
      sectionCode: 'm5.3.5',
      title: 'Protocol',
      documentTable: 'vault_documents',
      documentUuid: ing.document.id,
      lifecycleOp: 'new',
      reason: 'Placed by the validation run for this sequence',
    });
    expect(leaf.status === 200, `leaf expected 200, got ${leaf.status}`, leaf.json);
    return `program ${p.id}; submission ${submission.id}; sequence ${sequence.id}; leaf m5.3.5`;
  },
);

await step(
  {
    id: 'OQ-SRDY-01',
    urs: ['URS-SRDY-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/submissions/sequences/:id/dispatch-readiness without Authorization',
    expected: 'HTTP 401/403',
    dependsOn: ['OQ-SRDY-00'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/submissions/sequences/${state.sequence.id}/dispatch-readiness`, undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-02',
    urs: ['URS-SRDY-002'],
    title: 'Deterministic dispatch-readiness assessment for a sequence',
    action: 'GET /api/submissions/sequences/:id/dispatch-readiness',
    expected: 'HTTP 200 with numeric validationErrors / unacknowledgedShadowCriticals and an explicit ready/blocked verdict with reasons',
    dependsOn: ['OQ-SRDY-00'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/submissions/sequences/${state.sequence.id}/dispatch-readiness`);
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const j = r.json ?? {};
    expect(typeof j.validationErrors === 'number' && typeof j.unacknowledgedShadowCriticals === 'number', 'assessment lacks numeric counts', j);
    expect(typeof j.gate?.cleared === 'boolean' && Array.isArray(j.gate?.blockers), 'assessment has no gate.cleared verdict with blockers', Object.keys(j));
    expect(j.gate.cleared === false && j.gate.blockers.length >= 1, 'a never-validated, never-shadow-reviewed, unsigned sequence must not be cleared', j.gate);
    state.assessment = j;
    return `gate.cleared=${j.gate.cleared}; validationErrors=${j.validationErrors}; shadowCriticals=${j.unacknowledgedShadowCriticals}; releaseSignature=${j.releaseSignature?.verdict}; blockers: ${j.gate.blockers.join(' | ').slice(0, 300)}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-03',
    urs: ['URS-SRDY-003'],
    title: 'Dispatch QC returns the deterministic gate verdict; the model only narrates',
    action: 'POST /api/submissions/:id/dispatch-qc {region, sequenceId, validationErrors:0, unresolvedShadowCriticals:0, leaves}; GET /sequences/:id/dispatch-readiness',
    expected:
      'HTTP 200 with { clearedToDispatch, blockers, warnings, checklist, verdictSource:"assess-dispatch-readiness", narrative, narrativeUnavailable }; clearedToDispatch and blockers EQUAL the GET dispatch-readiness gate (client-supplied zeros do not override it); with no provider narrative is null and narrativeUnavailable.code is PROVIDER_UNAVAILABLE — the verdict is a pass without a provider, the narrative is recorded as not executed',
    dependsOn: ['OQ-SRDY-02'],
    note: 'VSR-001 F-9 (fixed 2026-09-21, docs/evidence/WB/2026-09-21/): the QC verdict is computeDispatchQcVerdict over the server-side assessment — the same composed gate freeze/dispatch enforce — and the model\'s own verdict field is never read. A gateway error on this route is now a FAIL (the verdict must not depend on a model), not a deviation.',
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/submissions/${state.submission.id}/dispatch-qc`, {
      region: 'fda',
      sequenceId: state.sequence.id,
      validationErrors: 0,
      unresolvedShadowCriticals: 0,
      leaves: [{ sectionCode: 'm5.3.5', operation: 'new' }],
    });
    expect(r.status === 200, `expected 200, got ${r.status} (a gateway/provider error here means the verdict depends on a model — CLAUDE.md Rule 2)`, r.json);
    const j = r.json ?? {};
    expect(typeof j.clearedToDispatch === 'boolean' && Array.isArray(j.blockers) && Array.isArray(j.warnings) && Array.isArray(j.checklist), 'response lacks the deterministic verdict shape', Object.keys(j));
    expect(j.verdictSource === 'assess-dispatch-readiness', `verdictSource is ${j.verdictSource}, not the server-side sequence assessment`, j);
    const g = await api('GET', `/api/submissions/sequences/${state.sequence.id}/dispatch-readiness`);
    expect(g.status === 200, `dispatch-readiness expected 200, got ${g.status}`, g.json);
    const gate = g.json?.gate ?? {};
    expect(j.clearedToDispatch === gate.cleared, `QC verdict ${j.clearedToDispatch} differs from the gate ${gate.cleared}`, { qc: j.clearedToDispatch, gate });
    expect(JSON.stringify(j.blockers) === JSON.stringify(gate.blockers), 'QC blockers differ from the gate blockers', { qc: j.blockers, gate: gate.blockers });
    expect(j.clearedToDispatch === false, 'client-supplied zeros cleared a never-validated sequence', j);
    let narrative;
    if (j.narrative === null && j.narrativeUnavailable?.code === 'PROVIDER_UNAVAILABLE') {
      narrative = 'narrative: not executed — no provider (narrativeUnavailable.code PROVIDER_UNAVAILABLE); the verdict did not need one';
    } else if (typeof j.narrative === 'string' && j.narrative.length > 0 && j.narrativeUnavailable === null) {
      narrative = `narrative: model prose returned (${j.narrative.length} chars) under the advisory label; verdict unchanged by it`;
    } else {
      expect(false, 'narrative/narrativeUnavailable is neither a provider-unavailable null nor advisory prose', { narrative: j.narrative, narrativeUnavailable: j.narrativeUnavailable });
    }
    return `clearedToDispatch=${j.clearedToDispatch} == gate.cleared; ${j.blockers.length} blockers identical to the gate; verdictSource=${j.verdictSource}; checklist ${j.checklist.length} items; ${narrative}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-04',
    urs: ['URS-SRDY-004'],
    title: 'Readiness review template is registered and execute validates inputs',
    action: 'GET /api/orchestration/templates; POST /api/orchestration/execute {templateId} without projectId',
    expected: 'submission_readiness_review listed with 5 steps; execute without projectId → 400',
  },
  async ({ api, expect }) => {
    const t = await api('GET', '/api/orchestration/templates');
    const tpl = (t.json?.templates ?? []).find((x) => x.templateId === 'submission_readiness_review');
    expect(tpl && tpl.stepCount === 5, 'template missing or wrong step count', t.json);
    const e = await api('POST', '/api/orchestration/execute', { templateId: 'submission_readiness_review' });
    expect(e.status === 400, `expected 400, got ${e.status}`, e.json);
    return `template present (${tpl.stepCount} steps); execute w/o projectId → 400`;
  },
);

/** What a review run says about the project it read: its first step, inspect_project_state. */
function inspected(run) {
  const first = (run?.steps ?? []).find((x) => x.stepId === 'inspect_project_state');
  return { name: first?.result?.projectName ?? null, documents: first?.result?.documentCount ?? null };
}

/** How a run that should not have completed is described in a failure. */
function assessedAnyway(run) {
  const p = inspected(run);
  return `ended "${run?.status}" for "${p.name}" with ${p.documents} document(s)`;
}

await step(
  {
    id: 'OQ-SRDY-05',
    urs: ['URS-SRDY-005'],
    title: 'The readiness review never assesses a project it cannot read',
    action:
      'POST /api/orchestration/execute {templateId:"submission_readiness_review", projectId:<the program id>, module:"ind"}. The review reads the integer project spine (projects.id); a program id is a uuid',
    expected:
      'Refused with a 4xx and no run, or a run that ends failed and says why. Never a completed review of a project the engine did not read',
    dependsOn: ['OQ-SRDY-00'],
    note: 'VSR-001 F-23. Until v0.4 this step executed the review for the program and passed on any 2xx, and the protocol called it unscripted while the record called it a scripted pass. Every read behind the review failed on the program uuid, each failure was swallowed, and the review completed all five steps for "Project" with 0 documents, recommending "No critical issues found".',
  },
  async ({ api, expect }) => {
    const e = await api('POST', '/api/orchestration/execute', {
      templateId: 'submission_readiness_review',
      projectId: state.programId,
      module: 'ind',
    });
    const refused = e.status >= 400 && e.status < 500;
    const failedRun = e.status < 300 && e.json?.status === 'failed';
    const why =
      e.status < 300
        ? `the review of program ${state.programId} ${assessedAnyway(e.json)}: a project it could not read was assessed`
        : `the review answered HTTP ${e.status}: neither a refusal nor a failed run`;
    expect(refused || failedRun, why, e.json);
    if (refused) return `refused: HTTP ${e.status} ${JSON.stringify(e.json?.error ?? e.json)}`;
    return `run ${e.json.executionId} ended failed: ${e.json.auditTrail?.at(-1)?.detail}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-05b',
    urs: ['URS-SRDY-005'],
    title: 'The readiness review names the project it assessed',
    action:
      'When intake anchored the program to a project (meta.projectAnchorId): POST /api/orchestration/execute {templateId:"submission_readiness_review", projectId:<the anchored project>, module:"ind"}',
    expected:
      'The run completes, and its first step (inspect_project_state), read from the execution the response returns, names the program. A program intake did not anchor is a deviation naming the reason intake gave',
    dependsOn: ['OQ-SRDY-00'],
    note: 'The review reads the integer project spine. A program reaches it only through the anchor intake writes (services/c2c/program-project-anchor.ts), and intake writes one only when the organisation has exactly one client workspace. Signup creates none.',
  },
  async ({ api, expect, deviation }) => {
    if (state.projectAnchorId == null) {
      const reason = [state.projectAnchorSkipped, state.projectAnchorDetail].filter(Boolean).join(': ');
      deviation(
        `intake did not anchor program ${state.programId} to a project (${reason || 'no reason given'}). The review reads projects, so there is no project it can assess for this program`,
      );
    }
    const e = await api('POST', '/api/orchestration/execute', {
      templateId: 'submission_readiness_review',
      projectId: state.projectAnchorId,
      module: 'ind',
    });
    expect(e.status === 200 && e.json?.status === 'completed', `expected a completed run, got HTTP ${e.status}`, e.json);
    const project = inspected(e.json);
    expect(project.name === state.programName, `the review assessed "${project.name}", not the program "${state.programName}"`, e.json.steps?.[0]);
    // v0.6: the execution history (GET /api/orchestration/executions/:id) is the
    // Orchestration board's, locked by launch scope at the API (OQ-SRDY-08). The
    // status and steps are read from the execution the response returns.
    return `run ${e.json.executionId} completed for "${project.name}" (${project.documents} document(s)), status and steps read from the execution returned`;
  },
);

await step(
  {
    id: 'OQ-SRDY-06',
    urs: ['URS-SRDY-006'],
    title: 'A contradiction scan never reports a project it cannot read as clean',
    action:
      'POST /api/governed-intelligence/contradictions/scan/<the program id>; POST /api/governed-intelligence/contradictions/scan/<a project id the organisation does not hold>',
    expected:
      'Neither answers 200 with findings. With launch scope enforced (the posture this protocol runs in) both are refused 403 LAUNCH_SCOPE, because the scan belongs to the Inconsistency board (OQ-SRDY-08). With it off, the program id is refused 400 and the unheld id 404',
    dependsOn: ['OQ-SRDY-00'],
    note: 'VSR-001 F-25. Until v0.5 this step scanned project 1 and passed on 200 with zero findings, in an organisation that holds no project 1: a clean result for a project nothing was read from. A program id arrived as NaN, which the registry searches read as "no project filter", so the scan read the whole organisation.',
  },
  async ({ api, expect }) => {
    const program = await api('POST', `/api/governed-intelligence/contradictions/scan/${state.programId}`, {});
    const unheld = await api('POST', '/api/governed-intelligence/contradictions/scan/2147480000', {});
    const clean = (r) => r.status === 200 && Array.isArray(r.json?.findings);
    const locked = (r) => r.status === 403 && r.json?.error?.code === 'LAUNCH_SCOPE';
    const scoped = await launchScopeEnforced(api);
    expect(!clean(program) && (scoped ? locked(program) : program.status === 400), `the scan of program ${state.programId} answered ${program.status}${clean(program) ? ` with ${program.json.findings.length} finding(s)` : ''}`, program.json);
    expect(!clean(unheld) && (scoped ? locked(unheld) : unheld.status === 404), `the scan of a project the organisation does not hold answered ${unheld.status}${clean(unheld) ? ` with ${unheld.json.findings.length} finding(s)` : ''}`, unheld.json);
    return scoped
      ? `launch scope enforced: both scans refused 403 LAUNCH_SCOPE, neither answered as clean`
      : `program id refused ${program.status}: ${program.json?.error}; unheld project refused ${unheld.status}: ${unheld.json?.error}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-06b',
    urs: ['URS-SRDY-006'],
    title: 'A contradiction scan of the program\'s project runs',
    action: 'When intake anchored the program to a project (meta.projectAnchorId): POST /api/governed-intelligence/contradictions/scan/<the anchored project>',
    expected: 'With launch scope off: HTTP 200 with a deterministic result (possibly zero findings); a program intake did not anchor is a deviation naming the reason intake gave. With launch scope enforced the scan is locked (OQ-SRDY-08) and this positive half cannot be executed in this posture: a deviation that says so',
    dependsOn: ['OQ-SRDY-00'],
  },
  async ({ api, expect, deviation }) => {
    if (await launchScopeEnforced(api)) {
      deviation('launch scope is enforced, and the contradiction scan belongs to the Inconsistency board, which is not in this release (VSR-001 §16.5; OQ-SRDY-08). The positive half of URS-SRDY-006 is executable only with launch scope off');
    }
    if (state.projectAnchorId == null) {
      const reason = [state.projectAnchorSkipped, state.projectAnchorDetail].filter(Boolean).join(': ');
      deviation(`intake did not anchor program ${state.programId} to a project (${reason || 'no reason given'}). The scan reads projects, so there is no project it can scan for this program`);
    }
    const r = await api('POST', `/api/governed-intelligence/contradictions/scan/${state.projectAnchorId}`, {});
    expect(r.status === 200 && Array.isArray(r.json?.findings), `expected 200 with findings, got ${r.status}`, r.json);
    return `project ${state.projectAnchorId}: ${r.json.summary?.total ?? r.json.findings.length} finding(s)`;
  },
);

await step(
  {
    id: 'OQ-SRDY-07',
    urs: ['URS-SRDY-007'],
    title: 'Dispatch Readiness surface renders the sequence readiness',
    action: 'Open /concept2cure/dispatch-readiness with the program selected',
    expected: 'The surface shows the open program\'s sequence (number 0000) and its gate verdict',
    dependsOn: ['OQ-SRDY-00'],
    note: 'VSR-001 F-8 (2026-09-20): DispatchReadiness.tsx took the FIRST submission in the organisation, not the open program\'s. Since 2026-09-21 the surface resolves the open program (shell id → GET /api/c2c/projects/:id), picks its submission by the platform\'s program↔submission identity convention, and gates that submission\'s latest sequence; OQ-SRDY-00 builds the sequence on the program\'s own submission so this step exercises exactly that. The surface prints the sequence NUMBER (0000) beside the row id.',
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/dispatch-readiness');
    await ctx.screenshot();
    await ctx.expectText(/0000/);
    return 'sequence 0000 visible';
  },
);

await step(
  {
    id: 'OQ-SRDY-08',
    urs: ['URS-SRDY-008'],
    title: 'The Orchestration and Inconsistency boards are not in this release',
    action: 'GET /api/module-subscriptions/navigation; open /concept2cure/orchestration and /concept2cure/inconsistency; POST /api/governed-intelligence/contradictions/scan/1; GET /api/orchestration/executions/<any id> (v0.6)',
    expected:
      'launchScope.enforced=true; "orchestration" and "inconsistency" are not entitled, source "launch-scope", while "dispatch-readiness" is entitled; each deep link explains the board is not in this release; and the boards\' own APIs answer 403 LAUNCH_SCOPE, so the lock is not only in the navigation (v0.6)',
    note: 'OQ-005 v0.5. Until then this ad-hoc step rendered both boards. In every organisation signup creates, the Orchestration board found no program and the Inconsistency board refused the program\'s id: both read the integer project spine, which a program reaches only through an anchor signup never creates (VSR-001 §14.3; decided §16).',
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const nav = await api('GET', '/api/module-subscriptions/navigation');
    expect(nav.status === 200, `expected 200, got ${nav.status}`, nav.json);
    expect(nav.json?.launchScope?.enforced === true, 'launchScope.enforced is not true', nav.json?.launchScope);
    const arr = Object.values(nav.json ?? {}).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'entitled' in x)) ?? [];
    const byId = Object.fromEntries(arr.map((v) => [v.id, v]));
    for (const id of ['orchestration', 'inconsistency']) {
      expect(byId[id]?.entitled === false && byId[id]?.source === 'launch-scope', `${id} is not locked by launch-scope`, byId[id]);
    }
    expect(byId['dispatch-readiness']?.entitled === true, 'dispatch-readiness is not entitled', byId['dispatch-readiness']);
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/orchestration');
    await ctx.expectText(/not in this release/i);
    await ctx.screenshot('orchestration');
    await ctx.goto('/concept2cure/inconsistency');
    await ctx.expectText(/not in this release/i);
    await ctx.screenshot('inconsistency');
    // v0.6: the lock holds at the API, not only in the navigation. Until
    // 2026-09-25 a signed-in tenant could call both boards' routes directly.
    const scan = await api('POST', '/api/governed-intelligence/contradictions/scan/1', {});
    const history = await api('GET', '/api/orchestration/executions/oq-srdy-08');
    for (const [name, r] of [['contradiction scan', scan], ['execution history', history]]) {
      expect(r.status === 403 && r.json?.error?.code === 'LAUNCH_SCOPE', `the ${name} API answered ${r.status}, not 403 LAUNCH_SCOPE`, r.json);
    }
    return 'orchestration and inconsistency locked by launch-scope in the navigation, both deep links, and both boards\' APIs (403 LAUNCH_SCOPE); dispatch-readiness entitled';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
