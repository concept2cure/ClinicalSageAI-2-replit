/**
 * OQ-002 steps OQ-VAULT-13 and OQ-VAULT-14 (URS-VAULT-013): review and approval
 * of a Vault version on its review route. Run by ./run.mjs after OQ-VAULT-12.
 *
 * Revised in OQ-002 v0.15 (2026-10-29) for RR1b
 * (docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §2.13): a Vault version is
 * sent for review only on a route naming its reviewers, one approver, a review
 * and an approval due date and the sender's reason (REVIEW_ROUTE_REQUIRED
 * otherwise), and the route's approver approves by signing on it; the server
 * approves on the last required signature. Until v0.14 both steps sent with
 * advance {to:'in_review'} and no route and approved through /advance, in
 * run.mjs; they moved here so the runner stays within the file-length limit.
 */
import { ingestPdf, makePdfBuffer } from '../../lib/fixtures.mjs';
import { requireApprover, requireSigner, signerCode } from '../../lib/credentials.mjs';

const DOCS = '/api/regulatory/documents';

/** Start a version's lifecycle record (or find it), as the run identity. The response. */
const startRecordRaw = (api, vaultId) => api('POST', DOCS, { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });

/** Start a version's lifecycle record (or find it), as the run identity. Its id. */
async function startRecord(api, expect, vaultId) {
  const start = await startRecordRaw(api, vaultId);
  expect([200, 201].includes(start.status), `start: expected 201, got ${start.status}`, start.json);
  return start.json.canonicalId;
}

/** A session's account id, the id a review route names a person by. */
function accountId(expect, user) {
  const id = Number(user?.id);
  expect(Number.isSafeInteger(id) && id > 0, 'the session names no account id', user);
  return id;
}

/** Calendar dates (UTC) a week and two weeks out: the review due, then the approval due on or after it. */
function routeDueDates() {
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  return { reviewDueDate: day(7), approvalDueDate: day(14) };
}

/** Send a started record for review on a route: reviewers and the one approver by account id, as the run identity. The response. */
function sendOnRoute(api, cid, { reviewers, approver, reason }) {
  return api('POST', `${DOCS}/${cid}/advance`, { to: 'in_review', reason, route: { reviewers, approvers: [approver], ...routeDueDates() } });
}

/** Sign as `who` (a credentialed identity): its password, and its code when a factor is enrolled. */
async function signAs(apiAs, who, path, body) {
  const code = await signerCode(who);
  return apiAs(who.session)('POST', path, { ...body, password: who.password, ...(code ? { mfaToken: code } : {}) });
}

/** The response is the refusal `status` with error `code`. */
function expectRefusal(expect, r, status, code, what) {
  expect(r.status === status && r.json?.error === code, `${what}: expected ${status} ${code}, got ${r.status}`, r.json);
}

/** The version's lifecycle as the versions list shows it. */
async function versionLifecycle(api, programId, vaultId) {
  const vs = await api('GET', `/api/c2c/project-vault/${programId}/documents/${vaultId}/versions`);
  return (vs.json?.data?.versions ?? []).find((v) => v.id === vaultId)?.lifecycle;
}

/** OQ-VAULT-13: one record; no send without a route; the record stays in authoring. */
async function noUnroutedSend(api, expect, vaultId) {
  const cid = await startRecord(api, expect, vaultId);
  const again = await startRecordRaw(api, vaultId);
  expect(again.status === 200 && again.json.canonicalId === cid && again.json.created === false, 'a second start made a second record', again.json);
  const bare = await api('POST', `${DOCS}/${cid}/advance`, { to: 'in_review' });
  expectRefusal(expect, bare, 409, 'REVIEW_ROUTE_REQUIRED', 'the send without a route');
  return cid;
}

/** OQ-VAULT-13: the route admits neither the uploader nor the reviewer as approver; neither refused send moves the record. */
async function routeAdmission(api, expect, cid, { runId, signerId, approverId, reason }) {
  const selfRoute = await sendOnRoute(api, cid, { reviewers: [runId], approver: approverId, reason });
  expectRefusal(expect, selfRoute, 409, 'MEMBER_IS_AUTHOR', 'the route naming the uploader');
  const both = await sendOnRoute(api, cid, { reviewers: [signerId], approver: signerId, reason });
  expectRefusal(expect, both, 409, 'MEMBER_ALREADY_NAMED', 'the route naming the reviewer as approver');
  const unsent = await api('GET', `${DOCS}/${cid}`);
  expect(unsent.status === 200 && unsent.json?.stage === 'authoring', 'a refused send moved the record out of authoring', unsent.json);
}

