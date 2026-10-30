/**
 * OQ-003 steps on Authoring's review route (URS-AUTH-010, URS-AUTH-011,
 * URS-AUTH-013): the review request (OQ-AUTH-17, OQ-AUTH-17b), run by ./run.mjs
 * after OQ-AUTH-10, and the signatures on the frozen document (OQ-AUTH-12 to
 * OQ-AUTH-14b), run after OQ-AUTH-11.
 *
 * Revised in OQ-003 v0.5 (2026-10-30) for RR5
 * (docs/design/REVIEW_ROUTING_2026-10-23.md §2.1, §2.8, §2.13;
 * server/services/authoring/authoring-review-route.ts): a review request carries
 * a governed reason and a route naming its reviewers with a due date, and writes
 * the request, the Reviewer grant, the route and each reviewer's task on one
 * transaction; on a live route only a named reviewer whose step is open signs
 * REVIEWER, refused before the credential otherwise, and that signature closes
 * their task and, the last reviewer's, completes the route. Until v0.4 the run
 * identity requested review from itself with no reason and no route, and signed
 * REVIEWER on its own document. The steps moved here from run.mjs so the runner
 * stays within the file-length limit.
 */
import { CREDENTIAL_NOT_SUPPLIED, requireSigner, signerCode } from '../../lib/credentials.mjs';
import { runCredential } from '../../lib/harness.mjs';

const DOCS = '/api/authoring/documents';

/** A session's account id, the id a review route names a person by. */
function accountId(expect, user) {
  const id = Number(user?.id);
  expect(Number.isSafeInteger(id) && id > 0, 'the session names no account id', user);
  return id;
}

/** A refusal's code: the request routes answer {error:{code}}, the signing route {code}. */
const codeOf = (r) => r.json?.error?.code ?? r.json?.code;

/** The response is the refusal `status` with code `code`. */
function expectRefusal(expect, r, status, code, what) {
  expect(r.status === status && codeOf(r) === code, `${what}: expected ${status} ${code}, got ${r.status} ${codeOf(r)}`, r.json);
}

/** A reviewer as the request names them: the account id, the printed name, the e-mail. */
const reviewerRef = (user) => ({ id: Number(user.id), name: user.displayName ?? user.email, email: user.email });

/** Ask for review, as the run identity. */
function requestReview(api, docId, body) {
  return api('POST', `${DOCS}/${docId}/request-review`, body);
}
/** The route's review due date: a calendar date (UTC) a week out. */
const reviewDue = () => ({ reviewDueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) });

/** The document's review route round, as the run identity reads it (null when it has none). */
async function routeRound(api, expect, docId) {
  const r = await api('GET', `${DOCS}/${docId}/review-route`);
  expect(r.status === 200 && r.json?.success === true, `review-route: expected 200, got ${r.status}`, r.json);
  return r.json.round;
}

/** OQ-AUTH-17: a refused request wrote nothing — no review request, no route. */
async function expectNothingRequested(api, expect, docId, what) {
  const reviews = await api('GET', `${DOCS}/${docId}/reviews`);
  expect(reviews.status === 200 && (reviews.json?.reviews ?? []).length === 0, `${what} left a review request`, reviews.json?.reviews);
  expect((await routeRound(api, expect, docId)) === null, `${what} left a review route`);
}

/** OQ-AUTH-17: the member validator's answer for the author and for the second identity, before anything is sent. */
async function expectCandidates(api, expect, docId, { runId, signerId }) {
  const r = await api('GET', `${DOCS}/${docId}/route-candidates`);
  expect(r.status === 200, `route-candidates: expected 200, got ${r.status}`, r.json);
  const of = (id) => (r.json?.candidates ?? []).find((c) => Number(c.id) === id);
  expect(of(runId)?.reviewer?.code === 'MEMBER_IS_AUTHOR', 'the candidates read does not refuse the author as reviewer (MEMBER_IS_AUTHOR)', of(runId));
  expect(of(signerId) !== undefined && of(signerId).reviewer === null, 'the candidates read does not offer OQ_SIGNER as reviewer', of(signerId));
}

