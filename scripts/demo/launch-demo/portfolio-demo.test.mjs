/**
 * The opt-in CSR portfolio pack's pure parts: fictional, prefixed, unique,
 * internally consistent synthetic numbers, and never part of "--pack all".
 * No server, database, browser or signature.
 *
 * node --test scripts/demo/launch-demo/portfolio-demo.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEMO_PREFIX, sha256 } from './lib.mjs';
import { ALL_HEADINGS, COMPANIES, HALCYRA_IR_LETTER, STAGES, STUDIES, buildCsrSource, companyOf, narrative, primaryEndpointName, sourceCounts, stageTasks } from './packs/portfolio-content.mjs';
import { csrDocTitle, headingsFor, mapHeadings, needsSource, objectiveFor, plannedTitles, projectTitle, seed, sourceBytes } from './packs/portfolio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('portfolio has its own prefix and every planned record title carries it', () => {
  assert.equal(DEMO_PREFIX.portfolio, '[Demo · Portfolio]');
  const titles = plannedTitles();
  assert.ok(titles.length >= 50);
  for (const t of titles) assert.ok(t.startsWith('[Demo · Portfolio] '), t);
});

test('idempotency keys (exact titles) are unique across the pack', () => {
  const titles = plannedTitles();
  assert.equal(new Set(titles).size, titles.length);
  for (const s of STUDIES) {
    const tasks = stageTasks(s).map((t) => t.title);
    assert.equal(new Set(tasks).size, tasks.length, s.key);
  }
});

test('four fictional companies, eight studies, one per stage a..h, each labelled fictional and synthetic', () => {
  assert.equal(COMPANIES.length, 4);
  for (const c of COMPANIES) assert.match(c.name, /\(fictional\)$/);
  assert.deepEqual(STUDIES.map((s) => s.stage), Object.keys(STAGES));
  for (const c of COMPANIES) assert.equal(STUDIES.filter((s) => s.company === c.key).length, 2, c.key);
  for (const s of STUDIES) {
    assert.match(projectTitle(s), /\(fictional\).*SYNTHETIC$/);
    assert.match(csrDocTitle(s), /\(fictional\)$/);
    assert.match(objectiveFor(s), /^FICTIONAL demonstration project \(SYNTHETIC/);
    assert.ok(objectiveFor(s).length <= 4000);
    assert.ok(['csr', 'ind'].includes(s.programType));
  }
  // Only the stages that file need an IND project (a csr project has no submission spine).
  assert.deepEqual(STUDIES.filter((s) => s.programType === 'ind').map((s) => s.stage), ['g', 'h']);
});

test('every synthetic source reconciles with its study arms, the contract enums and itself', () => {
  for (const s of STUDIES.filter(needsSource)) {
    const src = buildCsrSource(s);
    assert.equal(src.format, 'concept2cure.csr-source.v1');
    assert.match(src.dataCutDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(src.studyInfo.sponsor, /fictional/);
    assert.equal(src.studyInfo.sampleSize, s.arms.reduce((a, b) => a + b.n, 0));
    assert.equal(src.participants.length, src.studyInfo.sampleSize);
    assert.equal(src.studyData.disposition.length, src.participants.length);
    assert.equal(src.studyData.demographics.length, src.participants.length);
    assert.equal(new Set(src.participants.map((p) => p.subjectId)).size, src.participants.length);
    const counts = sourceCounts(src);
    for (const a of s.arms) {
      assert.deepEqual(counts[a.armId], { n: a.n, completed: a.completed, teae: a.teae, sae: a.sae, aeDisc: a.aeDisc }, `${s.key} ${a.armId}`);
      const arm = src.studyData.treatmentArms.find((t) => t.armId === a.armId);
      assert.deepEqual(arm.populations, { safety: a.n, itt: a.n, completed: a.completed });
      const eff = src.studyData.efficacy.find((e) => e.armId === a.armId && e.endpointName === primaryEndpointName(s));
      assert.equal(eff.display, `${a.responders}/${a.n} (${(Math.round((1000 * a.responders) / a.n) / 10).toFixed(1)}%)`);
      assert.ok(a.responders <= a.n && a.completed <= a.n && a.teae <= a.n && a.sae <= a.teae - a.aeDisc && a.aeDisc <= a.n - a.completed);
    }
    // The contract: a primary result matching studyInfo, event-level discontinuation flags only.
    assert.ok(src.studyData.efficacy.some((e) => e.endpointType === 'primary' && e.endpointName === src.studyInfo.primaryEndpoint), s.key);
    assert.equal(src.studyData.aeDiscontinuationBasis, 'event');
    for (const e of src.studyData.adverseEvents) {
      assert.ok(['mild', 'moderate', 'severe'].includes(e.severity));
      assert.ok(['related', 'unrelated', 'unknown'].includes(e.related));
      assert.ok(['recovered', 'recovering', 'not-recovered', 'fatal', 'unknown'].includes(e.outcome));
      assert.notEqual(e.outcome, 'fatal');
    }
    for (const d of src.studyData.disposition) assert.ok(['completed', 'discontinued'].includes(d.status));
    // Deterministic bytes: the Vault idempotency check compares SHA-256 across runs.
    assert.equal(sha256(sourceBytes(s)), sha256(sourceBytes(s)));
    assert.ok(sourceBytes(s).length < 5 * 1024 * 1024);
  }
});

test('narrative numbers are the study\'s own numbers and say they are synthetic', () => {
  for (const s of STUDIES.filter(needsSource)) {
    const text = narrative(s);
    for (const v of Object.values(text)) assert.match(v, /SYNTHETIC demonstration data, fictional sponsor; not clinical evidence/);
    for (const a of s.arms) {
      assert.ok(text.efficacy.includes(`${a.responders}/${a.n}`), `${s.key} efficacy`);
      assert.ok(text.safety.includes(`${a.teae}/${a.n}`), `${s.key} safety`);
    }
    const entered = s.randomized === false ? 'enrolled' : 'randomized';
    assert.ok(text.synopsis.includes(`${s.arms.reduce((x, y) => x + y.n, 0)} participants were ${entered}`));
    assert.match(text.titlePage, new RegExp(`Sponsor: ${companyOf(s).name.replace(/[()]/g, '\\$&')}`), `${s.key} title page names the sponsor`);
    assert.match(text.titlePage, /SYNTHETIC — not clinical evidence/);
    assert.match(text.titlePage, /signature/i);
  }
});

test('a non-randomized study never says it was randomized (PTR-022-102, open-label sequential cohorts)', () => {
  const s = STUDIES.find((x) => x.key === 'ptr022-102');
  assert.equal(s.randomized, false);
  for (const [key, v] of Object.entries(narrative(s))) assert.doesNotMatch(v, /\b(were|was) randomi[sz]ed|randomi[sz]ation was|all randomi[sz]ed|\bITT\b/i, `${key} claims randomization`);
  assert.match(narrative(s).plan, /full analysis set \(all enrolled and dosed participants\)/);
});

test('a resolved comment that claims an edit points at text that exists; open comments point at existing passages', () => {
  const f = STUDIES.find((x) => x.key === 'ptr022-102');
  assert.match(narrative(f).safety, /ADA-positive/);
  const e = STUDIES.find((x) => x.key === 'crv310-201');
  assert.match(narrative(e).safety, /pneumonitis/i);
  assert.match(narrative(e).discussion, /dose justification/i);
});

test('no stage claims the CSR was filed: stage h is a fictional information-request scenario', () => {
  const h = STUDIES.find((x) => x.stage === 'h');
  const words = [STAGES.h, ...stageTasks(h).map((t) => `${t.title} ${t.description}`), HALCYRA_IR_LETTER.text].join('\n');
  assert.doesNotMatch(words, /filed CSR|submitted in Module|post-filing/i);
  assert.match(STAGES.h, /scenario/i);
  assert.match(STAGES.h, /not placed/i);
});

test('stage d drafts some headings, e..h all eight, a..c none; e has open comments, f none open', () => {
  const by = Object.fromEntries(STUDIES.map((s) => [s.stage, s]));
  assert.equal(headingsFor(by.a).length + headingsFor(by.b).length + headingsFor(by.c).length, 0);
  assert.ok(headingsFor(by.d).length > 0 && headingsFor(by.d).length < 8);
  for (const k of ['e', 'f', 'g', 'h']) assert.equal(headingsFor(by[k]).length, ALL_HEADINGS.length);
  assert.ok(by.e.comments.filter((c) => !c.resolution).length >= 3);
  assert.ok(by.f.comments.length > 0 && by.f.comments.every((c) => c.resolution));
  // No task claims work the product refused: placement and signature tasks are not completed.
  for (const k of ['f', 'g', 'h']) {
    for (const t of stageTasks(by[k]).filter((x) => /5\.3\.5\.1|signature|freeze/i.test(x.title))) assert.notEqual(t.status, 'completed', t.title);
  }
});

test('mapHeadings picks the first matching template section by order and never maps one section twice', () => {
  const map = mapHeadings([
    { id: 's2', code: 'c2', title: '2. Synopsis', order_index: 2, content: '' },
    { id: 's9', code: 'c9', title: '9. Investigational Plan', order_index: 9, content: '<p>x</p>' },
    { id: 's1', code: 'c1', title: '1. Title Page', order_index: 1, content: '' },
    { id: 's12', code: 'c12', title: '12. Safety Evaluation', order_index: 12, content: '' },
  ]);
  assert.equal(map.synopsis.id, 's2');
  assert.equal(map.plan.empty, false);
  assert.equal(map.safety.id, 's12');
  assert.equal(map.introduction, undefined);
});

test('seed.mjs registers portfolio as opt-in: excluded from --pack all exactly like faux', () => {
  const src = readFileSync(path.join(HERE, 'seed.mjs'), 'utf8');
  assert.match(src, /const PACKS = \['biotech', 'mdx', 'lumen', 'faux', 'portfolio'\];/);
  assert.match(src, /const OPT_IN = \['faux', 'portfolio'\];/);
  assert.match(src, /chosen === 'all' \? PACKS\.filter\(pack => !OPT_IN\.includes\(pack\)\)/);
  const PACKS = ['biotech', 'mdx', 'lumen', 'faux', 'portfolio'];
  const OPT_IN = ['faux', 'portfolio'];
  assert.deepEqual(PACKS.filter((p) => !OPT_IN.includes(p)), ['biotech', 'mdx', 'lumen']);
});

test('CLI refuses portfolio mixed with another pack before connecting', () => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'seed.mjs'), '--pack', 'portfolio,biotech'],
    { encoding: 'utf8', env: { ...process.env, DEMO_SEED_TOKEN: '', DEMO_SEED_EMAIL: '' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--pack portfolio must run alone/);
});

test('seed reads only, and writes nothing, when the canonical CSR template is unavailable', async () => {
  const calls = [];
  const api = async (method, url) => { calls.push({ method, url }); return { status: 200, json: { templates: [] }, text: '' }; };
  const run = { step: async (_t, fn) => fn(), record() {}, note() {}, write() {} };
  await assert.rejects(seed({ api, run, baseUrl: 'http://x', identity: { email: 'a@b.c', organizationName: 'Org' } }), /canonical CSR template/);
  assert.ok(calls.length > 0 && calls.every((c) => c.method === 'GET'));
});
