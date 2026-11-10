#!/usr/bin/env node
/**
 * Self-test for check-filing-exit-agreement.mjs.
 *
 * Exists because the gate's whole value is in its failure branch, and on the
 * current tree that branch does not fire — it reports OK against a baseline. A
 * guard that has only ever been seen to pass has not been tested (CLAUDE.md,
 * working agreement).
 *
 * So this builds a miniature tree in a temp dir and runs the REAL gate against
 * it with cwd set there, asserting its verdict on each of the cases it exists
 * for:
 *
 *   1. a NEW SEAL with no agreement check   -> must FAIL, naming the file
 *   2. the same seal, guarded                -> must PASS
 *   3. a new DEVICE PACKAGE door, unguarded  -> must FAIL
 *   4. a baseline entry with no real reason  -> must FAIL (not a snooze)
 *   5. a baseline that allows more than exists -> must FAIL (shrink only)
 *   6. the module that DEFINES the question   -> must not count as a door
 *   9. a device package through the SECTION loaders (`loadAuthoredDeviceSections`,
 *      `loadGovernedDeviceSections`), unguarded -> must FAIL (P-29.3, 2026-11-02:
 *      /build and the official eSTAR's attachments read the filing this way,
 *      and the scanner did not see it)
 *  10. a device package that asks through `governedDeviceFilingAgreement` -> must PASS
 *  11. the device loaders' own module         -> must not count as a door
 *
 * Case 1 is the one that matters: it is round 16's actual mistake, in miniature.
 * The freeze was gated and `/e-sign` as APPROVER — the path a client uses — was
 * not, for a round, with every test green.
 *
 * Usage: node scripts/ci/check-filing-exit-agreement.selftest.mjs
 * Exit 0 when the gate catches what it must and stays quiet on what it must not.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(repoRoot, 'scripts/ci/check-filing-exit-agreement.mjs');
const TAG = '[ci:filing-exit-agreement:selftest]';

let failures = 0;

/**
 * Build a tree with the given server files and baseline, run the gate in it,
 * and return { code, out }.
 */