/** OQ-VAULT-13: the uploader may not review; the named reviewer's signature, bound to the bytes, completes the review. */
async function reviewOnRoute({ api, apiAs, expect }, cid, { signer, version, routeId }) {
  const self = await api('POST', `${DOCS}/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 13: the uploader must not review' });
  expectRefusal(expect, self, 403, 'ROUTE_NOT_NAMED', 'the uploader\'s review');
  const review = await signAs(apiAs, signer, `${DOCS}/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 13: reviewed for validation' });
  expect(review.status === 200, `the signer's review: expected 200, got ${review.status}`, review.json);
  expect(review.json.signature.boundContentHash === version.contentHash, 'the review is not bound to the version\'s SHA-256', review.json.signature);
  expect(review.json.reviewComplete === true && review.json.routeId === routeId, 'the named reviewer\'s signature did not complete the route\'s review', review.json);
}

/** OQ-VAULT-13: the reviewer may not approve, by signing (not named approver) or by advancing (a routed record is approved by signing). */
async function reviewerCannotApprove(apiAs, expect, signer, cid) {
  const reason = 'OQ-002 step 13: the reviewer must not approve';
  const own = await signAs(apiAs, signer, `${DOCS}/${cid}/sign`, { meaning: 'approved', reason });
  expectRefusal(expect, own, 403, 'ROUTE_NOT_NAMED', 'the reviewer\'s approval by signing');
  const byAdvance = await signAs(apiAs, signer, `${DOCS}/${cid}/advance`, { to: 'approved', reason });
  expectRefusal(expect, byAdvance, 409, 'ROUTE_APPROVAL_BY_SIGN', 'the reviewer\'s approval by advancing');
}

/** OQ-VAULT-13: the versions list shows the review and the route, the reviewer signed and the approver's step open. */
function expectRoundShown(expect, lc, { routeId, signerId, approverId }) {
  expect(lc?.stage === 'in_review' && Boolean(lc?.review?.printedName), 'the versions list does not show the review', lc);
  const members = lc.round?.members ?? [];
  const reviewerRow = members.find((m) => m.role === 'reviewer' && m.userId === signerId);
  const approverRow = members.find((m) => m.role === 'approver' && m.userId === approverId);
  expect(lc.round?.route?.id === routeId && reviewerRow?.outcome === 'signed' && approverRow?.stepOpen === true,
    'the versions list does not show the route with the reviewer signed and the approver\'s step open', lc.round);
  return approverRow;
}

/** OQ-VAULT-14: send a version on the route, the reviewer signs, the approver signs: approved on the last required signature. */
async function approveOnRoute({ api, apiAs, expect }, doc, { signer, approver, signerId, approverId }) {
  const cid = await startRecord(api, expect, doc.id);
  const sent = await sendOnRoute(api, cid, { reviewers: [signerId], approver: approverId, reason: 'OQ-002 step 14: sent for review for validation' });
  expect(sent.status === 200 && sent.json.stage === 'in_review', `send on the route: expected 200 in_review, got ${sent.status}`, sent.json);
  const r = await signAs(apiAs, signer, `${DOCS}/${cid}/sign`, { meaning: 'reviewed', reason: 'OQ-002 step 14: reviewed for validation' });
  expect(r.status === 200 && r.json.reviewComplete === true, `review: expected 200 completing the review, got ${r.status}`, r.json);
  const a = await signAs(apiAs, approver, `${DOCS}/${cid}/sign`, { meaning: 'approved', reason: 'OQ-002 step 14: approved for validation' });
  expect(a.status === 200 && a.json.approvalComplete === true && a.json.stage === 'approved', `approval: expected 200 approvalComplete, approved, got ${a.status}`, a.json);
  expect(a.json.signature?.boundContentHash === doc.contentHash, 'the approval is not bound to the version\'s SHA-256', a.json.signature);
  return { cid, routeId: sent.json.routeId, approval: a.json };
}

/** OQ-VAULT-14: check in v2.0 of `first` through the ingest route. The new version. */
async function checkIn(api, expect, { programId, title, first }) {
  const form = new FormData();
  form.append('file', new Blob([makePdfBuffer(`${title} revision 2`)], { type: 'application/pdf' }), 'approval-v2.pdf');
  form.append('programId', programId);
  form.append('documentTitle', title);
  form.append('documentType', 'PROTOCOL');
  form.append('supersedesDocumentId', first.id);
  const next = await api('POST', '/api/vault/ingest', form);
  expect(next.status === 201, `check-in: expected 201, got ${next.status}`, next.json);
  return next.json.document;
}

/** OQ-VAULT-14: v2.0 Approved with the approver's printed name and its route complete; v1.0 Superseded. */
function expectApprovedFamily(expect, list, routeId) {
  const [v2, v1] = list;
  expect(v2?.lifecycle?.stage === 'approved' && Boolean(v2?.lifecycle?.approval?.printedName), 'v2.0 is not shown approved', v2);
  const round = v2.lifecycle.round;
  expect(round?.route?.id === routeId && round?.route?.status === 'complete', 'v2.0\'s route is not shown complete', round);
  expect(v1?.lifecycle?.stage === 'superseded', 'v1.0 is not shown superseded', v1);
}

export async function runReviewRouteSteps({ step, state, stamp }) {
  await step(
    {
      id: 'OQ-VAULT-13',
      urs: ['URS-VAULT-013'],
      title: 'CREDENTIALED: a version is sent for review only on a review route; the uploader may not review it; the named reviewer signs the review over its bytes; the reviewer may not approve it',
      action:
        'POST /api/regulatory/documents naming the OQ-VAULT-11 version, twice; POST …/:id/advance {to:"in_review"} with no route; ' +
        'POST …/:id/advance {to:"in_review", reason, route} naming the run identity (the uploader) as reviewer, then OQ_SIGNER as reviewer and as approver; GET …/:id; ' +
        'the same naming OQ_SIGNER as reviewer and OQ_APPROVER as approver; ' +
        'as the run identity POST …/:id/sign {meaning:"reviewed", reason}; as OQ_SIGNER POST …/:id/sign {meaning:"reviewed", reason, password, mfaToken?}; ' +
        'as OQ_SIGNER POST …/:id/sign {meaning:"approved", …} and POST …/:id/advance {to:"approved", …}; GET …/documents/:id/versions',
      expected:
        'One lifecycle record (the second start returns it, created:false). The send without a route 409 REVIEW_ROUTE_REQUIRED. ' +
        'The route naming the uploader 409 MEMBER_IS_AUTHOR; the route naming the reviewer as approver too 409 MEMBER_ALREADY_NAMED; the record still in authoring. ' +
        'The route naming OQ_SIGNER and OQ_APPROVER 200, in_review, with its routeId. The uploader\'s review 403 ROUTE_NOT_NAMED; the signer\'s review 200 with boundContentHash ' +
        'equal to the version\'s SHA-256, completing the review; the signer\'s approval by signing 403 ROUTE_NOT_NAMED and by advancing 409 ROUTE_APPROVAL_BY_SIGN; ' +
        'the versions list shows the version In review with the review\'s printed name, and the route: the reviewer signed, the approver\'s step open. ' +
        'Without OQ_SIGNER_* or OQ_APPROVER_* (a third identity, the route\'s approver) the step is recorded "not executed — credential not supplied".',
      dependsOn: ['OQ-VAULT-11'],
      note:
        'Revised in OQ-002 v0.15 (RR1b, docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §2.13): a Vault version enters review only on a route naming its reviewers and one approver. ' +
        'Separation of duties is asserted where the route enforces it first (the validator refuses to name the uploader, or the reviewer as approver) and again at signing ' +
        '(a person the route does not name in that role signs nothing). The v0.6 code SELF_APPROVAL belongs to the unrouted path, which no handler reaches for a Vault version since RR1b.',
    },
    async (ctx) => {
      const { api, apiAs, expect, auth, baseUrl } = ctx;
      const signer = await requireSigner(ctx, baseUrl, auth.user.email);
      const approver = await requireApprover(ctx, baseUrl, [auth.user.email, signer.email]);
      Object.assign(state, { signer, approver });
      const [runId, signerId, approverId] = [auth.user, signer.session.user, approver.session.user].map((u) => accountId(expect, u));
      const reason = 'OQ-002 step 13: sent for review for validation';
      const cid = await noUnroutedSend(api, expect, state.v2.id);
      await routeAdmission(api, expect, cid, { runId, signerId, approverId, reason });
      const sent = await sendOnRoute(api, cid, { reviewers: [signerId], approver: approverId, reason });
      expect(sent.status === 200 && sent.json.stage === 'in_review' && Boolean(sent.json.routeId), `send on the route: expected 200 in_review with a routeId, got ${sent.status}`, sent.json);
      await reviewOnRoute(ctx, cid, { signer, version: state.v2, routeId: sent.json.routeId });
      await reviewerCannotApprove(apiAs, expect, signer, cid);
      const lc = await versionLifecycle(api, state.programId, state.v2.id);
      const approverRow = expectRoundShown(expect, lc, { routeId: sent.json.routeId, signerId, approverId });
      return `record ${cid}: unrouted send refused (REVIEW_ROUTE_REQUIRED); uploader and reviewer-as-approver not admitted to the route; route ${sent.json.routeId} sent; ` +
        `uploader's review refused; reviewed by ${lc.review.printedName}, bound to ${state.v2.contentHash.slice(0, 12)}…; reviewer's approval refused by sign and by advance; approver ${approverRow.printedName}'s step open`;
    },
  );

  await step(
    {
      id: 'OQ-VAULT-14',
      urs: ['URS-VAULT-013'],
      title: 'CREDENTIALED: the route\'s approver approves v1, then v2, by signing on the route; approving v2 supersedes v1; the approved version\'s details cannot be edited',
      action:
        'Ingest a new document (v1.0); send it for review on a route naming OQ_SIGNER as reviewer and OQ_APPROVER as approver; OQ_SIGNER signs the review; ' +
        'OQ_APPROVER signs the approval (POST …/:id/sign {meaning:"approved", reason, password, mfaToken?}). Check in v2.0 and repeat. GET …/documents/:v2/versions. ' +
        'POST …/documents/:v2/details {documentTitle, reason}',
      expected:
        'Each send 200 in_review. Each review 200, completing the review. Each approval 200 approvalComplete:true, stage approved, bound to that version\'s SHA-256: the server approves on the last required signature. ' +
        'v2\'s approval answers superseded:[v1\'s record]; the versions list shows v2.0 Approved (the approver\'s printed name), its route complete, and v1.0 Superseded; ' +
        'the edit 409 APPROVED_VERSION_IMMUTABLE. Without OQ_APPROVER_EMAIL / OQ_APPROVER_PASSWORD (a third identity) the step is recorded "not executed — credential not supplied".',
      dependsOn: ['OQ-VAULT-13'],
      note: 'Revised in OQ-002 v0.15 (RR1b): v0.6 approved through POST …/:id/advance {to:"approved"}, which a routed record refuses (ROUTE_APPROVAL_BY_SIGN, asserted in OQ-VAULT-13). The identities are the ones OQ-VAULT-13 resolved.',
    },
    async (ctx) => {
      const { api, expect, auth, attach } = ctx;
      const { signer, approver } = state;
      const [signerId, approverId] = [signer.session.user, approver.session.user].map((u) => accountId(expect, u));
      expect(accountId(expect, auth.user) !== approverId, 'the approver is the run identity');
      const people = { signer, approver, signerId, approverId };
      const title = `OQ-002 Approval family ${stamp}`;
      const first = await ingestPdf(api, expect, { programId: state.programId, title });
      const one = await approveOnRoute(ctx, first.document, people);
      const next = await checkIn(api, expect, { programId: state.programId, title, first: first.document });
      const two = await approveOnRoute(ctx, next, people);
      expect(JSON.stringify(two.approval.superseded) === JSON.stringify([one.cid]), 'approving v2.0 did not supersede v1.0', two.approval);
      const vs = await api('GET', `/api/c2c/project-vault/${state.programId}/documents/${next.id}/versions`);
      const list = vs.json?.data?.versions ?? [];
      attach('versions.json', list);
      expectApprovedFamily(expect, list, two.routeId);
      const edit = await api('POST', `/api/c2c/project-vault/${state.programId}/documents/${next.id}/details`, {
        documentTitle: `${title} renamed`, reason: 'OQ-002 step 14: an approved version must not change',
      });
      expect(edit.status === 409 && JSON.stringify(edit.json).includes('APPROVED_VERSION_IMMUTABLE'), `edit: expected 409 APPROVED_VERSION_IMMUTABLE, got ${edit.status}`, edit.json);
      return `v1.0 approved on route ${one.routeId}, then superseded by v2.0 (approved on route ${two.routeId} by ${list[0].lifecycle.approval.printedName}, route complete); the approved version's edit refused`;
    },
  );
}
