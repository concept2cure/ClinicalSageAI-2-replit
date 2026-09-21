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

await step(
  {
    id: 'OQ-SRDY-00',
    urs: [],
    title: 'Prerequisite: program, vault document, submission, sequence with one leaf',
    action: 'POST projects / vault ingest / submissions / sequences / leaves',
    expected: 'All created through the public API',
  },
  async ({ api, expect }) => {
    const p = await createProgram(api, expect, `OQ-005 Readiness program ${stamp}`);
    state.programId = p.id;
    state.programName = p.name;
    const ing = await ingestPdf(api, expect, { programId: p.id, title: `OQ-005 Protocol ${stamp}` });
    const { submission, sequence } = await createSubmissionWithSequence(api, expect, { title: `OQ-005 IND ${stamp}` });
    state.submission = submission;
    state.sequence = sequence;
    const leaf = await api('PUT', `/api/submissions/sequences/${sequence.id}/leaves`, {
      sectionCode: 'm5.3.5',
      title: 'Protocol',
      documentTable: 'vault_documents',
      documentUuid: ing.document.id,
      lifecycleOp: 'new',
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
    title: 'Dispatch QC records the gate outcome from the tamper-proof assessment',
    action: 'POST /api/submissions/:id/dispatch-qc {region, sequenceId, validationErrors:0, unresolvedShadowCriticals:0, leaves}',
    expected: 'HTTP 200; the result uses the server-side assessment (client-supplied zeros do not override it); the verdict is deterministic (no model in the loop)',
    dependsOn: ['OQ-SRDY-02'],
    note: 'If the route answers with an AI-gateway error code, the QC verdict depends on a model call — a CLAUDE.md Rule 2 observation (a verdict must come from a deterministic engine) — and the step is a deviation for the missing provider.',
  },
  async ({ api, expect, deviation }) => {
    const r = await api('POST', `/api/submissions/${state.submission.id}/dispatch-qc`, {
      region: 'fda',
      sequenceId: state.sequence.id,
      validationErrors: 0,
      unresolvedShadowCriticals: 0,
      leaves: [{ sectionCode: 'm5.3.5', operation: 'new' }],
    });
    if (r.status >= 500 && /AI|GATEWAY|PROVIDER/i.test(JSON.stringify(r.json))) {
      deviation(`AnA unavailable: no provider configured — the dispatch-QC route calls the model (${r.json?.error?.code}). OBSERVATION for review: a dispatch QC verdict routed through a model is not a deterministic gate (CLAUDE.md Rule 2).`, r.json);
    }
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    return JSON.stringify(r.json).slice(0, 300);
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

await step(
  {
    id: 'OQ-SRDY-05',
    urs: ['URS-SRDY-005'],
    title: 'Execute the readiness review for the program',
    action: 'POST /api/orchestration/execute {templateId:"submission_readiness_review", projectId}; GET /executions/:id',
    expected: 'Execution starts (2xx) and its status is readable; steps are orchestrator_logic (no model call)',
    dependsOn: ['OQ-SRDY-00'],
  },
  async ({ api, expect }) => {
    const e = await api('POST', '/api/orchestration/execute', { templateId: 'submission_readiness_review', projectId: state.programId, module: 'ind' });
    expect(e.status < 300, `expected 2xx, got ${e.status}`, e.json);
    const id = e.json?.executionId ?? e.json?.execution?.executionId ?? e.json?.id ?? e.json?.execution?.id;
    expect(id, 'no execution id', e.json);
    await new Promise((r) => setTimeout(r, 1500));
    const s = await api('GET', `/api/orchestration/executions/${id}`);
    expect(s.status === 200, `execution read expected 200, got ${s.status}`, s.json);
    return `execution ${id}: ${JSON.stringify(s.json).slice(0, 300)}`;
  },
);

await step(
  {
    id: 'OQ-SRDY-06',
    urs: ['URS-SRDY-006'],
    title: 'Contradiction (inconsistency) scan for a project',
    action: 'POST /api/governed-intelligence/contradictions/scan/1',
    expected: 'HTTP 200 with a deterministic scan result (possibly zero findings)',
  },
  async ({ api, expect, deviation, deniedTables }) => {
    const r = await api('POST', '/api/governed-intelligence/contradictions/scan/1', {});
    const needed = ['public.assumption_records', 'public.contradiction_links', 'public.decision_records'].filter((t) => deniedTables().includes(t));
    if (r.status === 500 && needed.length) {
      deviation(`IQ-DEV-001: ${needed.join(', ')} are listed as unreadable by the runtime role in IQ-07 (IQ/db-role-denied-tables.json); the scan answers 500. Re-execute after the grant is applied.`, r.json);
    }
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    return JSON.stringify(r.json).slice(0, 240);
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
    note: 'DispatchReadiness.tsx:79-84 reads GET /api/submissions and takes the FIRST submission in the organisation, not the one belonging to the program open in the shell. In an organisation with more than one submission the surface can gate a different sequence from the one the user is looking at.',
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
    title: 'Orchestration and Inconsistency surfaces render',
    action: 'Open /concept2cure/orchestration and /concept2cure/inconsistency',
    expected: 'Both render (screenshots); an unavailable store is shown as an error/empty state, never as data',
    dependsOn: ['OQ-SRDY-00'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/orchestration');
    await ctx.screenshot('orchestration');
    await ctx.goto('/concept2cure/inconsistency');
    await ctx.screenshot('inconsistency');
    return 'rendered';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
