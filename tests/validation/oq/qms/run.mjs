/**
 * OQ-006 — Operational Qualification: QMS controlled documents.
 * Protocol: docs/validation/OQ-006-QMS.md. Requirements: docs/validation/URS-006-QMS.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { qualifyPersonalAcknowledgement } from './personal-acknowledgement.mjs';
import { requireSigner, signerCode } from '../../lib/credentials.mjs';
import { computeQmsDocumentContentDigest, qmsDocumentDigestInput } from '../../lib/qms-digest.mjs';
import {
  inDays, errCode, dataOf, isApprovalRow, isQmsSignatureRow, isRetirementStamp, signatureRowsFor,
  postSigned, approveSigned, retireSigned, retirementDigestReport,
} from './signed-acts.mjs';
import { asSigned, createAuthoredSop, expectRouteCompleteOn, qmsProgramId, qualifyRoutedSend, sendOnRoute, signerRoute } from './controlled-sop.mjs';

const run = await createRun({
  app: 'QMS',
  appLabel: 'QMS controlled documents',
  protocolId: 'OQ-006',
  protocolTitle: 'Operational Qualification — QMS controlled documents',
});
const { step, state } = run;
const stamp = helpers.stamp();

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
    action: 'POST /api/mdx/qms/documents {docNumber, title, programId, reason} without docType',
    expected: 'HTTP 400 QMS_CREATE_INVALID (v0.8: the controlled create, 2026-10-14); nothing created',
  },
  async ({ api, expect }) => {
    const docNumber = `SOP-BAD-${stamp}`;
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber, title: 'no type', programId: qmsProgramId(), reason: 'OQ-006 step 02: missing type must be refused' });
    expect(r.status === 400 && errCode(r) === 'QMS_CREATE_INVALID', `expected 400 QMS_CREATE_INVALID, got ${r.status}`, r.json);
    const list = await api('GET', '/api/mdx/qms/documents');
    expect(!(list.json?.data ?? []).some((x) => x.doc_number === docNumber), 'a refused create was registered', list.json?.meta);
    return `HTTP 400 QMS_CREATE_INVALID: ${JSON.stringify(r.json).slice(0, 160)}; not registered`;
  },
);

await step(
  {
    id: 'OQ-QMS-03',
    urs: ['URS-QMS-002', 'URS-QMS-003'],
    title: 'Create an SOP; it is draft at version 1.0, audited, and its procedure text is written',
    action: 'POST /api/mdx/qms/documents {docNumber, title, docType:"sop", programId, templateKey:"sop", reason, nextReviewDate:+10d}; write the first authored section (PATCH /api/authoring/sections/:id {content, changeReason}); GET list; GET detail',
    expected: 'HTTP 201; status draft, version 1.0, bound to an authored copy; meta.auditTrail reports the §11.10(e) row; the section saves; listed and readable',
  },
  async ({ api, expect }) => {
    const docNumber = `SOP-OQ-${stamp}`;
    const { doc: d, response: r } = await createAuthoredSop(api, expect, {
      docNumber, title: `OQ-006 Document control SOP ${stamp}`, nextReviewDate: inDays(10), reason: 'OQ-006 step 03: create the document control SOP',
    });
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
    action: 'POST /api/mdx/qms/documents with the same docNumber (and its project and reason)',
    expected: 'HTTP 409',
    dependsOn: ['OQ-QMS-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber: state.docNumber, title: 'dup', docType: 'sop', programId: qmsProgramId(), reason: 'OQ-006 step 04: a duplicate number must be refused' });
    expect(r.status === 409, `expected 409, got ${r.status}`, r.json);
    return 'HTTP 409';
  },
);

await step(
  {
    id: 'OQ-QMS-04b',
    urs: ['URS-QMS-004'],
    title: 'CREDENTIALED: SOP A is sent for review on a review route naming its QMS approver; a send without a route is refused',
    action: 'resolve the signer (OQ_SIGNER_EMAIL); PATCH /api/mdx/qms/documents/:docA {status:"in_review", reason} with no route; then with route {reviewers:[], approvers:[signer], approvalDueDate:+5d}; GET /api/mdx/qms/documents/:docA/review-route',
    expected: 'Without a route: HTTP 409 REVIEW_ROUTE_REQUIRED and SOP A stays draft. With it: HTTP 200, status in_review; the route is open, round 1, sent by the run identity, with one member: the signer, role approver, step open, outcome pending',
    dependsOn: ['OQ-QMS-03'],
    note: 'v0.8 (RR4, docs/design/REVIEW_ROUTING_2026-10-23.md §2.7, NEW-4, D-Q): a QMS document is sent for review on a route that names one QMS approver (a designated one; while the organization has designated none, a member with the Approver role) and any reviewers. The signer is an Approver of the run organization, which designates none.',
  },
  async (ctx) => {
    ctx.state.signer = ctx.state.signer ?? await requireSigner(ctx, ctx.baseUrl, ctx.auth.user.email);
    return qualifyRoutedSend(ctx, state.docA.id, ctx.state.signer.session.user.id);
  },
);

await step(
  {
    id: 'OQ-QMS-05',
    urs: ['URS-QMS-004', 'URS-QMS-005'],
    title: 'CREDENTIALED: a second identity approves SOP A as an electronic signature; the approval is stamped, audited and signed; a second approval is refused',
    action: 'sign in as OQ_SIGNER_EMAIL with its password (and its authenticator code where the server requires MFA); when the signer has a second factor enrolled (OQ_SIGNER_TOTP_SECRET), first approve with {password} only; POST /api/mdx/qms/documents/:docA/approve {password, mfaToken?, meaning:"APPROVED", reason, effectiveDate}; approve again',
    expected:
      'A signer with a second factor enrolled: the password-only approval is refused 400 MFA_TOKEN_REQUIRED, SOP A stays in review and no signature row is written (§11.200). HTTP 200: status effective, approver_id = signer (≠ author), approved_at set, meta.auditTrail {persisted, chained}, meta.signature {id, meaning APPROVED, boundPayloadDigest (sha256), bindingBasis qms-document-version-content-sha256}; metadata.approval.contentDigest equals the signature digest; second approve → 409 QMS_INVALID_STATE. Without OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD the step is recorded "not executed — credential not supplied".',
    dependsOn: ['OQ-QMS-04b'],
    note: 'VSR-001 §8.3 P-2 / F-3: approval is a signing act (§11.50, §11.200); the runner\'s dev-login session holds no password, so the signer is a tester-supplied identity (tests/validation/lib/credentials.mjs). The two-person rule (§11.10(d)) means the signer must not be the author of SOP A (the run identity).',
  },
  async (ctx) => {
    const { expect, auth, baseUrl } = ctx;
    const signer = ctx.state.signer ?? await requireSigner(ctx, baseUrl, auth.user.email);
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
    expected: 'One row: signer_id = signer, signature_meaning APPROVED, signature_type qms-document-approval, binding_basis qms-document-version-content-sha256, is_valid true, second_factor_verified true when the signer has a second factor enrolled; the recomputed digest equals meta.signature.boundPayloadDigest and metadata.approval.contentDigest; (v0.8) the review route is complete, its approver signed with this row',
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
    // v0.8: an authored document's prose is restored from its signed version record (controlled-sop.mjs asSigned).
    const stored = await asSigned(api, expect, g.json?.data ?? {});
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
    const routeId = await expectRouteCompleteOn(api, expect, state.docA.id, row.id); // v0.8 (RR4)
    return `1 row (id ${row.id}) by signer ${row.signer_id}, ${row.signature_meaning}, ${row.binding_basis}, second_factor_verified ${row.second_factor_verified}; recomputed digest ${recomputed.slice(0, 12)}… == signature == document (match true); route ${routeId} complete on esig ${row.id}`;
  },
);

await step(
  {
    id: 'OQ-QMS-06a',
    kind: 'prerequisite',
    urs: ['URS-QMS-002'],
    title: 'Create a second SOP and send it for review on its route (fixture for the credential refusals, training, review-due and retire steps)',
    action: 'POST /api/mdx/qms/documents {docNumber SOP-OQ-B-…, docType:"sop", programId, reason, nextReviewDate:+5d}; write its procedure text; PATCH status in_review with a route naming the signer as QMS approver',
    expected: 'HTTP 201, draft v1.0; then in review on an open route',
    dependsOn: ['OQ-QMS-04b'],
  },
  async ({ api, expect }) => {
    const { doc } = await createAuthoredSop(api, expect, {
      docNumber: `SOP-OQ-B-${stamp}`, title: `OQ-006 Second SOP ${stamp}`, nextReviewDate: inDays(5), reason: 'OQ-006 step 06a: create the qualification fixture SOP',
    });
    const sent = await sendOnRoute(api, expect, doc.id, state.signer.session.user.id, 'OQ-006 step 06a: SOP B ready for QA approval');
    state.docB = sent.json.data;
    return `doc ${state.docB.id} ${state.docB.doc_number} ${state.docB.status} v${state.docB.version}`;
  },
);

await step(
  {
    id: 'OQ-QMS-06',
    urs: ['URS-QMS-005'],
    title: 'Approval without any signature component is refused',
    action: 'POST /documents/:docB/approve {} (no password, no meaning, no reason)',
    expected: 'HTTP 400 ESIGNATURE_COMPONENT_MISSING; fieldErrors name password, meaning and reason; docB stays in review',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/approve`, {});
    expect(r.status === 400 && errCode(r) === 'ESIGNATURE_COMPONENT_MISSING', `expected 400 ESIGNATURE_COMPONENT_MISSING, got ${r.status}`, r.json);
    const fields = Object.keys(r.json?.details?.fieldErrors ?? {});
    expect(['password', 'meaning', 'reason'].every((f) => fields.includes(f)), 'fieldErrors do not name password, meaning and reason', r.json);
    const g = await api('GET', `/api/mdx/qms/documents/${state.docB.id}`);
    expect(g.json?.data?.status === 'in_review', 'docB left review on a refused approval', g.json?.data);
    return `HTTP 400 ESIGNATURE_COMPONENT_MISSING (fieldErrors: ${fields.join(', ')}); docB still in review`;
  },
);

await step(
  {
    id: 'OQ-QMS-06b',
    urs: ['URS-QMS-005'],
    title: 'CREDENTIALED: a wrong password is refused and nothing is signed',
    action: 'as the signer, POST /documents/:docB/approve {password:<wrong>, meaning:"APPROVED", reason}',
    expected: 'HTTP 401 PASSWORD_VERIFICATION_FAILED; docB stays in review; no signature row for docB',
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
    expect(g.json?.data?.status === 'in_review', 'docB changed state on a refused credential', g.json?.data);
    const s = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${state.docB.id}`)}`);
    expect(s.status === 200 && (s.json?.data ?? []).length === 0, 'a signature row exists for a refused approval', s.json);
    return `HTTP 401 ${errCode(r) ?? ''}; docB still in review; 0 signature rows`;
  },
);

await step(
  {
    id: 'OQ-QMS-06c',
    urs: ['URS-QMS-005'],
    title: 'CREDENTIALED: the author cannot be named to approve their own document, nor approve it (two-person rule)',
    action: 'as the signer, create SOP C (authored by the signer) with its text; send it for review on a route naming the signer as its QMS approver; then approve it with the signer\'s own valid password (and code)',
    expected: 'The send is refused HTTP 409 MEMBER_IS_AUTHOR (v0.8: the route refuses the author before anything is written) and SOP C stays draft; the approval is refused HTTP 409 QMS_INVALID_STATE (only a document under review is approved); no signature row',
    dependsOn: ['OQ-QMS-04b'],
    note: 'v0.8 (RR4, §2.5): the two-person rule is now enforced where the approver is named (validateRouteMember, MEMBER_IS_AUTHOR), so an author never reaches their own document\'s approval on a route. The approval\'s own refusal (QMS_SELF_APPROVAL) remains for a document that entered review before review routes (§2.13); no API creates such a document now.',
  },
  async ({ apiAs, expect, state }) => {
    const asSigner = apiAs(state.signer.session);
    const { doc: docC } = await createAuthoredSop(asSigner, expect, { docNumber: `SOP-OQ-C-${stamp}`, title: `OQ-006 Self-approval SOP ${stamp}`, nextReviewDate: inDays(30), reason: 'OQ-006 step 06c: the signer authors SOP C' });
    expect(String(docC.author_id) === String(state.signer.session.user.id), 'SOP C is not attributed to the signer', docC);
    const send = await asSigner('PATCH', `/api/mdx/qms/documents/${docC.id}`, { status: 'in_review', reason: 'OQ-006 step 06c: self-routing must be refused', route: signerRoute(state.signer.session.user.id) });
    expect(send.status === 409 && errCode(send) === 'MEMBER_IS_AUTHOR', `self-naming expected 409 MEMBER_IS_AUTHOR, got ${send.status}`, send.json);
    const selfToken = await signerCode(state.signer);
    const r = await asSigner('POST', `/api/mdx/qms/documents/${docC.id}/approve`,
      { password: state.signer.password, ...(selfToken ? { mfaToken: selfToken } : {}), meaning: 'APPROVED', reason: 'OQ-006 step 06c: self-approval must be refused' });
    expect(r.status === 409 && errCode(r) === 'QMS_INVALID_STATE', `expected 409 QMS_INVALID_STATE, got ${r.status}`, r.json);
    const g = await asSigner('GET', `/api/mdx/qms/documents/${docC.id}`);
    expect(g.json?.data?.status === 'draft', 'SOP C changed state on the refused self-approval', g.json?.data);
    const s = await asSigner('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${docC.id}`)}`);
    expect(s.status === 200 && (s.json?.data ?? []).length === 0, 'a signature row exists for the refused self-approval', s.json);
    return `SOP C ${docC.id} authored by ${docC.author_id}; naming the author as approver → HTTP 409 MEMBER_IS_AUTHOR; self-approve → HTTP 409 QMS_INVALID_STATE; still draft; 0 signature rows`;
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
    expected: 'Without reason → 400 QMS_REASON_REQUIRED (v0.8: the controlled revision, 2026-10-14); with reason → version 2.0, status draft, prior approval cleared, audited',
    dependsOn: ['OQ-QMS-05'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/revise`, {});
    expect(a.status === 400 && errCode(a) === 'QMS_REASON_REQUIRED', `no reason expected 400 QMS_REASON_REQUIRED, got ${a.status}`, a.json);
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
    title: 'Personal acknowledgement is bound to the exact readable released revision',
    action: 'GET the released document; POST training-ack {documentVersion, contentDigest, understood:true, method:"attestation"}; GET training/compliance',
    expected: 'HTTP 201 with exact documentVersion/contentDigest and chained audit; coverage HTTP 200',
    dependsOn: ['OQ-QMS-06d'],
  },
  async ({ api, expect }) => {
    return qualifyPersonalAcknowledgement({ api, expect }, state.docB.id);
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
    id: 'OQ-QMS-10b',
    urs: ['URS-QMS-007'],
    title: 'A reason alone does not retire a controlled document',
    action: 'as the run identity (an editor), POST /documents/:docB/retire {reason} with no password and no meaning',
    expected: 'HTTP 400 ESIGNATURE_COMPONENT_MISSING; fieldErrors name password and meaning; docB keeps the status it had; no new signature row',
    dependsOn: ['OQ-QMS-06a'],
    note: 'Security review 2026-09-24, DP-32 / P1-29: until 2026-09-26 this request retired the document (OQ-QMS-10 as executed on 2026-09-23c is the record of that). Retirement is now the same electronic signature as approval (§11.50, §11.200); this step runs with or without the signer credential, so the refusal is observed on every execution.',
  },
  async ({ api, expect }) => {
    const docPath = `/api/mdx/qms/documents/${state.docB.id}`;
    const before = { status: dataOf(await api('GET', docPath)).status, rows: (await signatureRowsFor(api, state.docB.id)).length };
    const r = await api('POST', `${docPath}/retire`, { reason: 'OQ-006 step 10b: a reason alone must not retire' });
    expect(r.status === 400 && errCode(r) === 'ESIGNATURE_COMPONENT_MISSING', `expected 400 ESIGNATURE_COMPONENT_MISSING, got ${r.status}`, r.json);
    const fields = Object.keys(r.json?.details?.fieldErrors ?? {});
    expect(['password', 'meaning'].every((f) => fields.includes(f)), 'fieldErrors do not name password and meaning', r.json);
    const after = { status: dataOf(await api('GET', docPath)).status, rows: (await signatureRowsFor(api, state.docB.id)).length };
    expect(after.status === before.status && after.status !== 'retired' && after.rows === before.rows, 'docB changed, or a signature row was written, on a reason-only retire', { before, after });
    return `HTTP 400 ESIGNATURE_COMPONENT_MISSING (fieldErrors: ${fields.join(', ')}); docB still ${after.status}; signature rows unchanged (${after.rows})`;
  },
);

await step(
  {
    id: 'OQ-QMS-10',
    urs: ['URS-QMS-007'],
    title: 'CREDENTIALED: the signer retires SOP B as an electronic signature; the retirement is stamped, audited and signed; a second retirement is refused',
    action: 'as the signer, POST /documents/:docB/retire {password, mfaToken?, meaning:"APPROVED", reason}; read the signatures by target; recompute the §11.70 digest from the stored row; retire again',
    expected: 'HTTP 200: status retired, metadata.retired {reason, meaning APPROVED, contentDigest, bindingBasis, by = signer, at, fromStatus effective}, meta.auditTrail {persisted, chained}, meta.signature {id, meaning APPROVED, boundPayloadDigest (sha256), bindingBasis qms-document-version-content-sha256}; metadata.retired.contentDigest equals the signature digest; the signatures for docB are now two, the new one signature_type qms-document-retirement by the signer; the digest recomputed from the stored row (version content minus metadata.approval and metadata.retired) equals the signature digest; second retire → 409 QMS_INVALID_STATE',
    dependsOn: ['OQ-QMS-06d'],
    note: 'Security review 2026-09-24, DP-32 / P1-29. Retiring is the terminal transition of an effective procedure and a signed record (§11.50, §11.200), taken with the same ceremony as the approval: signing authority, password and enrolled second factor re-verified, the meaning, one electronic_signatures row bound to the version content, the UPDATE and the chained audit row in one transaction (server/services/qms/document-approval-signature.ts retireQmsDocumentSigned).',
  },
  async (ctx) => {
    const { expect, attach } = ctx;
    const signer = ctx.state.signer;
    const signerId = signer.session.user.id;
    const asSigner = ctx.apiAs(signer.session);
    const { response, document: d, signature: sig } = await retireSigned(ctx, state.docB.id, 'OQ-006 step 10: superseded by validation (signed)');
    const retired = d.metadata?.retired ?? {};
    expect(isRetirementStamp(retired, sig, signerId), 'metadata.retired stamps wrong (contentDigest/by/fromStatus/meaning/at)', { retired, sig });
    const rows = await signatureRowsFor(asSigner, d.id);
    const row = rows.find((x) => x.signature_type === 'qms-document-retirement');
    expect(rows.length === 2 && row && isQmsSignatureRow(row, signerId, 'qms-document-retirement') && String(row.id) === String(sig.id), `expected 2 signature rows for docB with one valid retirement row id ${sig.id}, got ${rows.length}`, rows);
    // §11.70: the retirement digest is the version-content recipe with the stamp the retirement writes removed.
    const report = retirementDigestReport(await asSigned(asSigner, expect, dataOf(await asSigner('GET', `/api/mdx/qms/documents/${d.id}`))), sig, retired, row);
    attach('retirement-digest-recomputation.json', report);
    expect(report.match, 'recomputed §11.70 retirement digest does not match the signature / the stored document', report);
    const again = await postSigned(ctx, `/api/mdx/qms/documents/${d.id}/retire`, { reason: 'OQ-006 step 10: second retirement must be refused' });
    expect(again.status === 409 && errCode(again) === 'QMS_INVALID_STATE', `second retire expected 409 QMS_INVALID_STATE, got ${again.status}`, again.json);
    state.docB = d;
    return `retired by ${retired.by} (${signer.session.user.email}) from ${retired.fromStatus} at ${retired.at}; signature ${sig.id} meaning ${sig.meaning}, ${sig.authenticationMethod}, digest ${String(sig.boundPayloadDigest).slice(0, 12)}… (recomputed match ${report.match}); 2 rows for docB; auditTrail=${JSON.stringify(response.json.meta.auditTrail)}; re-retire → 409 QMS_INVALID_STATE`;
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
    action: 'Open /concept2cure/quality?program=<OQ_QMS_PROGRAM_ID> (v0.8: Quality opens within a project); find the SOP number; click the "Change control" tab',
    expected: 'SOP register shows the created SOP; Change control tab renders (an unavailable store is an honest error state)',
    dependsOn: ['OQ-QMS-03'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto(`/concept2cure/quality?program=${qmsProgramId()}`);
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
