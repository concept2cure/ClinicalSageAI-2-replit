#!/usr/bin/env node
/**
 * CI Guard: the frontend deploy uploads every file the built app fetches, and
 * caches for a year only what is content-hashed.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * deploy-aws.yml's "Sync to S3" step uploaded dist/public with
 * `--exclude "index.html" --exclude "*.json"` and then copied index.html back.
 * Nothing copied the JSON back. The app loads its interface strings from
 * `/locales/{{lng}}/{{ns}}.json` (client/src/i18n/index.ts), so production
 * would serve a sign-in page of raw keys ("title.signIn", "field.email") in
 * every language, from the first deploy. The same step gave robots.txt,
 * sitemap.xml and the web manifest a one-year `immutable` cache although their
 * names never change, so a correction to any of them would never reach a
 * browser that had fetched it once. (Audit of production-as-configured,
 * docs/evidence/W2/2026-09-24-multi-task/.)
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Parse every `aws s3 sync` / `aws s3 cp` into $FRONTEND_BUCKET in the
 * deploy-frontend job, apply its --exclude/--include filters the way the AWS
 * CLI does (every file included by default; filters in order; the last match
 * decides; `*` also matches `/`), and run the result against the files the
 * build publishes: everything under client/public, index.html, and the
 * content-hashed assets/ output. Then require:
 *   • every published file is uploaded by some command;
 *   • a `max-age` over one hour, or `immutable`, only under assets/ (Vite
 *     names those by content hash, so a changed file has a new name);
 *   • index.html revalidates (max-age=0 or no-cache).
 *
 * Exit 0 — the step uploads everything with safe caching. Exit 1 — it does not.
 *
 * Usage:
 *   node scripts/ci/check-frontend-sync-coverage.mjs
 *   node scripts/ci/check-frontend-sync-coverage.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:frontend-sync-coverage]';
const ONE_HOUR = 3600;

/** Files the build publishes, relative to dist/public. */
function publishedFiles() {
  const pub = path.join(repoRoot, 'client', 'public');
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(pub, '');
  // Vite writes index.html and content-hashed chunks beside client/public's copy.
  out.push('index.html', 'assets/index-0a1b2c3d.js', 'assets/index-0a1b2c3d.css');
  return out;
}

/** fnmatch as the AWS CLI applies it: `*` and `?` also match `/`. */
function globToRegExp(glob) {
  let re = '';
  for (const ch of glob) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Split a run block into commands, joining backslash continuations. */
function commandsOf(run) {
  return run
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => /^aws s3 (sync|cp)\b/.test(l));
}

function tokens(cmd) {
  return (cmd.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''));
}

/** Parse one aws s3 command into {kind, src, dest, filters[], cacheControl}. */
function parseCommand(cmd) {
  const t = tokens(cmd);
  const kind = t[2];
  const positional = [];
  const filters = [];
  let cacheControl = '';
  for (let i = 3; i < t.length; i++) {
    if (t[i] === '--exclude' || t[i] === '--include') filters.push({ type: t[i].slice(2), pattern: t[++i] });
    else if (t[i] === '--cache-control') cacheControl = t[++i];
    else if (t[i] === '--content-type') i++;
    else if (t[i].startsWith('--')) continue;
    else positional.push(t[i]);
  }
  const [src, dest] = positional;
  return { kind, src, dest, filters, cacheControl };
}

/** Which published files one command uploads, and under which key. */
function uploadsOf(c, files) {
  const destPrefix = (c.dest || '').replace(/^s3:\/\/\$\{?FRONTEND_BUCKET\}?\/?/, '');
  if (c.kind === 'cp') {
    const rel = c.src.replace(/^dist\/public\/?/, '');
    return files.includes(rel) ? [{ file: rel, key: destPrefix || rel }] : [];
  }
  const srcRel = c.src.replace(/^dist\/public\/?/, '').replace(/\/?$/, '');
  const out = [];
  for (const f of files) {
    if (srcRel && !f.startsWith(`${srcRel}/`)) continue;
    const rel = srcRel ? f.slice(srcRel.length + 1) : f;
    let included = true;
    for (const flt of c.filters) if (globToRegExp(flt.pattern).test(rel)) included = flt.type === 'include';
    if (included) out.push({ file: f, key: `${destPrefix}${rel}` });
  }
  return out;
}

