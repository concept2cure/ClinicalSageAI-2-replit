#!/usr/bin/env node
/**
 * The production image is pinned, owned without a second copy, stamped with its
 * commit, and runs node as PID 1's direct child (MR-03 Stage 2, OPS-19).
 *
 * Dockerfile.optimized was built FROM node:22-slim by tag, so two builds of the
 * same commit could ship different Node and Debian packages; it ran
 * `chown -R appuser:appuser /app`, which writes a second copy of every file in
 * /app (node_modules included) into a new layer; it never received the commit
 * it was built from (.dockerignore keeps .git out, so the server reported
 * "unknown"); and it started with `npm run start`, so npm, not node, took
 * SIGTERM and the server's drain (server/startup/shutdown.ts) depended on npm
 * forwarding it.
 *
 * Checked, statically:
 *   1. every FROM that names an image (not an earlier stage) carries
 *      @sha256:<64 hex>;
 *   2. no RUN in the production stage runs `chown -R` (ownership is set with
 *      COPY --chown, in the layer that writes the files);
 *   3. the builder declares ARG BUILD_COMMIT before `npm run build`, and the
 *      production stage declares ARG BUILD_COMMIT and ENV BUILD_COMMIT;
 *   4. the production stage's CMD is exec form and starts node, not a package
 *      manager or a shell;
 *   5. both workflows that build the production image pass
 *      --build-arg BUILD_COMMIT (deploy-aws.yml, ci.yml).
 *
 *   node scripts/ci/check-image-hardening.mjs              # the repository
 *   node scripts/ci/check-image-hardening.mjs --self-test  # shows it failing
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCKERFILE = 'Dockerfile.optimized';
const WORKFLOWS = ['.github/workflows/deploy-aws.yml', '.github/workflows/ci.yml'];

/** Instructions with continuation lines joined; comments dropped. */
export function instructions(text) {
  const out = [];
  let current = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!current && /^\s*#/.test(line)) continue;
    if (line.endsWith('\\')) {
      current += line.slice(0, -1) + ' ';
      continue;
    }
    current += line;
    if (current.trim()) out.push(current.trim());
    current = '';
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** [{ name, from, body: [instruction…] }] in file order. */
export function stages(text) {
  const out = [];
  for (const ins of instructions(text)) {
    const from = ins.match(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from) {
      out.push({ from: from[1], name: (from[2] ?? '').toLowerCase(), body: [] });
    } else if (out.length) {
      out[out.length - 1].body.push(ins);
    }
  }
  return out;
}

/** Problems in one Dockerfile's text. */
export function checkDockerfile(text) {
  const problems = [];
  const all = stages(text);
  const names = new Set();
  for (const s of all) {
    if (!names.has(s.from.toLowerCase()) && !/@sha256:[0-9a-f]{64}$/.test(s.from)) {
      problems.push(`FROM ${s.from}${s.name ? ` AS ${s.name}` : ''} is not pinned by digest (@sha256:…)`);
    }
    if (s.name) names.add(s.name);
  }
  const builder = all.find(s => s.name === 'builder');
  const production = all.find(s => s.name === 'production');
  if (!production) return [...problems, 'no stage named production'];
  for (const ins of production.body) {
    if (/^RUN\b/i.test(ins) && /\bchown\s+(-[a-zA-Z]*R|--recursive)\b/.test(ins)) {
      problems.push(`the production stage runs a recursive chown (${ins.slice(0, 80)}…); set ownership with COPY --chown`);
    }
  }
  if (builder) {
    const build = builder.body.findIndex(i => /^RUN\b.*\bnpm run build\b/i.test(i));
    const arg = builder.body.findIndex(i => /^ARG\s+BUILD_COMMIT\b/i.test(i));
    if (build >= 0 && (arg < 0 || arg > build)) {
      problems.push('the builder does not declare ARG BUILD_COMMIT before `npm run build`, so the bundle reports "unknown"');
    }
  }
  if (!production.body.some(i => /^ARG\s+BUILD_COMMIT\b/i.test(i)) ||
      !production.body.some(i => /^ENV\s+BUILD_COMMIT[=\s]/i.test(i))) {
    problems.push('the production stage does not declare ARG BUILD_COMMIT and ENV BUILD_COMMIT');
  }
  const cmds = production.body.filter(i => /^CMD\b/i.test(i));
  const cmd = cmds[cmds.length - 1];
  if (!cmd) {
    problems.push('the production stage has no CMD');
  } else {
    let argv = null;
    try {
      argv = JSON.parse(cmd.replace(/^CMD\s+/i, ''));
    } catch {
      argv = null;
    }
    if (!Array.isArray(argv)) {
      problems.push(`the production CMD is shell form (${cmd}); use exec form so node receives SIGTERM`);
    } else if (!/(^|\/)node$/.test(String(argv[0]))) {
      problems.push(`the production CMD starts ${JSON.stringify(argv[0])}, not node (${cmd}); npm, yarn or a shell would take SIGTERM in node's place`);
    }
  }
  return problems;
}

/** Problems in a workflow that builds the production image. */
export function checkWorkflow(file, text) {
  const problems = [];
  const lines = instructions(text.replace(/\r/g, ''));
  const builds = lines.filter(l => /docker build\b.*-f Dockerfile\.optimized\b.*--target production\b/.test(l));
  if (builds.length === 0) problems.push(`${file}: no \`docker build … --target production\` of ${DOCKERFILE} found`);
  for (const b of builds) {
    if (!/--build-arg\s+BUILD_COMMIT=/.test(b)) {
      problems.push(`${file}: the production image build does not pass --build-arg BUILD_COMMIT (${b.slice(0, 90)}…)`);
    }
  }
  return problems;
}

const PIN = '@sha256:' + 'a'.repeat(64);
const GOOD = [
  `FROM node:22-slim${PIN} AS builder`,
  'WORKDIR /app',
  'RUN npm ci',
  'ARG BUILD_COMMIT',
  'RUN npm run build',
  'FROM builder AS provision',
  'CMD ["npm", "run", "db:provision"]',
  `FROM node:22-slim${PIN} AS production`,
  'RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser && chown appuser:appuser /app',
  'COPY --chown=appuser:appuser --from=builder /app/dist ./dist',
  'USER appuser',
  'ARG BUILD_COMMIT',
  'ENV BUILD_COMMIT=${BUILD_COMMIT}',
  'ENV NODE_ENV=production',
  'CMD ["node", "dist/index.js"]',
].join('\n');

function selfTest() {
  const edit = (from, to) => {
    if (!GOOD.includes(from)) throw new Error(`self-test fixture lacks ${from}`);
    return GOOD.replace(from, to);
  };
  const cases = [
    ['a hardened Dockerfile passes', GOOD, []],
    ['an unpinned builder', edit(`FROM node:22-slim${PIN} AS builder`, 'FROM node:22-slim AS builder'), ['FROM node:22-slim AS builder is not pinned']],
    ['an unpinned production stage', edit(`FROM node:22-slim${PIN} AS production`, 'FROM node:22-slim AS production'), ['FROM node:22-slim AS production is not pinned']],
    ['a short digest', edit(`FROM node:22-slim${PIN} AS production`, 'FROM node:22-slim@sha256:abc AS production'), ['is not pinned']],
    ['npm as the production CMD', edit('CMD ["node", "dist/index.js"]', 'CMD ["npm", "run", "start"]'), ['not node']],
    ['a shell-form CMD', edit('CMD ["node", "dist/index.js"]', 'CMD node dist/index.js'), ['shell form']],
    ['a recursive chown over /app', edit('&& chown appuser:appuser /app', '&& chown -R appuser:appuser /app'), ['recursive chown']],
    ['no BUILD_COMMIT in the builder', edit('ARG BUILD_COMMIT\nRUN npm run build', 'RUN npm run build'), ['before `npm run build`']],
    ['no BUILD_COMMIT ENV in production', edit('ENV BUILD_COMMIT=${BUILD_COMMIT}\n', ''), ['ENV BUILD_COMMIT']],
    ['a later stage FROM an earlier one needs no digest', GOOD, []],
  ];
  const workflowCases = [
    ['a build passing the commit', 'run: |\n  docker build -f Dockerfile.optimized --target production \\\n    --build-arg BUILD_COMMIT=${{ github.sha }} \\\n    -t x .\n', []],
    ['a build without it', 'run: |\n  docker build -f Dockerfile.optimized --target production -t x .\n', ['does not pass --build-arg BUILD_COMMIT']],
  ];
  let failed = 0;
  const report = (label, got, expect) => {
    const ok = expect.length === 0 ? got.length === 0 : expect.every(e => got.some(g => g.includes(e)));
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n     expected ${JSON.stringify(expect)}, got ${JSON.stringify(got)}`}`);
  };
  for (const [label, text, expect] of cases) report(label, checkDockerfile(text), expect);
  for (const [label, text, expect] of workflowCases) report(`workflow: ${label}`, checkWorkflow('fixture.yml', text), expect);
  if (failed) {
    console.error(`[ci:image-hardening] self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log('[ci:image-hardening] self-test: every case behaves');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const problems = checkDockerfile(readFileSync(resolve(ROOT, DOCKERFILE), 'utf8')).map(p => `${DOCKERFILE}: ${p}`);
  for (const f of WORKFLOWS) problems.push(...checkWorkflow(f, readFileSync(resolve(ROOT, f), 'utf8')));
  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`[ci:image-hardening] ${problems.length} problem(s) (MR-03 OPS-19).`);
    process.exit(1);
  }
  console.log(`[ci:image-hardening] OK — ${DOCKERFILE} is pinned by digest, owned without a recursive chown, stamped with BUILD_COMMIT and started as node; both workflows pass the commit.`);
}

main();
