#!/usr/bin/env node
/**
 * CI Guard: a control that promises a governed action and only sends a message.
 *
 * ── The defect, found twice independently ─────────────────────────────────────────────
 * Biostatistics had an "Attach to dossier" button whose handler was:
 *
 *     const attach = () => {
 *       fireToast(docDef.label + ' attached to dossier');   // green tick, first
 *       ask('Attach the ... to the submission dossier statistical section');
 *     };
 *
 * `ask` streams a sentence into the AnA chat pane. Nothing is attached. The
 * toast painted a success before a byte had left the browser.
 *
 * The editor had a ribbon button labelled "Cite" whose handler was:
 *
 *     const citeSelection = () => { ... onAsk(`Cite this claim: "${s}"`); };
 *
 * Nothing created, stored, numbered, or listed. A writer could press it, read a
 * reply, and believe a claim was sourced when the filed document held no record
 * of it.
 *
 * Same shape both times, in unrelated parts of the codebase, months apart: a
 * LABEL naming a governed act, bound to a handler whose only effect is to ASK.
 * The two were caught by a human reading screens. This makes it repeatable.
 *
 * ── Why this class is worth its own gate ──────────────────────────────────────
 * The other honesty gates catch a surface MISREPORTING STATE. This one catches a
 * surface misrepresenting its own CAPABILITY, which is worse in a filing
 * product: the user does not merely believe a wrong fact, they believe they have
 * DONE something. They stop chasing it. The attachment is never made, the claim
 * is never sourced, and the omission is discovered — if at all — by a reviewer.
 *
 * ── The rule, deliberately narrow ─────────────────────────────────────────────
 * A finding requires BOTH:
 *   1. a handler whose body calls `ask(...)` / `onAsk(...)` and does NOTHING
 *      else that could constitute the act — no await, no apiRequest/fetch, no
 *      save/mutate/persist; and
 *   2. a control bound to it whose LABEL opens with a governed action verb, in
 *      the imperative, with no request framing.
 *
 * Either alone is ordinary. `<button onClick={() => ask('Explain this')}>Explain
 * with AnA</button>` is honest and silent here — it says what it does. So is a
 * handler that asks AND persists. Only the conjunction is reported: a promise of
 * an act, kept by a message.
 *
 * The repair is a rename, not a rewrite, and both real fixes were exactly that:
 * "Attach to dossier" became "Ask AnA to attach it to the dossier", and "Cite"
 * became "Ask for a source".
 *
 * Usage:
 *   node scripts/ci/check-action-overclaim.mjs                 # fail on new
 *   node scripts/ci/check-action-overclaim.mjs --list
 *   node scripts/ci/check-action-overclaim.mjs --self-test     # prove it works
 *   node scripts/ci/check-action-overclaim.mjs --write-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/action-overclaim-baseline.json');
const FIXTURES = path.join(ROOT, 'tests/fixtures/action-overclaim');

/**
 * Verbs that name a governed act — something that changes the record, the
 * filing, or its state. A label opening with one is a promise.
 *
 * Deliberately excludes verbs whose plain meaning IS conversational or
 * navigational (ask, explain, draft, suggest, review, summarise, show, open,
 * find), because a control that says "Draft the report" and drafts it in chat
 * has told the truth.
 */
const GOVERNED_VERB =
  /^(attach|cite|route|promote|submit|sign|approve|reject|file|publish|transmit|freeze|lock|unlock|release|assign|accept|archive|delete|remove|send|dispatch|seal|lodge|register|certify|validate|verify|apply|commit|save|store|record|log|upload|export|download|generate|plan|compile|assemble)\b/i;
// generate / plan / compile / assemble were added after SubmissionCenter's
// "Generate plan (plan_submission)" button — a persisted-artifact promise over a
// chat message — passed this gate. A plan, a compiled sequence, an assembled
// package are filing artifacts; a label opening with one of these is a promise.

/** A label already framed as a request is honest however it continues. */
const REQUEST_FRAMED = /^(ask|request|draft|propose|suggest|explain|review|summari[sz]e|show|open|find|check with)\b/i;

