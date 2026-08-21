#!/usr/bin/env node
/**
 * CI Guard: clearance copy selected by an EMPTY collection.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * BIOPHARMA_WORK_ORDER.md's standing verification checklist:
 *
 *   [ ] No AI narrative asserts readiness or absence of blockers over an empty state
 *
 * That line had no executable answer. Every other item on the checklist is
 * gated — internals-in-copy, toast canonicality, the Part 11 chain, the three
 * hand-verified engine results. This one was checked by a human reading screens,
 * which is how it was found in the first place and is not repeatable.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The archetype, from the NDA/BLA filing cockpit as it actually shipped:
 *
 *   headline={highs.length && topHigh
 *     ? <>…{topHigh.area} would get you refused at the filing door.</>
 *     : <>You're {overall}% ready to file — no Refuse-to-File blockers left…</>}
 *
 * A two-branch conditional has no representation for "nothing has been
 * assessed", so "we found nothing" and "we have not looked" are the same
 * expression. Over a program with no content the surface asserted there were no
 * Refuse-to-File blockers — the precise risk it exists to manage.
 *
 * The rule this enforces is stated once, in
 * client/src/concept2cure/v2/assessmentState.ts: an empty findings set is not a
 * finding of "none". Clearance is a POSITIVE claim and needs positive evidence
 * that an assessment ran.
 *
 * ── Why the detection is two-sided, and therefore quiet ───────────────────────
 * A finding requires BOTH:
 *
 *   1. a ternary whose condition is an EMPTINESS test — `x.length`,
 *      `!x.length`, `x.length === 0`, `x.length > 0` — and
 *   2. clearance VOCABULARY in the branch that an empty collection selects.
 *
 * Either alone is ordinary code. `items.length ? <List/> : <Empty/>` is the
 * correct pattern and is silent here. "You're on track" guarded by a real
 * assessment is silent here. Only the conjunction — reassurance chosen BY
 * emptiness — is reported, which is exactly the defect and nothing else.
 *
 * Branch selection is computed, not guessed: for `x.length ? A : B` the empty
 * branch is B; for `!x.length ? A : B` and `x.length === 0 ? A : B` it is A.
 * Reporting the wrong branch would flag correct empty states, and a gate that
 * flags the correct pattern trains people to ignore it.
 *
 * ── Seen to fail on the real thing ────────────────────────────────────────────
 * The fixtures under tests/fixtures/empty-state-honesty/ are the ACTUAL pre-fix
 * sources of NdaCockpit.tsx and BiopharmaSpecialty.tsx, recovered from git
 * (01b1025^ and 38aeb4f^). `--self-test` runs the gate over them and requires it
 * to flag them, then over the current versions and requires silence. Not a
 * synthetic probe — the code that shipped the defect.
 *
 * Usage:
 *   node scripts/ci/check-empty-state-honesty.mjs                 # fail on new
 *   node scripts/ci/check-empty-state-honesty.mjs --list          # show all
 *   node scripts/ci/check-empty-state-honesty.mjs --self-test     # prove it works
 *   node scripts/ci/check-empty-state-honesty.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/empty-state-honesty-baseline.json');
const FIXTURES = path.join(ROOT, 'tests/fixtures/empty-state-honesty');

/**
 * Copy that asserts clearance, safety, progress or completeness.
 *
 * Every phrase here was observed on a real screen — in the UAT report, or in the
 * pre-fix sources kept as fixtures. This is not a list of words to avoid; it is
 * a list of claims that require evidence, and the gate only fires when one is
 * selected BY an empty collection.
 */