/** OQ-AUTH-17: the refusals at naming, each with nothing written. */
async function expectNamingRefusals(api, expect, docId, { self, signer, reason }) {
  const cases = [
    [{ reviewers: [signer], route: reviewDue() }, 400, 'REASON_REQUIRED', 'the request with no reason'],
    [{ reviewers: [signer], reason }, 400, 'ROUTE_DUE_DATES_REQUIRED', 'the request with no route due date'],
    [{ reviewers: [self], reason, route: reviewDue() }, 409, 'REVIEWER_IS_AUTHOR', 'the request naming the author'],
  ];
  for (const [body, status, code, what] of cases) {
    expectRefusal(expect, await requestReview(api, docId, body), status, code, what);
    await expectNothingRequested(api, expect, docId, what);
  }
}

/** OQ-AUTH-17: one open route, round 1, sent by the run identity with its reason, naming OQ_SIGNER as its one reviewer, pending at their turn. */
function expectOpenRoute(expect, round, { routeId, runId, signerId, reason }) {
  const header = round?.route ?? {};
  expect(header.id === routeId && header.status === 'open' && header.round === 1 && header.senderId === runId, 'the route is not open, round 1, sent by the run identity', header);
  const [member] = round.members ?? [];
  expect(round.members.length === 1 && member.userId === signerId && member.role === 'reviewer' && member.outcome === 'pending' && member.stepOpen === true && Boolean(member.dueDate),
    'the route does not name OQ_SIGNER as its one reviewer, pending at their turn, with a due date', round.members);
  expect(round.history?.length === 1 && round.history[0].action === 'send' && round.history[0].reason === reason, 'the route\'s naming history is not the one send with its reason', round.history);
}

/** The board row for the document as `apiFn`'s identity reads it, in `scope` ('' is the default, all open work). */
async function boardRow(apiFn, expect, docId, scope = '') {
  const r = await apiFn('GET', `/api/review/board${scope ? `?scope=${scope}` : ''}`);
  expect(r.status === 200, `board${scope ? ` (${scope})` : ''}: expected 200, got ${r.status}`, r.json);
  return (r.json?.data?.queue ?? []).find((q) => q.id === docId);
}

/** The route task in `apiFn`'s identity's open work, or undefined. */
async function myRouteTask(apiFn, expect, taskId) {
  const r = await apiFn('GET', '/api/tasks/my-work');
  expect(r.status === 200, `my-work: expected 200, got ${r.status}`, r.json);
  return (r.json?.data?.items ?? []).find((t) => t.taskId === taskId);
}

/** The document's signatures, as the run identity reads them. */
async function signatures(api, docId) {
  return (await api('GET', `/api/authoring/docs/${docId}/signatures`)).json?.signatures ?? [];
}

/** OQ-AUTH-17: the request naming OQ_SIGNER answered 200 with their pending review request and a new route holding their task with its due date. */
function expectSent(expect, rr, { email, signerId }) {
  expect(rr.status === 200, `request-review expected 200, got ${rr.status}`, rr.json);
  const pending = (rr.json?.reviews ?? []).filter((x) => x.review_status === 'pending');
  expect(pending.length === 1 && pending[0].reviewer_email === email, 'review request not recorded as pending for OQ_SIGNER', rr.json?.reviews);
  const sent = rr.json?.route ?? {};
  const task = (sent.tasks ?? []).find((t) => Number(t.userId) === signerId);
  expect(Boolean(sent.id) && sent.added === false && sent.tasks.length === 1 && Boolean(task?.taskId && task.dueDate),
    'the request did not write a route with OQ_SIGNER\'s task and its due date', sent);
  return { reviewer: pending[0].reviewer_email, sent, task };
}

/** OQ-AUTH-17: submit refused without an approver, then into the workflow with one; the workflow read. */
async function submitIntoWorkflow(api, expect, docId, approverEmail) {
  const noApprover = await api('POST', `/api/authoring/docs/${docId}/submit`, { workflow_steps: [{ role: 'QA' }] });
  expect(noApprover.status === 400, `submit without approver_email expected 400, got ${noApprover.status}`, noApprover.json);
  const sub = await api('POST', `/api/authoring/docs/${docId}/submit`, { workflow_steps: [{ role: 'QA', approver_email: approverEmail }] });
  expect(sub.status < 300, `submit expected 2xx, got ${sub.status}`, sub.json);
  const wf = await api('GET', `/api/authoring/docs/${docId}/workflow`);
  expect(wf.status === 200 && /PENDING/.test(JSON.stringify(wf.json)), 'workflow has no PENDING step', wf.json);
  return wf.json;
}