function runGate({ files, baseline }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'filing-exit-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.mkdirSync(path.join(tmp, 'scripts/ci'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'scripts/ci/filing-exit-agreement-baseline.json'),
    JSON.stringify(baseline, null, 2),
  );
  try {
    const out = execFileSync('node', [GATE], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function expect(name, { code, out }, { exit, contains = [], absent = [] }) {
  const problems = [];
  if (code !== exit) problems.push(`exit ${code}, expected ${exit}`);
  for (const c of contains) if (!out.includes(c)) problems.push(`output is missing ${JSON.stringify(c)}`);
  for (const a of absent) if (out.includes(a)) problems.push(`output should not mention ${JSON.stringify(a)}`);
  if (problems.length) {
    failures += 1;
    console.error(`${TAG} ✗ ${name}`);
    for (const p of problems) console.error(`    ${p}`);
    console.error(`    --- gate output ---\n${out.split('\n').map((l) => `    ${l}`).join('\n')}`);
  } else {
    console.log(`${TAG} ✓ ${name}`);
  }
}

// ── The fixtures, in the shapes the real tree has ───────────────────────────

/** A seal: it writes a signature row and stamps the document APPROVED. */
const SEAL_UNGUARDED = `
export async function sealIt(client, docId, tenantId, email) {
  await client.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [docId]);
  await client.query('INSERT INTO authoring_signatures (id, doc_id) VALUES ($1, $2)', ['x', docId]);
}
`;

/** The same seal, having asked the question first. */
const SEAL_GUARDED = `
import { filingAgreesWithEditing } from '../services/c2c/filing-section-target.js';
export async function sealIt(client, docId, tenantId, email) {
  const agreement = await filingAgreesWithEditing(client, { authoringDocId: docId, tenantId });
  if (agreement.diverged.some((d) => d.filed === 'different')) throw new Error('FILING_DIVERGED');
  await client.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [docId]);
  await client.query('INSERT INTO authoring_signatures (id, doc_id) VALUES ($1, $2)', ['x', docId]);
}
`;

/** A device package built from the filing. */
const PACKAGE_UNGUARDED = `
export async function buildPackage(orgId, programId) {
  const scope = await resolveDeviceContentScope(orgId, { programId });
  return loadDeviceContentLeaves(orgId, scope);
}
`;

/** The module that defines the question. It must not be read as a door. */
const DEFINER = `
export async function filingAgreesWithEditing(client, args) {
  await client.query("UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1", [args.authoringDocId]);
  return { documentId: null, diverged: [] };
}
`;

/** The two section loaders: /build, the official eSTAR's attachments, the EU technical file. */
const SECTIONS_UNGUARDED = `
export async function draftPackage(orgId, programId) {
  return loadAuthoredDeviceSections(orgId, { programId });
}
export async function technicalFile(orgId, programId) {
  return loadGovernedDeviceSections(orgId, programId, pool, ['mdr']);
}
`;

/** The same package, having asked the device form of the question first. */
const PACKAGE_GUARDED_DEVICE = `
import { governedDeviceFilingAgreement } from '../services/pathway-engines/estar/estar-content-leaves';
export async function buildPackage(orgId, programId) {
  const agreement = await governedDeviceFilingAgreement(orgId, programId, {});
  if (agreement.rewritten.length > 0) throw new Error('FILING_DIVERGED');
  return loadAuthoredDeviceSections(orgId, { programId });
}
`;

/** The device loaders' module calls its own loaders; it defines the doors' reads. */
const DEVICE_LOADERS = `
export async function resolveDeviceContentScope(orgId, opts) { return { scope: opts }; }
export async function loadAuthoredDeviceSections(orgId, opts) { return loadGovernedDeviceSections(orgId, opts.programId); }
export async function loadDeviceContentLeaves(orgId, opts) { return loadGovernedDeviceSections(orgId, opts.programId); }
`;

const NO_FILES = {};

// 1. A new seal with no agreement check must FAIL, by name.
expect(
  'a new seal with no agreement check fails, naming the file and the kind',
  runGate({ files: { 'server/routes/new-seal.ts': SEAL_UNGUARDED }, baseline: { files: {} } }),
  {
    exit: 1,
    contains: ['server/routes/new-seal.ts', 'approval-stamp', 'signature-row', 'baseline allows 0'],
  },
);

// 2. The same seal, guarded, must PASS.
expect(
  'the same seal passes once it asks the question',
  runGate({ files: { 'server/routes/new-seal.ts': SEAL_GUARDED }, baseline: { files: {} } }),
  { exit: 0, contains: ['OK'], absent: ['new-seal.ts'] },
);

// 3. A new device package door must FAIL.
expect(
  'a new device package built from the filing fails',
  runGate({ files: { 'server/routes/new-package.ts': PACKAGE_UNGUARDED }, baseline: { files: {} } }),
  { exit: 1, contains: ['server/routes/new-package.ts', 'device-content-load', 'device-content-scope'] },
);

// 4. A baseline entry whose reason is not a reason must FAIL.
expect(
  'a baseline entry with no written reason fails, so it cannot be a snooze',
  runGate({
    files: { 'server/routes/new-seal.ts': SEAL_UNGUARDED },
    baseline: { files: { 'server/routes/new-seal.ts': { count: 2, reason: 'later' } } },
  }),
  { exit: 1, contains: ['no written reason'] },
);

// 5. A baseline that allows more than exists must FAIL — shrink only, so a
//    freed allowance cannot silently absorb the next door.
expect(
  'a baseline allowing more than exists fails, so freed allowance cannot absorb a new door',
  runGate({
    files: { 'server/routes/new-seal.ts': SEAL_UNGUARDED },
    baseline: {
      files: {
        'server/routes/new-seal.ts': {
          count: 9,
          reason: 'DEFECT recorded for the selftest; the count is deliberately too high so the shrink-only branch fires.',
        },
      },
    },
  }),
  { exit: 1, contains: ['allows more than exists', '2 now, baseline 9'] },
);

// 6. A correctly baselined door passes, and says so.
expect(
  'a door baselined with a real reason passes, and the count is reported',
  runGate({
    files: { 'server/routes/new-seal.ts': SEAL_UNGUARDED },
    baseline: {
      files: {
        'server/routes/new-seal.ts': {
          count: 2,
          reason: 'DEFECT, recorded so it cannot grow: this selftest fixture seals without asking, which is exactly what the baseline exists to hold.',
        },
      },
    },
  }),
  { exit: 0, contains: ['OK', '2 baselined site(s)'] },
);

// 7. The module that DEFINES the question is not a door, even though it
//    contains the writes the scanner anchors on.
expect(
  'the module that defines the question is not read as a door',
  runGate({
    files: { 'server/services/c2c/filing-section-target.ts': DEFINER },
    baseline: { files: {} },
  }),
  { exit: 0, contains: ['OK'], absent: ['filing-section-target.ts:'] },
);

// 9. A device package through the section loaders must FAIL, by kind. These are
//    the reads /build and the official eSTAR's attachments made, unseen.
expect(
  'a device package through the section loaders fails, naming each kind',
  runGate({ files: { 'server/routes/new-sections.ts': SECTIONS_UNGUARDED }, baseline: { files: {} } }),
  { exit: 1, contains: ['server/routes/new-sections.ts', 'device-sections-load', 'governed-sections-load', '2 site(s), baseline allows 0'] },
);

// 10. The same kind of door passes once it asks the device form of the question.
expect(
  'a device package that asks governedDeviceFilingAgreement passes',
  runGate({ files: { 'server/routes/new-package.ts': PACKAGE_GUARDED_DEVICE }, baseline: { files: {} } }),
  { exit: 0, contains: ['OK'], absent: ['new-package.ts'] },
);

// 11. The device loaders' own module is not a door, though it calls its loaders.
expect(
  'the device loaders\' module is not read as a door',
  runGate({
    files: { 'server/services/pathway-engines/estar/estar-content-leaves.ts': DEVICE_LOADERS },
    baseline: { files: {} },
  }),
  { exit: 0, contains: ['OK'], absent: ['estar-content-leaves.ts:'] },
);

// 8. An empty tree passes — the gate must not invent doors.
expect('an empty tree passes', runGate({ files: NO_FILES, baseline: { files: {} } }), { exit: 0, contains: ['OK'] });

if (failures > 0) {
  console.error(`${TAG} FAIL — ${failures} case(s) did not behave as the gate must.`);
  process.exit(1);
}
console.log(`${TAG} OK — the gate fails on every shape it exists to catch, and stays quiet on the rest.`);
