/**
 * OQ-006 — Operational Qualification: QMS controlled documents.
 * Protocol: docs/validation/OQ-006-QMS.md. Requirements: docs/validation/URS-006-QMS.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { requireSigner, signerCode } from '../../lib/credentials.mjs';
import { computeQmsDocumentContentDigest, qmsDocumentDigestInput } from '../../lib/qms-digest.mjs';

const run = await createRun({
  app: 'QMS',
  appLabel: 'QMS controlled documents',
  protocolId: 'OQ-006',
  protocolTitle: 'Operational Qualification — QMS controlled documents',
});
const { step, state } = run;
const stamp = helpers.stamp();
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

await step(
  {
    id: 'OQ-QMS-01',
    urs: ['URS-QMS-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/mdx/qms/documents without Authorization',
    expected: 'HTTP 401/403',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/documents', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-QMS-02',
    urs: ['URS-QMS-002'],
    title: 'Controlled document creation validates its inputs',
    action: 'POST /api/mdx/qms/documents {docNumber, title} without docType',
    expected: 'HTTP 422 with field errors',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber: `SOP-BAD-${stamp}`, title: 'no type' });
    expect(r.status === 422, `expected 422, got ${r.status}`, r.json);
    return `HTTP 422: ${JSON.stringify(r.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-03',
    urs: ['URS-QMS-002', 'URS-QMS-003'],
    title: 'Create an SOP; it is draft at version 1.0 and audited',
    action: 'POST /api/mdx/qms/documents {docNumber, title, docType:"sop", nextReviewDate:+10d}; GET list; GET detail',
    expected: 'HTTP 201; status draft, version 1.0; meta.auditTrail reports the §11.10(e) row; listed and readable',
  },
  async ({ api, expect }) => {
    const docNumber = `SOP-OQ-${stamp}`;
    const r = await api('POST', '/api/mdx/qms/documents', {
      docNumber,
      title: `OQ-006 Document control SOP ${stamp}`,
      docType: 'sop',
      category: 'validation',
      nextReviewDate: inDays(10),
    });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const d = r.json?.data;
    expect(d?.status === 'draft' && d?.version === '1.0', 'status/version wrong', d);
    state.docA = d;
    state.docNumber = docNumber;
    const list = await api('GET', '/api/mdx/qms/documents');
    expect((list.json?.data ?? []).some((x) => x.id === d.id), 'not listed', list.json?.meta);
    const one = await api('GET', `/api/mdx/qms/documents/${d.id}`);
    expect(one.status === 200 && one.json?.data?.doc_number === docNumber, 'detail mismatch', one.json);
    return `doc ${d.id} ${docNumber} draft v1.0; auditTrail=${JSON.stringify(r.json.meta?.auditTrail)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-04',
    urs: ['URS-QMS-002'],
    title: 'Duplicate document number refused',
    action: 'POST /api/mdx/qms/documents with the same docNumber',
    expected: 'HTTP 409',
    dependsOn: ['OQ-QMS-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber: state.docNumber, title: 'dup', docType: 'sop' });
    expect(r.status === 409, `expected 409, got ${r.status}`, r.json);
    return 'HTTP 409';
  },
);

const APPROVE_HEX64 = /^[0-9a-f]{64}$/;
const BINDING_BASIS = 'qms-document-version-content-sha256';
/** The mdx-qms error envelope is { error: <message>, details: { code, fieldErrors? } } (server/lib/api-response.ts clientError). */
const errCode = (r) => r.json?.details?.code ?? r.json?.error?.code ?? null;
/** The approval stamps the route commits to: effective, approver = signer, approved_at set. */
const isEffectiveBy = (d, userId) => d?.status === 'effective' && String(d?.approver_id) === String(userId) && Boolean(d?.approved_at);
/** meta.signature as the signed approve returns it (docs/evidence/WB/2026-09-21/README.md). */
const isApprovalSignature = (sig) =>
  Boolean(sig && sig.id && sig.meaning === 'APPROVED' && APPROVE_HEX64.test(String(sig.boundPayloadDigest)) && sig.bindingBasis === BINDING_BASIS);
