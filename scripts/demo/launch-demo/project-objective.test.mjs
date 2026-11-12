// GA-DEMO-15 (docs/evidence/GA-READINESS/2026-11-10/ledger.json): C2C-101, C2C-201 and NeuroPanel-Dx had no charter
// objective; only the Lumen and Faux projects did. A project's About card then says "No objective is recorded for
// this project yet", and S11's plan and the goal-led views have nothing to read. The Lumen pack recorded one through
// the About card's own route; that step is now shared, and each pack records its project's objective from text the
// pack already holds, with that text named as the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureObjective } from './packs/biotech-shared.mjs';
import { C2C101_OBJECTIVE } from './packs/biotech-content.mjs';
import { C2C201_OBJECTIVE } from './packs/biotech-work-content.mjs';
import { NEUROPANEL_OBJECTIVE } from './packs/mdx-content.mjs';
import { VAULT_DOCS } from './packs/biotech-content.mjs';
import { INTENDED_USE } from './packs/mdx-content.mjs';

function stand(current = null) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET') return { status: 200, json: { data: { current } } };
    if (method === 'PUT') return { status: 200, json: { data: { current: body } } };
    return { status: 404 };
  };
  const counts = { found: 0, created: 0 };
  return { calls, ctx: { api, run: { step: async (_n, fn) => fn() }, tally: { found: () => counts.found++, created: () => counts.created++ } }, counts };
}

test('a project with no objective gets one, with its source and a reason, through the About card\'s route', async () => {
  const s = stand(null);
  await ensureObjective(s.ctx, { id: 'p-1' }, C2C101_OBJECTIVE);
  const put = s.calls.find((c) => c.method === 'PUT');
  assert.equal(put.path, '/api/charters/by-project/p-1/objectives');
  assert.deepEqual(Object.keys(put.body).sort(), ['objective', 'reason', 'sources', 'successCriteria']);
  assert.ok(put.body.sources.length >= 1 && put.body.reason.length >= 8);
  assert.equal(s.counts.created, 1);
});

test('a recorded objective is left as it is: a person may have changed it', async () => {
  const s = stand({ objective: 'Changed by a person' });
  await ensureObjective(s.ctx, { id: 'p-1' }, C2C101_OBJECTIVE);
  assert.deepEqual(s.calls.filter((c) => c.method !== 'GET'), []);
  assert.equal(s.counts.found, 1);
});

test('each objective is text the pack already holds, not new prose', () => {
  const synopsis = VAULT_DOCS.find((d) => d.key === 'protocol').pdf.sections.find((x) => x.heading === '1. Synopsis').paragraphs.join(' ');
  assert.ok(synopsis.includes(C2C101_OBJECTIVE.objective), 'C2C-101: the protocol synopsis states it');
  assert.ok(synopsis.includes(C2C101_OBJECTIVE.successCriteria.replace(/^Primary endpoint: /, '').replace(/\.$/, '')), 'C2C-101: the synopsis states the endpoint');
  assert.ok(NEUROPANEL_OBJECTIVE.objective.includes(INTENDED_USE), 'NeuroPanel-Dx: its intended use, as the 510(k) Summary states it');
  assert.match(C2C201_OBJECTIVE.sources[0].title, /no protocol/i, 'C2C-201 has no protocol in the pack, and its source says so');
  for (const o of [C2C101_OBJECTIVE, C2C201_OBJECTIVE, NEUROPANEL_OBJECTIVE]) assert.ok(o.sources.every((x) => ['protocol', 'registry', 'publication', 'press_release', 'data_room', 'other'].includes(x.kind)));
});