/** Work that could constitute the act. Its presence means the handler is real. */
const REAL_WORK = /\bawait\b|\bapiRequest\b|\bfetch\(|\bmutate|\bpersist|\bsaveTo|\bupsert|\.post\(|\.put\(|\.patch\(/;

/**
 * An ask, in either of the two names this codebase uses — and only when its
 * first argument is a natural-language STRING.
 *
 * That last condition is not decoration. The first version of this rule matched
 * any call named `ask(`, and its only live finding was AccessRequests' "Approve"
 * button — a FALSE POSITIVE. That surface has a local `ask(row, decision)` that
 * opens the governed confirmation dialog and performs a real approval; the name
 * merely collides with the AnA chat helper. Flagging it would have been the
 * worst possible outcome for a gate whose whole subject is honesty: telling a
 * developer that a correct, properly gated approval flow lies to its user.
 *
 * The chat ask (`ask(...)` / `onAsk?.(...)`) always receives a sentence. A domain function receives a record.
 * That is the discriminator, and it is exact on both real defects:
 *     ask('Attach the ' + label + ' to the submission dossier ...')   flagged
 *     onAsk(`Cite this claim: "${s}"`)                                flagged
 *     ask(r, 'approved')                                              ignored
 *
 * KNOWN LIMIT, stated rather than papered over: an ask whose sentence is built
 * elsewhere — `ask(buildPrompt())` — is not matched. Narrow and trusted beats
 * broad and ignored; a gate that cries wolf is one nobody reads.
 */
const ASKS = /\b(?:on)?[Aa]sk(?:\?\.)?\(\s*(?:'|"|`)/;

function sourceFiles() {
  return execSync("git ls-files 'client/src/**/*.tsx'", {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
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

/**
 * Handlers in this file whose only effect is to ask.
 *
 * Matches `const NAME = (...) => {BODY}` and the useCallback form. The body is
 * read to its balanced close so a long handler is not truncated into looking
 * effect-free — reading half a function and concluding it does nothing is how a
 * gate produces confident false positives.
 */
function askOnlyHandlers(code) {
  const names = new Set();
  const DECL = /const\s+(\w+)\s*=\s*(?:useCallback\(\s*)?(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
  let m;
  while ((m = DECL.exec(code)) !== null) {
    const start = DECL.lastIndex - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < code.length && i < start + 4000; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = code.slice(start, end + 1);
    if (ASKS.test(body) && !REAL_WORK.test(body)) names.add(m[1]);
  }
  return names;
}

/** Labels bound to a handler, as this codebase actually writes them. */
function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    hits.push(...scan(file, readFileSync(path.join(ROOT, file), 'utf8')));
  }
  return hits;
}

function scan(file, raw) {
  const code = stripComments(raw);
  const askOnly = askOnlyHandlers(code);
  const inlineAsk = (expr) => ASKS.test(expr) && !REAL_WORK.test(expr);
  const bound = (expr) => {
    const name = expr.trim().replace(/^\(\)\s*=>\s*/, '').replace(/[();\s]/g, '');
    return askOnly.has(name) || inlineAsk(expr);
  };
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  const out = [];
  const report = (i, label) => {
    const l = label.trim();
    if (!GOVERNED_VERB.test(l) || REQUEST_FRAMED.test(l)) return;
    out.push({ file, line: lineOf(i), label: l });
  };

  // `label: 'Attach to dossier', onClick: attach`  (AnswerLead action / alt)
  const OBJ = /label:\s*'([^']{2,80})'\s*,\s*onClick:\s*([^},]{1,80})/g;
  let m;
  while ((m = OBJ.exec(code)) !== null) if (bound(m[2])) report(m.index, m[1]);

  // `<RB title="Cite the selected claim" onClick={citeSelection}>`
  const ATTR = /title=["']([^"']{2,80})["'][^>]{0,200}?onClick=\{([^}]{1,80})\}/g;
  while ((m = ATTR.exec(code)) !== null) if (bound(m[2])) report(m.index, m[1]);

  // `<button onClick={handler}>Attach to dossier</button>` — text child, with
  // an OPTIONAL leading icon expression: `>{I.download} Export<`. The icon
  // `{I.download}` is exactly the tell here — it is the affordance of a real
  // download button worn by an ask-only handler — so the matcher must step over
  // it to read the label, not stop at the `{`.
  const CHILD = /onClick=\{([^}]{1,120})\}[^>]*>\s*(?:\{[^{}]*\}\s*)?([A-Za-z][^<>{}]{1,60}?)\s*</g;
  while ((m = CHILD.exec(code)) !== null) if (bound(m[1])) report(m.index, m[2]);

  return out;
}

const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--self-test')) {
  let ok = true;
  for (const f of readdirSync(FIXTURES)) {
    const hits = scan(f, readFileSync(path.join(FIXTURES, f), 'utf8'));
    if (hits.length === 0) { console.error(`  ✗ ${f}: flagged nothing`); ok = false; }
    else console.log(`  ✓ ${f}: flagged ${hits.length} — e.g. "${hits[0].label}"`);
  }
  // …and silent on the repaired sources.
  for (const f of ['client/src/concept2cure/v2/surfaces/Biostatistics.tsx',
                   'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
                   // RbmSurfacesA is the fixture that exercises the icon-prefix,
                   // optional-chaining (onAsk?.) and export-verb coverage added
                   // after those first two — its repaired form must stay silent.
                   'client/src/concept2cure/v2/surfaces/RbmSurfacesA.tsx',
                   // SubmissionCenter is the fixture behind the generate/plan/
                   // compile/assemble verbs; its repaired Planner must stay silent.
                   'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx']) {
    const hits = scan(f, readFileSync(path.join(ROOT, f), 'utf8'));
    if (hits.length > 0) { console.error(`  ✗ ${f}: still flags ${hits.map((h) => h.label).join(', ')}`); ok = false; }
    else console.log(`  ✓ ${f}: silent on the repaired source`);
  }
  console.log(ok ? '\nself-test PASSED — catches the real defect, quiet on the repair.'
                 : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

const hits = findings();

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${key(h)}  "${h.label}"`);
  console.log(`\n${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ entries: hits.map(key).sort() }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).entries : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(key(h)));

if (fresh.length > 0) {
  console.error('\n❌ A control promises a governed action and only sends a message.\n');
  for (const h of fresh) console.error(`   ${key(h)}  "${h.label}"`);
  console.error(`
   The handler bound to this control calls ask()/onAsk() and does nothing else
   that could constitute the act — no await, no request, no write. The label
   says the act happens. It does not.

   The user does not merely believe a wrong fact; they believe they have DONE
   something, and stop chasing it. The attachment is never made, the claim is
   never sourced, and the omission surfaces — if at all — at review.

   The fix is usually the LABEL, not the handler:
     "Attach to dossier"        → "Ask AnA to attach it to the dossier"
     "Cite"                     → "Ask for a source"
   If the control should really perform the act, make it perform it and report
   the outcome — never announce one before the work is done.
`);
  process.exit(1);
}

console.log(`check-action-overclaim: no new occurrences. ${hits.length} baselined.`);