/** OQ-AUTH-14b: the route complete, its one reviewer signed with the OQ-AUTH-14 signature. The member. */
function expectRouteComplete(expect, round, { routeId, signerId, signatureId }) {
  expect(round?.route?.id === routeId && round.route.status === 'complete', 'the route is not complete', round?.route);
  const [member] = round.members ?? [];
  const sig = member?.signature ?? {};
  expect(member?.userId === signerId && member.outcome === 'signed' && sig.id === signatureId && sig.meaning === 'REVIEWER' && Boolean(sig.printedName),
    'the route does not show the reviewer signed with the OQ-AUTH-14 signature', member);
  return member;
}

/** OQ-AUTH-14b: the queue row no longer awaits the reviewer and carries their review signature's time. */
function expectBoardSigned(expect, row, signerId) {
  const mine = (row?.reviews ?? []).find((x) => x.reviewerId === String(signerId));
  expect(row?.awaitingMyReview === false && Boolean(row.myReviewSignedAt) && Boolean(mine?.routeSignedAt),
    'the queue still has the document awaiting the reviewer, or shows no review signature', row ?? 'not listed');
}

/** OQ-AUTH-17. */
async function requestStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-17',
      urs: ['URS-AUTH-013'],
      title: 'CREDENTIALED: request review on a review route naming the second identity; the route refuses what it may not name; submit the document into its approval workflow (before freeze — submit requires DRAFT)',
      action:
        'GET /documents/:id/route-candidates; POST /documents/:id/request-review naming OQ_SIGNER with no reason, then with a reason and no route; naming the run identity (the author) with a reason and route {reviewDueDate}; ' +
        'GET /documents/:id/reviews and GET /documents/:id/review-route after each; POST /documents/:id/request-review {reviewers:[OQ_SIGNER], reason, route:{reviewDueDate}}; GET …/review-route; the same request again; ' +
        'POST /docs/:id/submit {workflow_steps:[{role:"QA"}]}; with approver_email = self; GET /docs/:id/workflow',
      expected:
        'The candidates read refuses the run identity as reviewer, MEMBER_IS_AUTHOR, and offers OQ_SIGNER. No reason 400 REASON_REQUIRED; no route 400 ROUTE_DUE_DATES_REQUIRED; the author named 409 REVIEWER_IS_AUTHOR; after each, no review request and no route. ' +
        'Naming OQ_SIGNER 200: a pending review request for OQ_SIGNER, and a route (added false) with one task, OQ_SIGNER\'s, with its due date; the route reads open, round 1, sent by the run identity with the reason, OQ_SIGNER its one reviewer, pending at their turn, with a due date. ' +
        'Naming OQ_SIGNER again 409 MEMBER_ALREADY_NAMED, the route unchanged. Submit without approver_email 400; with it the document moves to IN_REVIEW and the workflow lists a PENDING step. ' +
        'Without OQ_SIGNER_* the step is recorded "not executed — credential not supplied".',
      dependsOn: ['OQ-AUTH-03'],
      note:
        'Revised in OQ-003 v0.5 (RR5): until v0.4 the run identity named itself, with no reason and no route, which RR5 refuses 400 REASON_REQUIRED (red record). ' +
        'The author is refused twice over: by the request\'s own independence check (REVIEWER_IS_AUTHOR, server/services/authoring/peer-review.ts), which answers first, and by the route\'s one member validator ' +
        '(MEMBER_IS_AUTHOR, server/services/review/review-route-member.ts), whose answer the candidates read shows.',
    },
    async (ctx) => {
      const { api, expect, auth, baseUrl } = ctx;
      state.signer = await requireSigner(ctx, baseUrl, auth.user.email);
      const [runId, signerId] = [auth.user, state.signer.session.user].map((u) => accountId(expect, u));
      state.signerId = signerId;
      const docId = state.docId;
      const reason = 'OQ-003 step 17: ready for medical review for validation';
      const signer = reviewerRef(state.signer.session.user);
      await expectCandidates(api, expect, docId, { runId, signerId });
      await expectNamingRefusals(api, expect, docId, { self: reviewerRef(auth.user), signer, reason });
      const rr = await requestReview(api, docId, { reviewers: [signer], reason, route: reviewDue() });
      const { reviewer, sent, task } = expectSent(expect, rr, { email: state.signer.email, signerId });
      state.route = { id: sent.id, taskId: task.taskId };
      expectOpenRoute(expect, await routeRound(api, expect, docId), { routeId: sent.id, runId, signerId, reason });
      expectRefusal(expect, await requestReview(api, docId, { reviewers: [signer], reason, route: reviewDue() }), 409, 'MEMBER_ALREADY_NAMED', 'naming OQ_SIGNER again');
      const unchanged = await routeRound(api, expect, docId);
      expect(unchanged?.members?.length === 1 && unchanged.history?.length === 1, 'a refused naming changed the route', unchanged);
      const wf = await submitIntoWorkflow(api, expect, docId, auth.user.email);
      return `author refused (MEMBER_IS_AUTHOR in candidates; REVIEWER_IS_AUTHOR on request); no reason, no route refused with nothing written; route ${sent.id} names ${reviewer} (task ${task.taskId}, due ${task.dueDate}); ` +
        `naming again refused MEMBER_ALREADY_NAMED; submit w/o approver → 400; workflow: ${JSON.stringify(wf).slice(0, 160)}`;
    },
  );
}

