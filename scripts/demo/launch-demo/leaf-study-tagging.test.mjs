// A study document placed in a Module 4 or 5 study section must name its study and its STF file-tag, or FDA
// validation 1789 refuses the package: LMN-201's protocol, consent form and toxicity report were placed with neither,
// so "Download an inspection copy" could never return a package (2026-11-10). The seed places them tagged, and tags
// the ones an earlier run placed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureLeaves } from './packs/biotech-submission.mjs';

function stand(existing = []) {
  const puts = [];
  const leaves = existing.map((l, i) => ({ id: i + 1, updatedAt: '2026-11-10T07:00:00.000Z', studyId: null, stfFileTag: null, ...l }));
  const api = async (method, path, body) => {
    if (method === 'GET' && path.endsWith('/leaves')) return { status: 200, json: leaves };
    if (method === 'PUT' && path.endsWith('/leaves')) {
      puts.push(body);
      if (body.leafId) Object.assign(leaves.find((l) => l.id === body.leafId), { studyId: body.studyId, stfFileTag: body.stfFileTag });
      else leaves.push({ id: leaves.length + 1, sectionCode: body.sectionCode, title: body.title, documentUuid: body.documentUuid, studyId: body.studyId ?? null, stfFileTag: body.stfFileTag ?? null });
      return { status: 200, json: {} };
    }
    return { status: 404, text: 'not in the stand-in' };
  };
  const ctx = { api, tally: { found() {}, created() {} } };
  return { ctx, puts, rec: { sequence: { id: 9 } } };
}
const PROTOCOL = { id: 'doc-1', key: 'protocol', sectionCode: '5.3.5.1', leafTitle: 'Protocol', studyId: 'LMN-201-CDI02', stfFileTag: 'protocol-or-amendment' };
const BROCHURE = { id: 'doc-2', key: 'ib', sectionCode: '1.14.4.1', leafTitle: "Investigator's Brochure" };

test('a study document is placed with its study id and file-tag; another document carries neither', async () => {
  const { ctx, puts, rec } = stand();
  await ensureLeaves(ctx, rec, [PROTOCOL, BROCHURE]);
  assert.deepEqual(puts.map((b) => [b.sectionCode, b.studyId, b.stfFileTag]),
    [['5.3.5.1', 'LMN-201-CDI02', 'protocol-or-amendment'], ['1.14.4.1', undefined, undefined]]);
});

test('a leaf an earlier run placed untagged is tagged, against the values it was read with', async () => {
  const { ctx, puts, rec } = stand([{ sectionCode: '5.3.5.1', title: 'Protocol', documentUuid: 'doc-1' }]);
  await ensureLeaves(ctx, rec, [PROTOCOL]);
  assert.equal(puts.length, 1);
  assert.deepEqual({ leafId: puts[0].leafId, studyId: puts[0].studyId, stfFileTag: puts[0].stfFileTag, edit: puts[0].studyTaggingEdit },
    { leafId: 1, studyId: 'LMN-201-CDI02', stfFileTag: 'protocol-or-amendment',
      edit: { expectedStudyId: null, expectedStfFileTag: null, expectedUpdatedAt: '2026-11-10T07:00:00.000Z' } });
});

test('a leaf that already names a study is left as a person set it', async () => {
  const { ctx, puts, rec } = stand([{ sectionCode: '5.3.5.1', title: 'Protocol', documentUuid: 'doc-1', studyId: 'SET-BY-A-PERSON', stfFileTag: 'protocol-or-amendment' }]);
  await ensureLeaves(ctx, rec, [PROTOCOL]);
  assert.deepEqual(puts, []);
});