function maxAge(cc) {
  const m = /max-age=(\d+)/.exec(cc);
  return m ? Number(m[1]) : null;
}

/** Returns a list of problems for the given run blocks. */
export function check(runBlocks, files = publishedFiles()) {
  const cmds = runBlocks
    .flatMap(commandsOf)
    .map(parseCommand)
    .filter((c) => /FRONTEND_BUCKET/.test(c.dest || ''));
  if (cmds.length === 0) return ['no `aws s3 sync|cp` into $FRONTEND_BUCKET found in the deploy-frontend job'];
  const problems = [];
  const uploaded = new Map();
  for (const c of cmds) for (const u of uploadsOf(c, files)) uploaded.set(u.file, c.cacheControl);
  for (const f of files) {
    if (!uploaded.has(f)) {
      problems.push(`not uploaded: ${f}`);
      continue;
    }
    const cc = uploaded.get(f);
    const hashed = f.startsWith('assets/');
    const age = maxAge(cc);
    if (!hashed && (/immutable/.test(cc) || (age !== null && age > ONE_HOUR))) {
      problems.push(`cached as if content-hashed but its name never changes: ${f} (${cc})`);
    }
    if (f === 'index.html' && !(age === 0 || /no-cache|no-store/.test(cc))) {
      problems.push(`index.html must revalidate on every load; got "${cc || '(no cache-control)'}"`);
    }
  }
  return problems;
}

function deployFrontendRunBlocks() {
  const wf = yaml.load(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'deploy-aws.yml'), 'utf8'));
  const job = wf.jobs && wf.jobs['deploy-frontend'];
  if (!job) throw new Error('deploy-aws.yml has no deploy-frontend job');
  return (job.steps || []).map((s) => s.run).filter(Boolean);
}

function selfTest() {
  // The step as it stood before 2026-09-25: must fail on the locale files and
  // on the year-long cache of fixed-name files.
  const before = `aws s3 sync dist/public/ "s3://$FRONTEND_BUCKET/" \\
  --delete \\
  --cache-control "public,max-age=31536000,immutable" \\
  --exclude "index.html" \\
  --exclude "*.json"
aws s3 cp dist/public/index.html "s3://$FRONTEND_BUCKET/index.html" \\
  --cache-control "public,max-age=0,must-revalidate"`;
  const beforeProblems = check([before]);
  const expectMissing = beforeProblems.some((p) => /^not uploaded: locales\/en\/auth\.json$/.test(p));
  const expectCache = beforeProblems.some((p) => /robots\.txt/.test(p));
  // No upload at all, and an index.html cached for a year.
  const none = check(['echo nothing to do']);
  const badIndex = check([`aws s3 sync dist/public/ "s3://$FRONTEND_BUCKET/" --cache-control "public,max-age=300,must-revalidate"`]);
  const ok = expectMissing && expectCache && none.length === 1 && badIndex.some((p) => /index\.html must revalidate/.test(p));
  console.log(`${TAG} self-test: pre-fix step → ${beforeProblems.length} problem(s), locales missing: ${expectMissing}, fixed names cached a year: ${expectCache}`);
  console.log(`${TAG} self-test: no upload → ${JSON.stringify(none)}; index.html long-cached → flagged: ${badIndex.some((p) => /index\.html/.test(p))}`);
  console.log(`${TAG} self-test ${ok ? 'OK — the gate fails on each case it exists to catch' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--self-test')) selfTest();

const problems = check(deployFrontendRunBlocks());
if (problems.length) {
  console.error(`${TAG} FAIL — deploy-aws.yml's frontend upload:`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(`${TAG} OK — every published file is uploaded; only assets/ is cached as immutable.`);
