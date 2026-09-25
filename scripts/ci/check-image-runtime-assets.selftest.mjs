#!/usr/bin/env node
/**
 * Self-test for ci:image-runtime-assets — shows the gate FAILING on each way the
 * production image can lack a file the server reads at run time, per CLAUDE.md
 * ("a gate that has only ever been seen to pass has not been tested"), then
 * passing on an intact fixture.
 *
 * Each case is a synthetic repository in a temp directory — a server/index.ts
 * the gate bundles the way production does, a Dockerfile, a .dockerignore and a
 * classification — not the real ones: the real repository's verdict is the
 * gate's own job in CI, and a self-test that depended on it would be red for
 * reasons that have nothing to do with the gate.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-image-runtime-assets.mjs');

const DOCKERFILE_INTACT = [
  'FROM node:22-slim AS builder',
  'WORKDIR /app',
  'COPY . .',
  'RUN npm run build',
  '',
  'FROM builder AS provision',
  'CMD ["true"]',
  '',
  'FROM node:22-slim AS production',
  'WORKDIR /app',
  'COPY --from=builder /app/dist ./dist',
  '# a continuation line, as the real file has',
  'COPY --from=builder \\',
  '  /app/vendor/forms ./vendor/forms',
  'CMD ["node", "dist/index.js"]',
  '',
].join('\n');

/** The repository every case starts from; a case overrides files by path. */
const BASE = {
  'server/index.ts': [
    "import { FORMS_DIR } from './live';",
    "import { SCRATCH_DIR } from './scratch';",
    'console.log(FORMS_DIR, SCRATCH_DIR);',
  ].join('\n'),
  // Resolves the vendored forms the way template-locations.ts does.
  'server/live.ts': [
    "import path from 'node:path';",
    "export const FORMS_DIR = path.join(process.cwd(), 'vendor', 'forms');",
  ].join('\n'),
  // A directory the process creates: correctly not shipped.
  'server/scratch.ts': [
    "import path from 'node:path';",
    "export const SCRATCH_DIR = path.resolve(process.cwd(), 'scratch');",
  ].join('\n'),
  // Not imported by server/index.ts, so not in the bundle: its unclassified
  // read must not count. The intact case passing proves the bundle scoping.
  'server/dead.ts': [
    "import path from 'node:path';",
    "export const NEVER = path.join(process.cwd(), 'unclassified-but-dead');",
  ].join('\n'),
  'vendor/forms/FDA_1571.pdf': '%PDF-1.7 fixture',
  'vendor/forms/FDA_1571.pdf.manifest.json': '{}',
  '.dockerignore': ['node_modules', 'dist', '*.md', 'docs'].join('\n'),
  Dockerfile: DOCKERFILE_INTACT,
};

const CLASSIFICATION = {
  'vendor/forms': { kind: 'ship', reason: 'fixture: the vendored forms' },
  scratch: { kind: 'not-shipped', reason: 'fixture: created on write' },
};

const withoutFormsCopy = DOCKERFILE_INTACT.replace('COPY --from=builder \\\n  /app/vendor/forms ./vendor/forms\n', '');

