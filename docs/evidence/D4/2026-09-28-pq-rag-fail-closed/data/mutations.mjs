// Mutation pass for check-gold-manifest.mjs: each case breaks the real data in the
// one way a rule (or a review objection) exists to catch, and the check must exit 1
// with that reason. One positive control shows --ready CAN pass, so a red readiness
// result on the real data means "not ready", not "this gate never passes".
//
// Usage: node mutations.mjs <gold.json> <manifest.json> <gold-at-base.json>
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, 'check-gold-manifest.mjs');
const [goldPath, manifestPath, basePath] = process.argv.slice(2);
const realGold = readFileSync(goldPath, 'utf8');
const realManifest = readFileSync(manifestPath, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'pq-rag-mut-'));

const clone = (s) => JSON.parse(s);
const entry = (m, code) => m.entries.find((e) => e.document_code === code);
const item = (g, id) => g.items.find((i) => i.id === id);
const HEX = (c) => c.repeat(64);

function verify(e, sha) {
  Object.assign(e, {
    verified: true,
    versionVerified: true,
    sourceUrl: 'https://example.invalid/file.pdf',
    sha256: sha,
    date: '2000-01-01',
  });
}
function verifyTerms(m, pub) {
  Object.assign(m.publishers[pub], { termsVerified: true, terms: 'fixture terms', termsUrl: 'https://example.invalid/terms' });
}

const CASES = [
  ['[4] US-Code entries pin two editions', (g, m) => {
    entry(m, 'US-USC-42-262').version = 'USCODE-2023';
    item(g, 'fda-bla-vs-nda').expectedSourceKeys[0] = 'US-USC-42-262@USCODE-2023';
  }, 'US-Code entries pin more than one edition'],
  ['[5] two verified entries share one sha256 (E6(R3) Annex 2 under the E6(R2) file)', (g, m) => {
    verifyTerms(m, 'ICH');
    verify(entry(m, 'ICH-E6-R2'), HEX('a'));
    verify(entry(m, 'ICH-E6-R3'), HEX('a'));
  }, 'shares sha256'],
  ['[7] an entry names its publisher as issuer', (g, m) => {
    entry(m, 'EU-REG-2017-745').issuer = 'EU-PublicationsOffice';
  }, 'issuer EU-PublicationsOffice is not in issuers'],
  ['[7] an entry has no publisher', (g, m) => {
    delete entry(m, 'US-21CFR-316').publisher;
  }, 'publisher undefined is not in publishers'],
  ['[8] an EU-CONS entry pinned to the unamended OJ text', (g, m) => {
    entry(m, 'EU-REG-2017-745').version = 'OJ';
    item(g, 'eu-mdr-clinical-evaluation').expectedSourceKeys = ['EU-REG-2017-745@OJ'];
  }, 'does not match versionScheme EU-CONS'],
  ['[8] the EU-CONS scheme is undescribed', (g, m) => {
    delete m.versionScheme['EU-CONS'];
  }, 'versionScheme.EU-CONS is not described'],
  ['[10] keysProvisional dropped while versions are unverified', (g) => {
    g.keysProvisional = false;
  }, 'keysProvisional must be true'],
  ['[11] quotation marks back in an unfetched terms summary', (g, m) => {
    m.publishers.ICH.termsSearchIndexSummary = "Search-engine summary: the notice says the document 'is protected by copyright'.";
  }, 'carries quotation marks'],
  ['[11] terms filled in while unverified', (g, m) => {
    m.publishers['US-FDA'].terms = 'public domain';
  }, 'terms set while termsVerified is not true'],
  ['[12] a gold item keyed to the UNPINNED EMA entry', (g, m) => {
    item(g, 'ema-paediatric-investigation-plan').expectedSourceKeys.push('EMA-PROC-ADVICE-PAEDIATRIC-APPLICATIONS@UNPINNED');
    entry(m, 'EMA-PROC-ADVICE-PAEDIATRIC-APPLICATIONS').neededByGoldItems = ['ema-paediatric-investigation-plan'];
  }, 'names an UNPINNED entry'],
  ['[6] a gold item keyed to an unread supporting entry', (g, m) => {
    item(g, 'stats-primary-endpoint-multiplicity').expectedSourceKeys.push('FDA-GUID-MULTIPLE-ENDPOINTS@final-2022-10');
    entry(m, 'FDA-GUID-MULTIPLE-ENDPOINTS').neededByGoldItems = ['stats-primary-endpoint-multiplicity'];
  }, 'names a supporting entry, not an answer-source'],
  ['a key matching no manifest entry', (g) => {
    item(g, 'ich-q1a-stability').expectedSourceKeys = ['ICH-Q1A-R2@2003-02-06'];
  }, 'matches no manifest entry'],
  ['an original field changed', (g) => {
    item(g, 'ich-e2a-serious-adverse-event').expectedAnswerContains = ['death', 'life-threatening', 'hospitalisation'];
  }, 'original field expectedAnswerContains changed'],
  ['a key on a negative control', (g) => {
    item(g, 'negative-control-out-of-scope').expectedSourceKeys = ['ICH-E9@Step4'];
  }, 'has expected source keys'],
  ['expectedSourceIds filled before the resolver exists', (g) => {
    item(g, 'ich-q7-gmp-api').expectedSourceIds = ['12345'];
  }, 'expectedSourceIds must stay []'],
  ['verified:true without URL, sha256, date or verified terms', (g, m) => {
    entry(m, 'ICH-Q7').verified = true;
  }, 'verified without sourceUrl'],
  ['a new item without an evidence quote', (g) => {
    g.items.push({ id: 'new-unquoted', question: 'q', expectedSourceIds: [], expectedSourceKeys: ['ICH-Q7@Step4'], expectedAnswerContains: ['x'], tags: ['ICH'] });
    // keep neededByGoldItems consistent so only the evidence rule fires
  }, 'lacks evidence'],
  ['a new item quoting an UNVERIFIED text', (g) => {
    g.items.push({
      id: 'new-unverified-quote', question: 'q', expectedSourceIds: [], expectedSourceKeys: ['ICH-Q7@Step4'],
      expectedAnswerContains: ['starting material'], tags: ['ICH'],
      evidence: { document_code: 'ICH-Q7', section: '1.3', quote: 'from the API starting material onward' },
    });
  }, 'evidence quotes an unverified entry'],
  ['a new item whose expected substring is not in its quote', (g, m) => {
    verifyTerms(m, 'ICH');
    verify(entry(m, 'ICH-Q7'), HEX('b'));
    g.items.push({
      id: 'new-substring-missing', question: 'q', expectedSourceIds: [], expectedSourceKeys: ['ICH-Q7@Step4'],
      expectedAnswerContains: ['intermediate'], tags: ['ICH'],
      evidence: { document_code: 'ICH-Q7', section: '1.3', quote: 'from the API starting material onward' },
    });
  }, "'intermediate' is not in the quote"],
];

