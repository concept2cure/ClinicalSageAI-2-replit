#!/usr/bin/env node
/**
 * CI Guard: a `sign` ledger row must come from a signature ceremony.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * recordGovernedAction(client, { command: 'sign', ... }) writes the governed
 * ledger pair (audit_logs + c2c_ana_actions) and stamps the action risk 'high'.
 * An inspector querying that ledger reads it as an electronic signature. The
 * primitive itself checks nothing: it does not re-authenticate the signer
 * (21 CFR 11.200), it does not write the electronic_signatures row that carries
 * the signer's printed name, time and meaning (11.50) bound to what was signed
 * (11.70). The canonical path (`makeHandler('sign')` → `writeMutation` in
 * server/routes/c2c/actions.ts) does all of that. A route that calls the
 * primitive directly with 'sign' does none of it unless it does so itself.
 *
 * The 2026-09-22 weekly review found protocol finalization and reviewer
 * dispositions doing exactly that, and an AnA tool doing it from a chat turn in
 * which nobody entered a password. The census that followed found ~35 more.
 * This gate makes the population countable and stops it growing.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * Every sign-ledger write site:
 *   - recordGovernedAction( ... command: 'sign' ... )
 *   - a governed helper passed 'sign' positionally: governed(req, res, 'sign', …),
 *     governedScoped(…), governedPdev(ctx, 'sign', …)
 *   - writeMutation('sign', …)   (writes the signature row, but re-auth is the caller's)
 * must sit in a handler that also re-verifies the signer (verifyReauth /
 * reverifySigner, the ceremony verifyReauth wraps; the signing PIN it also
 * accepted was retired 2026-09-23) AND writes the signature row (persistGovernedActionSignature
 * / persistGovernedSignSignature / persistElectronicSignature / writeMutation).
 * "Handler" is the enclosing top-level statement: a `router.<verb>(…)` block, a
 * `registerToolHandler(…)` block, or a top-level function.
 *
 * ── Deliberately textual ──────────────────────────────────────────────────────
 * A token in the handler is not proof the ceremony is correct or reachable; the
 * behavioural proof is each surface's own tests. What this buys is that a NEW
 * signature cannot be written without its author having wired the ceremony, and
 * that the existing population is a number that can only fall. The baseline is
 * per file WITH A WRITTEN REASON; an entry without one fails.
 *
 * ── Known limits (from the adversarial review, 2026-09-23) ─────────────────────
 * A literal 'sign' is found bare, in a ternary, or as a template literal, in
 * a `command:` property or in a governed helper's first three arguments.
 * The scanner can miss a sign write that:
 *   - passes the command as a variable or shorthand (`{ command }`), or a
 *     constant rather than the literal 'sign';
 *   - puts the command after the third positional argument of a helper;
 *   - calls recordGovernedAction under an import alias;
 *   - goes through a helper whose name does not start with `governed`;
 *   - sits in routes nested inside one factory function, where one route's
 *     verifyReauth makes an unceremonied sibling look covered (the "handler"
 *     is the enclosing column-0 statement).
 * It cannot see a proof handed across a function boundary (the eSTAR and
 * governed-transmit baseline entries). These limits are why the baseline carries
 * reasons and why each signing surface keeps its own behavioural tests.
 *
 * The baseline is exact: an entry above the current count fails too, so fixing a
 * site means lowering its entry, and a freed allowance cannot absorb a new site.
 *
 * Usage:
 *   node scripts/ci/check-sign-ceremony.mjs            # fail on new sites
 *   node scripts/ci/check-sign-ceremony.mjs --list     # every site, with verdict
 *   node scripts/ci/check-sign-ceremony.mjs --write-baseline   # counts only; reasons are written by hand
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'scripts/ci/sign-ceremony-baseline.json');

const REAUTH = /\b(?:verifyReauth|reverifySigner)\s*\(/;
const SIGNATURE_ROW = /\b(?:persistGovernedActionSignature|persistGovernedSignSignature|persistElectronicSignature|writeMutation)\s*\(/;

/** Top-level statement starts: the unit a "handler" is measured over. */
const HANDLER_START = /^(?:router\s*\.\s*\w+\s*\(|registerToolHandler\s*\(|(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|(?:export\s+)?const\s+[\w$]+\s*=\s*(?:async\b|\()|app\s*\.\s*\w+\s*\()/;

/**
 * Blank out comments, keeping string literals and newlines. A quoted or
 * commented occurrence is documentation; a string literal is how `'sign'` is
 * passed, so strings must survive.
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Index of the quote that closes the string literal opening at `i`. */
function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === q) return j;
    j += 1;
  }
  return j;
}

/** The argument text of the call whose `(` is at `open`, balanced; parentheses inside strings do not count. */
function callSpan(code, open) {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    const ch = code[j];
    if (ch === '"' || ch === "'" || ch === '`') { j = skipString(code, j); continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(open, j + 1);
    }
  }
  return code.slice(open);
}

/** A call's arguments (span includes its parens), split at top-level commas. */
function topLevelArgs(span) {
  const inner = span.slice(1, span.endsWith(')') ? -1 : undefined);
  const args = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < inner.length; j++) {
    const ch = inner[j];
    if (ch === '"' || ch === "'" || ch === '`') { j = skipString(inner, j); continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { args.push(inner.slice(start, j)); start = j + 1; }
  }
  args.push(inner.slice(start));
  return args.map((a) => a.trim());
}

/** Every value given to a `command:` property in `text`, up to its top-level `,` or closing brace. */
function commandValues(text) {
  const out = [];
  const re = /\bcommand\s*:/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    let depth = 0;
    let j = start;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === '"' || ch === "'" || ch === '`') { j = skipString(text, j); continue; }
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) break;
    }
    out.push(text.slice(start, j));
  }
  return out;
}

