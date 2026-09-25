/**
 * OQ-004 — Operational Qualification: Submission Center.
 * Protocol: docs/validation/OQ-004-SUBMISSION-CENTER.md. Requirements: docs/validation/URS-004-SUBMISSION-CENTER.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { requireSigner, signerCode } from '../../lib/credentials.mjs';
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
    kind: 'prerequisite',
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
      reason: 'Placed by the validation run for this sequence',
    });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const bad = await api('PUT', `/api/submissions/sequences/${state.sequence.id}/leaves`, { sectionCode: 'm1.3', title: 'x', documentTable: 'not_a_table', documentId: 1, reason: 'Placed by the validation run for this sequence' });
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

/**
 * §11.200: a signer with a second factor enrolled must not be able to sign with
 * the password alone. The refusal must write no signature row.
 */
async function refusePasswordOnlySignature({ asSigner, expect, signBody, signerRows, password }) {
  const bare = await asSigner('POST', '/api/c2c/actions/sign', signBody({ password }));
  expect(
    bare.status === 401 && bare.json?.error === 'REAUTH_TOTP_REQUIRED',
    `a password-only signature by a signer with a second factor enrolled expected 401 REAUTH_TOTP_REQUIRED, got ${bare.status}`,
    bare.json,
  );
  expect((await signerRows()).length === 0, 'a signature row exists for the refused password-only signature');
  return 'password-only signature refused 401 REAUTH_TOTP_REQUIRED with no row written; signed with password + TOTP';
}

await step(
  {
    id: 'OQ-SUBC-08',
    urs: ['URS-SUBC-007'],
    title: 'CREDENTIALED: sign the sequence under a Part 11 e-signature; freeze is then decided by the composed gate, not by the signature alone',
    action: 'sign in as OQ_SIGNER_EMAIL with its password (and its authenticator code where the server requires MFA); when the signer has a second factor enrolled (OQ_SIGNER_TOTP_SECRET), first POST /api/c2c/actions/sign with reauth:{password} only; then POST /api/c2c/actions/sign {target:"ectd-sequence:<id>", reason, payload:{intent:"freeze"}, reauth:{password, totp}}; GET /api/part11/signatures/by-target; POST /sequences/:id/freeze {signatureActionId} as the signer',
    expected:
      'A signer with a second factor enrolled: the password-only signature is refused 401 REAUTH_TOTP_REQUIRED and writes no signature row (§11.200). Sign: HTTP 200 with actionId; exactly one electronic_signatures row on ectd-sequence:<id> by the signer, second_factor_verified true when a code was presented. Freeze on this never-validated sequence (status assembling after OQ-SUBC-04): refused 409 INVALID_STATE by the sequence state machine (a valid e-signature is necessary, not sufficient); the sequence status is unchanged. Without OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD the step is recorded "not executed — credential not supplied".',
    dependsOn: ['OQ-SUBC-03'],
    note: 'The sign action re-authenticates with the account password (verifyReauth) and applies separation of duties (the signer must not be the sequence\'s creator — the run identity). freezeSequence checks the state machine, then the signature, then the deterministic gate; a frozen outcome needs a validated, shadow-reviewed sequence, which this protocol\'s fixture is not. What is qualified here is the signature persistence and that a signature alone does not freeze.',
  },
  async (ctx) => {
    const { api, apiAs, expect, auth, baseUrl, state } = ctx;
    const signer = await requireSigner(ctx, baseUrl, auth.user.email);
    const asSigner = apiAs(signer.session);
    const target = `ectd-sequence:${state.sequence.id}`;
    const signBody = (reauth) => ({
      target,
      reason: 'OQ-004 step 08: e-signature to freeze sequence 0000 for validation',
      payload: { intent: 'freeze' },
      reauth,
    });
    const signerRows = async () => {
      const rows = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(target)}`);
      expect(rows.status === 200, `signature read expected 200, got ${rows.status}`, rows.json);
      return (rows.json?.data ?? []).filter((r) => String(r.signer_id) === String(signer.session.user.id));
    };
    const secondFactor = signer.totpSecret
      ? await refusePasswordOnlySignature({ asSigner, expect, signBody, signerRows, password: signer.password })
      : 'no second factor enrolled';
    const code = await signerCode(signer);
    const sign = await asSigner('POST', '/api/c2c/actions/sign', signBody({ password: signer.password, ...(code ? { totp: code } : {}) }));
    expect(sign.status === 200 && sign.json?.actionId, `sign expected 200 with actionId, got ${sign.status}`, sign.json);
    const mine = await signerRows();
    expect(mine.length === 1, `expected exactly 1 signature row by the signer on ${target}, got ${mine.length}`, mine);
    expect(
      mine[0].second_factor_verified === Boolean(code),
      `the signature row records second_factor_verified=${mine[0].second_factor_verified} although a code was ${code ? '' : 'not '}presented`,
      mine[0],
    );
    const before = await api('GET', `/api/submissions/${state.submission.id}/sequences`);
    const pick = (r) => (Array.isArray(r.json) ? r.json : r.json?.data ?? []).find((x) => x.id === state.sequence.id);
    const statusBefore = pick(before)?.status;
    const freeze = await asSigner('POST', `/api/submissions/sequences/${state.sequence.id}/freeze`, { signatureActionId: sign.json.actionId });
    expect(freeze.status === 409 && freeze.json?.error?.code === 'INVALID_STATE', `freeze on a never-validated sequence expected 409 INVALID_STATE, got ${freeze.status}`, freeze.json);
    const after = pick(await api('GET', `/api/submissions/${state.submission.id}/sequences`));
    expect(after && after.status === statusBefore && after.status !== 'frozen', `sequence status changed (${statusBefore} → ${after?.status}) although the freeze was refused`, after);
    return `${secondFactor}; sign → actionId ${sign.json.actionId} (${sign.json.state}); 1 electronic_signatures row (id ${mine[0].id}, ${mine[0].signature_meaning ?? mine[0].signature_type}, second_factor_verified ${mine[0].second_factor_verified}); freeze → 409 INVALID_STATE (${freeze.json.error.message}); sequence status ${after.status} unchanged`;
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
    kind: 'unscripted',
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
    kind: 'unscripted',
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
    kind: 'ad-hoc',
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