/** Each case: files to override (null deletes), classification, and the finding it must produce. */
const CASES = [
  {
    name: 'the production stage does not COPY a shipped path (the U7 acroforms defect)',
    files: { Dockerfile: withoutFormsCopy },
    expect: 'vendor/forms — read at run time by server/live.ts:2; the image must ship it, and no COPY in stage "production"',
  },
  {
    name: 'the COPY exists, but in another stage than the one that ships',
    files: { Dockerfile: withoutFormsCopy.replace('CMD ["true"]', 'COPY --from=builder /app/vendor/forms ./vendor/forms\nCMD ["true"]') },
    expect: 'no COPY in stage "production" puts anything at /app/vendor/forms',
  },
  {
    name: '.dockerignore keeps the source out of the build context',
    files: { '.dockerignore': `${BASE['.dockerignore']}\nvendor` },
    expect: '.dockerignore "vendor" removes vendor/forms from the build context',
  },
  {
    name: 'the COPY source does not exist in the repository',
    files: { 'vendor/forms/FDA_1571.pdf': null, 'vendor/forms/FDA_1571.pdf.manifest.json': null },
    expect: 'vendor/forms is not tracked in the repository',
  },
  {
    name: 'a new run-time read in a shipped module, unclassified',
    files: {
      'server/live.ts': `${BASE['server/live.ts']}\nexport const SCHEMAS = path.resolve(process.cwd(), 'schemas', 'v1');`,
      'server/index.ts': BASE['server/index.ts'].replace("import { FORMS_DIR } from './live';", "import { FORMS_DIR, SCHEMAS } from './live';").replace('console.log(FORMS_DIR,', 'console.log(SCHEMAS, FORMS_DIR,'),
    },
    expect: 'schemas/v1 — read at run time by server/live.ts:3, and not classified',
  },
  {
    name: 'a bundle-relative __dirname read: dist/ in the image, not the source directory',
    files: {
      'server/live.ts': [
        "import path from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
        "export const FORMS_DIR = path.join(process.cwd(), 'vendor', 'forms');",
        "export const RULES = path.join(__dirname, 'rules', 'rules.yaml');",
      ].join('\n'),
      'server/rules/rules.yaml': '[]',
      'server/index.ts': BASE['server/index.ts'].replace("import { FORMS_DIR } from './live';", "import { FORMS_DIR, RULES } from './live';").replace('console.log(FORMS_DIR,', 'console.log(RULES, FORMS_DIR,'),
    },
    classification: { ...CLASSIFICATION, 'dist/rules': { kind: 'ship', reason: 'fixture' } },
    expect: 'dist/rules/rules.yaml — read at run time by server/live.ts:5; the image must ship it, and COPY --from=builder /app/dist ./dist covers it, but `npm run build` produces only',
  },
  {
    name: 'a classification no shipped module uses any more',
    classification: { ...CLASSIFICATION, 'old/vendored': { kind: 'ship', reason: 'fixture: stale' } },
    expect: 'RUNTIME_PATHS lists old/vendored, which no module in the production bundle resolves any more',
  },
  {
    name: 'a known gap the image now covers, left unreclassified',
    classification: { ...CLASSIFICATION, 'vendor/forms': { kind: 'known-gap', reason: 'fixture: was missing' } },
    expect: 'vendor/forms — classified known-gap, but the image now covers it',
  },
  {
    name: 'a classification with no written reason',
    classification: { ...CLASSIFICATION, scratch: { kind: 'not-shipped', reason: '  ' } },
    expect: 'RUNTIME_PATHS["scratch"] has no written reason',
  },
];

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-runtime-assets-selftest-'));

function runGate(label, overrides = {}, classification = CLASSIFICATION) {
  const root = path.join(tmpRoot, label);
  const files = { ...BASE, ...overrides };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  const cls = path.join(root, 'classification.json');
  fs.writeFileSync(cls, JSON.stringify(classification));
  const r = spawnSync(
    process.execPath,
    [GATE, '--root', root, '--dockerfile', 'Dockerfile', '--classification', cls],
    { encoding: 'utf8' },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Failure lines only: the indented findings before any known-gap listing. */
const findingsOf = (out) => {
  const body = out.split('Known gaps (written decisions, not failures):')[0];
  return body.split('\n').filter((l) => /^ {2}\S/.test(l));
};

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} — ${msg}`);
  if (!ok) failures += 1;
};

try {
  const intact = runGate('intact');
  check(intact.status === 0, `intact fixture passes, the unbundled module's unclassified read ignored (exit ${intact.status})`);
  if (intact.status !== 0) console.log(intact.out);

  CASES.forEach((c, i) => {
    const r = runGate(`case-${i}`, c.files, c.classification);
    const findings = findingsOf(r.out);
    const named = findings.length === 1 && findings[0].includes(c.expect);
    check(
      r.status === 1 && named,
      `${c.name}: exit ${r.status}, ${findings.length} finding(s)${named ? '' : ` — expected exactly one containing "${c.expect}"`}`,
    );
    if (!(r.status === 1 && named)) console.log(r.out);
  });
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n[image-runtime-assets:selftest] ${failures} case(s) wrong.`);
  process.exit(1);
}
console.log(`\n[image-runtime-assets:selftest] the gate fails on all ${CASES.length} cuts and passes the intact fixture.`);