/** The literal 'sign' anywhere in an expression: bare, in a ternary, or as a template. */
const SIGN_LITERAL = /(['"`])sign\1/;
const CALLBACK = /=>|^(?:async\s+)?function\b/;
/** A `function name(` declaration, whose parameter types may name 'sign' without writing it. */
const isDeclaration = (code, index) => /\bfunction\s*\*?\s*$/.test(code.slice(Math.max(0, index - 40), index));

const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

/** Every sign-ledger write site in `code` (comment-stripped), as indices. */
export function findSignSites(code) {
  const sites = [];
  const rga = /\brecordGovernedAction\s*\(/g;
  let m;
  while ((m = rga.exec(code))) {
    if (isDeclaration(code, m.index)) continue;
    const open = m.index + m[0].length - 1;
    if (commandValues(callSpan(code, open)).some((v) => SIGN_LITERAL.test(v))) sites.push({ index: m.index, kind: 'recordGovernedAction' });
  }
  // governed(req, res, 'sign', …), governedPdev(ctx, 'sign', …): the command is
  // one of the leading positional arguments. A ternary there
  // (`approved ? 'sign' : 'resolve'`) is a sign write on one branch.
  const helper = /\bgoverned\w*\s*\(/g;
  while ((m = helper.exec(code))) {
    if (isDeclaration(code, m.index)) continue;
    const open = m.index + m[0].length - 1;
    const leading = topLevelArgs(callSpan(code, open)).slice(0, 3);
    if (leading.some((a) => !CALLBACK.test(a) && SIGN_LITERAL.test(a))) sites.push({ index: m.index, kind: 'governed-helper' });
  }
  const wm = /\bwriteMutation\s*\(\s*(['"`])sign\1/g;
  while ((m = wm.exec(code))) sites.push({ index: m.index, kind: 'writeMutation' });
  return sites.sort((a, b) => a.index - b.index);
}

/** The enclosing top-level statement: from its column-0 start to the next one. */
export function handlerBody(code, index) {
  const lines = code.split('\n');
  const siteLine = lineOf(code, index) - 1;
  let start = 0;
  for (let l = siteLine; l >= 0; l--) {
    if (HANDLER_START.test(lines[l])) { start = l; break; }
  }
  let end = lines.length;
  for (let l = siteLine + 1; l < lines.length; l++) {
    if (HANDLER_START.test(lines[l])) { end = l; break; }
  }
  return { text: lines.slice(start, end).join('\n'), startLine: start + 1 };
}

/** Scan one file's source. Returns every site with its verdict. */
export function scanSource(src) {
  const code = stripComments(src);
  return findSignSites(code).map((s) => {
    const body = handlerBody(code, s.index);
    const reauth = REAUTH.test(body.text);
    const signatureRow = s.kind === 'writeMutation' || SIGNATURE_ROW.test(body.text);
    return { line: lineOf(code, s.index), kind: s.kind, handlerLine: body.startLine, reauth, signatureRow, ok: reauth && signatureRow };
  });
}

function serverFiles() {
  const out = execSync("git ls-files --cached --others --exclude-standard 'server/**/*.ts' 'server/*.ts'", { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/(^|\/)__tests__\//.test(f) && !/\.(test|spec|dbtest)\.ts$/.test(f) && !f.endsWith('.d.ts'));
}

export function scanRepo() {
  const results = {};
  for (const f of serverFiles()) {
    const abs = path.join(ROOT, f);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, 'utf8');
    if (!/['"]sign['"]/.test(src)) continue;
    const sites = scanSource(src);
    if (sites.length) results[f] = sites;
  }
  return results;
}

/** Compare a scan to a baseline. Pure, so the selftest can drive it. */
export function evaluate(scan, baseline) {
  const files = baseline?.files ?? {};
  const failures = [];
  const unreasoned = [];
  let baselined = 0;
  const shrinkable = [];
  for (const [f, entry] of Object.entries(files)) {
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 20) unreasoned.push(f);
  }
  for (const [f, sites] of Object.entries(scan)) {
    const bad = sites.filter((s) => !s.ok);
    const allowed = Number(files[f]?.count ?? 0);
    if (bad.length > allowed) failures.push({ file: f, count: bad.length, allowed, sites: bad });
    else baselined += bad.length;
    if (bad.length < allowed) shrinkable.push({ file: f, count: bad.length, allowed });
  }
  for (const [f, entry] of Object.entries(files)) {
    if (!scan[f] && Number(entry?.count ?? 0) > 0) shrinkable.push({ file: f, count: 0, allowed: Number(entry.count) });
  }
  return { failures, unreasoned, baselined, shrinkable };
}

function main() {
  const args = process.argv.slice(2);
  const scan = scanRepo();
  if (args.includes('--list')) {
    for (const [f, sites] of Object.entries(scan)) {
      for (const s of sites) {
        const why = s.ok ? 'ok' : [!s.reauth && 'no signer re-verification', !s.signatureRow && 'no signature row'].filter(Boolean).join(', ');
        console.log(`${f}:${s.line}  ${s.kind}  ${why}`);
      }
    }
    return;
  }
  if (args.includes('--write-baseline')) {
    const prior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { files: {} };
    const files = {};
    for (const [f, sites] of Object.entries(scan)) {
      const n = sites.filter((s) => !s.ok).length;
      if (n) files[f] = { count: n, reason: prior.files?.[f]?.reason ?? 'TODO: write why this file may keep an unceremonied sign write' };
    }
    writeFileSync(BASELINE, JSON.stringify({ $note: prior.$note, files }, null, 2) + '\n');
    console.log(`[ci:sign-ceremony] wrote ${Object.keys(files).length} file(s) to the baseline. Replace every TODO with a reason.`);
    return;
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { files: {} };
  const { failures, unreasoned, baselined, shrinkable } = evaluate(scan, baseline);
  let failed = false;
  if (failures.length) {
    failed = true;
    console.error('[ci:sign-ceremony] FAIL — a `sign` ledger write without the signature ceremony:');
    for (const f of failures) {
      for (const s of f.sites) {
        const why = [!s.reauth && 'no verifyReauth/reverifySigner', !s.signatureRow && 'no signature-row write'].filter(Boolean).join(', ');
        console.error(`  ✗ ${f.file}:${s.line}  (${why})`);
      }
      if (f.allowed) console.error(`    ${f.file}: ${f.count} site(s), baseline allows ${f.allowed}.`);
    }
    console.error('\n  A `sign` row is read as an electronic signature. Route the act through the');
    console.error('  canonical ceremony (POST /api/c2c/actions/sign, or verifyReauth + the ledger');
    console.error('  pair + persistGovernedSignSignature on one transaction, as');
    console.error('  server/services/protocol-development/protocol-signature.ts does), or record');
    console.error('  it under a command that does not claim a signature.');
  }
  if (unreasoned.length) {
    failed = true;
    console.error('[ci:sign-ceremony] FAIL — baseline entries with no written reason:');
    for (const f of unreasoned) console.error(`  ✗ ${f}`);
  }
  if (shrinkable.length) {
    failed = true;
    console.error('[ci:sign-ceremony] FAIL — the baseline allows more than exists. Lower these entries (or remove them at 0) so the freed allowance cannot absorb a new site:');
    for (const x of shrinkable) console.error(`  ✗ ${x.file}: ${x.count} now, baseline ${x.allowed}`);
  }
  if (failed) process.exit(1);
  console.log(`[ci:sign-ceremony] OK — no new sign write without the ceremony. ${baselined} baselined site(s) remain, exactly as baselined.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
