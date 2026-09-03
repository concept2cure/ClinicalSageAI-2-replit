#!/usr/bin/env node
/**
 * CI Guard: a success message painted before the response was checked.
 *
 * ── The defect, found three times ─────────────────────────────────────────────
 * `apiRequest` (client/src/lib/queryClient.ts) throws on every non-2xx EXCEPT
 * 401, which it RETURNS so callers can say "sign in" rather than "server
 * error". A handler that leans on the throw alone therefore falls straight
 * through to its success branch on an expired session:
 *
 *   Vault.fileDocument        → "Recorded in the audit trail"       (nothing was)
 *   Biostatistics.attach      → "<doc> attached to dossier"          (nothing was)
 *   AuthoringFilingBar.doFreeze → "Document frozen and sealed"      (server refused)
 *
 * Each was caught by a human reading a screen. In a filing product a false
 * "sealed" or "recorded" is not a cosmetic bug: the user stops chasing an act
 * that never happened, and the gap surfaces at review, if at all.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * Inside one handler, after `await apiRequest(...)`, a success-sounding toast or
 * note (saved / recorded / sealed / signed / …) must not be reached before the
 * response's `ok` or `status` has been consulted. Routing the call through one
 * of the codebase's checked helpers (`mutateVerbatim`, `liveMutateOrNull`,
 * `readJson`, `saveToAuthoring`, `extractApiError`) counts as consulting it.
 *
 * The heuristic is narrow on purpose: it reads at most 900 characters after the
 * call, and only reports when a success phrase appears in that window with no
 * response check between. A handler that checks `ok` and then celebrates is
 * silent here. A handler that celebrates in a catch block is silent here too —
 * that is a different defect with a different gate.
 *
 * Usage:
 *   node scripts/ci/check-success-before-ok.mjs               # fail on any hit
 *   node scripts/ci/check-success-before-ok.mjs --list
 *   node scripts/ci/check-success-before-ok.mjs --self-test   # prove it works
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const FIXTURES = path.join(ROOT, 'tests/fixtures/success-before-ok');

/** A message that tells the user the act happened. */
const SUCCESS =
  /(fireToast|fire|setNote|setStatus|setMsg|toast|notify)\s*\(\s*(\{[^}]*tone:\s*'ok'[^}]*\}|['"`][^'"`]*\b(saved|recorded|created|updated|applied|signed|sealed|frozen|exported|published|attached|deleted|removed|submitted|sent|filed|promoted|routed|released|archived|approved|dispatched)\b[^'"`]*['"`])/i;

/** Evidence the response was consulted, or the call went through a checked helper. */
const CHECKED =
  /\.ok\b|\bstatus\s*[!=<>]=|res\.status|r\.status|\bok\b\s*[,)}]|!ok\b|mutateVerbatim|liveMutateOrNull|readJson|saveToAuthoring|extractApiError|apiJson|apiPost|apiPatch/;

const CALL = /await\s+apiRequest\s*\(/g;
const WINDOW = 900;

function sourceFiles() {
  return execSync(
    "git ls-files 'client/src/concept2cure/v2/surfaces/*.tsx' 'client/src/concept2cure/v2/editor/*.tsx' 'client/src/concept2cure/v2/*.tsx' 'client/src/concept2cure/components/**/*.tsx'",
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.tsx$|\/fixtures\//.test(f));
}

/** Blank comments so prose ABOUT a defect is not read as the defect. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

export function scan(file, raw) {
  const code = stripComments(raw);
  const out = [];
  let m;
  CALL.lastIndex = 0;
  while ((m = CALL.exec(code)) !== null) {
    const window = code.slice(m.index, m.index + WINDOW);
    const s = SUCCESS.exec(window);
    if (!s) continue;
    if (CHECKED.test(window.slice(0, s.index))) continue;
    const line = code.slice(0, m.index).split('\n').length;
    out.push({ file, line, claim: s[0].replace(/\s+/g, ' ').slice(0, 90) });
  }
  return out;
}

if (process.argv.includes('--self-test')) {
  let ok = true;
  for (const f of readdirSync(FIXTURES)) {
    const hits = scan(f, readFileSync(path.join(FIXTURES, f), 'utf8'));
    if (hits.length === 0) { console.error(`  ✗ ${f}: flagged nothing`); ok = false; }
    else console.log(`  ✓ ${f}: flagged ${hits.length} — e.g. ${hits[0].claim}`);
  }
  for (const f of ['client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx',
                   'client/src/concept2cure/v2/surfaces/Vault.tsx',
                   'client/src/concept2cure/v2/surfaces/Biostatistics.tsx']) {
    const hits = scan(f, readFileSync(path.join(ROOT, f), 'utf8'));
    if (hits.length > 0) { console.error(`  ✗ ${f}: still flags ${hits.map((h) => h.claim).join(' | ')}`); ok = false; }
    else console.log(`  ✓ ${f}: silent on the repaired source`);
  }
  console.log(ok ? '\nself-test PASSED — catches the real defect, quiet on the repair.' : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

const hits = [];
for (const file of sourceFiles()) hits.push(...scan(file, readFileSync(path.join(ROOT, file), 'utf8')));

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.claim}`);
  console.log(`\n${hits.length} occurrence(s).`);
  process.exit(0);
}

if (hits.length > 0) {
  console.error('\n❌ A success message is reached before the response was checked.\n');
  for (const h of hits) console.error(`   ${h.file}:${h.line}  ${h.claim}`);
  console.error(`
   apiRequest RETURNS a 401 instead of throwing it. A handler that relies on
   the throw alone reaches this message on an expired session — telling the
   user something was saved, sealed or recorded when the server refused it.

   Check res.ok / res.status (or route the call through mutateVerbatim,
   liveMutateOrNull, readJson or saveToAuthoring) before any success message.
`);
  process.exit(1);
}

console.log(`check-success-before-ok: no occurrences across ${sourceFiles().length} file(s).`);
