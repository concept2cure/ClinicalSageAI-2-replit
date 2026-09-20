#!/usr/bin/env node
/**
 * `live ?? FIXTURE`, and the ternary that means the same thing — a tenant's
 * regulated screen falling back to example rows.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 *     const changes = reg.changes ?? FIXTURE_CHANGES;
 *     const docs    = reg.docs    ?? FIXTURE_DOCS;
 *
 * It reads like a default. It is not. The fallback fires on exactly the
 * occasions a user cannot detect — an empty tenant, an expired token, a 500, a
 * fetch that has not started — and substitutes canonical example content for
 * the tenant's own. `client/src/concept2cure/mdx/lib/useSampleRows.ts` was
 * written to eliminate this pattern and says so in its header; these two
 * survived it, on an ICH Q10 change-control log whose rows assert
 * `classification: 'major'` / `status: 'approved'`, and on an SOP register
 * asserting `status: 'effective'` with training-completion counts. Neither
 * surface rendered a sample-data banner of any kind.
 *
 * ── Why a check and not just the fix ─────────────────────────────────────────
 * Both were repaired, and then the repair was fault-injected: putting
 * `?? FIXTURE_DOCS` back broke NOTHING. No test covered it, no gate saw it, and
 * the surface went straight back to showing invented effective SOPs. A fix with
 * nothing holding it is a fix that lasts until the next merge.
 *
 * ── What counts, and what deliberately does not ──────────────────────────────
 * CONTENT fallbacks only. There are 37 `?? UPPER_CASE` expressions in this tree
 * and most are correct:
 *
 *   `?? EMPTY_ROWS`, `?? EMPTY_TREE`   a frozen empty array, used for stable
 *                                      identity so a memo/effect dep does not
 *                                      churn. Falling back to nothing is the
 *                                      honest empty state, not a fiction.
 *   `?? ANA_MODES`, `?? SEG2PRODUCT`   configuration and lookup maps. Not
 *                                      tenant data and not example rows.
 *
 * So the signal is the NAME: an identifier named FIXTURE_* / SAMPLE_* / DEMO_*
 * / MOCK_* / SEED_*. `EMPTY_*` is exempt because empty is never a fabrication.
 *
 * The module PATH was tried as a second signal and dropped. Keying on an import
 * from `data/` or `fixtures/` produced three findings on its first run and all
 * three were false: `CER_EQUIV_DEVICES.find(…) ?? CER_EQUIV_DEVICES[1]` (a
 * lookup default inside the fixture itself, in a component that only renders
 * under sample mode), `?? PMA_PHASES[4].label` (a label taken from the phase
 * taxonomy), and `?? MAA_MARKETS` (a reference table — that the EMA is the
 * European Medicines Agency is a fact, not a tenant's data). Those modules hold
 * taxonomies and reference tables next to example rows, and nothing static
 * separates them. A guard whose first run is all noise is a guard that gets
 * `--write-baseline` run at it and stops being read, so the imprecise half is
 * gone rather than baselined.
 *
 * Two structural exclusions for the same reason: a fallback INDEXING a
 * collection (`?? FOO[1]`) is picking one element, not substituting a data set;
 * and a fallback whose identifier also appears on the LEFT of the `??` is an
 * intra-fixture default, not a live-vs-fixture swap.
 *
 * The fix is `useSampleRows(live, fixture)` — which returns the fixture only
 * under the explicit sample-mode boundary (impossible in a production build)
 * and an honest empty otherwise — plus `useShowingSample` driving a
 * `<SampleDataBanner>`. Not a wider baseline.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN = path.join(ROOT, 'client', 'src', 'concept2cure');
// ZERO-DEBT BY DECISION, NOT BY ACCIDENT (recorded 2026-09-10, WO-4).
//
// This file does not exist, and that is intentional. An absent baseline reads as
// an EMPTY one below (`existsSync(BASELINE) ? ... : []`), so every finding is
// new and the gate fails closed. The count is currently zero, so there is
// nothing to record and committing an empty JSON file would only invite someone
// to add to it.
//
// The failure mode this note prevents: a reader seeing a baseline path that
// resolves to nothing cannot tell whether zero-debt was chosen or the file was
// lost, and "restore the missing baseline" is the wrong repair for the first
// case. If you ever run --write-baseline here, you are converting a clean gate
// into a ratchet — do that deliberately and say why.
const BASELINE = path.join(ROOT, 'scripts', 'ci', 'ungated-fixture-fallback-baseline.json');

const argv = new Set(process.argv.slice(2));
const LIST = argv.has('--list');
const WRITE = argv.has('--write-baseline');

/** Content by name. `EMPTY_*` is never content — see the header. */
const CONTENT_NAME = /^(?:FIXTURE|SAMPLE|DEMO|MOCK|SEED)(?:_|$)/;


/**
 * The SECOND shape of the same defect: a ternary, not a `??`.
 *
 *     extras.pmaTrialMetrics?.length ? extras.pmaTrialMetrics : PMA_TRIAL_METRICS
 *
 * That line shipped `Enrolled 412 / 680 · Behind plan by 3 weeks` and
 * `Adverse events 47 · 3 serious · 2 device-related under adjudication` to any
 * regulated tenant whose read was empty, slow or failing — another company's
 * enrolment and another company's serious adverse events, with no banner. It is
 * identical in effect to `live ?? FIXTURE` and the `??` scan above could not see
 * it, nor could the name rule: the constants are named for the pathway, not
 * FIXTURE_/SAMPLE_/DEMO_.
 *
 * So the signal here is structural instead of lexical: the else-branch is a bare
 * identifier this file IMPORTS from a `data/` or `fixtures/` module, and the
 * then-branch is not. Two exclusions keep it honest, and both were found by
 * running it — each is a real line in this tree that is CORRECT:
 *
 *   Overview.tsx     `sourcePrograms.length > 0 || !sampleOn ? derive(...) : MDX_HEALTH`
 *                    The fixture is behind the sample-mode boundary, which is
 *                    the remedy, not the defect. A condition that consults
 *                    sample mode is exempt.
 *
 *   Pyramid.tsx      `vocab === 'risk' ? PY_RISK : PY_STATUS`
 *                    Both branches are imported constants, so this SELECTS a
 *                    vocabulary rather than substituting for absent data.
 *
 * Kept in this file rather than a new one: it is the same rule about the same
 * thing, and a second gate would be a second place to forget.
 */
