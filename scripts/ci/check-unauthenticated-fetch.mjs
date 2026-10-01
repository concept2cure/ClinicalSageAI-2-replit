#!/usr/bin/env node
/**
 * CI gate: a raw fetch() from the client must send the bearer token, unless the
 * server says its endpoint is public.
 *
 * ── THE INCIDENT ─────────────────────────────────────────────────────────────
 * `credentials: 'include'` is not authentication in this app. The /api gate
 * (server/middleware/auth.ts, `extractBearerToken`) reads
 * `req.headers.authorization` and has NO cookie fallback. Between 2026-09-19 and
 * 2026-09-24 seven client call sites were found sending the cookie and no
 * token, each found by hand, one at a time:
 *
 *   useVaultUpload        — every vault upload, on three surfaces
 *   useSubmissionDetail   — a package's readiness and milestones, shown as empty
 *   useEsignature         — the shared e-signature modal: no signer could be
 *                           verified, so every e-signed action behind it was blocked
 *   usePdevData.postJson  — all nine PDEV writes
 *   EvidencePicker        — PDEV evidence search, shown as "HTTP 401"
 *   useAcceptAnaDraft, useProgramExtras (fixed upstream)
 *
 * Two properties made this class survive. authBoundary runs 'warn' outside
 * production and 'enforce' in it, so a call without its token can work on a
 * laptop and 401 for every user. And several of those URLs reach fetch() as a
 * PARAMETER or a `${BASE}${path}` template, so a sweep that looks for the string
 * "/api/" cannot see them — an earlier sweep reported "no further instances"
 * and was wrong for exactly that reason.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 * EVERY raw fetch() in client/src (tests excluded), whatever its URL — the
 * default is flipped, so a URL this script cannot resolve is treated as /api
 * until shown otherwise. A call passes when:
 *   - its argument list names the bearer token (getAuthHeaders(),
 *     buildAuthHeaders(), or an Authorization header), or
 *   - its `headers` is a variable or a local helper whose definition in the same
 *     file does, or
 *   - its first argument is a literal URL that is public per the SERVER's own
 *     PUBLIC_API_ALLOWLIST (parsed from server/middleware/public-api-allowlist.ts, so the
 *     two cannot drift), or an absolute http(s) URL that is not this API, or
 *   - it is a reviewed exception in unauthenticated-fetch-baseline.json, with
 *     the reason written down.
 *
 * Calls through apiRequest / useFetchJson / queryClient are not raw fetch() and
 * are not scanned; those helpers attach the token themselves.
 *
 * Usage:
 *   node scripts/ci/check-unauthenticated-fetch.mjs
 *   node scripts/ci/check-unauthenticated-fetch.mjs --list
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The shared quote-, template- and escape-aware stripper, not a local copy: a
// regex stripper once blanked 859 lines of server code (see its header).
import { stripComments } from './lib/strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = path.join(repoRoot, 'client/src');
const BOUNDARY = path.join(repoRoot, 'server/middleware/public-api-allowlist.ts');
const BASELINE = path.join(repoRoot, 'scripts/ci/unauthenticated-fetch-baseline.json');
const LIST = process.argv.includes('--list');

/** A marker that the bearer token is being sent. */
const AUTH = /\b(getAuthHeaders|buildAuthHeaders)\s*\(|Authorization\b/;

function readAllowlist() {
  const src = fs.readFileSync(BOUNDARY, 'utf8');
  const start = src.indexOf('PUBLIC_API_ALLOWLIST');
  if (start < 0) throw new Error('PUBLIC_API_ALLOWLIST not found in public-api-allowlist.ts — the gate cannot know what is public');
  const body = src.slice(start, src.indexOf('];', start));
  const entries = [...body.matchAll(/\{\s*path:\s*'([^']+)',\s*match:\s*'(exact|prefix)'\s*\}/g)]
    .map((m) => ({ path: m[1], match: m[2] }));
  if (entries.length === 0) throw new Error('PUBLIC_API_ALLOWLIST parsed to zero entries — refusing to report success');
  return entries;
}

function isPublic(url, allow) {
  const bare = url.split('?')[0];
  return allow.some((e) => (e.match === 'exact' ? bare === e.path : bare === e.path || bare.startsWith(e.path + '/')));
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(f, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) out.push(f);
  }
  return out;
}

/** The text of a call from its opening paren to the matching close. */
function callText(src, openIdx) {
  let depth = 0;
  let q = null;
  for (let i = openIdx; i < src.length && i < openIdx + 4000; i++) {
    const c = src[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
  }
  return src.slice(openIdx + 1, openIdx + 1200);
}

/** The in-file definition text(s) of `name`. */
function definitions(src, name) {
  const re = new RegExp(`(?:const|let|var|function)\\s+${name}\\b`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push(src.slice(m.index, m.index + 700));
  return out;
}

/** Does the in-file definition of `name` carry the bearer token? */
function definitionAuthed(src, name, depth) {
  return definitions(src, name).some((d) => AUTH.test(d) || (depth > 0 && authed(src, d, depth - 1)));
}

/**
 * Does this argument list (or, one level down, an object it names) send the
 * token? Bounded depth: `fetch(url, options)` where `options` holds
 * `headers` and `headers` holds Authorization is how apiRequest itself is
 * written, and the canonical helper must not need a baseline entry.
 */
function authed(src, args, depth = 2) {
  if (AUTH.test(args)) return true;
  // fetch(url, init) with init passed by name
  const initName = args.match(/,\s*([A-Za-z_$][\w$]*)\s*$/);
  if (initName && depth > 0 && definitionAuthed(src, initName[1], depth - 1)) return true;
  // headers: <expr>   or shorthand `headers`
  const hv = args.match(/headers\s*:\s*([^\n]+)/);
  const shorthand = /[{,]\s*headers\s*[,}\n]/.test(args);
  const candidates = [];
  if (hv) for (const m of hv[1].matchAll(/(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*\(?/g)) candidates.push(m[1]);
  if (shorthand) candidates.push('headers');
  return candidates.some((n) => definitionAuthed(src, n, depth - 1));
}

function firstArg(args) {
  const lit = args.match(/^\s*(['"`])([^'"`]*)\1/);
  if (!lit) return { literal: false, text: args.trim().split(/[,\n]/)[0].slice(0, 80) };
  return { literal: true, text: lit[2] };
}

const allow = readAllowlist();
const findings = [];
let scanned = 0;
for (const file of walk(CLIENT)) {
  // Stripped for EVERYTHING below, not just the call search: a comment that
  // merely mentions Authorization must not count as sending it.
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const re = /(?<![\w$.])fetch\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    scanned += 1;
    const open = m.index + m[0].length - 1;
    const args = callText(src, open);
    const first = firstArg(args);
    const rel = path.relative(repoRoot, file);
    const line = src.slice(0, m.index).split('\n').length;
    if (first.literal) {
      // A template with an interpolation in the FIRST segment cannot be judged.
      const url = first.text;
      if (/^https?:\/\//.test(url)) continue;
      if (!url.includes('${') && isPublic(url, allow)) continue;
      if (url.startsWith('/api/') && isPublic(url.split('${')[0].replace(/\/$/, ''), allow)) continue;
    }
    if (authed(src, args)) continue;
    findings.push({ file: rel, line, target: first.text });
  }
}

/* A scan that found nothing to scan has not run. client/src makes sixty-odd raw
   fetch() calls (64 on 2026-09-24); if the walker or the call pattern broke, this
   would otherwise report "every call is authenticated" over an empty set. */
const MIN_SCANNED = 40;
if (scanned < MIN_SCANNED) {
  console.error(`❌ ci:unauthenticated-fetch — scanned only ${scanned} fetch() call(s) (floor ${MIN_SCANNED}). The scan did not run; refusing to report success.`);
  process.exit(1);
}

let baseline = { allow: [] };
if (fs.existsSync(BASELINE)) baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const errors = [];
for (const b of baseline.allow) {
  if (!b.reason || b.reason.trim().length < 20) errors.push(`baseline entry ${b.file} :: ${b.target} has no written reason`);
}
const key = (x) => `${x.file}::${x.target}`;
const allowed = new Set(baseline.allow.map(key));
const live = new Set(findings.map(key));
for (const b of baseline.allow) {
  if (!live.has(key(b))) errors.push(`baseline entry ${key(b)} no longer occurs — remove it`);
}
const fresh = findings.filter((f) => !allowed.has(key(f)));

if (LIST) {
  console.log(`[ci:unauthenticated-fetch] ${findings.length} raw fetch() call(s) with no bearer token (${allow.length} public allowlist entries read):`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.target}${allowed.has(key(f)) ? '   (baselined)' : ''}`);
}

if (fresh.length || errors.length) {
  if (fresh.length) {
    console.error(`❌ ci:unauthenticated-fetch — ${fresh.length} raw fetch() call(s) send no bearer token:`);
    for (const f of fresh) console.error(`   ${f.file}:${f.line}  ${f.target}`);
    console.error(`
   \`credentials: 'include'\` is not authentication here: the /api gate reads the
   Authorization header only. Add headers: { ...getAuthHeaders() } (or the
   lane's buildAuthHeaders()), or go through apiRequest. If the endpoint is
   public, it belongs on PUBLIC_API_ALLOWLIST in server/middleware/public-api-allowlist.ts,
   not in this gate's baseline.`);
  }
  for (const e of errors) console.error(`❌ ci:unauthenticated-fetch — ${e}`);
  process.exit(1);
}
console.log(`✅ ci:unauthenticated-fetch — ${scanned} raw fetch() call(s) scanned; every one sends the bearer token or targets a public endpoint (${findings.length} baselined).`);
