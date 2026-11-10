// The demo seed runs again whenever scripts/demo changes (.devcontainer/post-start.sh). Once a second signer is
// supplied, a document a previous run froze or approved is past review, and the server refuses a review request on it
// (authoring-permissions.ts IMMUTABLE_DOCUMENT_STATUSES: AUTHORING_DOCUMENT_IMMUTABLE). On 2026-11-10 that refusal
// stopped the biotech and device packs on every start of an existing Codespace ("The demo seed did not finish").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureReview } from './packs/biotech-authoring.mjs';
import { ensureReviewRequested } from './packs/mdx.mjs';

/** The server's answers: no review on record yet, and a review request refused on a document past review. */
function stand(status) {
  const posts = [];
  const api = async (method, path) => {
    if (method === 'GET' && path.endsWith('/reviews')) return { status: 200, json: { reviews: [] } };
    if (method === 'POST' && path.endsWith('/request-review')) {
      posts.push(path);
      if (['FROZEN', 'APPROVED'].includes(status)) return { status: 409, text: `{"error":{"code":"AUTHORING_DOCUMENT_IMMUTABLE","message":"Document status ${status} does not permit this action."}}` };
      return { status: 201, json: { reviews: [{ reviewer_email: 'ava.approver@example.test', review_status: 'pending' }] } };
    }
    if (method === 'GET' && path.endsWith('/workflow')) return { status: 200, json: { steps: [] } };
    if (method === 'POST' && path.endsWith('/submit')) return { status: 201, json: {} };
    return { status: 404, text: 'not in the stand-in' };
  };
  return { api, posts };
}
const signer = { email: 'ava.approver@example.test', session: { user: { id: 3, displayName: 'Ava Approver' } } };
const tally = { found() {}, created() {} };

for (const status of ['FROZEN', 'APPROVED']) {
  test(`biotech: a ${status} document from a previous run is found, and no review is requested`, async () => {
    const { api, posts } = stand(status);
    const docRec = { id: 'doc-1', status };
    const said = await ensureReview({ api, tally, signer, me: { id: 1, email: 'ana@example.test' } }, { key: 'synopsis', role: 'in-review' }, docRec);
    assert.deepEqual(posts, []);
    assert.match(said, new RegExp(`already ${status.toLowerCase()}`));
  });

  test(`device: a ${status} 510(k) Summary from a previous run is found, and no review is requested`, async () => {
    const { api, posts } = stand(status);
    const requested = await ensureReviewRequested({ api }, { id: 'doc-2', status }, { email: 'ava.approver@example.test' });
    assert.equal(requested, false);
    assert.deepEqual(posts, []);
  });
}

test('a draft is still sent for review, so the first run is unchanged', async () => {
  const { api, posts } = stand('DRAFT');
  const docRec = { id: 'doc-3', status: 'DRAFT' };
  await ensureReview({ api, tally, signer, me: { id: 1, email: 'ana@example.test' } }, { key: 'synopsis', role: 'reviewed' }, docRec);
  assert.equal(posts.length, 1);
  const device = stand('DRAFT');
  assert.equal(await ensureReviewRequested({ api: device.api }, { id: 'doc-4', status: 'DRAFT' }, { email: 'ava.approver@example.test' }), true);
  assert.equal(device.posts.length, 1);
});
