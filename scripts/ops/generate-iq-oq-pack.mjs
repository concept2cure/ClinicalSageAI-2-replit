#!/usr/bin/env node
/**
 * generate-iq-oq-pack.mjs — produce docs/validation/IQ_OQ_EVIDENCE_PACK.md, the
 * installation- and operational-qualification EVIDENCE for this platform.
 *
 * Ledger row L7. `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` records the Part 11
 * *mechanisms* as closed — one signature substrate, a chained audit trail, §11.70
 * supersession — while the qualification pack that evidences them was never
 * produced. A regulated buyer's quality team asks for the pack, not for the
 * mechanisms.
 *
 * WHAT THIS IS, EXACTLY. This generates qualification EVIDENCE. It is not a
 * qualification: a qualification is a protocol executed and signed by a
 * competent person, and no script can be that. What it does is remove the part
 * quality should never have to do by hand — establishing what is actually
 * installed and which controls are actually exercised by passing tests — so the
 * human review starts from observed fact instead of from a claim. The generated
 * document says this in its own header, because a pack that overstated itself
 * would be the precise failure this codebase has spent its effort removing.
 *
 * Design contract (shared with ga-readiness-report.mjs and pilot-go-no-go.mjs):
 *   • OBSERVED, NEVER ASSUMED. Every line records what was seen. A control whose
 *     test file is absent reports NO EVIDENCE. A test that was not executed
 *     reports NOT EXECUTED. Neither is ever rendered as a pass.
 *   • FAIL CLOSED. The verdict is INCOMPLETE unless every declared control maps
 *     to at least one test file that exists AND those tests were executed AND
 *     they passed. Missing evidence is a failed pack, not a footnote.
 *   • No secret values are printed — only whether a variable is set.
 *
 * Usage:
 *   node scripts/ops/generate-iq-oq-pack.mjs           # map + installation only
 *   node scripts/ops/generate-iq-oq-pack.mjs --run     # also execute the OQ suites
 *   node scripts/ops/generate-iq-oq-pack.mjs --json    # machine-readable to stdout
 *
 * Exit code: 0 when the pack is complete (every control evidenced by a passing
 * executed test), 1 otherwise. Without --run the pack is by definition
 * incomplete, and exits 1 — that is the honest answer, not a failure of the run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN = process.argv.includes('--run');
const JSON_MODE = process.argv.includes('--json');
const OUT = 'docs/validation/IQ_OQ_EVIDENCE_PACK.md';

const rel = (p) => path.join(repoRoot, p);
const exists = (p) => fs.existsSync(rel(p));

/* ── OQ control map ───────────────────────────────────────────────────────────
 * Each control names the regulation it satisfies and the tests that exercise
 * it. Adding a control without a test is allowed and produces NO EVIDENCE —
 * that is the point. Removing a control to make the pack pass is not a fix.
 */
