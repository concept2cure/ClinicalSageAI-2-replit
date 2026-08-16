#!/usr/bin/env node
/**
 * CI Guard: Toast Canonicality
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `.de-toast .ico` is styled green. A toast whose only parameter is a string
 * therefore announces EVERY outcome with a success tick, including the failures.
 * BP-W0-6 found it on Word export (a 500 reported as though the document had
 * been produced); the Wave 0 design review then found the same shape on the
 * §11.50 e-signature dialog, where a REJECTED PIN drew the green tick on the one
 * action in the product that is a legally binding attestation.
 *
 * Neither was the bug. The bug was that twenty-eight surfaces each declared
 *
 *     function useToast(): [string, (m: string) => void]
 *
 * so "this toast cannot express failure" was not one defect but a property
 * re-created at every call site — fixing two of them left twenty-six. The fix is
 * one implementation, `client/src/concept2cure/v2/toast.tsx`, whose `fire` takes
 * the tone as part of its type.
 *
 * ── Why a gate and not a comment ──────────────────────────────────────────────
 * `cmcShared.tsx` carried a tone-aware toast, with a comment explaining exactly
 * this hazard, from the CMC remediation onward. Three CMC surfaces imported it.
 * Every surface written afterwards hand-rolled the one-tone version anyway, and
 * `DocumentAuthoring` — fixing this very defect — added a THIRD parallel
 * tone-aware copy rather than importing the one beside it. A correct
 * implementation nobody finds is not a canonical implementation.
 *
 * ── What is checked ───────────────────────────────────────────────────────────
 *   1. de-toast-render   `className="de-toast"` outside the canonical module.
 *                        The markup, the ARIA role and the icon are the
 *                        component's to decide; a hand-rolled div re-decides
 *                        them and always decides "success".
 *   2. local-toast       a `useToast` / `C2CToast` declaration anywhere else.
 *   3. erased-tone       a toast-shaped prop typed `(m: string) => void`.
 *                        This one is invisible to TypeScript: a one-argument
 *                        function IS assignable to a two-argument type, so
 *                        narrowing at a component boundary silently makes the
 *                        tone unpassable inside the child and nothing warns.
 *                        That is precisely how `AuthoringFilingBar` lost it.
 *   4. unconverged       the OTHER bottom/top-centre pill classes. These are the
 *                        same component under five more names, none able to
 *                        express an error. They are not migrated here because
 *                        doing so changes their appearance and that is a design
 *                        decision, not a bug fix — but the count is pinned so
 *                        the set cannot grow while the decision is pending.
 *
 * `.cl-toast` is deliberately NOT in (4). It carries its own icon chip, title
 * and a "go" action button — a genuinely different component, not a sixth name
 * for this one.
 *
 * Exit codes: 0 = clean, 1 = a new copy, a hand-rolled render, an erased tone,
 * or growth in the unconverged set.
 *
 * Usage:
 *   node scripts/ci/check-toast-canonicality.mjs
 *   node scripts/ci/check-toast-canonicality.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Scoped to the Concept2Cure v2 shell, which is where `.de-toast` and every
 * surface that renders it live.
 *
 * `client/src/hooks/use-toast.ts` is deliberately out of scope: it is the
 * shadcn/Radix toaster, a different design system with its own variant and
 * action model, and `client/src/components/ui/toaster.tsx` is its only importer
 * in the repo — no v2 surface touches it. Calling it a duplicate of this
 * component would be a false positive, and a gate that cries wolf is a gate
 * people switch off.
 */
const SCAN = path.join(ROOT, 'client', 'src', 'concept2cure');

const CANONICAL = 'client/src/concept2cure/v2/toast.tsx';

/**
 * Pill-toast classes that have not been converged onto the canonical component,
 * with the number of render sites each has today. A new one, or another site on
 * an existing one, fails the gate.
 */
const UNCONVERGED_BASELINE = {
  'pdev-toast': 6,
  'sn-toast': 1,
  'ac-toast': 1,
  'amem-toast': 1,
  'etmf-toast': 1,
};

/** Props that carry a toast fire function under one of its several names. */
const TOAST_PROP_NAMES = ['fireToast', 'onNotice', 'note', 'fire', 'toast', 'notify'];

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const violations = [];
const unconvergedCounts = Object.fromEntries(Object.keys(UNCONVERGED_BASELINE).map((k) => [k, 0]));

for (const file of walk(SCAN)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    const at = { file: rel, line: i + 1, text: line.trim().slice(0, 140) };

    // 1 — a hand-rolled render of the canonical toast's own class.
    if (rel !== CANONICAL && /className=["'`]de-toast/.test(line)) {
      violations.push({ ...at, rule: 'de-toast-render' });
    }

    // 2 — a second declaration of the canonical component or hook.
    if (rel !== CANONICAL && /^\s*(export\s+)?(function|const)\s+(useToast|C2CToast)\b/.test(line)) {
      violations.push({ ...at, rule: 'local-toast' });
    }

    // 3 — a toast function narrowed to one tone at a type boundary.
    for (const name of TOAST_PROP_NAMES) {
      const re = new RegExp(`\\b${name}\\??\\s*:\\s*\\(\\s*\\w+\\s*:\\s*string\\s*\\)\\s*=>\\s*void`);
      if (re.test(line)) {
        // The canonical module quotes the bad shape in its own documentation.
        if (rel === CANONICAL) break;
        violations.push({ ...at, rule: 'erased-tone', prop: name });
        break;
      }
    }

    // 4 — the classes still awaiting the design decision.
    for (const cls of Object.keys(UNCONVERGED_BASELINE)) {
      if (new RegExp(`className=["'\`]${cls}\\b`).test(line)) unconvergedCounts[cls]++;
    }
  });
}

for (const [cls, baseline] of Object.entries(UNCONVERGED_BASELINE)) {
  const found = unconvergedCounts[cls];
  if (found > baseline) {
    violations.push({
      rule: 'unconverged-growth',
      file: '(repo-wide)',
      line: 0,
      text: `.${cls}: ${found} render sites, baseline ${baseline}. ` +
        'Use the canonical <C2CToast> instead of adding another one-tone pill.',
    });
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ violations, unconvergedCounts, baseline: UNCONVERGED_BASELINE }, null, 2));
} else if (violations.length) {
  console.error(`\n✖ Toast canonicality: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}`);
    console.error(`      ${v.text}`);
  }
  console.error(`\n  The one implementation is ${CANONICAL}:`);
  console.error("      import { C2CToast, useToast } from '../toast';");
  console.error('      const [toast, fireToast] = useToast();');
  console.error("      fireToast('Couldn’t save … Nothing was persisted.', 'error');");
  console.error('      <C2CToast msg={toast} />');
  console.error("\n  For a prop, use the exported `FireToast` type — never `(m: string) => void`.\n");
} else {
  const pending = Object.entries(UNCONVERGED_BASELINE).reduce((n, [, v]) => n + v, 0);
  console.log(`✓ Toast canonicality: one implementation, no hand-rolled renders, no erased tones.`);
  console.log(`  (${pending} render sites on 5 un-converged pill classes are pinned at baseline.)`);
}

process.exit(violations.length ? 1 : 0);
