/**
 * OQ-004 — Operational Qualification: Submission Center.
 * Protocol: docs/validation/OQ-004-SUBMISSION-CENTER.md. Requirements: docs/validation/URS-004-SUBMISSION-CENTER.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { createProgram, ingestPdf, createSubmissionWithSequence } from '../../lib/fixtures.mjs';

const run = await createRun({
  app: 'SUBMISSION-CENTER',
  appLabel: 'Submission Center',
  protocolId: 'OQ-004',
  protocolTitle: 'Operational Qualification — Submission Center',
});
const { step, state } = run;
const stamp = helpers.stamp();

await step(
  {
    id: 'OQ-SUBC-00',
    urs: [],
    title: 'Prerequisite: a program with one vault document',
    action: 'POST /api/c2c/projects; POST /api/vault/ingest',
    expected: 'Program and document created',
  },
  async ({ api, expect }) => {
    const p = await createProgram(api, expect, `OQ-004 Submission program ${stamp}`);
    state.programId = p.id;
    state.programName = p.name;
    const ing = await ingestPdf(api, expect, { programId: p.id, title: `OQ-004 Cover letter ${stamp}`, documentType: 'CORRESPONDENCE' });
    state.docId = ing.document.id;
    return `program ${p.id}; document ${ing.document.id}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-01',
    urs: ['URS-SUBC-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/submissions without Authorization',
    expected: 'HTTP 401/403',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/submissions', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-02',
    urs: ['URS-SUBC-002'],
    title: 'Submission creation validates its inputs',
    action: 'POST /api/submissions with primaryRegion "mars"',
    expected: 'HTTP 400 VALIDATION with field details',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/submissions', { title: 'bad', applicationType: 'IND', clientType: 'biotech', primaryRegion: 'mars' });
    expect(r.status === 400 && r.json?.error?.code === 'VALIDATION', `expected 400 VALIDATION, got ${r.status}`, r.json);
    return `HTTP 400: ${JSON.stringify(r.json.error.details?.fieldErrors ?? r.json.error).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-03',
    urs: ['URS-SUBC-002', 'URS-SUBC-003'],
    title: 'Create a submission and its first sequence',
    action: 'POST /api/submissions {IND, biotech, fda}; POST /api/submissions/:id/sequences {fda, "0000", original}; GET sequences',
    expected: 'HTTP 201 for both; the audit outcome is reported on the submission; the sequence is listed with status draft',
  },
  async ({ api, expect }) => {
    const { submission, sequence } = await createSubmissionWithSequence(api, expect, { title: `OQ-004 IND ${stamp}` });
    state.submission = submission;
    state.sequence = sequence;
    const list = await api('GET', `/api/submissions/${submission.id}/sequences`);
    const seqs = Array.isArray(list.json) ? list.json : list.json?.data ?? [];
    expect(seqs.some((s) => s.id === sequence.id), 'sequence not listed', list.json);
    return `submission ${submission.id} (auditTrail: ${JSON.stringify(submission.auditTrail)}); sequence ${sequence.id} "${sequence.sequenceNumber ?? sequence.sequence_number}" status ${sequence.status}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-04',
    urs: ['URS-SUBC-004'],
    title: 'Place a vault document as an eCTD leaf',
    action: 'PUT /api/submissions/sequences/:seq/leaves {sectionCode:"m1.2", title, documentTable:"vault_documents", documentUuid}; GET leaves',
    expected: 'HTTP 200; the leaf is listed with its section code; an unplaceable documentTable is refused with 400',
    dependsOn: ['OQ-SUBC-03'],
  },
  async ({ api, expect }) => {
    const r = await api('PUT', `/api/submissions/sequences/${state.sequence.id}/leaves`, {
      sectionCode: 'm1.2',
      title: 'Cover letter',
      documentTable: 'vault_documents',
      documentUuid: state.docId,
      lifecycleOp: 'new',
    });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const bad = await api('PUT', `/api/submissions/sequences/${state.sequence.id}/leaves`, { sectionCode: 'm1.3', title: 'x', documentTable: 'not_a_table', documentId: 1 });
    expect(bad.status === 400, `unplaceable table expected 400, got ${bad.status}`, bad.json);
    const leaves = await api('GET', `/api/submissions/sequences/${state.sequence.id}/leaves`);
    const arr = Array.isArray(leaves.json) ? leaves.json : leaves.json?.data ?? leaves.json?.leaves ?? [];
    expect(arr.some((l) => (l.sectionCode ?? l.section_code) === 'm1.2'), 'leaf not listed', leaves.json);
    state.leaf = arr.find((l) => (l.sectionCode ?? l.section_code) === 'm1.2');
    return `leaf placed (${JSON.stringify(r.json).slice(0, 160)}); bad table → 400`;
  },
);

await step(
  {
    id: 'OQ-SUBC-05',
    urs: ['URS-SUBC-005'],
    title: 'Sequence lifecycle follows the state machine',
    action: 'POST transition draft→assembling; then assembling→dispatched (skips validated)',
    expected: 'First transition 200 (status assembling); second refused (INVALID_STATE or GOVERNED_REQUIRED), status unchanged',
    dependsOn: ['OQ-SUBC-03'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/submissions/sequences/${state.sequence.id}/transition`, { status: 'assembling' });
    expect(a.status === 200, `draft→assembling expected 200, got ${a.status}`, a.json);
    const b = await api('POST', `/api/submissions/sequences/${state.sequence.id}/transition`, { status: 'dispatched' });
    expect(b.status >= 400 && b.status < 500, `assembling→dispatched expected 4xx, got ${b.status}`, b.json);
    const seq = await api('GET', `/api/submissions/${state.submission.id}/sequences`);
    const s = (Array.isArray(seq.json) ? seq.json : seq.json?.data ?? []).find((x) => x.id === state.sequence.id);
    expect(s?.status === 'assembling', `status expected assembling, got ${s?.status}`, s);
    return `assembling ok; dispatched refused (${b.json?.error?.code ?? b.status}); status=${s.status}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-06',
    urs: ['URS-SUBC-006'],
    title: 'Freeze and dispatch are governed transitions only',
    action: 'POST transition {status:"frozen"} on the generic endpoint; POST /sequences/:id/freeze without signatureActionId',
    expected: 'Generic transition refused with GOVERNED_REQUIRED; freeze without a signature refused with 400 VALIDATION',
    dependsOn: ['OQ-SUBC-05'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/submissions/sequences/${state.sequence.id}/transition`, { status: 'frozen' });
    expect(a.status >= 400 && /GOVERNED_REQUIRED/.test(JSON.stringify(a.json)), `expected GOVERNED_REQUIRED, got ${a.status}`, a.json);
    const b = await api('POST', `/api/submissions/sequences/${state.sequence.id}/freeze`, {});
    expect(b.status === 400, `freeze w/o signature expected 400, got ${b.status}`, b.json);
    return `generic frozen → ${a.status} GOVERNED_REQUIRED; freeze w/o signatureActionId → 400`;
  },
);

await step(
  {
    id: 'OQ-SUBC-07',
    urs: ['URS-SUBC-007'],
    title: 'Governed e-signature demands re-authentication',
    action: 'POST /api/c2c/actions/sign {target:"ectd-sequence:<id>", reason} with no reauth block',
    expected: 'Refused (4xx) with a re-authentication error; no signature or ledger action created',
    dependsOn: ['OQ-SUBC-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/c2c/actions/sign', { target: `ectd-sequence:${state.sequence.id}`, reason: 'OQ-004 step 07 signature without re-auth' });
    expect(r.status >= 400 && r.status < 500, `expected 4xx, got ${r.status}`, r.json);
    expect(!r.json?.actionId, 'an action id was minted without re-auth', r.json);
    return `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-08',
    urs: ['URS-SUBC-007'],
    title: 'Freeze the sequence under a Part 11 e-signature',
    action: 'POST /api/c2c/actions/sign with reauth {password} then POST /sequences/:id/freeze {signatureActionId}',
    expected: 'Signature persisted in electronic_signatures and the ledger; sequence status frozen',
    dependsOn: ['OQ-SUBC-03'],
  },
  async ({ deviation }) => {
    deviation(
      'Tester holds no password credential for the dev-login identity (dev-login bypasses the password factor by design; the runner never guesses credentials). Re-execute with a real user account and its password.',
    );
  },
);

await step(
  {
    id: 'OQ-SUBC-09',
    urs: ['URS-SUBC-008'],
    title: 'Gateway capabilities are reported honestly',
    action: 'GET /api/submissions/capabilities',
    expected: 'Every gateway reports configured:false in this environment (no ESG/CESP credentials); no gateway is claimed as configured',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/submissions/capabilities');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const gws = r.json?.gateways ?? [];
    expect(gws.length > 0 && gws.every((g) => g.configured === false), 'a gateway claims to be configured', gws);
    return `${gws.length} gateways, all configured:false; environment=${r.json.environment}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-10',
    urs: ['URS-SUBC-009'],
    title: 'Dossier map for the open program',
    action: 'GET /api/dossier-map?projectId=<program id as the shell supplies it>',
    expected: 'HTTP 200 with per-module (M1–M5) completeness for the program',
    dependsOn: ['OQ-SUBC-00'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/dossier-map?projectId=${encodeURIComponent(state.programId)}`);
    expect(r.status === 200, `expected 200, got ${r.status} — the route requires an integer projectId while the shell's program id is a UUID (server/routes/dossier-map.routes.ts:46-53 vs client/src/concept2cure/v2/surfaces/DossierMap.tsx readShellProjectId)`, r.json);
    return `HTTP 200: ${JSON.stringify(r.json?.meta)}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-11',
    urs: ['URS-SUBC-010'],
    title: 'eCTD compile answers for the program',
    action: 'POST /api/ectd-compile/:programId/compile {region:"FDA", submissionType:"initial"}; GET /status',
    expected: 'Compile answers 2xx with a spine/status, or an explained 4xx refusal — never a 500',
    dependsOn: ['OQ-SUBC-00'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/ectd-compile/${state.programId}/compile`, { region: 'FDA', submissionType: 'initial' });
    expect(r.status < 500, `expected <500, got ${r.status}`, r.json);
    const s = await api('GET', `/api/ectd-compile/${state.programId}/status`);
    return `compile → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}; status → ${s.status} ${JSON.stringify(s.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-12',
    urs: ['URS-SUBC-012'],
    title: 'Transmit cannot run without a signature and a configured gateway',
    action: 'POST /api/submissions/sequences/:id/transmit {} ',
    expected: 'HTTP 400 VALIDATION (signatureActionId required); nothing transmitted',
    dependsOn: ['OQ-SUBC-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/submissions/sequences/${state.sequence.id}/transmit`, {});
    expect(r.status === 400, `expected 400, got ${r.status}`, r.json);
    return `HTTP 400 ${r.json?.error?.code}`;
  },
);

await step(
  {
    id: 'OQ-SUBC-13',
    urs: ['URS-SUBC-011'],
    title: 'Submission Center surface renders the submission',
    action: 'Open /concept2cure/submission-center with the program selected',
    expected: 'The submission title is visible',
    dependsOn: ['OQ-SUBC-03'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/submission-center');
    await ctx.expectText(state.submission.title);
    await ctx.screenshot();
    return 'submission visible';
  },
);

await step(
  {
    id: 'OQ-SUBC-14',
    urs: ['URS-SUBC-011'],
    title: 'eCTD compile and publishing surfaces render',
    action: 'Open /concept2cure/ectd-compile and /concept2cure/ectd-publishing',
    expected: 'Both render (screenshots) without a runtime page error',
    dependsOn: ['OQ-SUBC-00'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/ectd-compile');
    await ctx.screenshot('ectd-compile');
    await ctx.goto('/concept2cure/ectd-publishing');
    await ctx.screenshot('ectd-publishing');
    return 'rendered';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
