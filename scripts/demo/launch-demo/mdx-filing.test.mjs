// GA-DEMO-10 and GA-DEMO-12 (docs/evidence/GA-READINESS/2026-11-10/ledger.json).
//
// 10. The device pack authored its 510(k) documents as working documents of the project. None was the filing's
//     editing copy, so the project's filing (its eSTAR outline, 38 sections) held no text, and the seeded
//     NeuroPanel-Dx export answered 422 NO_AUTHORED_CONTENT. The product's own way to write into a filing is a
//     document created naming it (POST /api/authoring/docs with c2c_document_id), then a section saved with a
//     reason. Shown in the running app on 2026-11-12: one section saved that way and the export answers 200.
// 12. The pack asks the leaf route whether it takes an eSTAR section code by placing a leaf. Since the route began
//     to answer 200, that leaf stayed: a seventh, a second copy of the device description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedFiling, removeProbeLeaf, FILING_TEXT } from './packs/mdx-filing.mjs';

const P = 'f20d85cb-d56e-4f7f-a2ae-ec5ffb2a7843';
const KEYS = ['A', 'A1', 'A5', 'B', 'B1', 'B2', 'B3', 'C', 'C1', 'C2', 'E', 'E3', 'E5', 'E7'];

function stand({ copyExists = false, filed = [] } = {}) {
  const calls = [];
  const state = {
    outline: KEYS.map((key) => ({ key, label: `Section ${key}`, has_content: filed.includes(key) })),
    docs: [{ id: 'summary', title: '[Demo · MDX] 510(k) Summary', c2c_document_id: null }, ...(copyExists ? [{ id: 'copy', title: 'the filing', c2c_document_id: 'doc_filing' }] : [])],
    sections: [],
  };
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.startsWith('/api/c2c/documents?')) return { status: 200, json: { documents: [{ id: 'doc_filing', title: 'NeuroPanel-Dx 510(k) — 510(k) × FDA', doc_type: 'k510' }] } };
    if (method === 'GET' && path === '/api/c2c/documents/doc_filing/outline') return { status: 200, json: { outline: state.outline } };
    if (method === 'GET' && path === '/api/authoring/docs') return { status: 200, json: { documents: state.docs } };
    if (method === 'POST' && path === '/api/authoring/docs') {
      if (body.c2c_document_id !== 'doc_filing' || body.client_program_id !== P) return { status: 400, text: 'not the filing' };
      state.docs.push({ id: 'copy', title: body.title, c2c_document_id: body.c2c_document_id });
      return { status: 201, json: { document: { id: 'copy', title: body.title, c2c_document_id: body.c2c_document_id }, governance: { bound: true, c2cDocumentId: 'doc_filing' } } };
    }
    if (method === 'GET' && path === '/api/authoring/docs/copy/sections') return { status: 200, json: { sections: state.sections } };
    if (method === 'POST' && path === '/api/authoring/sections') { const s = { id: `s-${body.code}`, code: body.code, content: body.content }; state.sections.push(s); return { status: 201, json: { section: s } }; }
    if (method === 'PATCH' && path.startsWith('/api/authoring/sections/')) {
      // As the server: a save with no reason is refused, and only a save files the text.
      if (!body.changeReason || body.changeReason.length < 8) return { status: 400, text: 'A reason for change of at least 8 characters is required.' };
      const s = state.sections.find((x) => x.id === path.split('/').pop());
      state.outline.find((o) => o.key === s.code).has_content = true;
      return { status: 200, json: { success: true, filing: { committed: true, documentId: 'doc_filing', sectionKey: s.code } } };
    }
    return { status: 404, text: `not in the stand-in: ${method} ${path}` };
  };
  return { api, calls, state, run: { record() {}, note() {} } };
}

test('the pack creates the filing\'s editing copy, naming the filing, and files each section with a reason', async () => {
  const s = stand();
  await seedFiling({ api: s.api, run: s.run }, P);
  const created = s.calls.filter((c) => c.method === 'POST' && c.path === '/api/authoring/docs');
  assert.equal(created.length, 1);
  assert.equal(created[0].body.c2c_document_id, 'doc_filing');
  const filed = s.state.outline.filter((o) => o.has_content).map((o) => o.key);
  assert.deepEqual(filed, FILING_TEXT.map((t) => t.key).sort(), 'every section the pack has text for is in the filing');
  for (const c of s.calls.filter((x) => x.method === 'PATCH')) assert.ok(c.body.changeReason.length >= 8 && c.body.content.length > 40);
});

test('every section the pack files is filled from text the pack already authors, and names a real filing section', () => {
  for (const t of FILING_TEXT) {
    assert.ok(KEYS.includes(t.key), `${t.key} is in the filing's outline`);
    assert.match(t.content(), /<p>|<table>/, `${t.key} has text`);
  }
  assert.ok(FILING_TEXT.length >= 6);
});

test('a second run finds the copy and the filed sections, and writes nothing', async () => {
  const s = stand({ copyExists: true, filed: FILING_TEXT.map((t) => t.key) });
  const said = await seedFiling({ api: s.api, run: s.run }, P);
  assert.deepEqual(s.calls.filter((c) => c.method !== 'GET'), []);
  assert.match(said, /already/);
});

test('a run stopped part way is finished: a section created but not yet filed is saved', async () => {
  const s = stand({ copyExists: true, filed: FILING_TEXT.slice(1).map((t) => t.key) });
  const first = FILING_TEXT[0].key;
  s.state.sections.push({ id: `s-${first}`, code: first, content: 'x' });
  await seedFiling({ api: s.api, run: s.run }, P);
  assert.deepEqual(s.calls.filter((c) => c.method === 'POST'), [], 'the section is not created twice');
  assert.equal(s.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.ok(s.state.outline.find((o) => o.key === first).has_content);
});

test('the eSTAR section-code probe leaves no leaf placed, and a leaf an earlier run left is removed', async () => {
  const calls = [];
  const leaves = [
    { id: 11, sectionCode: '3.2.P.1' }, { id: 12, sectionCode: 'estar.device-description' }, { id: 13, section_code: '1.14' },
  ];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET') return { status: 200, json: leaves };
    if (method === 'DELETE') {
      if (!body?.reason || body.reason.length < 8) return { status: 400, text: 'REASON_REQUIRED' };
      return { status: 204, json: null };
    }
    return { status: 404, text: 'not in the stand-in' };
  };
  const removed = await removeProbeLeaf({ api }, 7, 'estar.device-description');
  assert.equal(removed, 1);
  assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.path), ['/api/submissions/sequences/7/leaves/12']);
});