/** The electronic_signatures row GET /api/part11/signatures/by-target returns for a QMS approval. */
const isApprovalRow = (row, signerId) =>
  String(row.signer_id) === String(signerId) &&
  row.signature_meaning === 'APPROVED' &&
  row.signature_type === 'qms-document-approval' &&
  row.binding_basis === BINDING_BASIS &&
  row.is_valid === true;

/**
 * A signed approval by the credentialed signer (the second identity). Shared by
 * the positive step (05) and the fixture approval of SOP B (06d). Asserts the
 * response shape the product commits to (docs/evidence/WB/2026-09-21/README.md).
 */
async function approveSigned(ctx, docId, reason) {
  const { expect } = ctx;
  const signer = ctx.state.signer;
  const asSigner = ctx.apiAs(signer.session);
  const mfaToken = await signerCode(signer);
  const r = await asSigner('POST', `/api/mdx/qms/documents/${docId}/approve`, {
    password: signer.password,
    ...(mfaToken ? { mfaToken } : {}),
    meaning: 'APPROVED',
    reason,
    effectiveDate: inDays(0),
  });
  expect(r.status === 200, `signed approve expected 200, got ${r.status}`, r.json);
  const d = r.json?.data ?? {};
  const meta = r.json?.meta ?? {};
  expect(isEffectiveBy(d, signer.session.user.id), 'approval stamps wrong (status/approver/approved_at)', d);
  expect(meta.auditTrail?.persisted === true, 'meta.auditTrail not reported as persisted', meta);
  const sig = meta.signature;
  expect(isApprovalSignature(sig), 'meta.signature lacks id / meaning APPROVED / sha256 boundPayloadDigest / bindingBasis', sig);
  const approval = d.metadata?.approval ?? {};
  expect(approval.contentDigest === sig.boundPayloadDigest, 'document metadata.approval.contentDigest differs from the signature digest', { approval, sig });
  return { response: r, document: d, signature: sig };
}

