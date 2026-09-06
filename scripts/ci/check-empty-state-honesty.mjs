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
  // A negation crossed with a finding-noun. This replaces four hand-written
  // sentences that each missed the same claim said a different way: an
  // adversarial pass found "No issues found", "No risks identified", "No gaps
  // detected" and "No contradictions detected" all sailing past, because the
  // old rule demanded a trailing left|remain|outstanding.
  /\b(?:no|none|zero|nothing)\b[^.<>{}]{0,40}\b(?:blockers?|findings?|issues?|risks?|gaps?|deviations?|contradictions?|deficiencies|discrepanc\w+|signals?|warnings?|errors?|gaps?)\b/i,
  /\bnothing\s+(?:is\s+)?(?:blocking|outstanding|pending|open|overdue|alarming|to\s+\w+)\b/i,
  /\bno\s+(?:action|remediations?|pushback|critical\s+issues?)\b[^.<>{}]{0,20}(?:needed|required|surfaced|found)?/i,
  /\byou'?re close\b/i,
  /\bis fileable\b|\bready to file\b|\bfiling-ready\b/i,
  /\bbuilding steadily\b/i,
  /\bon top of (?:this|your)\b/i,
  // The space belongs INSIDE the alternation. `you (?:are|'re)` requires
  // "you " then "'re", so it matched "you are on track" and NOT the
  // contraction — which is how the phrase is actually written. The gate's only
  // live finding survived on the accident that that one string was spelled out
  // in full; three characters would have silenced it.
  /\byou(?:\s+are|'re)\s+on track\b/i,
  /\bin good standing\b/i,
  /\bdoing its job\b/i,
  /\bare secured\b|\bin hand\b/i,
  /\bnot in scope\b/i,
  /\ball clear\b|\byou'?re all set\b/i,
  /\ball\s+\w+\s+(?:are\s+)?(?:current|up to date|complete|clear|signed|verified|approved)\b/i,
  /\bsurveillance is\b[^.<>{}]{0,24}\bworking\b/i,
];

/**
 * Ternary conditions that test EMPTINESS, with the branch an empty collection
 * selects. `whenEmpty: 'consequent'` means the `? A` side fires when empty.
 */
const EMPTINESS = [
  { re: /!\s*([A-Za-z_$][\w$.?]*)\s*(?:\.length|\?\.length)\s*$/, whenEmpty: 'consequent' },
  { re: /\)?\s*(?:\.length|\?\.length)\s*(?:\?\?\s*0\s*\)?)?\s*===?\s*0\s*$/, whenEmpty: 'consequent' },
  { re: /\)?\s*(?:\.length|\?\.length)\s*>\s*0\s*$/, whenEmpty: 'alternate' },
  { re: /\)?\s*(?:\.length|\?\.length)\s*!==?\s*0\s*$/, whenEmpty: 'alternate' },
  // `x.size === 0`, `Object.keys(x).length === 0` and `count === 0` name the
  // same emptiness without the identifier-adjacent `.length` the first rules
  // require.
  { re: /\.size\s*===?\s*0\s*$/, whenEmpty: 'consequent' },
  { re: /\b(\w*(?:Count|Total))\s*===?\s*0\s*$/, whenEmpty: 'consequent' },
  { re: /\b(\w*(?:Count|Total))\s*>\s*0\s*$/, whenEmpty: 'alternate' },
  // A named emptiness boolean — `nothingOnFile`, `deviceEmpty`, `isEmpty` — is
  // this codebase's REPAIRED idiom, so keying only on `.length` meant coverage
  // SHRANK as the code improved.
  { re: /\b(\w*(?:[Ee]mpty|[Nn]othingOnFile|NoData|noData))\s*$/, whenEmpty: 'consequent' },
  { re: /!\s*([A-Za-z_$][\w$.?]*)\s*$/, whenEmpty: 'consequent' },
  // Bare truthiness: `items.length ? A : B`, `items.length && top ? A : B`.
  { re: /\)?\s*(?:\.length|\?\.length)\s*(?:&&\s*[\w$.]+\s*)?$/, whenEmpty: 'alternate' },
];