/** OQ-AUTH-17b. */
async function boardBeforeStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-17b',
      urs: ['URS-AUTH-013'],
      title: 'CREDENTIALED: the named reviewer sees the review awaiting them on the Review surface and in their work',
      action: 'As OQ_SIGNER, after the request and submit above: GET /api/review/board (the read model behind /concept2cure/review); GET /api/review/board?scope=mine; GET /api/tasks/my-work',
      expected: 'The queue lists the document for the reviewer, awaiting their review (awaitingMyReview true, no review signature); the "mine" scope lists it; their work lists their route task, as a reviewer\'s',
      dependsOn: ['OQ-AUTH-17'],
      note:
        'Revised in OQ-003 v0.5 (RR5): the reviewer is OQ_SIGNER, whom the route names; until v0.4 it was the run identity. F-6 (VSR-001 §11.2) is why this step exists: the Review board reads the authoring review store, ' +
        'and since RR5 also each document\'s route (server/services/review/authoring-review-board.ts).',
    },
    async ({ apiAs, expect }) => {
      const asSigner = apiAs(state.signer.session);
      const row = await boardRow(asSigner, expect, state.docId);
      expect(row?.awaitingMyReview === true && row.myReviewSignedAt === null, 'the queue does not list the document awaiting the reviewer', row ?? 'not listed');
      expect((await boardRow(asSigner, expect, state.docId, 'mine')) !== undefined, 'the reviewer\'s "mine" scope does not list the document');
      const task = await myRouteTask(asSigner, expect, state.route.taskId);
      expect(task?.reviewRole === 'reviewer', 'the reviewer\'s work does not list their route task', task ?? 'not listed');
      return `queue lists the document awaiting ${state.signer.email}; in "mine"; task ${task.taskId} (${task.status}) in their work`;
    },
  );
}