const CLEARANCE = [
  /\bno\b[^.<>{}]{0,40}\bblockers?\b/i,
  /\bno\b[^.<>{}]{0,30}\b(?:findings?|issues?|risks?|gaps?)\b[^.<>{}]{0,20}\b(?:left|remain|outstanding)\b/i,
  /\byou'?re close\b/i,
  /\bis fileable\b|\bready to file\b/i,
  /\bbuilding steadily\b/i,
  /\bon top of (?:this|your)\b/i,
  /\byou (?:are|'re) on track\b/i,
  /\bin good standing\b/i,
  /\bnothing is (?:overdue|alarming)\b/i,
  /\bnothing (?:is )?(?:crosses|crossed) the threshold\b/i,
  /\bdoing its job\b/i,
  /\bare secured\b|\bin hand\b/i,
  /\bnot in scope\b/i,
  /\ball clear\b|\byou'?re all set\b/i,
  /\bnothing (?:to worry|needs your attention)\b/i,
  /\bsurveillance is\b[^.<>{}]{0,24}\bworking\b/i,
];

/**
 * Ternary conditions that test EMPTINESS, with the branch an empty collection
 * selects. `whenEmpty: 'consequent'` means the `? A` side fires when empty.
 */
const EMPTINESS = [
  { re: /!\s*([A-Za-z_$][\w$.]*)\s*(?:\.length|\?\.length)\s*$/, whenEmpty: 'consequent' },
  { re: /([A-Za-z_$][\w$.]*)\s*(?:\.length|\?\.length)\s*===?\s*0\s*$/, whenEmpty: 'consequent' },
  { re: /([A-Za-z_$][\w$.]*)\s*(?:\.length|\?\.length)\s*>\s*0\s*$/, whenEmpty: 'alternate' },
  { re: /([A-Za-z_$][\w$.]*)\s*(?:\.length|\?\.length)\s*!==?\s*0\s*$/, whenEmpty: 'alternate' },
  // Bare truthiness: `items.length ? A : B` and `items.length && top ? A : B`.
  { re: /([A-Za-z_$][\w$.]*)\s*(?:\.length|\?\.length)\s*(?:&&\s*[\w$.]+\s*)?$/, whenEmpty: 'alternate' },
];

/**
 * A nested ternary condition naming positive evidence that an assessment ran.
 * When the clearance copy sits behind one of these, the branch is honest.
 */
const EVIDENCE_GUARD = /\b(?:assessed|assessmentRan|hasRun|wasRun|evaluated|reviewed|screened|checked|analysed|analyzed|completed|isLive|loaded)\b[^?]{0,60}\?/;

/** Split `A : B` at the `:` that belongs to THIS ternary. */
function splitBranches(src, qIndex) {
  let depth = 0;
  let nested = 0;
  for (let i = qIndex + 1; i < src.length && i < qIndex + 4000; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth < 0) return { consequent: src.slice(qIndex + 1, i), alternate: '' };
    } else if (depth === 0) {
      if (c === '?') nested++;
      else if (c === ':') {
        if (nested > 0) { nested--; continue; }
        // Not a ternary colon if it is `::` or a TS type annotation in an arg list.
        return {
          consequent: src.slice(qIndex + 1, i),
          alternate: src.slice(i + 1, Math.min(src.length, i + 1200)),
        };
      }
    }
  }
  return null;
}