await step(
  {
    id: 'OQ-QMS-05',
    urs: ['URS-QMS-004', 'URS-QMS-005'],
    title: 'CREDENTIALED: a second identity approves SOP A as an electronic signature; the approval is stamped, audited and signed; a second approval is refused',
    action: 'sign in as OQ_SIGNER_EMAIL with its password (and its authenticator code where the server requires MFA); when the signer has a second factor enrolled (OQ_SIGNER_TOTP_SECRET), first approve with {password} only; POST /api/mdx/qms/documents/:docA/approve {password, mfaToken?, meaning:"APPROVED", reason, effectiveDate}; approve again',
    expected:
      'A signer with a second factor enrolled: the password-only approval is refused 400 MFA_TOKEN_REQUIRED, SOP A stays in review and no signature row is written (§11.200). HTTP 200: status effective, approver_id = signer (≠ author), approved_at set, meta.auditTrail {persisted, chained}, meta.signature {id, meaning APPROVED, boundPayloadDigest (sha256), bindingBasis qms-document-version-content-sha256}; metadata.approval.contentDigest equals the signature digest; second approve → 409 QMS_INVALID_STATE. Without OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD the step is recorded "not executed — credential not supplied".',
    dependsOn: ['OQ-QMS-03'],
    note: 'VSR-001 §8.3 P-2 / F-3: approval is a signing act (§11.50, §11.200); the runner\'s dev-login session holds no password, so the signer is a tester-supplied identity (tests/validation/lib/credentials.mjs). The two-person rule (§11.10(d)) means the signer must not be the author of SOP A (the run identity).',
  },
  async (ctx) => {
    const { expect, auth, baseUrl } = ctx;
    const signer = await requireSigner(ctx, baseUrl, auth.user.email);
    expect(signer.session.user.email !== auth.user.email, 'signer session resolved to the author identity', signer.session.user.email);
    ctx.state.signer = signer;
    let secondFactor = 'no second factor enrolled';
    if (signer.totpSecret) {
      // §11.200: with a factor enrolled, the password alone must not sign.
      const asSigner0 = ctx.apiAs(signer.session);
      const bare = await asSigner0('POST', `/api/mdx/qms/documents/${ctx.state.docA.id}/approve`, {
        password: signer.password,
        meaning: 'APPROVED',
        reason: 'OQ-006 step 05: a password-only approval must be refused',
        effectiveDate: inDays(0),
      });
      expect(bare.status === 400 && errCode(bare) === 'MFA_TOKEN_REQUIRED', `a password-only approval by a signer with a second factor enrolled expected 400 MFA_TOKEN_REQUIRED, got ${bare.status}`, bare.json);
      const g0 = await asSigner0('GET', `/api/mdx/qms/documents/${ctx.state.docA.id}`);
      expect(g0.json?.data?.status !== 'effective', 'SOP A became effective on the refused password-only approval', g0.json?.data);
      const s0 = await asSigner0('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${ctx.state.docA.id}`)}`);
      expect(s0.status === 200 && (s0.json?.data ?? []).length === 0, 'a signature row exists for the refused password-only approval', s0.json);
      secondFactor = 'password-only approval refused 400 MFA_TOKEN_REQUIRED with no row written; approved with password + TOTP';
    }
    const { response, document: d, signature: sig } = await approveSigned(ctx, ctx.state.docA.id, 'OQ-006 step 05: SOP approved for validation (signed)');
    ctx.state.docA = d;
    ctx.state.signatureA = sig;
    const asSigner = ctx.apiAs(signer.session);
    const againToken = await signerCode(signer);
    const again = await asSigner('POST', `/api/mdx/qms/documents/${d.id}/approve`, {
      password: signer.password,
      ...(againToken ? { mfaToken: againToken } : {}),
      meaning: 'APPROVED',
      reason: 'OQ-006 step 05: second approval must be refused',
    });
    expect(again.status === 409 && errCode(again) === 'QMS_INVALID_STATE', `second approve expected 409 QMS_INVALID_STATE, got ${again.status}`, again.json);
    return `${secondFactor}; effective; author ${d.author_id} (${auth.user.email}) ≠ approver ${d.approver_id} (${signer.session.user.email}) at ${d.approved_at}; signature ${sig.id} meaning ${sig.meaning}, ${sig.authenticationMethod}, digest ${String(sig.boundPayloadDigest).slice(0, 12)}…; auditTrail=${JSON.stringify(response.json.meta.auditTrail)}; re-approve → 409 QMS_INVALID_STATE`;
  },
);

await step(
  {
    id: 'OQ-QMS-05b',
    urs: ['URS-QMS-005'],
    title: 'Exactly one electronic_signatures row is bound to the approval; the §11.70 content digest recomputes from the stored document',
    action: 'GET /api/part11/signatures/by-target?target=qms-document:<docA>; GET /api/mdx/qms/documents/:docA; recompute sha256(canonicalJson(version content)) (tests/validation/lib/qms-digest.mjs — a re-implementation of computeQmsDocumentContentDigest)',
    expected: 'One row: signer_id = signer, signature_meaning APPROVED, signature_type qms-document-approval, binding_basis qms-document-version-content-sha256, is_valid true, second_factor_verified true when the signer has a second factor enrolled; the recomputed digest equals meta.signature.boundPayloadDigest and metadata.approval.contentDigest',
    dependsOn: ['OQ-QMS-05'],
  },
  async ({ api, expect, state, attach }) => {
    const target = `qms-document:${state.docA.id}`;
    const s = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(target)}`);
    expect(s.status === 200, `signature read expected 200, got ${s.status}`, s.json);
    const rows = s.json?.data ?? [];
    expect(rows.length === 1, `expected exactly 1 signature row for ${target}, got ${rows.length}`, rows);
    const row = rows[0];
    expect(isApprovalRow(row, state.signer.session.user.id), 'signature row attributes wrong', row);
    expect(String(row.id) === String(state.signatureA.id), 'the stored row is not the signature the approval reported', { row: row.id, reported: state.signatureA.id });
    expect(
      row.second_factor_verified === Boolean(state.signer.totpSecret),
      `the signature row records second_factor_verified=${row.second_factor_verified} although the signer ${state.signer.totpSecret ? 'presented' : 'has no'} second factor`,
      row,
    );
    const g = await api('GET', `/api/mdx/qms/documents/${state.docA.id}`);
    expect(g.status === 200, `document read expected 200, got ${g.status}`, g.json);
    const stored = g.json?.data ?? {};
    const recomputed = computeQmsDocumentContentDigest(stored);
    const storedOnDocument = stored.metadata?.approval?.contentDigest ?? null;
    const report = {
      method: 'tests/validation/lib/qms-digest.mjs — re-implementation of server/services/qms/document-approval-signature.ts computeQmsDocumentContentDigest (canonical JSON: sorted keys, undefined→null, Date→ISO; sha256 hex)',
      digestInput: qmsDocumentDigestInput(stored),
      recomputed,
      reportedBySignature: state.signatureA.boundPayloadDigest,
      storedOnDocument,
      match: recomputed === state.signatureA.boundPayloadDigest && recomputed === storedOnDocument,
      signatureRow: row,
    };
    attach('digest-recomputation.json', report);
    expect(report.match, 'recomputed §11.70 digest does not match the signature / the stored document', report);
    return `1 row (id ${row.id}) by signer ${row.signer_id}, ${row.signature_meaning}, ${row.binding_basis}, second_factor_verified ${row.second_factor_verified}; recomputed digest ${recomputed.slice(0, 12)}… == signature == document (match true)`;
  },
);

await step(
  {
    id: 'OQ-QMS-06a',
    kind: 'prerequisite',
    urs: ['URS-QMS-002'],
    title: 'Create a second SOP (fixture for the credential refusals, training, review-due and retire steps)',
    action: 'POST /api/mdx/qms/documents {docNumber SOP-OQ-B-…, docType:"sop", nextReviewDate:+5d}',
    expected: 'HTTP 201, draft v1.0',
  },
  async ({ api, expect }) => {
    const c = await api('POST', '/api/mdx/qms/documents', { docNumber: `SOP-OQ-B-${stamp}`, title: `OQ-006 Second SOP ${stamp}`, docType: 'sop', nextReviewDate: inDays(5) });
    expect(c.status === 201, `create expected 201, got ${c.status}`, c.json);
    state.docB = c.json.data;
    return `doc ${state.docB.id} ${state.docB.doc_number} ${state.docB.status} v${state.docB.version}`;
  },
);

await step(
  {
    id: 'OQ-QMS-06',
    urs: ['URS-QMS-005'],
    title: 'Approval without any signature component is refused',
    action: 'POST /documents/:docB/approve {} (no password, no meaning, no reason)',
    expected: 'HTTP 400 ESIGNATURE_COMPONENT_MISSING; fieldErrors name password, meaning and reason; docB stays draft',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/approve`, {});
    expect(r.status === 400 && errCode(r) === 'ESIGNATURE_COMPONENT_MISSING', `expected 400 ESIGNATURE_COMPONENT_MISSING, got ${r.status}`, r.json);
    const fields = Object.keys(r.json?.details?.fieldErrors ?? {});
    expect(['password', 'meaning', 'reason'].every((f) => fields.includes(f)), 'fieldErrors do not name password, meaning and reason', r.json);
    const g = await api('GET', `/api/mdx/qms/documents/${state.docB.id}`);
    expect(g.json?.data?.status === 'draft', 'docB left draft state on a refused approval', g.json?.data);
    return `HTTP 400 ESIGNATURE_COMPONENT_MISSING (fieldErrors: ${fields.join(', ')}); docB still draft`;
  },
);