/** OQ-AUTH-12. */
async function pinStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-12',
      urs: ['URS-AUTH-010'],
      title: 'A signing PIN signs nothing, and no route sets one',
      action: 'POST /api/authoring/users/pin {pin}; as the route\'s named reviewer (OQ_SIGNER) POST /docs/:id/e-sign {pin, meaning:"REVIEWER", intent} with no password',
      expected: '404 for the PIN route; 400 PASSWORD_REQUIRED for the PIN-only signature; no signature stored beyond the OQ-AUTH-11 freeze\'s own',
      dependsOn: ['OQ-AUTH-11', 'OQ-AUTH-17'],
      note: 'Revised in OQ-003 v0.5 (RR5): the PIN-only signature is attempted by the named reviewer. The run identity, whom the route does not name, is refused ROUTE_NOT_NAMED before any credential (OQ-AUTH-13b), which would answer this step for the wrong reason.',
    },
    async ({ api, apiAs, expect }) => {
      const route = await api('POST', '/api/authoring/users/pin', { pin: '246813' });
      expect(route.status === 404, `the PIN route expected 404, got ${route.status}`, route.json);
      const sign = await apiAs(state.signer.session)('POST', `/api/authoring/docs/${state.docId}/e-sign`, { pin: '246813', meaning: 'REVIEWER', intent: 'OQ PIN only' });
      expect(sign.status === 400 && sign.json?.code === 'PASSWORD_REQUIRED', `a PIN-only signature expected 400 PASSWORD_REQUIRED, got ${sign.status}`, sign.json);
      // The one signature on record is the OQ-AUTH-11 freeze's own (DP-35); the PIN added none.
      expect((await signatures(api, state.docId)).length === 1, 'a signature was stored for a PIN');
      return 'PIN route → 404; the reviewer\'s PIN-only signature → 400 PASSWORD_REQUIRED; no signature stored';
    },
  );
}

/** OQ-AUTH-13. */
async function refusalStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-13',
      urs: ['URS-AUTH-010'],
      title: 'E-signature refuses a wrong password, a missing code and an invalid meaning',
      action:
        'POST /docs/:id/e-sign as the route\'s named reviewer (OQ_SIGNER) with (a) a wrong password, (b) their password and no code (identity with an authenticator enrolled); ' +
        '(c) as the run identity with meaning "WHATEVER"; (d) as the named reviewer with meaning "WHATEVER"',
      expected:
        '(a) 401 PASSWORD_VERIFICATION_FAILED; (b) 400 MFA_TOKEN_REQUIRED; (c) 400 Invalid signature meaning; (d) 403 AUTHORING_OBJECT_FORBIDDEN; ' +
        'no signature stored beyond the OQ-AUTH-11 freeze\'s own',
      dependsOn: ['OQ-AUTH-12'],
      note:
        'Revised in OQ-003 v0.5 (RR5): (a) and (b) are executed by the named reviewer, for the reason OQ-AUTH-12 gives. (c) stays the run identity\'s: the object gate judges an e-sign whose meaning is not REVIEWER as an approval-class act ' +
        '(server/middleware/authoringObjectAuthorization.ts), which the run identity\'s access admits, so the request reaches the meaning check; a Reviewer grant does not admit it, so (d), the same request from the named reviewer, is refused at the gate.',
    },
    async ({ api, apiAs, expect, deviation }) => {
      const run = runCredential();
      if (!run) deviation(CREDENTIAL_NOT_SUPPLIED);
      const asSigner = apiAs(state.signer.session);
      const path = `/api/authoring/docs/${state.docId}/e-sign`;
      const a = await asSigner('POST', path, { password: 'not-the-password', meaning: 'REVIEWER', intent: 'OQ wrong password' });
      expect(a.status === 401 && a.json?.code === 'PASSWORD_VERIFICATION_FAILED', `wrong password expected 401 PASSWORD_VERIFICATION_FAILED, got ${a.status}`, a.json);
      let b = null;
      if (state.signer.totpSecret) {
        b = await asSigner('POST', path, { password: state.signer.password, meaning: 'REVIEWER', intent: 'OQ no code' });
        expect(b.status === 400 && b.json?.code === 'MFA_TOKEN_REQUIRED', `password without the enrolled code expected 400 MFA_TOKEN_REQUIRED, got ${b.status}`, b.json);
      }
      // The meaning is refused before the credentials are checked, so no code is spent.
      const c = await api('POST', path, { password: run.password, meaning: 'WHATEVER', intent: 'OQ bad meaning' });
      expect(c.status === 400, `bad meaning expected 400, got ${c.status}`, c.json);
      const d = await asSigner('POST', path, { password: state.signer.password, meaning: 'WHATEVER', intent: 'OQ bad meaning' });
      expectRefusal(expect, d, 403, 'AUTHORING_OBJECT_FORBIDDEN', 'a meaning other than REVIEWER from the named reviewer');
      // The one signature on record is the OQ-AUTH-11 freeze's own (DP-35); the refusals added none.
      expect((await signatures(api, state.docId)).length === 1, 'a signature was stored despite refusal');
      return `wrong password → 401; ${b ? 'no code → 400 MFA_TOKEN_REQUIRED; ' : 'no authenticator enrolled for this identity, so (b) does not apply; '}bad meaning → 400 (run identity), 403 AUTHORING_OBJECT_FORBIDDEN (reviewer); no signature stored`;
    },
  );
}