const CONTROLS = [
  {
    id: 'OQ-01',
    control: 'Audit trail is computer-generated, time-stamped and tamper-evident',
    regulation: '21 CFR 11.10(e)',
    tests: [
      'server/services/audit/__tests__/chain.test.ts',
      'server/services/audit/__tests__/chainIntegrityMonitor.test.ts',
      'server/services/audit/__tests__/audit-integrity-pglite.integration.test.ts',
      'server/services/audit/__tests__/auditSealPosture.test.ts',
    ],
  },
  {
    id: 'OQ-02',
    control: 'Audit surface reports real per-row integrity and never asserts coverage it has not checked',
    regulation: '21 CFR 11.10(e)',
    tests: ['server/routes/__tests__/mdx-audit-integrity.test.ts'],
  },
  {
    id: 'OQ-03',
    control: 'Records are protected from alteration; audit rows cannot be updated or deleted',
    regulation: '21 CFR 11.10(c)',
    tests: ['server/services/__tests__/part11-data-integrity.test.ts'],
  },
  {
    id: 'OQ-04',
    control: 'Signed records carry the printed name, date/time and meaning of the signature',
    regulation: '21 CFR 11.50',
    tests: [
      'server/services/compliance/__tests__/signature-manifestation.test.ts',
      'server/routes/__tests__/part11-signature-manifest.test.ts',
      'server/routes/__tests__/part11-manifest-governed.test.ts',
    ],
  },
  {
    id: 'OQ-05',
    control: 'Signatures are bound to their records and cannot be transferred; superseded signatures are retained',
    regulation: '21 CFR 11.70',
    tests: [
      'server/services/part11/__tests__/version-binding.test.ts',
      'tests/schema-contract/esignature-verify-roundtrip.contract.test.ts',
    ],
  },
  {
    id: 'OQ-06',
    control: 'Each signature is unique to one individual and signing authority is verified',
    regulation: '21 CFR 11.100, 11.200(a)(2)',
    tests: ['server/services/part11/__tests__/signing-authority.test.ts'],
  },
  {
    id: 'OQ-07',
    control: 'Signing requires two distinct identification components and re-authentication',
    regulation: '21 CFR 11.200(a)(1)',
    tests: [
      'server/routes/__tests__/esignature-sign.test.ts',
      'server/routes/c2c/__tests__/governed-sign-esignature.pglite.integration.test.ts',
    ],
  },
  {
    id: 'OQ-08',
    control: 'Governed actions fail closed when their preconditions are not met',
    regulation: '21 CFR 11.10(a) — validation of intended performance',
    tests: [
      'server/services/ana-ri/__tests__/ana-governance-fail-closed.test.ts',
      'server/services/ana-ri/__tests__/part11-command-gate.test.ts',
      'server/services/ana-ri/__tests__/part11-governance.test.ts',
    ],
  },
  {
    id: 'OQ-09',
    control: 'The system never fabricates an agency response, acknowledgment or identifier',
    regulation: '21 CFR 11.10(a); FDA ESG Guidance',
    tests: [
      'tests/fda-submission-honesty.contract.test.ts',
      'server/services/ana/__tests__/honesty-envelope.test.ts',
      'server/routes/__tests__/part11-compliance-honesty.test.ts',
    ],
  },
  {
    id: 'OQ-10',
    control: 'Access is limited to authorised individuals; tenant data cannot cross organisations',
    regulation: '21 CFR 11.10(d)',
    tests: ['server/__tests__/security'],
  },
  {
    id: 'OQ-11',
    control: 'End-to-end regulatory journeys behave as specified, including their refusals',
    regulation: '21 CFR 11.10(a)',
    tests: ['tests/golden-journeys'],
  },
];

/* ── IQ observations ──────────────────────────────────────────────────────── */

/**
 * Probe a binary's presence and version.
 *
 * `spawnSync` rather than `execFileSync` because execFileSync returns stdout
 * only, and xmllint — like many tools — prints `--version` to **stderr**. The
 * first cut reported it "present (version not reported)": an observation that
 * observed nothing, in a document whose entire value is that its lines were
 * observed.
 */
function binary(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  /* ENOENT is what "absent" means. A binary that exists but exits non-zero on
     --version is present; reporting it absent would be a false installation
     finding. */
  if (r.error?.code === 'ENOENT') return { present: false, version: null };
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { present: true, version: out.split('\n')[0].trim() || null };
}

/** Markdown table cells are pipe-delimited, so any pipe inside a value ends the
 *  cell early and shifts every column after it. Vitest summary lines contain
 *  pipes ("Tests 1 failed | 8 passed"), which silently corrupted the OQ table. */
function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(rel(p), 'utf8'));
  } catch {
    return null;
  }
}

function collectIq() {
  const pkg = readJson('package.json') ?? {};
  const migrations = [
    ...(fs.existsSync(rel('migrations')) ? fs.readdirSync(rel('migrations')) : []),
    ...(fs.existsSync(rel('db/migrations')) ? fs.readdirSync(rel('db/migrations')) : []),
  ].filter((f) => f.endsWith('.sql'));

  const ciGates = Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith('ci:') || s.startsWith('check:'));

  return {
    runtime: {
      nodeObserved: process.version,
      nodeRequired: pkg.engines?.node ?? null,
      /* A declared range this runtime does not satisfy is an installation
         defect, so it is reported rather than smoothed over. Only the common
         `>=X` form is evaluated; anything else reports unknown rather than a
         guess. */
      satisfied: (() => {
        const req = pkg.engines?.node;
        const m = typeof req === 'string' ? req.match(/^>=\s*(\d+)/) : null;
        if (!m) return null;
        return Number(process.version.slice(1).split('.')[0]) >= Number(m[1]);
      })(),
    },
    migrations: { declared: migrations.length },
    /* The PDF/A toolchain is runbook blocker B15: the packager shells out to
       these, so their absence from the deployment image is an installation
       finding, not a runtime surprise. */
    toolchain: {
      ghostscript: binary('gs', ['--version']),
      veraPdf: binary('verapdf', ['--version']),
      xmllint: binary('xmllint', ['--version']),
    },
    gates: { declared: ciGates.length },
    /* Presence only — never the value. */
    secrets: ['AUDIT_HMAC_KEY', 'MFA_ENCRYPTION_KEY', 'RLS_ENFORCE', 'ENTITLEMENTS_ENFORCE'].map((k) => ({
      name: k,
      set: typeof process.env[k] === 'string' && process.env[k].length > 0,
    })),
  };
}