/**
 * Copy that DENIES an assessment rather than reporting its result.
 *
 * The broadened vocabulary immediately flagged the repair. NdaCockpit's honest
 * not-assessed branch reads
 *
 *   "There is no NDA/BLA submission in scope, so no module readiness, no
 *    Module 1 worklist and no Refuse-to-File finding exists to report."
 *
 * which contains "no … finding" and is the exact sentence this whole rule
 * exists to produce. The distinction is not the noun — both say "no findings" —
 * it is the CLAIM: a clearance claim asserts absence as a verdict, the honest
 * one asserts absence of an assessment and names what is missing.
 *
 * So a branch that says so is not a finding, whatever nouns it uses. This is
 * the semantic the gate is actually enforcing, and stating it here is more
 * honest than tuning the noun list until the repair stops matching.
 */
const HONEST_DISCLAIMER =
  new RegExp(
    [
      // Explicit denials of assessment.
      'nothing has been assessed',
      'has not been (?:run|assessed|recorded|screened|evaluated|authored)',
      'have not been (?:run|assessed|recorded|screened|authored)',
      'exists? to report',
      'has nothing to report',
      'is unknown',
      'standing is (?:unknown|untracked)',
      'rather than clear',
      'untracked',
      'not a clean',
      'no\\s+\\w+\\s+has been (?:run|recorded|logged)',
      'never been',
      'no .{0,40}assessment has been',
      'present or absent',
      'could not be verified',
      'nothing was invented',
      'nothing is inferred',
      // "No X YET" is the not-yet-populated idiom, not a verdict. This is the
      // single biggest discriminator: an honest empty state says the thing has
      // not happened, a clearance claim says it happened and found nothing.
      'no[^.<>{}]{0,60}\\byet\\b',
      'not (?:yet )?(?:been )?(?:connected|populated|configured)',
      // …and it names what would populate it.
      'appears? here once',
      'appear here (?:once|when)',
      'populate',
      '(?:record|run|add|connect|create|open)[^.<>{}]{0,30}\\bfirst\\b',
    ].join('|'),
    'i',
  );

/**
 * A nested ternary condition naming positive evidence that an assessment ran.
 * When the clearance copy sits behind one of these, the branch is honest.
 */
const EVIDENCE_GUARD =
  /(?:mayReassure\s*\(|assessmentState\s*\(|hasAnswer\s*\(|===\s*'assessed-clear'|!==?\s*'not-assessed'|\b(?:assessed|assessmentRan|hasRun|wasRun|evaluated|screened)\b\s*(?:\)|&&|\|\||\?))/;

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
          alternate: boundedExpression(src, i + 1),
        };
      }
    }
  }
  return null;
}

/**
 * The alternate of a ternary is ONE expression. Read it as one: walk forward
 * with depth tracking and stop at the first depth-0 `;` (a statement boundary —
 * we have left the expression) or when a closer takes depth below zero (the
 * enclosing `{…}` / `(…)` container has ended, so the branch has too).
 *
 * The previous form took a blind 1200-character raw window after the colon. It
 * ran straight past the branch into whatever followed — following statements,
 * sibling JSX rows — and produced two false positives from text that was never
 * in the branch at all: a refusal reason (`return { ok: false, reason: 'No
 * contradiction named …' }`) two statements later, and "Nothing to pay." from
 * an unrelated row. A gate that flags copy the branch never contained is one
 * people learn to ignore. Still capped at 1200 so a pathological file cannot
 * hang the scan.
 */
function boundedExpression(src, start) {
  let depth = 0;
  const end = Math.min(src.length, start + 1200);
  for (let i = start; i < end; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth < 0) return src.slice(start, i);
    } else if (c === ';' && depth === 0) {
      return src.slice(start, i);
    }
  }
  return src.slice(start, end);
}

