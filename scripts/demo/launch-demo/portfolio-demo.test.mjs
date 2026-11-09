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
// Namespace imports for the sponsor-workspace parts, so a pack without them fails these cases, not the file.
import * as content from './packs/portfolio-content.mjs';
import * as pack from './packs/portfolio.mjs';
import { SUPPLIERS as LUMEN_SUPPLIERS } from './packs/lumen-qms-content.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const firstWord = (name) => String(name).trim().split(/\s+/)[0].toLowerCase();

test('each fictional sponsor is its own client workspace, named "(fictional demo)", one per company', () => {
  const ws = content.SPONSOR_WORKSPACES;
  assert.ok(Array.isArray(ws), 'portfolio-content.mjs exports SPONSOR_WORKSPACES');
  assert.equal(ws.length, COMPANIES.length);
  assert.deepEqual(ws.map((w) => w.key), COMPANIES.map((c) => c.key));
  for (const w of ws) {
    assert.match(w.name, /\(fictional demo\)$/, w.name);
    assert.match(w.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, w.slug);
    assert.doesNotMatch(w.name, /concept2cure/i, 'never the organisation\'s own workspace');
    assert.equal(firstWord(w.name), firstWord(COMPANIES.find((c) => c.key === w.key).name), `${w.key} workspace is named for its company`);
  }
  assert.equal(new Set(ws.map((w) => w.name)).size, ws.length);
  assert.equal(new Set(ws.map((w) => w.slug)).size, ws.length);
});

test('every project spec carries its sponsor\'s workspace, and the intake body names it explicitly', () => {
  assert.equal(typeof content.workspaceOf, 'function', 'portfolio-content.mjs exports workspaceOf');
  assert.equal(typeof pack.projectIntakeBody, 'function', 'portfolio.mjs exports projectIntakeBody');
  for (const s of STUDIES) {
    const w = content.workspaceOf(s);
    assert.ok(w, `${s.key} has a sponsor workspace`);
    assert.equal(w.key, s.company, `${s.key} is in its own sponsor's workspace`);
    const body = pack.projectIntakeBody(s, 41);
    assert.equal(body.clientWorkspaceId, 41, `${s.key} names its workspace`);
    assert.equal(body.name, `[Demo · Portfolio] ${projectTitle(s)}`);
    assert.throws(() => pack.projectIntakeBody(s, undefined), /workspace/i, 'a project is never created without its workspace');
    assert.throws(() => pack.projectIntakeBody(s, 0), /workspace/i);
  }
  for (const w of content.SPONSOR_WORKSPACES) assert.equal(STUDIES.filter((s) => content.workspaceOf(s).key === w.key).length, 2, w.key);
});

test('no sponsor is named like a Lumen pack supplier (or any other fictional company in the packs)', () => {
  const taken = new Set(LUMEN_SUPPLIERS.map((s) => firstWord(s.name)));
  for (const c of COMPANIES) {
    assert.ok(!taken.has(firstWord(c.name)), `${c.name} shares its name with a Lumen supplier`);
    assert.ok(!LUMEN_SUPPLIERS.some((s) => s.name.toLowerCase() === c.name.replace(/ \(fictional\)$/, '').toLowerCase()), c.name);
  }
  assert.ok(!COMPANIES.some((c) => /corvane/i.test(`${c.key} ${c.name} ${c.profile}`)), 'the Corvane name is the Lumen pack\'s supplier');
});

test('a portfolio project found by title in another workspace is refused: never moved, never reused', () => {
  assert.equal(typeof pack.existingProjectFor, 'function', 'portfolio.mjs exports existingProjectFor');
  const title = '[Demo · Portfolio] X';
  assert.deepEqual(pack.existingProjectFor([{ id: 'p0', title: 'other', client_workspace_id: 7 }], title, 7), { action: 'create' });
  assert.deepEqual(pack.existingProjectFor([{ id: 'p1', title, client_workspace_id: '7' }], title, 7), { action: 'reuse', id: 'p1' });
  const refused = pack.existingProjectFor([{ id: 'p2', title, client_workspace_id: 2 }], title, 7);
  assert.equal(refused.action, 'refuse');
  assert.equal(refused.id, 'p2');
  assert.equal(refused.foundWorkspaceId, 2);
  assert.match(refused.reason, /refused/i);
  assert.match(refused.reason, /not moved/i);
  assert.equal(pack.existingProjectFor([{ id: 'p3', name: title, client_workspace_id: null }], title, 7).action, 'refuse');
  assert.throws(() => pack.existingProjectFor([{ id: 'a', title, client_workspace_id: 7 }, { id: 'b', title, client_workspace_id: 2 }], title, 7), /more than one/);
});