const SAMPLE_GATED = /\b(?:sampleOn|isSampleMode|useSampleMode|sampleModeAvailable|showingSample)\b/;

/** Names imported as values from a `data/` or `fixtures/` module. */
function importedContentNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']*)'/g)) {
    if (!/(?:^|\/)(?:data|fixtures)\//.test(m[2])) continue;
    for (const raw of m[1].split(',')) {
      const part = raw.trim();
      if (!part || /^type\s/.test(part)) continue;          // `type Foo` is not a value
      names.add(part.replace(/\s+as\s+.*$/, '').trim());
    }
  }
  return names;
}

function ternaryFallbacks(src, rel) {
  const found = [];
  const names = importedContentNames(src);
  if (!names.size) return found;
  for (const m of src.matchAll(/\?([^?:;]{0,200}?):\s*([A-Za-z_$][\w$]*)\s*[;,)\]\n]/g)) {
    const [whole, thenBranch, id] = m;
    if (!names.has(id)) continue;
    if (names.has(thenBranch.trim())) continue;             // a selector, not a fallback
    const from = Math.max(0, m.index - 220);
    if (SAMPLE_GATED.test(src.slice(from, m.index + whole.length))) continue;
    found.push({ where: `${rel}:${src.slice(0, m.index).split('\n').length}`, id, shape: '? :' });
  }
  return found;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Blank out comments so prose ABOUT the pattern is not reported as the pattern.
 *
 * This was a line test — skip a line that STARTS with `*`, `//` or `/*` — and it
 * missed the comment style this codebase actually uses, where a block comment's
 * continuation lines are indented with no leading asterisk:
 *
 *     /* ...
 *        `ci:fixture-fallback` keys on `live ?\u003F FIXTURE` ...   <- not skipped
 *      *\/
 *
 * So the file that explains why a fallback was removed fails the check for the
 * fallback it removed. Blanking preserves line numbers, so the offsets a real
 * finding reports still point at the right line.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function main() {
  const findings = [];

  for (const file of walk(SCAN)) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(ROOT, file);

    stripComments(src).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\?\?\s*([A-Z][A-Za-z0-9_]{2,})\s*(\[|\.)?/g)) {
        const id = m[1];
        if (!CONTENT_NAME.test(id)) continue;
        // `?? FOO[1]` / `?? FOO.bar` picks an element, it does not substitute a set.
        if (m[2]) continue;
        // `X.find(…) ?? X[1]` — an intra-fixture default, not a live fallback.
        if (new RegExp(`\\b${id}\\b[\\s\\S]*\\?\\?`).test(line)) continue;
        findings.push({ where: `${rel}:${i + 1}`, id, shape: '??' });
      }
    });

    findings.push(...ternaryFallbacks(stripComments(src), rel));
  }

  findings.sort((a, b) => a.where.localeCompare(b.where));
  /* The shape is part of the identity: the same line can only hold one, and a
     reader sent to look for `??` on a ternary looks for the wrong thing. */
  const key = (f) => `${f.where} ${f.shape ?? '??'} ${f.id}`;
  const current = [...new Set(findings.map(key))].sort();

  if (WRITE) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ generated: 'by --write-baseline', findings: current }, null, 2)}\n`,
    );
    console.log(`[ci:fixture-fallback] baseline written — ${current.length} ungated fallback(s).`);
    return 0;
  }

  const baseline = new Set(
    existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')).findings ?? []) : [],
  );
  const fresh = findings.filter((f) => !baseline.has(key(f)));

  console.log('[ci:fixture-fallback] `live ?? FIXTURE` and `live?.length ? live : FIXTURE` in client/src/concept2cure');
  console.log(`  ungated content fallbacks  : ${findings.length}`);
  console.log(`  baselined (known, unfixed) : ${baseline.size}`);

  if (LIST) for (const f of findings) {
    console.log(`  ${baseline.has(key(f)) ? ' ' : '!'} ${f.where}  ${f.shape ?? '??'} ${f.id}`);
  }

  if (fresh.length === 0) {
    console.log(`\n✅ no new ungated fixture fallback. ${baseline.size} baselined.`);
    return 0;
  }

  console.log(`\n❌ ${fresh.length} new ungated fixture fallback(s):\n`);
  for (const f of fresh) console.log(`  ${f.where}  ${f.shape ?? '??'} ${f.id}`);
  console.log(
    '\n  This substitutes example content for a tenant\'s own data on exactly the\n' +
      '  occasions they cannot detect it: an empty tenant, an expired token, a 500,\n' +
      '  a fetch that has not started.\n\n' +
      '  Use `useSampleRows(live, fixture)` — it returns the fixture only under the\n' +
      '  explicit sample-mode boundary and an honest empty otherwise — and drive a\n' +
      '  <SampleDataBanner> from `useShowingSample(live)` so the substitution is\n' +
      '  never silent. See client/src/concept2cure/mdx/lib/useSampleRows.ts.',
  );
  return 1;
}

process.exit(main());