/** Human-readable copy inside a JSX branch: drop expressions and tags. */
function prose(branch) {
  return branch
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&mdash;|&nbsp;|&amp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function scanSource(code, label) {
  const hits = [];
  const lineOf = (i) => code.slice(0, i).split('\n').length;

  for (let q = code.indexOf('?'); q !== -1; q = code.indexOf('?', q + 1)) {
    // `?.` optional chaining and `??` are not ternaries.
    if (code[q + 1] === '.' || code[q + 1] === '?' || code[q - 1] === '?') continue;

    const before = code.slice(Math.max(0, q - 160), q).replace(/\s+$/, '');
    const rule = EMPTINESS.find((r) => r.re.test(before));
    if (!rule) continue;

    const branches = splitBranches(code, q);
    if (!branches) continue;

    const emptyBranch = rule.whenEmpty === 'consequent' ? branches.consequent : branches.alternate;

    /* Already guarded, and this is the pattern we WANT.
       IndLifecycle does exactly the right thing:

         {R.blockers.length === 0 ? (
            {R.assessed ? <>No blockers … the package is fileable</>
                        : <>Nothing has been assessed …</>} )

       The clearance sentence is inside a nested ternary on POSITIVE EVIDENCE
       that an assessment ran, which is precisely what assessmentState.ts asks
       for. Flagging it would report the repair as the defect — and a gate that
       flags the correct pattern is one people learn to ignore. */
    if (EVIDENCE_GUARD.test(emptyBranch)) continue;

    const text = prose(emptyBranch);
    if (text.length < 8) continue;

    const matched = CLEARANCE.find((c) => c.test(text));
    if (!matched) continue;

    hits.push({
      file: label,
      line: lineOf(q),
      collection: (before.match(rule.re) || [])[1] || '(collection)',
      claim: text.slice(0, 150),
    });
  }
  return hits;
}

function scanFile(rel) {
  return scanSource(stripComments(readFileSync(path.join(ROOT, rel), 'utf8')), rel);
}

function sourceFiles() {
  return execSync("git ls-files 'client/src/**/*.tsx'", {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.tsx$|\/fixtures\//.test(f));
}

// ── --self-test: prove the gate on the code that actually shipped the defect ──
if (process.argv.includes('--self-test')) {
  let ok = true;
  const cases = [
    ['NdaCockpit.pre-fix.tsx.fixture', 'client/src/concept2cure/v2/surfaces/NdaCockpit.tsx'],
    ['BiopharmaSpecialty.pre-fix.tsx.fixture', 'client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx'],
  ];
  for (const [fixture, current] of cases) {
    const fpath = path.join(FIXTURES, fixture);
    if (!existsSync(fpath)) { console.error(`  ✗ missing fixture ${fixture}`); ok = false; continue; }
    const pre = scanSource(stripComments(readFileSync(fpath, 'utf8')), fixture);
    const now = scanFile(current);
    if (pre.length === 0) { console.error(`  ✗ ${fixture}: gate did NOT flag the pre-fix source`); ok = false; }
    else console.log(`  ✓ ${fixture}: flagged ${pre.length} — e.g. "${pre[0].claim.slice(0, 72)}…"`);
    if (now.length > 0) { console.error(`  ✗ ${current}: gate flags the FIXED source (${now[0].claim.slice(0, 70)})`); ok = false; }
    else console.log(`  ✓ ${current}: silent on the fixed source`);
  }
  console.log(ok ? '\nself-test PASSED — catches the real defect, quiet on the repair.' : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

const hits = sourceFiles().flatMap(scanFile);
const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${key(h)}  [${h.collection}]  ${h.claim}`);
  console.log(`\n${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ files: [...new Set(hits.map((h) => h.file))].sort() }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(h.file));

if (fresh.length > 0) {
  console.error('\n❌ Clearance copy selected by an EMPTY collection.\n');
  for (const h of fresh) console.error(`   ${key(h)}\n     when \`${h.collection}\` is empty → "${h.claim}"`);
  console.error(`
   An empty findings set is not a finding of "none". This copy is chosen BY the
   collection being empty, so it says "we found nothing" in a state that means
   "we have not looked". (BIOPHARMA_WORK_ORDER.md standing checklist.)

   Use the four-state discriminator instead:
     client/src/concept2cure/v2/assessmentState.ts — assessmentState/mayReassure
   Clearance requires positive evidence that an assessment RAN, passed as its own
   input; never derived from findingCount === 0.
`);
  process.exit(1);
}

const stale = baseline.filter((f) => !hits.some((h) => h.file === f));
console.log(
  `check-empty-state-honesty: no new occurrences. ${hits.length} baselined across ${new Set(hits.map((h) => h.file)).size} file(s).` +
    (stale.length ? `\n  ${stale.length} baselined file(s) now clean — run --write-baseline to shrink it.` : '')
);