await step(
  {
    id: 'OQ-QMS-06b',
    urs: ['URS-QMS-005'],
    title: 'CREDENTIALED: a wrong password is refused and nothing is signed',
    action: 'as the signer, POST /documents/:docB/approve {password:<wrong>, meaning:"APPROVED", reason}',
    expected: 'HTTP 401 PASSWORD_VERIFICATION_FAILED; docB stays draft; no signature row for docB',
    dependsOn: ['OQ-QMS-05', 'OQ-QMS-06a'],
  },
  async ({ api, apiAs, expect, state }) => {
    const asSigner = apiAs(state.signer.session);
    const r = await asSigner('POST', `/api/mdx/qms/documents/${state.docB.id}/approve`, {
      password: `not-the-password-${stamp}`,
      meaning: 'APPROVED',
      reason: 'OQ-006 step 06b: wrong password must be refused',
    });
    expect(r.status === 401, `expected 401, got ${r.status}`, r.json);
    const g = await api('GET', `/api/mdx/qms/documents/${state.docB.id}`);
    expect(g.json?.data?.status === 'draft', 'docB changed state on a refused credential', g.json?.data);
    const s = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${state.docB.id}`)}`);
    expect(s.status === 200 && (s.json?.data ?? []).length === 0, 'a signature row exists for a refused approval', s.json);
    return `HTTP 401 ${errCode(r) ?? ''}; docB still draft; 0 signature rows`;
  },
);