function run(gold, manifest, ready) {
  const g = path.join(dir, 'gold.json');
  const m = path.join(dir, 'manifest.json');
  writeFileSync(g, JSON.stringify(gold));
  writeFileSync(m, JSON.stringify(manifest));
  const r = spawnSync(process.execPath, [CHECK, g, m, basePath, ...(ready ? ['--ready'] : [])], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

let bad = 0;
for (const [label, mutate, expect] of CASES) {
  const g = clone(realGold);
  const m = clone(realManifest);
  mutate(g, m);
  const r = run(g, m, false);
  const ok = r.status === 1 && r.out.includes(expect);
  if (!ok) bad++;
  console.info(`${ok ? 'RED as intended' : 'NOT CAUGHT     '} exit=${r.status}  ${label}  [expects: ${expect}]`);
}

// Readiness on the real data: must be red (nothing verified, nothing quoted).
{
  const r = run(clone(realGold), clone(realManifest), true);
  const ok = r.status === 1 && r.out.includes('"positivesReady": 0');
  if (!ok) bad++;
  console.info(`${ok ? 'RED as intended' : 'NOT CAUGHT     '} exit=${r.status}  --ready on the real data  [expects: positivesReady 0]`);
}

// Positive control: a one-item gold set whose key is verified and whose item quotes it passes --ready.
{
  const m = clone(realManifest);
  verifyTerms(m, 'ICH');
  const e = entry(m, 'ICH-Q7');
  verify(e, HEX('c'));
  for (const x of m.entries) if (x !== e) x.neededByGoldItems = [];
  e.neededByGoldItems = ['ich-q7-gmp-api'];
  const g = clone(realGold);
  g.items = g.items.filter((i) => i.id === 'ich-q7-gmp-api');
  const it = g.items[0];
  it.evidence = { document_code: 'ICH-Q7', section: 'fixture', quote: 'fixture: active pharmaceutical ingredient ... starting material' };
  delete it.openChecks;
  // The base set for this control is the same one item, so no original item is "missing".
  const baseOne = path.join(dir, 'base-one.json');
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  writeFileSync(baseOne, JSON.stringify({ ...base, items: base.items.filter((i) => i.id === 'ich-q7-gmp-api') }));
  const gp = path.join(dir, 'gold-one.json');
  const mp = path.join(dir, 'manifest-one.json');
  writeFileSync(gp, JSON.stringify(g));
  writeFileSync(mp, JSON.stringify(m));
  const r = spawnSync(process.execPath, [CHECK, gp, mp, baseOne, '--ready'], { encoding: 'utf8' });
  const ok = r.status === 0 && r.stdout.includes('"positivesReady": 1');
  if (!ok) bad++;
  console.info(`${ok ? 'GREEN as intended' : 'WRONGLY RED     '} exit=${r.status}  positive control: one verified, quoted item passes --ready`);
  if (!ok) console.info(r.stdout + r.stderr);
}

console.info(bad ? `\n${bad} case(s) not as intended` : `\nall ${CASES.length + 2} cases as intended`);
process.exitCode = bad ? 1 : 0;