/* ── OQ execution ─────────────────────────────────────────────────────────── */

/** Resolve each declared test target and record whether it is really there. */
function resolveControls() {
  return CONTROLS.map((c) => {
    const found = c.tests.filter((t) => exists(t));
    const missing = c.tests.filter((t) => !exists(t));
    return {
      ...c,
      found,
      missing,
      evidence: found.length > 0 ? 'declared' : 'NO EVIDENCE',
      result: 'NOT EXECUTED',
      passed: null,
      failed: null,
    };
  });
}

/**
 * Execute the resolved suites, one vitest run per control so a control's result
 * is its own. A control with no existing test is not executed and keeps its
 * NO EVIDENCE verdict — running nothing must never look like a pass.
 */
function executeControls(controls) {
  for (const c of controls) {
    if (c.found.length === 0) continue;
    try {
      execFileSync(
        'npx',
        ['vitest', 'run', '--config', 'vitest.config.ts', '--reporter=dot', ...c.found],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
          timeout: 15 * 60 * 1000,
        },
      );
      c.result = 'PASS';
    } catch (err) {
      c.result = 'FAIL';
      /* Keep the reason, not the whole transcript — the pack points at the
         suite to re-run, it does not replace it. */
      const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      const line = out.split('\n').find((l) => /Tests\s+\d|FAIL|Error/.test(l));
      c.failureHint = (line ?? String(err.message ?? '')).trim().slice(0, 200);
    }
  }
  return controls;
}

/* ── render ───────────────────────────────────────────────────────────────── */

function verdictOf(controls) {
  const noEvidence = controls.filter((c) => c.evidence === 'NO EVIDENCE');
  const notRun = controls.filter((c) => c.evidence !== 'NO EVIDENCE' && c.result === 'NOT EXECUTED');
  const failed = controls.filter((c) => c.result === 'FAIL');
  const complete = noEvidence.length === 0 && notRun.length === 0 && failed.length === 0;
  return { complete, noEvidence, notRun, failed };
}

