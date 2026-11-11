// P-122 (2026-11-10): the demo seed completes a real review round, so a seeded document can be approved live.
//
// Since P-95 (33c3e4de9) an approval is refused 409 REVIEW_REQUIRED until the document's latest review route names
// a reviewer and every reviewer has signed. With no second signer supplied (OQ_SIGNER_*), the seed requested no
// review at all ("not executed — signer credential not supplied"), so every seeded document refused approval in a
// demo. Now the seed adds a synthetic reviewer through the product (POST /api/tenant-users, then the activation
// link the server hands back), and that reviewer signs the review over the document's text.
//
// Pinned: the reviewer is an @example.test address; the password never reaches the seed's recorded API traffic;
// the round is requested naming the reviewer and signed REVIEWER by them; a reviewer whose password this run does
// not hold is said, never faked.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSyntheticReviewer, SYNTHETIC_REVIEWER } from './lib.mjs';
import { ensureReview } from './packs/biotech-authoring.mjs';

const BASE = 'http://stand-in.invalid';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** The server's unauthenticated doors the helper uses: the activation link and the development sign-in. */
function serveDoors(seen) {
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(BASE, '');
    seen.push({ path, body: init.body ? JSON.parse(init.body) : null });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
    if (path === '/api/auth/reset-password') return json(200, { success: true });
    if (path === '/api/auth/dev-login') return json(200, { accessToken: 'stand-in-token' });
    if (path === '/api/v1/auth/session') return json(200, { authenticated: true, user: { id: 41, email: SYNTHETIC_REVIEWER.email, displayName: 'Demo Reviewer (synthetic)' } });
    return json(404, {});
  };
}

/** The seed identity's API: the member list, and adding a member (the server returns the link when it sends no email). */
function adminApi(members) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path === '/api/tenant-users/5') return { status: 200, json: members };
    if (method === 'POST' && path === '/api/tenant-users') {
      return { status: 201, json: { id: 41, email: body.email, invitation: { delivery: 'link', setupUrl: `${BASE}/concept2cure/password-reset?token=one-time-token` } } };
    }
    return { status: 404, text: 'not in the stand-in' };
  };
  return { api, calls };
}

test('the seed adds a synthetic @example.test reviewer through the product and sets its password from the activation link', async () => {
  const seen = [];
  serveDoors(seen);
  const { api, calls } = adminApi([{ id: 1, email: 'rr5-author@example.test' }]);
  const reviewer = await ensureSyntheticReviewer({ api, baseUrl: BASE, identity: { organizationId: 5 } });
  assert.match(SYNTHETIC_REVIEWER.email, /@example\.test$/);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/tenant-users/5', 'POST /api/tenant-users']);
  assert.deepEqual(calls[1].body, { email: SYNTHETIC_REVIEWER.email, name: SYNTHETIC_REVIEWER.name, role: 'reviewer', organizationId: 5 });
  const reset = seen.find((s) => s.path === '/api/auth/reset-password');
  assert.equal(reset.body.token, 'one-time-token');
  assert.equal(reviewer.state, 'created');
  assert.equal(reviewer.password, reset.body.newPassword);
  assert.ok(reviewer.password.length >= 20);
  // The password is in no call the seed records.
  assert.equal(JSON.stringify(calls).includes(reviewer.password), false);
});

test('on a later run the reviewer is found, and the seed says it cannot sign rather than inventing a password', async () => {
  serveDoors([]);
  const { api, calls } = adminApi([{ id: 41, email: SYNTHETIC_REVIEWER.email }]);
  const reviewer = await ensureSyntheticReviewer({ api, baseUrl: BASE, identity: { organizationId: 5 } });
  assert.deepEqual(calls.map((c) => c.method), ['GET']);
  assert.equal(reviewer.state, 'found');
  assert.equal(reviewer.password, null);
  assert.match(reviewer.note, /password is never kept/);
});

/** The document's routes: no review yet, the request, the signatures and the review signature. */
function docApi(signed) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.endsWith('/reviews')) return { status: 200, json: { reviews: [] } };
    if (method === 'POST' && path.endsWith('/request-review')) {
      return { status: 201, json: { reviews: [{ reviewer_email: body.reviewers[0].email, review_status: 'pending' }] } };
    }
    if (method === 'GET' && path.endsWith('/signatures')) return { status: 200, json: { signatures: signed } };
    if (method === 'POST' && path.endsWith('/e-sign')) return { status: 200, json: { success: true } };
    return { status: 404, text: 'not in the stand-in' };
  };
  return { api, calls };
}
const tally = { found() {}, created() {} };
const notes = [];
const run = { note: (n) => notes.push(n) };
const me = { id: 1, email: 'rr5-author@example.test' };
const spec = { key: 'clinical-overview', name: 'Module 2.5 Clinical Overview — C2C-101', role: 'in-review' };

test('with no second signer, the synthetic reviewer is named on the round and signs it REVIEWER: the round is complete', async () => {
  const author = docApi([]);
  const reviewerSide = docApi([]);
  const reviewer = { email: SYNTHETIC_REVIEWER.email, password: 'held-in-memory', api: reviewerSide.api, session: { user: { id: 41, displayName: 'Demo Reviewer (synthetic)' } } };
  const docRec = { id: 'doc-25', status: 'DRAFT' };
  const said = await ensureReview({ api: author.api, tally, run, me, signer: null, reviewer }, spec, docRec);
  const request = author.calls.find((c) => c.path.endsWith('/request-review'));
  assert.equal(request.body.reviewers[0].email, SYNTHETIC_REVIEWER.email);
  const sign = reviewerSide.calls.find((c) => c.path.endsWith('/e-sign'));
  assert.equal(sign.body.meaning, 'REVIEWER');
  assert.equal(sign.body.password, 'held-in-memory');
  assert.match(said, /round is complete/);
  // The author never signs the review, and no approval is given by the seed.
  assert.equal(author.calls.some((c) => c.path.endsWith('/e-sign')), false);
  assert.equal(reviewerSide.calls.some((c) => c.body?.meaning === 'APPROVER'), false);
});

test('a reviewer this run cannot sign for leaves the round open, and says so', async () => {
  const author = docApi([]);
  const reviewerSide = docApi([]);
  const reviewer = { email: SYNTHETIC_REVIEWER.email, password: null, note: 'it was added on an earlier run, and its password is never kept', api: reviewerSide.api, session: { user: { id: 41 } } };
  const said = await ensureReview({ api: author.api, tally, run, me, signer: null, reviewer }, spec, { id: 'doc-26', status: 'DRAFT' });
  assert.equal(reviewerSide.calls.some((c) => c.path.endsWith('/e-sign')), false);
  assert.match(said, /review not signed — it was added on an earlier run/);
});
