#!/usr/bin/env node
/**
 * CI Guard: API routes, table names and internal identifiers in user-visible copy.
 *
 * ── The rule this enforces ────────────────────────────────────────────────────
 * BIOPHARMA_WORK_ORDER.md, hard guardrail 3:
 *
 *   "DO NOT render API routes, table names, env vars, file paths or exception
 *    text in client UI. In these lanes I found /api/ind-checklist,
 *    /api/labeling-pi, project_sections and a shadow-review endpoint all
 *    rendered as page copy."
 *
 * and the acceptance criterion for BP-W0-5: "Grep the built client bundle: no
 * /api/, no project_sections, no task names in visible copy."
 *
 * ── Why it is a real defect and not a tidiness preference ─────────────────────
 * The reader of these surfaces is a regulatory director, not an engineer. Copy
 * like "GET /api/dossier-readiness/:projectId didn't respond" tells them nothing
 * they can act on, and in a regulated product the internal shape of the system —
 * route topology, the names of governed stores — is an information-disclosure
 * finding, not a cosmetic one. `project_sections` in an empty state names a
 * table to whoever is holding the session.
 *
 * The house already fixed the same class server-side: the 503 in
 * server/routes/c2c/projects.ts used to put the missing relation into the
 * client-facing message and now sends it to the log keyed by request id. This is
 * that decision applied to the strings the client itself renders.
 *
 * ── What counts as user-visible ───────────────────────────────────────────────
 * Only positions that reach the screen: the copy-bearing JSX attributes
 * (hint / title / subtitle / placeholder / label / note / caption / message) and
 * JSX text nodes. NOT: the argument to apiRequest/useLiveRows/fetch (that IS the
 * route and must say so), `//` and block comments, imports, or test files.
 *
 * A route mentioned in a `code`/`mono` span is still visible copy and still
 * counts — a monospace font does not make an endpoint meaningful to a reader.
 *
 * Usage:
 *   node scripts/ci/check-internals-in-copy.mjs                 # fail on new
 *   node scripts/ci/check-internals-in-copy.mjs --list           # show all
 *   node scripts/ci/check-internals-in-copy.mjs --write-baseline # after fixing
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/internals-in-copy-baseline.json');

/** Internals that must never appear in copy. */
const INTERNALS = [
  { re: /\/api\//, what: 'API route' },
  // The relation list is hand-maintained, and a hand-maintained list is only as
  // good as the last time someone extended it. It did not carry ANY of the
  // submission-core relations — so `submission_leaves`, printed twice into the
  // placement dialog's own body copy, was never a finding. The stores named in
  // DOCUMENT_STORE_LABEL (shared/regulatory/canonical-document.ts) and the eCTD
  // core relations are added here; that map is the list of stores a leaf can
  // point at, which is exactly the set most likely to reach a screen.
  { re: /\b(project_sections|authoring_documents|authoring_sections|unified_tasks|regulatory_programs|c2c_document_sections|labeling_pi_sections|c2c_ana_actions|audit_logs|mdx_notifications|project_tasks|document_workflows|software_lifecycle_items|unified_documents|submission_leaves|ectd_sequences|coauthor_documents|ctd_onboarding_documents|vault_documents|concept2cure_artifacts|c2c_documents|doc_revisions|q_sub_section_bodies|protocol_sections|protocol_documents|biosketch_sections|workflow_document_versions|module_documents)\b/, what: 'table name' },
  { re: /\b(GET|POST|PATCH|PUT|DELETE)\s+\//, what: 'HTTP method + path' },
  { re: /\bprocess\.env\.[A-Z_]+/, what: 'env var' },
  // ── Folded in from a parallel gate (check-ui-internals) that was doing the
  // same job under a different name. Two gates for one rule is the duplication
  // this repo forbids, so that one is deleted and its extra rule classes live
  // here. Each pattern below was observed on a real screen during the MDX UAT.
  { re: /\brelation\s+"/i, what: 'missing-relation error' },
  { re: /failed query/i, what: 'driver error' },
  { re: /\b(?:select|insert\s+into|update|delete\s+from)\s+["'`]/i, what: 'SQL' },
  { re: /\b(?:pg_[a-z_]{3,}|information_schema)\b/, what: 'Postgres catalog' },
  // Multi-segment env names: ESTAR_TEMPLATE_DIR is three segments, and a
  // single-segment pattern misses it.
  { re: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:URL|KEY|SECRET|TOKEN|DIR|PATH|PASSWORD|DSN|HOST|PORT)\b/, what: 'env var' },
  { re: /(?:^|[\s(])\/(?:home|usr|var|opt|app|etc)\//, what: 'absolute file path' },
  { re: /\.(?:ts|tsx|js|mjs|cjs):\d+/, what: 'source location' },
  // Extensions the product's own repo actually uses. The list started at
  // ts|tsx|mjs|cjs|sql and let a `.md` filename through: document-authoring's
  // customer-visible note read "See HANDOFF_TO_DESIGN_document_authoring.md",
  // rendered as the tool card's whole description on Project Home. A rule that
  // bans source paths in copy has to know what a source path looks like here.
  { re: /\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|md|json|ya?ml|sh|py)\b/, what: 'source file' },
];

/** Copy-bearing JSX attributes: `hint="…"` / `title={'…'}`. */
const ATTR = /\b(hint|title|subtitle|placeholder|label|note|caption|message|desc|description)\s*=\s*\{?\s*["'`]([^"'`]{0,400})["'`]/g;
/**
 * JSX text runs.
 *
 * The original rule was `/>([^<>{}\n]{3,400})</` — copy had to sit between `>`
 * and `<` on ONE line with no JSX expression anywhere between. Measured against
 * the four shapes real copy takes, it caught one:
 *
 *   `<p>text</p>`                        caught
 *   `<p>{I.icon} text</p>`               missed — text follows an expression
 *   `<p>\n  text\n</p>`                  missed — the run spans lines
 *   `<div>\n  {I.icon} text\n</div>`     missed — both
 *
 * Multi-line JSX is how nearly all copy in this codebase is formatted, and
 * `{I.icon} label` is the dominant kicker idiom, so the gate reported zero
 * findings while a live `/api/ind-checklist` sat in an IND Lifecycle eyebrow
 * (UAT report BP-07). A gate that has only ever been seen to pass has not been
 * tested.
 *
 * This run spans lines and tolerates embedded `{…}` expressions, which
 * {@link jsxProse} then strips before the INTERNALS patterns are applied.
 *
 * Two things went wrong on the way to this rule, both worth leaving written
 * down. Anchoring on `[>}]…[<{]` matched plain TypeScript, because a `}`
 * ending one function and a `{` opening the next captured everything between.
 * And `((?:[^<>]|\{[^{}]*\})*?)` — an alternation under a lazy quantifier —
 * backtracks catastrophically and hung the gate on large files. A CI gate that
 * hangs is worse than one that misses. What survives is a single bounded
 * character class, linear to scan, filtered to prose below.
 */
const TEXT = />([^<>]{3,600})</g;

/**
 * The human-readable residue of a JSX text run, or '' if it is not copy.
 *
 * Strips embedded expressions, then rejects anything carrying the punctuation
 * of code rather than prose. Without this the rule reads statements as
 * sentences; with it, `{I.rocket} IND Lifecycle -- /api/ind-checklist` reduces
 * to the sentence a user actually sees.
 *
 * ── Why a bare parenthesis is not the code signal it looks like ───────────────
 * `(` and `)` were in the reject class, and they were pulling real weight: the
 * TEXT rule anchors on `>` … `<`, so a generic call like
 * `useLiveRows<Row>('/api/x', …)` presents its own argument list as a "text
 * run", and ~20 of those exist. Rejecting on paren killed all of them.
 *
 * It also killed regulatory prose, which is full of parentheses — and with it
 *   "Placement writes a submission_leaves row in the canonical core (audited,
 *    org-scoped)."
 *   "Programmatic access tokens (/api/api-keys) — org-scoped, hashed at rest…"
 *   "Settings /api/billing (dashboard)"
 * — a relation name and two live routes, sitting in body copy, unreported
 * because they were written in sentences that used brackets.
 *
 * The two are separable without the collateral. An argument list captured this
 * way ALWAYS opens with the paren (the generic's `>` is immediately before it)
 * and ALWAYS quotes its route. Prose does neither: this codebase writes copy
 * with typographic quotes, so a straight quote in a text run means a literal.
 * So: reject a leading paren, reject a straight quote, and let sentences keep
 * their brackets.
 */
function jsxProse(run) {
  const text = run.replace(/\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 3) return '';
  if (/[;=]|=>|\breturn\b|\bconst\b|\bimport\b/.test(text)) return '';
  if (text.startsWith('(')) return '';      // a generic call's argument list
  if (/['"`]/.test(text)) return '';        // a straight quote means a literal, not prose
  return text;
}

/**
 * The blind spot `jsxProse` opened, and the rule that closes it.
 *
 * `jsxProse` strips `{...}` before matching, deliberately — without that,
 * `{I.rocket} IND Lifecycle` reads as code and every icon becomes noise. But a
 * string literal INSIDE the expression is rendered text too, and stripping the
 * container took the literal with it. So this sailed through untouched:
 *
 *   <span className="bs-doc-prov">
 *     {live ? '/api/ana-biostats' : 'Deterministic engine'} -- v1.0.0 — draft
 *   </span>
 *
 * — an API route printed onto the provenance line of a statistical document, in
 * the exact lane this gate exists to police. A second instance sat in
 * ReportEngine on the same CSS class. Both are fixed; this stops the third.
 *
 * Deliberately narrow: only literals inside an expression container that makes
 * NO call. A ternary or member access renders its literals to the user;
 * `apiRequest('/api/x')` does not.
 *
 * ── The second blind spot, and why the first fix was not enough ───────────────
 * "Holds no parenthesis" was the original test, and it is not the same rule as
 * "makes no call". A parenthesis inside a QUOTED LITERAL is rendered text — it
 * is part of what the user reads — but the container regex excluded `(` and `)`
 * outright, so any literal that happened to contain a paren took its whole
 * container out of scope. That hid the exact string it was written to catch:
 *
 *   {placing ? 'Placing…' : 'Place leaf (PUT /leaves)'}
 *
 * — a live HTTP method and path, on a button, in the placement dialog, wearing
 * the one piece of punctuation that made the gate look away. The gate reported
 * a clean empty baseline the entire time.
 *
 * So the container now admits parens, and the call test is applied to the
 * residue AFTER string literals are blanked: a paren outside every quote is a
 * call and the container is skipped; a paren inside one is prose and the
 * literal is read.
 */
const EXPR_IN_TEXT = /\{([^{}]{0,300})\}/g;

/**
 * `TEXT`'s 600-character bound exists so the rule cannot hang. It also means a
 * long comment sitting inside a JSX element hides everything after it: comments
 * are blanked to SPACES (to keep byte offsets, and therefore line numbers,
 * correct), and those spaces count toward the bound. Proven, not assumed — the
 * first version of this rule was tested by reintroducing both routes and caught
 * NEITHER, because the explanatory comment left beside them pushed the run past
 * 600.
 *
 * A bound is unnecessary here anyway: `[^<>]` is a negated class terminated by a
 * character it excludes, so the match is deterministic and linear with or
 * without it. The literal pass uses the unbounded form.
 */
const TEXT_ALL = />([^<>]{3,})</g;

function jsxExprLiterals(run) {
  const out = [];
  EXPR_IN_TEXT.lastIndex = 0;
  let m;
  while ((m = EXPR_IN_TEXT.exec(run)) !== null) {
    const body = m[1];
    // Blank the quoted spans, then ask whether a call parenthesis survives.
    // `fmt(x)` does; `'Place leaf (PUT /leaves)'` does not.
    if (/\(/.test(body.replace(/['"`][^'"`]*['"`]/g, ' '))) continue;
    for (const lit of body.match(/['"`]([^'"`]{3,200})['"`]/g) || []) {
      out.push(lit.slice(1, -1));
    }
  }
  return out;
}

/**
 * The third place copy lives, and the one the JSX rules cannot see.
 *
 * ATTR reads `title="…"` and TEXT reads what sits between tags — both are JSX
 * POSITIONS. A great deal of this product's copy is not written there. It is
 * written as a string constant and handed to a component:
 *
 *   export const IDENTITY_STATEMENT = 'This document lives in the governed …'
 *   summary: 'Nonclinical (CTD Module 4): the /api/nonclinical-summary … '
 *   title={governed ? 'Governed — …' : 'POST /sequences/:seqId/transition — …'}
 *
 * The last of those is a tooltip on a live button in the Submission Center;
 * ATTR missed it because a ternary sits between the `=` and the quote. Nine
 * such strings carry a route or a relation into copy, and the gate has never
 * been able to see any of them.
 *
 * ── Why this needs a tokenizer and not another regex ─────────────────────────
 * Matching `'…'` with a pattern captures the span BETWEEN two literals as
 * though it were one: `rawJson('PATCH', `/api/quality/plans/${id}`, { status:
 * 'active' })` reads as a literal `, `/api/quality/plans/…`, { status: ` and
 * reports a route the user never sees. So the line is walked character by
 * character, honouring escapes, and only real literals are considered.
 *
 * ── What counts as prose ─────────────────────────────────────────────────────
 * 40+ characters with a space in it, and not itself a path. A route passed as
 * an argument is the route and must say so; a sentence that MENTIONS one is the
 * defect. `${…}` interpolations are stripped first — the interpolated
 * expression is code, and stripping it is the same move jsxProse makes on
 * `{…}`. Without it `documentSourceLabel('coauthor_documents', id)` inside a
 * template reads as a relation in copy when what renders is a store's name.
 */
function stringLiterals(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const q = line[i];
    if (q === "'" || q === '"' || q === '`') {
      let j = i + 1;
      let buf = '';
      while (j < line.length) {
        if (line[j] === '\\') { buf += line[j + 1] ?? ''; j += 2; continue; }
        if (line[j] === q) break;
        buf += line[j];
        j++;
      }
      // Unterminated on this line = a multi-line template. Stop rather than
      // guess: the rest of the line is inside a literal we cannot delimit.
      if (j >= line.length) break;
      out.push(buf);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * Prose string literals on a line, with interpolations removed.
 *
 * A `console.*` line is skipped: its argument is a message to a DEVELOPER
 * reading the browser console, and naming the file they must edit is the whole
 * point of it. The rule polices what a regulatory director reads on a screen,
 * not what an engineer reads in devtools.
 */
function proseLiterals(line) {
  if (/\bconsole\.(?:warn|error|log|info|debug|trace)\s*\(/.test(line)) return [];
  const out = [];
  for (const raw of stringLiterals(line)) {
    const lit = raw.replace(/\$\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (lit.length < 40 || !lit.includes(' ')) continue;
    if (/^[./]/.test(lit)) continue; // a path literal IS the path
    out.push(lit);
  }
  return out;
}

/**
 * Copy that is DECLARED in shared/ but RENDERED by the client.
 *
 * The walk below is `client/src/**`, which is where copy usually lives — and
 * that is exactly why this gate was green over 25 surface notes carrying API
 * routes, source paths, a table name and an agent branch name. The surface
 * registry declares them in `shared/constants/`, and the client renders each
 * one verbatim: as the scaffold page's subtitle under the <h1>
 * (surfaces/Surfaces.tsx), as the Coverage card note, and as the nav card's
 * tooltip. A gate that only reads the file where copy is USED cannot see copy
 * that is declared one directory over.
 *
 * Only the fields that reach a screen are read. `engineering` exists precisely
 * so the routes and contract refs have somewhere to live that is NOT copy, so
 * it is skipped here on purpose — flagging it would push the detail back into
 * the rendered field or delete it, and both are worse.
 */
const SHARED_COPY_SOURCES = [
  'shared/constants/ui-surface-registry.ts',
  'shared/constants/ui-surface-registry.ui-v2.ts',
];
const RENDERED_FIELDS = /^\s*(notes|label|subtitle|blurb)\s*:\s*'((?:[^'\\]|\\.)*)'/;

function sharedCopyFindings() {
  const hits = [];
  for (const file of SHARED_COPY_SOURCES) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const m = RENDERED_FIELDS.exec(line);
        if (!m) return;
        const value = m[2];
        for (const { re: bad, what } of INTERNALS) {
          if (!bad.test(value)) continue;
          hits.push({ file, line: i + 1, what, text: value.trim().slice(0, 110) });
          break;
        }
      });
  }
  return hits;
}

function sourceFiles() {
  const out = execSync("git ls-files 'client/src/**/*.tsx' 'client/src/**/*.ts'", {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.tsx?$|\.spec\.tsx?$|\/fixtures\//.test(f));
}

/** Blank out comments so prose ABOUT a route is not reported as the route. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function findings() {
  const hits = sharedCopyFindings();
  for (const file of sourceFiles()) {
    const raw = readFileSync(path.join(ROOT, file), 'utf8');
    const code = stripComments(raw);
    const lineOf = (idx) => code.slice(0, idx).split('\n').length;

    const scan = (re, group, refine) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        const value = refine ? refine(m[group] ?? '') : m[group];
        if (!value) continue;
        for (const { re: bad, what } of INTERNALS) {
          if (!bad.test(value)) continue;
          hits.push({ file, line: lineOf(m.index), what, text: value.trim().slice(0, 110) });
          break;
        }
      }
    };
    scan(ATTR, 2);

    // Copy written as a string constant rather than in a JSX position. Applies
    // to .ts as well as .tsx — hooks and services carry user-facing messages.
    code.split('\n').forEach((line, i) => {
      for (const value of proseLiterals(line)) {
        for (const { re: bad, what } of INTERNALS) {
          if (!bad.test(value)) continue;
          hits.push({ file, line: i + 1, what, text: value.trim().slice(0, 110) });
          break;
        }
      }
    });

    // JSX text only exists in .tsx; scanning .ts with this rule reads code.
    if (file.endsWith('.tsx')) {
      scan(TEXT, 1, jsxProse);
      // …and the literals jsxProse throws away with the expression around them.
      TEXT_ALL.lastIndex = 0;
      let t;
      while ((t = TEXT_ALL.exec(code)) !== null) {
        for (const value of jsxExprLiterals(t[1])) {
          for (const { re: bad, what } of INTERNALS) {
            if (!bad.test(value)) continue;
            hits.push({ file, line: lineOf(t.index), what, text: value.trim().slice(0, 110) });
            break;
          }
        }
      }
    }
  }
  return hits;
}

const hits = findings();
const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${key(h)}  [${h.what}]  ${h.text}`);
  console.log(`\n${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  const files = [...new Set(hits.map((h) => h.file))].sort();
  writeFileSync(BASELINE, JSON.stringify({ files }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s) across ${files.length} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(h.file));

if (fresh.length > 0) {
  console.error('\n❌ Internal identifiers in user-visible copy.\n');
  for (const h of fresh) console.error(`   ${key(h)}  [${h.what}]\n     ${h.text}`);
  console.error(`
   The reader of these surfaces is a regulatory director. A route name tells
   them nothing they can act on, and the internal shape of a governed system is
   an information-disclosure finding in a regulated product, not a cosmetic one.
   (BIOPHARMA_WORK_ORDER.md guardrail 3; BP-W0-5.)

   Name the CAPABILITY, not the endpoint:
     "GET /api/cmc/stability-studies didn't respond."
     → "The stability register didn't respond."
`);
  process.exit(1);
}

const stale = baseline.filter((f) => !hits.some((h) => h.file === f));
console.log(
  `check-internals-in-copy: no new occurrences. ${hits.length} baselined across ${new Set(hits.map((h) => h.file)).size} file(s).` +
    (stale.length ? `\n  ${stale.length} baselined file(s) now clean — run --write-baseline to shrink it.` : '')
);