/** Human-readable copy inside a JSX branch: drop expressions and tags. */
function prose(branch) {
  return branch
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
    // Typographic apostrophes and their entities. Without this, "You’re close"
    // and "You&rsquo;re close" match nothing, so a routine microcopy pass
    // normalising punctuation would silently disable a third of the patterns.
    .replace(/&rsquo;|&apos;|&#39;|[\u2018\u2019]/g, "'")
    .replace(/&mdash;|&nbsp;|&amp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
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

    // Says outright that nothing was assessed — the correct pattern, not the
    // defect. Checked on the rendered prose so JSX tags between the words do
    // not hide it.
    if (HONEST_DISCLAIMER.test(prose(emptyBranch))) continue;

    const text = prose(emptyBranch);
    if (text.length < 8) continue;
    // Code, not copy: an arrow, a return, a statement terminator, or a call
    // shape survived the strip. Clearance a user reads contains none of these.
    if (/=>|\breturn\b|;|\bconst\b|\bif\s*\(|\.filter\(|\.map\(/.test(text)) continue;

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

/** The string and template literals a statement body renders, as prose. */
function literalProse(body) {
  const out = [];
  const re = /`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return prose(out.join(' ').replace(/\$\{[^{}]*\}/g, ' '));
}

/** Read `(...)` starting at `open`, returning its text and the index after it. */
function readParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return { text: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Read the statement after a condition: a `{…}` block, or up to the `;`. */
function readBody(src, from) {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === '{') {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return { text: src.slice(i + 1, j), end: j + 1 };
      }
    }
    return null;
  }
  const semi = src.indexOf(';', i);
  return semi === -1 ? null : { text: src.slice(i, semi), end: semi + 1 };
}

/**
 * The same rule for `if (…) {…} else if (…) {…} else {…}`.
 *
 * The ternary walk above was the whole gate, so rewriting a flagged ternary as
 * an if/else chain silenced it with the defect still in place. Proven by
 * falsification on the dispatch surface's reload-findings copy: with the
 * evidence branch deleted from an if/else chain, the gate stayed green.
 *
 * A chain's clearance branch is honest when an EARLIER condition in the SAME
 * chain tested positive evidence that the assessment ran — reaching the later
 * branch means that test already passed. That is the statement-level twin of
 * EVIDENCE_GUARD, which reads a nested ternary's condition instead.
 */
function scanIfChains(code, label) {
  const hits = [];
  const lineOf = (i) => code.slice(0, i).split('\n').length;

  for (let m = /\bif\s*\(/g, r = m.exec(code); r !== null; r = m.exec(code)) {
    // `else if` is read as part of its chain, never as a fresh head.
    if (/\belse\s*$/.test(code.slice(Math.max(0, r.index - 8), r.index))) continue;

    const chain = [];
    let cursor = r.index + r[0].length - 1;
    let head = r.index;
    for (let guard = 0; guard < 12; guard++) {
      const cond = readParen(code, cursor);
      if (!cond) break;
      const body = readBody(code, cond.end);
      if (!body) break;
      chain.push({ at: head, cond: cond.text, body: body.text });
      const after = code.slice(body.end, body.end + 40);
      const elseIf = after.match(/^\s*else\s*if\s*\(/);
      if (elseIf) {
        head = body.end + elseIf[0].length - elseIf[0].trimStart().length;
        cursor = body.end + elseIf[0].length - 1;
        continue;
      }
      const elseOnly = after.match(/^\s*else\b/);
      if (elseOnly) {
        const tail = readBody(code, body.end + elseOnly[0].length);
        if (tail) chain.push({ at: body.end, cond: null, body: tail.text });
      }
      break;
    }
    if (chain.length < 2) continue;

    for (let i = 0; i < chain.length; i++) {
      const { cond } = chain[i];
      if (!cond) continue;
      const rule = EMPTINESS.find((x) => x.re.test(cond.replace(/\s+$/, '')));
      if (!rule) continue;

      // Which branch an empty collection reaches: this one, or the rest of the
      // chain it falls through to.
      const selected =
        rule.whenEmpty === 'consequent'
          ? chain[i].body
          : chain.slice(i + 1).map((c) => (c.cond ?? '') + ' ' + c.body).join(' ');
      if (!selected.trim()) continue;

      // Evidence anywhere on the path to this branch — inside it, or in a
      // condition the chain already passed to reach it.
      const earlier = chain.slice(0, i).map((c) => c.cond ?? '').join(' ');
      if (EVIDENCE_GUARD.test(selected) || EVIDENCE_GUARD.test(earlier)) continue;

      const text = literalProse(selected);
      if (text.length < 8) continue;
      if (HONEST_DISCLAIMER.test(text)) continue;
      if (!CLEARANCE.some((c) => c.test(text))) continue;

      hits.push({
        file: label,
        line: lineOf(chain[i].at),
        collection: (cond.match(rule.re) || [])[1] || '(collection)',
        claim: text.slice(0, 150),
      });
    }
  }
  return hits;
}

function scanFile(rel) {
  const code = stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
  return [...scanSource(code, rel), ...scanIfChains(code, rel)];
}

function sourceFiles() {
  return execSync("git ls-files 'client/src/**/*.tsx' 'client/src/*.tsx' 'client/src/**/*.ts' 'client/src/**/*.jsx'", {
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