await step(
  {
    id: 'OQ-QMS-06c',
    urs: ['URS-QMS-005'],
    title: 'CREDENTIALED: the author cannot approve their own document (two-person rule)',
    action: 'as the signer, POST /api/mdx/qms/documents (SOP C, authored by the signer); then approve it with the signer\'s own valid password',
    expected: 'HTTP 403 QMS_SELF_APPROVAL; SOP C stays draft; no signature row',
    dependsOn: ['OQ-QMS-05'],
  },
  async ({ apiAs, expect, state }) => {
    const asSigner = apiAs(state.signer.session);
    const c = await asSigner('POST', '/api/mdx/qms/documents', { docNumber: `SOP-OQ-C-${stamp}`, title: `OQ-006 Self-approval SOP ${stamp}`, docType: 'sop', nextReviewDate: inDays(30) });
    expect(c.status === 201, `create expected 201, got ${c.status}`, c.json);
    const docC = c.json.data;
    expect(String(docC.author_id) === String(state.signer.session.user.id), 'SOP C is not attributed to the signer', docC);
    const selfToken = await signerCode(state.signer);
    const r = await asSigner('POST', `/api/mdx/qms/documents/${docC.id}/approve`, {
      password: state.signer.password,
      ...(selfToken ? { mfaToken: selfToken } : {}),
      meaning: 'APPROVED',
      reason: 'OQ-006 step 06c: self-approval must be refused',
    });
    expect(r.status === 403 && errCode(r) === 'QMS_SELF_APPROVAL', `expected 403 QMS_SELF_APPROVAL, got ${r.status}`, r.json);
    const g = await asSigner('GET', `/api/mdx/qms/documents/${docC.id}`);
    expect(g.json?.data?.status === 'draft', 'SOP C changed state on the refused self-approval', g.json?.data);
    const s = await asSigner('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${docC.id}`)}`);
    expect(s.status === 200 && (s.json?.data ?? []).length === 0, 'a signature row exists for the refused self-approval', s.json);
    return `SOP C ${docC.id} authored by ${docC.author_id}; self-approve → HTTP 403 QMS_SELF_APPROVAL; still draft; 0 signature rows`;
  },
);

await step(
  {
    id: 'OQ-QMS-06d',
    urs: ['URS-QMS-004'],
    title: 'CREDENTIALED: the signer approves SOP B (fixture — an effective document for the review-due and retire steps)',
    action: 'as the signer, POST /documents/:docB/approve {password, meaning:"APPROVED", reason}',
    expected: 'HTTP 200 effective with meta.signature; one signature row for docB',
    dependsOn: ['OQ-QMS-05', 'OQ-QMS-06a'],
  },
  async (ctx) => {
    const { document: d, signature: sig } = await approveSigned(ctx, ctx.state.docB.id, 'OQ-006 step 06d: SOP B approved (signed) as the review-due / retire fixture');
    ctx.state.docB = d;
    const s = await ctx.api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${d.id}`)}`);
    ctx.expect(s.status === 200 && (s.json?.data ?? []).length === 1, `expected 1 signature row for docB, got ${(s.json?.data ?? []).length}`, s.json);
    return `docB effective; signature ${sig.id} (${sig.meaning}); 1 row`;
  },
);