function render(iq, controls, v) {
  const L = [];
  L.push('# IQ / OQ evidence pack');
  L.push('');
  L.push('> **Generated by `scripts/ops/generate-iq-oq-pack.mjs`. Do not edit by hand — regenerate.**');
  L.push('');
  L.push('## What this document is');
  L.push('');
  L.push('This is qualification **evidence**, not a qualification. A qualification is a');
  L.push('protocol executed and signed by a competent person; no script can be that. What');
  L.push('this removes is the part quality should never have to establish by hand — what is');
  L.push('actually installed, and which controls are actually exercised by tests that');
  L.push('actually pass. Review starts from observed fact rather than from a claim.');
  L.push('');
  L.push('Every line below was observed at generation time. A control whose test file is');
  L.push('absent reads NO EVIDENCE. A test that was not executed reads NOT EXECUTED.');
  L.push('Neither is ever rendered as a pass.');
  L.push('');
  L.push(`**Verdict: ${v.complete ? 'COMPLETE' : 'INCOMPLETE'}**`);
  if (!v.complete) {
    L.push('');
    if (v.noEvidence.length) L.push(`- ${v.noEvidence.length} control(s) have no test evidence: ${v.noEvidence.map((c) => c.id).join(', ')}`);
    if (v.notRun.length) L.push(`- ${v.notRun.length} control(s) were not executed (re-run with \`--run\`): ${v.notRun.map((c) => c.id).join(', ')}`);
    if (v.failed.length) L.push(`- ${v.failed.length} control(s) FAILED: ${v.failed.map((c) => c.id).join(', ')}`);
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 1. Installation qualification (IQ)');
  L.push('');
  L.push('| Item | Observed | Note |');
  L.push('|---|---|---|');
  L.push(`| Node runtime | \`${iq.runtime.nodeObserved}\` | declared \`${iq.runtime.nodeRequired ?? 'none'}\`${iq.runtime.satisfied === false ? ' — **NOT SATISFIED**' : iq.runtime.satisfied === null ? ' — range not evaluated' : ''} |`);
  L.push(`| Migration files present | ${iq.migrations.declared} | count on disk; whether they are *applied* needs a database and is not claimed here |`);
  L.push(`| CI gates declared | ${iq.gates.declared} | \`ci:*\` / \`check:*\` scripts |`);
  for (const [name, probe] of Object.entries(iq.toolchain)) {
    L.push(
      `| ${name} | ${probe.present ? `present${probe.version ? ` — \`${cell(probe.version)}\`` : ' (version not reported)'}` : '**absent**'} | PDF/A + XML toolchain (runbook B15) |`,
    );
  }
  for (const s of iq.secrets) {
    L.push(`| \`${s.name}\` | ${s.set ? 'set' : '**not set**'} | presence only; value never read |`);
  }
  L.push('');
  L.push('## 2. Operational qualification (OQ)');
  L.push('');
  L.push('| ID | Control | Regulation | Evidence | Result |');
  L.push('|---|---|---|---|---|');
  for (const c of controls) {
    const ev =
      c.evidence === 'NO EVIDENCE'
        ? '**NO EVIDENCE**'
        : c.found.map((t) => `\`${t}\``).join('<br>');
    const res =
      c.result === 'PASS'
        ? 'PASS'
        : c.result === 'FAIL'
          ? `**FAIL** — ${cell(c.failureHint ?? 'see suite')}`
          : 'NOT EXECUTED';
    L.push(`| ${c.id} | ${cell(c.control)} | ${cell(c.regulation)} | ${ev} | ${res} |`);
  }
  const anyMissing = controls.filter((c) => c.missing.length > 0);
  if (anyMissing.length) {
    L.push('');
    L.push('### Declared test targets that are not on disk');
    L.push('');
    L.push('A target named here but absent means the control map has drifted from the');
    L.push('repository. That is a finding about this pack, and it is reported rather than');
    L.push('quietly dropped.');
    L.push('');
    for (const c of anyMissing) {
      for (const m of c.missing) L.push(`- ${c.id} → \`${m}\``);
    }
  }
  L.push('');
  L.push('## 3. What this pack does not cover');
  L.push('');
  L.push('- **Applied database state.** Migration files are counted on disk; whether a');
  L.push('  given environment has them applied requires a connection and is not claimed.');
  L.push('- **Licensed artefacts and credentials.** Covered by');
  L.push('  `node scripts/ops/ga-readiness-report.mjs` and `scripts/ops/submission-preflight.mjs`.');
  L.push('  They are not restated here.');
  L.push('- **Performance qualification (PQ).** Qualification under production load with');
  L.push('  real data is a separate exercise against a real deployment.');
  L.push('- **The signature.** Quality signs the qualification. This pack is its input.');
  L.push('');
  return L.join('\n');
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const iq = collectIq();
let controls = resolveControls();
if (RUN) controls = executeControls(controls);
const v = verdictOf(controls);
const markdown = render(iq, controls, v);

fs.mkdirSync(rel('docs/validation'), { recursive: true });
fs.writeFileSync(rel(OUT), markdown, 'utf8');

if (JSON_MODE) {
  console.log(JSON.stringify({ verdict: v.complete ? 'COMPLETE' : 'INCOMPLETE', iq, controls }, null, 2));
} else {
  console.log(`\nIQ/OQ evidence pack → ${OUT}`);
  console.log(`  controls declared: ${controls.length}`);
  console.log(`  no evidence:       ${v.noEvidence.length}${v.noEvidence.length ? ` (${v.noEvidence.map((c) => c.id).join(', ')})` : ''}`);
  console.log(`  not executed:      ${v.notRun.length}${RUN ? '' : '  (run with --run to execute)'}`);
  console.log(`  failed:            ${v.failed.length}${v.failed.length ? ` (${v.failed.map((c) => c.id).join(', ')})` : ''}`);
  console.log(`  verdict:           ${v.complete ? 'COMPLETE' : 'INCOMPLETE'}\n`);
}

process.exit(v.complete ? 0 : 1);