/** OQ-AUTH-13b. */
async function notNamedStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-13b',
      urs: ['URS-AUTH-010', 'URS-AUTH-013'],
      title: 'On a live review route, a REVIEWER signature from a person the route does not name is refused before the credential',
      action: 'As the run identity (the author, whom the route does not name): POST /docs/:id/e-sign {password, meaning:"REVIEWER", intent} with no code; GET /docs/:id/signatures; GET /documents/:id/review-route',
      expected: '403 ROUTE_NOT_NAMED — not 400 MFA_TOKEN_REQUIRED, which the same request from the named reviewer answered in OQ-AUTH-13: the route answers before the credential is read; no signature stored beyond the OQ-AUTH-11 freeze\'s own; the route open, its reviewer still pending',
      dependsOn: ['OQ-AUTH-13'],
      note: 'New in OQ-003 v0.5 (RR5, §2.8; authoringReviewerPrecheck in server/services/authoring/authoring-review-route.ts). Until v0.4 the run identity signed REVIEWER on its own document (OQ-AUTH-14).',
    },
    async ({ api, expect, deviation }) => {
      const run = runCredential();
      if (!run) deviation(CREDENTIAL_NOT_SUPPLIED);
      const r = await api('POST', `/api/authoring/docs/${state.docId}/e-sign`, { password: run.password, meaning: 'REVIEWER', intent: 'OQ-003 step 13b: the author is not named on the route' });
      expectRefusal(expect, r, 403, 'ROUTE_NOT_NAMED', 'the REVIEWER signature from the author, whom the route does not name');
      expect((await signatures(api, state.docId)).length === 1, 'a signature was stored despite the refusal');
      const round = await routeRound(api, expect, state.docId);
      expect(round?.route?.status === 'open' && round.members.every((m) => m.outcome === 'pending'), 'the refused signature changed the route', round);
      return '403 ROUTE_NOT_NAMED before the credential; no signature stored; the route open, its reviewer pending';
    },
  );
}

/** OQ-AUTH-14. */
async function reviewSignatureStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-14',
      urs: ['URS-AUTH-010', 'URS-AUTH-011'],
      title: 'CREDENTIALED: the route\'s named reviewer applies a REVIEWER e-signature, re-verified by the ceremony and bound to the frozen snapshot',
      action: 'As OQ_SIGNER: GET /api/review/board; POST /docs/:id/e-sign {password, mfaToken (current code), meaning:"REVIEWER", intent}; GET /docs/:id/signatures',
      expected:
        'Before the signature the queue lists the document awaiting OQ_SIGNER\'s review. HTTP 200; two signatures — the OQ-AUTH-11 freeze (AUTHOR) and this one, with signer_email = OQ_SIGNER (the named reviewer), meaning REVIEWER, ' +
        'method password+mfa (password for an identity with no authenticator), pin_verified false, signature_digest and covered_content_hash present',
      dependsOn: ['OQ-AUTH-13'],
      note: 'Revised in OQ-003 v0.5 (RR5): the signer is the person the route names; until v0.4 it was the run identity, the document\'s author, which OQ-AUTH-13b now shows refused.',
    },
    async ({ api, apiAs, expect }) => {
      const asSigner = apiAs(state.signer.session);
      const before = await boardRow(asSigner, expect, state.docId);
      expect(before?.awaitingMyReview === true, 'before the signature the queue does not list the document awaiting the reviewer', before ?? 'not listed');
      const mfaToken = await signerCode(state.signer);
      const r = await asSigner('POST', `/api/authoring/docs/${state.docId}/e-sign`, {
        password: state.signer.password,
        ...(mfaToken ? { mfaToken } : {}),
        meaning: 'REVIEWER',
        intent: 'OQ-003 step 14: reviewed for validation',
      });
      expect(r.status === 200 && r.json?.signatureId, `expected 200 with a signatureId, got ${r.status}`, r.json);
      state.reviewSignatureId = r.json.signatureId;
      const sigs = await signatures(api, state.docId);
      // DP-35: the freeze in OQ-AUTH-11 is itself a signature (AUTHOR), so this one is the second.
      expect(sigs.length === 2 && sigs.some((x) => x.meaning === 'AUTHOR'), `expected the freeze's AUTHOR signature and this one, got ${sigs.length}`, sigs);
      const sig = sigs.find((x) => x.meaning === 'REVIEWER') ?? {};
      const method = mfaToken ? 'password+mfa' : 'password';
      expect(sig.id === r.json.signatureId && sig.signer_email === state.signer.email && sig.meaning === 'REVIEWER', 'signature attributes wrong', sig);
      expect(sig.method === method && sig.pin_verified === false, `the signature records method ${sig.method} (pin_verified ${sig.pin_verified}); expected ${method}, false`, sig);
      expect(sig.signature_digest && sig.covered_content_hash, 'signature not bound to a frozen snapshot', sig);
      return `signature ${sig.id} by ${sig.signer_email}, meaning ${sig.meaning}, method ${sig.method}, covers freeze v${sig.covered_freeze_version} (${String(sig.covered_content_hash).slice(0, 12)}…)`;
    },
  );
}