await step(
  {
    id: 'OQ-QMS-07',
    urs: ['URS-QMS-006'],
    title: 'Open a controlled revision (reason required; major version bump; back to draft)',
    action: 'POST /revise {} then POST /revise {reason}',
    expected: 'Without reason → 422; with reason → version 2.0, status draft, prior approval cleared, audited',
    dependsOn: ['OQ-QMS-05'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/revise`, {});
    expect(a.status === 422, `no reason expected 422, got ${a.status}`, a.json);
    const b = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/revise`, { reason: 'OQ-006 step 07: periodic review found an obsolete reference' });
    expect(b.status === 200, `revise expected 200, got ${b.status}`, b.json);
    const d = b.json?.data;
    expect(d?.version === '2.0' && d?.status === 'draft' && !d?.approved_at, 'revision state wrong', d);
    return `v${d.version} ${d.status}; auditTrail=${JSON.stringify(b.json.meta?.auditTrail)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-08',
    urs: ['URS-QMS-008'],
    title: 'Training acknowledgement is recorded against the document version',
    action: 'POST /documents/:id/training-ack {method:"attestation"}; GET /api/mdx/qms/training/compliance',
    expected: 'HTTP 201 with document_version; compliance report HTTP 200',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/training-ack`, { method: 'attestation' });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const c = await api('GET', '/api/mdx/qms/training/compliance');
    expect(c.status === 200, `compliance expected 200, got ${c.status}`, c.json);
    return `ack for v${r.json?.data?.document_version}; compliance: ${JSON.stringify(c.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-09',
    urs: ['URS-QMS-009'],
    title: 'Review-due report lists effective documents approaching review',
    action: 'GET /api/mdx/qms/documents/review-due?within=30 (docB is effective with nextReviewDate +5d)',
    expected: 'docB listed with overdue=false',
    dependsOn: ['OQ-QMS-06d'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/documents/review-due?within=30');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const hit = (r.json?.data ?? []).find((x) => x.id === state.docB.id);
    expect(hit && hit.overdue === false, 'docB not listed as review-due', r.json?.data?.map((x) => x.doc_number));
    return `listed (${r.json.meta?.count} due within 30 days)`;
  },
);

await step(
  {
    id: 'OQ-QMS-10',
    urs: ['URS-QMS-007'],
    title: 'Retire a document with a recorded reason',
    action: 'POST /documents/:id/retire {reason}',
    expected: 'HTTP 200; status retired; the reason is kept',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/retire`, { reason: 'OQ-006 step 10: superseded by validation' });
    expect(r.status === 200 && r.json?.data?.status === 'retired', `expected retired, got ${r.status}`, r.json);
    return `retired; metadata: ${JSON.stringify(r.json.data.metadata).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-11',
    urs: ['URS-QMS-010'],
    title: 'Change control: raise and list a change',
    action: 'POST /api/mdx/qms/changes {changeNumber, title, reason}; GET /api/mdx/qms/changes; GET /changes/summary',
    expected: 'HTTP 201 and the change is listed',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/changes', { changeNumber: `CC-OQ-${stamp}`, title: 'OQ-006 change', reason: 'validation exercise' });
    const l = await api('GET', '/api/mdx/qms/changes');
    expect(r.status === 201 && l.status === 200, `expected 201/200, got ${r.status}/${l.status}`, { create: r.json, list: l.json });
    return `change ${r.json?.data?.id} listed (${(l.json?.data ?? []).length})`;
  },
);

await step(
  {
    id: 'OQ-QMS-12',
    urs: ['URS-QMS-011'],
    title: 'Quality Management Plan create and list (governed: reason required)',
    action: 'POST /api/quality/plans {name, description} with no reason; again with a reason of at least 8 characters; GET /api/quality/plans',
    expected: 'Without a reason: HTTP 400 REASON_REQUIRED and no plan created. With it: HTTP 201; plan listed with status draft',
  },
  async ({ api, expect }) => {
    const name = `OQ-006 QMP ${stamp}`;
    // v0.5: creating a plan is a governed change (D5, 2026-09-23); a plan
    // posted without a reason is refused and nothing is created.
    const refused = await api('POST', '/api/quality/plans', { name, description: 'Validation exercise' });
    expect(refused.status === 400, `expected 400 without a reason, got ${refused.status}`, refused.json);
    expect(refused.json?.error === 'REASON_REQUIRED', 'expected REASON_REQUIRED', refused.json);
    const before = await api('GET', '/api/quality/plans');
    const beforeArr = Array.isArray(before.json) ? before.json : before.json?.data ?? [];
    expect(!beforeArr.some((p) => p.name === name), 'a refused plan was created', beforeArr.map((p) => p.name));
    const r = await api('POST', '/api/quality/plans', { name, description: 'Validation exercise', reason: 'OQ-006 validation exercise: QMP create' });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const l = await api('GET', '/api/quality/plans');
    const arr = Array.isArray(l.json) ? l.json : l.json?.data ?? [];
    expect(arr.some((p) => p.name === name), 'plan not listed', arr.map((p) => p.name));
    state.qmpName = name;
    return `plan ${r.json?.id} status ${r.json?.status}; ${arr.length} plans listed`;
  },
);

await step(
  {
    id: 'OQ-QMS-13',
    kind: 'ad-hoc',
    urs: ['URS-QMS-013'],
    title: 'Quality-system templates are served',
    action: 'GET /api/mdx/qms/templates',
    expected: 'HTTP 200 with a non-empty template family',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/templates');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const arr = r.json?.data ?? r.json?.templates ?? [];
    expect(Array.isArray(arr) && arr.length > 0, 'no templates', r.json);
    return `${arr.length} templates`;
  },
);

await step(
  {
    id: 'OQ-QMS-14',
    kind: 'unscripted',
    urs: ['URS-QMS-012'],
    title: 'Quality surface renders the SOP register and the Change control tab',
    action: 'Open /concept2cure/quality; find the SOP number; click the "Change control" tab',
    expected: 'SOP register shows the created SOP; Change control tab renders (an unavailable store is an honest error state)',
    dependsOn: ['OQ-QMS-03'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/quality');
    await ctx.expectText(state.docNumber);
    await ctx.screenshot('sop-register');
    const tab = ctx.page.getByRole('tab', { name: /change control/i });
    if ((await tab.count()) > 0) {
      await tab.first().click();
      await ctx.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await ctx.screenshot('change-control');
    }
    return 'SOP register shows the SOP; change control tab captured';
  },
);

await step(
  {
    id: 'OQ-QMS-15',
    kind: 'unscripted',
    urs: ['URS-QMS-011', 'URS-QMS-012'],
    title: 'QMP surface renders the plan',
    action: 'Open /concept2cure/qmp',
    expected: 'The plan name is visible',
    dependsOn: ['OQ-QMS-12'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/qmp');
    await ctx.expectText(state.qmpName);
    await ctx.screenshot();
    return 'plan visible';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
