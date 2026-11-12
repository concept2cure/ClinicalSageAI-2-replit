// GA-DEMO-11 (docs/evidence/GA-READINESS/2026-11-10/ledger.json) and the hand-off in COORDINATION.md "the demo seed's
// owner": the device pack asked the second signer to review the 510(k) Summary, and that same person then froze and
// approved it. Where an organisation has more than one member, the person who reviewed a version does not approve it
// (P-95 as clarified 2026-11-09, P-116). The product does not refuse it yet (GA-ADV-01), so the seed worked, and would
// have stopped on the day the product follows the decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryPeople, reviewAndFreezeSummary, signSummary } from './packs/mdx.mjs';

/** One server, three people. Every call is recorded with who made it. */
function stand() {
  const calls = [];
  const state = { status: 'DRAFT', reviews: [], signatures: [], frozen: null };
  const as = (email) => async (method, path, body) => {
    calls.push({ email, method, path, body });
    if (method === 'GET' && path.endsWith('/reviews')) return { status: 200, json: { reviews: state.reviews } };
    if (method === 'POST' && path.endsWith('/request-review')) { state.reviews.push({ reviewer_email: body.reviewers[0].email }); return { status: 201, json: {} }; }
    if (method === 'GET' && path.endsWith('/signatures')) return { status: 200, json: { signatures: state.signatures } };
    if (method === 'POST' && path.endsWith('/e-sign')) { state.signatures.push({ id: state.signatures.length + 1, signer_email: email, meaning: body.meaning, reason: body.intent, covered_freeze_version: '1.0' }); return { status: 200, json: {} }; }
    if (method === 'POST' && path.endsWith('/submit')) { state.status = 'IN_REVIEW'; return { status: 201, json: {} }; }
    if (method === 'GET' && path.endsWith('/workflow')) return { status: 200, json: { steps: [{ role: 'QA', status: 'pending' }] } };
    if (method === 'GET' && path.endsWith('/frozen')) return state.frozen ? { status: 200, json: state.frozen } : { status: 404, json: {} };
    if (method === 'POST' && path.endsWith('/freeze')) { state.frozen = { version: '1.0', contentHash: 'ab'.repeat(32), frozenAt: '2026-11-12T00:00:00Z', frozenBy: email }; state.status = 'FROZEN'; return { status: 200, json: {} }; }
    return { status: 404, text: `not in the stand-in: ${method} ${path}` };
  };
  const person = (email, id) => ({ email, password: 'pw', userId: id, session: { user: { id, displayName: email.split('@')[0] } }, api: as(email) });
  const run = { record() {}, note() {} };
  return { calls, state, run, author: as('ana.author@example.test'), second: person('ava.approver@example.test', 3), third: person('rhea.reviewer@example.test', 2) };
}
const doc = () => ({ id: 'doc-1', status: 'DRAFT', sections: [] });
const signed = (s, meaning) => s.state.signatures.filter((x) => x.meaning === meaning).map((x) => x.signer_email);

test('with three people, the third reviews and seals the 510(k) Summary and the second approves it', async () => {
  const s = stand();
  const people = summaryPeople(s.second, s.third);
  await reviewAndFreezeSummary({ api: s.author, run: s.run }, doc(), people.reviewer);
  await signSummary({ api: s.author, run: s.run }, 'doc-1', people.approver);
  assert.deepEqual(s.state.reviews, [{ reviewer_email: 'rhea.reviewer@example.test' }], 'the review is asked of the third person');
  assert.deepEqual(signed(s, 'REVIEWER'), ['rhea.reviewer@example.test']);
  assert.equal(s.state.frozen.frozenBy, 'rhea.reviewer@example.test');
  assert.deepEqual(signed(s, 'APPROVER'), ['ava.approver@example.test']);
  const both = signed(s, 'REVIEWER').filter((e) => signed(s, 'APPROVER').includes(e));
  assert.deepEqual(both, [], 'nobody reviews and approves the same version');
});

test('with two people, the second reviews and seals, and nobody approves: the step says why', async () => {
  const s = stand();
  const people = summaryPeople(s.second, null);
  assert.equal(people.approver, null);
  await reviewAndFreezeSummary({ api: s.author, run: s.run }, doc(), people.reviewer);
  const said = await signSummary({ api: s.author, run: s.run }, 'doc-1', people.approver, people);
  assert.deepEqual(signed(s, 'REVIEWER'), ['ava.approver@example.test']);
  assert.deepEqual(signed(s, 'APPROVER'), [], 'the reviewer did not approve');
  assert.match(said, /not executed/);
  assert.match(said, /reviewed|third person/i);
});

test('with nobody but the author, nothing is asked or signed, as before', async () => {
  const s = stand();
  const people = summaryPeople(null, null);
  const said = await reviewAndFreezeSummary({ api: s.author, run: s.run }, doc(), people.reviewer);
  assert.match(said, /not executed/);
  assert.deepEqual(s.calls.filter((c) => c.method === 'POST'), []);
});
