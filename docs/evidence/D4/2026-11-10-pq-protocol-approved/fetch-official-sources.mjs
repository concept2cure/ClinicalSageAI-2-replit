#!/usr/bin/env node
// Steps 1 and 2 of the corpus manifest's verifyProcedure (server/eval/rag/guidance-corpus-manifest.json), for the
// sources the retrieval test bank needs: download each official file, and record its URL, size and SHA-256. It also
// saves each publisher's reuse-terms page for the founder to read (step 4).
//
// It changes nothing in the repository and decides nothing. A URL that answered is a candidate: the person running
// this confirms, from the issuer's own listing page, that it is the file the issuer links (step 1), reads the cover
// (step 3) and reads the terms (step 4). Founder decision P-118, docs/LAUNCH_DEFINITION_OF_DONE.md.
//
// Run it from a network that reaches the publishers (the Codespace; the sessions' containers are refused):
//   node docs/evidence/D4/2026-11-10-pq-protocol-approved/fetch-official-sources.mjs ~/.concept2cure-codespace/guidance-sources
// Optional 2nd and 3rd arguments: another manifest and another gold file (the tests use them).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const [outArg, manifestArg, goldArg] = process.argv.slice(2);
if (!outArg) {
  console.error('Name a folder outside the repository to save the files in.');
  process.exit(2);
}
const OUT = path.resolve(outArg.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
if (OUT === REPO || OUT.startsWith(`${REPO}${path.sep}`)) {
  console.error('That folder is inside the repository. Publisher files stay outside it until their reuse terms are verified.');
  process.exit(2);
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = readJson(manifestArg ?? path.join(REPO, 'server/eval/rag/guidance-corpus-manifest.json'));
const gold = readJson(goldArg ?? path.join(REPO, 'server/eval/rag/gold-dataset.json'));

const neededKeys = new Set(gold.items.flatMap(item => item.expectedSourceKeys ?? []));
const sources = manifest.entries.filter(entry => neededKeys.has(`${entry.document_code}@${entry.version}`));
const publishers = [...new Set(sources.map(entry => entry.redistribution?.termsOf).filter(Boolean))];

/** One GET, followed through redirects, with a browser-like agent and no personal detail. */
async function download(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; guidance-source-check)', accept: '*/*' } });
    if (!response.ok) return { url, ok: false, reason: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) return { url, ok: false, reason: 'the reply was empty' };
    return { url, ok: true, finalUrl: response.url, bytes, contentType: response.headers.get('content-type') ?? null };
  } catch (error) {
    return { url, ok: false, reason: error?.cause?.code ?? error?.name ?? 'request failed' };
  }
}

const safeName = text => text.replace(/[^A-Za-z0-9._-]+/g, '_');

async function firstThatAnswers(candidates) {
  const tried = [];
  for (const url of candidates) {
    const got = await download(url);
    if (got.ok) return { got, tried };
    tried.push({ url, reason: got.reason });
  }
  return { got: null, tried };
}

function save(folder, name, got) {
  fs.mkdirSync(folder, { recursive: true });
  const isPdf = got.bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  const file = path.join(folder, `${safeName(name)}${isPdf ? '.pdf' : '.html'}`);
  fs.writeFileSync(file, got.bytes);
  return { file, isPdf, sha256: createHash('sha256').update(got.bytes).digest('hex'), byteSize: got.bytes.length };
}

const report = { retrievedAt: new Date().toISOString(), sources: [], publisherTerms: [] };

for (const entry of sources) {
  const candidates = [entry.sourceUrl, ...(entry.sourceUrlCandidates ?? [])].filter(Boolean);
  const { got, tried } = await firstThatAnswers(candidates);
  const row = { key: `${entry.document_code}@${entry.version}`, title: entry.title, publisher: entry.redistribution?.termsOf ?? null };
  if (!got) {
    report.sources.push({ ...row, downloaded: false, tried });
    continue;
  }
  const saved = save(path.join(OUT, 'sources'), row.key, got);
  report.sources.push({ ...row, downloaded: true, candidateUrl: got.url, finalUrl: got.finalUrl, contentType: got.contentType,
    ...saved, tried,
    stillToDo: [
      'Confirm from the issuer\'s own listing page that this is the file it links (step 1).',
      'Read the cover: title, revision and date (step 3).',
      ...(saved.isPdf ? [] : ['This is not a PDF. It may be a page about the document and not the document.']),
    ] });
}

for (const name of publishers) {
  const publisher = manifest.publishers?.[name] ?? {};
  const candidates = [publisher.termsUrl, ...(publisher.termsUrlCandidates ?? [])].filter(Boolean);
  const { got, tried } = await firstThatAnswers(candidates);
  if (!got) {
    report.publisherTerms.push({ publisher: name, downloaded: false, tried });
    continue;
  }
  const saved = save(path.join(OUT, 'terms'), name, got);
  report.publisherTerms.push({ publisher: name, downloaded: true, candidateUrl: got.url, finalUrl: got.finalUrl, ...saved, tried,
    stillToDo: ['Read the page and quote the sentence that permits reuse, with the date read (step 4).'] });
}

fs.mkdirSync(OUT, { recursive: true });
const reportFile = path.join(OUT, 'report.json');
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

const missing = [...report.sources, ...report.publisherTerms].filter(row => !row.downloaded);
console.info(`Sources downloaded: ${report.sources.filter(row => row.downloaded).length} of ${report.sources.length}.`);
console.info(`Reuse-terms pages downloaded: ${report.publisherTerms.filter(row => row.downloaded).length} of ${report.publisherTerms.length}.`);
for (const row of missing) console.info(`Not downloaded: ${row.key ?? row.publisher} (${row.tried.map(t => `${t.url}: ${t.reason}`).join('; ') || 'no URL is recorded for it'})`);
console.info(`Report: ${reportFile}`);
console.info('Nothing in the repository was changed. Send the report back; it holds no key and no personal detail.');
process.exit(missing.length ? 1 : 0);