/** OQ-AUTH-14b. */
async function routeClosedStep(step, state) {
  await step(
    {
      id: 'OQ-AUTH-14b',
      urs: ['URS-AUTH-013'],
      title: 'CREDENTIALED: the review signature closes the reviewer\'s route task and completes the route; the Review board no longer has it awaiting them',
      action: 'GET /documents/:id/review-route; as OQ_SIGNER: GET /api/tasks/my-work, GET /api/review/board, GET /api/review/board?scope=mine',
      expected:
        'The route reads complete, its one reviewer signed with the OQ-AUTH-14 signature (meaning REVIEWER, their printed name); their route task is no longer in their open work; ' +
        'the queue row reads awaitingMyReview false with the signature\'s time (myReviewSignedAt, and routeSignedAt on their review request); the "mine" scope no longer lists the document',
      dependsOn: ['OQ-AUTH-14'],
      note: 'New in OQ-003 v0.5 (RR5, §2.8; closeAuthoringReviewerTask in server/services/authoring/authoring-review-route.ts, signedOnRoute in shared/authoring/peer-review.ts). The document stays on the queue: its approval workflow step (OQ-AUTH-17) is still pending.',
    },
    async ({ api, apiAs, expect }) => {
      const round = await routeRound(api, expect, state.docId);
      const member = expectRouteComplete(expect, round, { routeId: state.route.id, signerId: state.signerId, signatureId: state.reviewSignatureId });
      const asSigner = apiAs(state.signer.session);
      expect((await myRouteTask(asSigner, expect, state.route.taskId)) === undefined, 'the reviewer\'s route task is still in their open work');
      const row = await boardRow(asSigner, expect, state.docId);
      expectBoardSigned(expect, row, state.signerId);
      expect((await boardRow(asSigner, expect, state.docId, 'mine')) === undefined, 'the reviewer\'s "mine" scope still lists the document');
      return `route ${round.route.id} complete; ${member.signature.printedName} signed (${member.signature.id}); task ${state.route.taskId} closed; queue: awaitingMyReview false, signed ${row.myReviewSignedAt}; not in "mine"`;
    },
  );
}

/** OQ-AUTH-17 and OQ-AUTH-17b, after OQ-AUTH-10. */
export async function runReviewRequestSteps({ step, state }) {
  await requestStep(step, state);
  await boardBeforeStep(step, state);
}

/** OQ-AUTH-12 to OQ-AUTH-14b, after the OQ-AUTH-11 freeze. */
export async function runSignatureSteps({ step, state }) {
  for (const run of [pinStep, refusalStep, notNamedStep, reviewSignatureStep, routeClosedStep]) await run(step, state);
}