test('a sponsor workspace is found by exact name in this organisation, or refused, never adopted by a near match', () => {
  assert.equal(typeof pack.matchSponsorWorkspace, 'function', 'portfolio.mjs exports matchSponsorWorkspace');
  const spec = content.SPONSOR_WORKSPACES[0];
  const row = (o) => ({ id: '9', name: spec.name, slug: spec.slug, organizationId: '2', status: 'active', ...o });
  assert.equal(pack.matchSponsorWorkspace([], spec, 2), null);
  assert.equal(pack.matchSponsorWorkspace([row({ name: 'Concept2Cure Therapeutics', slug: 'concept2cure' })], spec, 2), null);
  assert.equal(pack.matchSponsorWorkspace([row()], spec, 2), 9);
  assert.throws(() => pack.matchSponsorWorkspace([row(), row({ id: '10', slug: 'x' })], spec, 2), /more than one/);
  assert.throws(() => pack.matchSponsorWorkspace([row({ status: 'archived' })], spec, 2), /not active/);
  assert.throws(() => pack.matchSponsorWorkspace([row({ organizationId: '3' })], spec, 2), /another organisation/);
  assert.throws(() => pack.matchSponsorWorkspace([row({ name: 'Someone else', id: '11' })], spec, 2), /slug/);
});

test('a study design titled for the pack but bound to another project is left where it is', () => {
  assert.equal(typeof pack.designOwnedElsewhere, 'function', 'portfolio.mjs exports designOwnedElsewhere');
  const title = '[Demo · Portfolio] D';
  assert.equal(pack.designOwnedElsewhere([], title, 'p1'), null);
  assert.equal(pack.designOwnedElsewhere([{ title, programId: 'p1', studyId: 's1' }], title, 'p1'), null);
  assert.deepEqual(pack.designOwnedElsewhere([{ title, programId: 'p0', studyId: 's0' }], title, 'p1'), { studyId: 's0', programId: 'p0' });
});

test('the known product behaviour says what the server does: the first data-room read of ANY project captures organisation-wide Quality records, whatever its workspace', () => {
  const k = pack.KNOWN_PRODUCT_BEHAVIOUR;
  assert.ok(k && typeof k === 'object', 'portfolio.mjs exports KNOWN_PRODUCT_BEHAVIOUR');
  assert.match(k.where, /every project/i);
  assert.match(k.where, /any client workspace/i);
  assert.match(k.trigger, /GET \/api\/c2c\/projects\/:id\/sources at offset 0/);
  for (const file of ['data-room-search.ts', 'record-source.ts', 'project-evidence-queries.ts']) assert.ok(k.cause.includes(file), `cause names ${file}`);
  assert.match(k.ownWorkspace, /does not stop/i);
  assert.doesNotMatch(JSON.stringify(k), /letter[^"]*triggers|only (on )?stage h/i, 'the letter upload is not the trigger');
  // The pack's header says the same: no longer that the letter triggers it, nor that the own workspace keeps the evidence out.
  const header = readFileSync(path.join(HERE, 'packs/portfolio.mjs'), 'utf8').split('*/')[0].replace(/\n\s*\*\s?/g, ' ');
  assert.doesNotMatch(header, /uploading stage h's letter[^.]*triggers/i);
  assert.doesNotMatch(header, /so every sponsor's projects showed/i);
  assert.match(header, /first read of any project's data room/i);
  assert.match(header, /does not stop/i);
});

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
  const e = STUDIES.find((x) => x.key === 'vnh310-201');
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
