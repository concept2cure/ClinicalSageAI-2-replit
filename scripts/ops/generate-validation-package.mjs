#!/usr/bin/env node
/**
 * generate-validation-package.mjs — render the D4 validation package from the
 * URS registry, and, with `--run`, execute the verification it cites.
 *
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D4: "CSA-aligned: validation plan,
 * URS per launch app, risk assessment, IQ, OQ with executed Playwright
 * evidence, traceability matrix generated from tests, summary report."
 *
 * This script produces five of those seven. The validation plan
 * (`VP-LAUNCH-001`) is written by a human because a plan is a commitment, not
 * an observation. The IQ is already produced by its own generator
 * (`scripts/ops/generate-iq-oq-pack.mjs`) and is referenced rather than
 * restated — the same platform Part 11 controls described twice would be two
 * documents to keep in step, which is the failure this package is designed
 * against.
 *
 * WHAT IT PRODUCES
 *   docs/validation/launch/URS-<APP>.md                  one per launch app
 *   docs/validation/launch/RA-LAUNCH-001-RISK-ASSESSMENT.md
 *   docs/validation/launch/TM-LAUNCH-001-TRACEABILITY-MATRIX.md
 *   docs/validation/launch/VSR-LAUNCH-001-SUMMARY-REPORT.md
 *
 * DESIGN CONTRACT (shared with ga-readiness-report.mjs, submission-preflight.mjs
 * and generate-iq-oq-pack.mjs, and the reason any of them is worth reading):
 *   • OBSERVED, NEVER ASSUMED. Without `--run` every result reads NOT EXECUTED
 *     and the verdict is INCOMPLETE. That is the honest answer for a run that
 *     executed nothing, not a defect of the run.
 *   • FAIL CLOSED. The verdict is COMPLETE only when every requirement has at
 *     least one verification that was executed AND passed. A suite that could
 *     not be started reads ERROR, never a pass.
 *   • The structural gate runs first and unconditionally. A registry citing a
 *     path that does not exist produces no documents at all, because a rendered
 *     matrix is indistinguishable from a correct one.
 *
 * USAGE
 *   node scripts/ops/generate-validation-package.mjs            # render, execute nothing
 *   node scripts/ops/generate-validation-package.mjs --run      # also execute vitest + Playwright
 *   node scripts/ops/generate-validation-package.mjs --run --no-e2e   # skip the browser tier
 *   node scripts/ops/generate-validation-package.mjs --json     # machine-readable to stdout
 *
 * `--run` with the browser tier needs a provisioned DATABASE_URL and a Chromium
 * Playwright can launch; it boots the application itself through the helpers in
 * scripts/run-e2e-smoke.mjs rather than restating that recipe.
 *
 * Exit 0 when the package is COMPLETE, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readRegistry, validateRegistry, repoRoot, REGISTRY_PATH } from './validation/registry.mjs';

const ARGS = process.argv.slice(2);
const RUN = ARGS.includes('--run');
const NO_E2E = ARGS.includes('--no-e2e');
const JSON_MODE = ARGS.includes('--json');
const OUT_DIR = 'docs/validation/launch';

const rel = (p) => path.join(repoRoot, p);
const say = (...a) => { if (!JSON_MODE) console.log(...a); };

/** Markdown cells are pipe-delimited; a pipe inside a value shifts every column
 *  after it. Vitest summary lines contain pipes ("1 failed | 8 passed"). */
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const RESULT = { PASS: 'PASS', FAIL: 'FAIL', NOT_EXECUTED: 'NOT EXECUTED', ERROR: 'ERROR' };

/* ── execution ───────────────────────────────────────────────────────────── */

/**
 * Run one vitest invocation over a set of files. One invocation per requirement
 * rather than one for the whole registry: a requirement's result has to be its
 * own, or a single unrelated failure marks every requirement failed and the
 * matrix stops distinguishing them.
 */
function runVitest(files) {
  try {
    const out = execFileSync(
      'npx',
      ['vitest', 'run', '--config', 'vitest.config.ts', '--reporter=dot', ...files],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60_000 },
    );
    return { result: RESULT.PASS, detail: summariseVitest(out) };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    /* A suite that never started is not a failed control — it is an absent
       observation, and calling it FAIL would put a false finding in a signed
       document just as surely as calling it PASS would hide a real one. */
    if (!/Test Files|Tests\s+\d/.test(out)) {
      return { result: RESULT.ERROR, detail: `vitest did not run: ${out.trim().split('\n').slice(-2).join(' ').slice(0, 200)}` };
    }
    return { result: RESULT.FAIL, detail: summariseVitest(out) };
  }
}

function summariseVitest(out) {
  const line = out.split('\n').find((l) => /Tests\s+\d|Tests\s+\w/.test(l));
  return (line ?? out.split('\n').filter(Boolean).slice(-1)[0] ?? '').trim().slice(0, 160);
}

/**
 * Run one Playwright spec against an already-running server and read the JSON
 * report. `--reporter=json` overrides the config's reporters and writes the
 * report to stdout, so nothing has to be cleaned up between specs.
 */
function runPlaywrightSpec(specPath, env) {
  const bin = fs.existsSync(rel('node_modules/.bin/playwright'))
    ? { cmd: 'node_modules/.bin/playwright', pre: [] }
    : { cmd: 'npx', pre: ['playwright'] };
  const r = spawnSync(bin.cmd, [...bin.pre, 'test', specPath, '--reporter=json'], {
    cwd: repoRoot, encoding: 'utf8', env, timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error?.code === 'ENOENT') {
    return { result: RESULT.ERROR, detail: 'playwright is not installed (npm i -D @playwright/test)' };
  }
  let report = null;
  try {
    const text = r.stdout ?? '';
    const start = text.indexOf('{');
    if (start >= 0) report = JSON.parse(text.slice(start));
  } catch {
    report = null;
  }
  if (!report) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' ');
    return { result: RESULT.ERROR, detail: `no Playwright report: ${tail.slice(0, 220)}` };
  }
  const stats = report.stats ?? {};
  const expected = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const skipped = stats.skipped ?? 0;
  /* A spec that ran zero tests exits 0. Treating that as a pass is precisely the
     "control that reports success while doing nothing" shape; it is an ERROR. */
  if (expected + unexpected === 0) {
    return { result: RESULT.ERROR, detail: `the spec ran no tests (${skipped} skipped)` };
  }
  const detail = `${expected} passed, ${unexpected} failed, ${skipped} skipped`;
  return { result: unexpected > 0 ? RESULT.FAIL : RESULT.PASS, detail };
}

/** Boot the application once, run every OQ browser spec against it, shut it down. */
async function executeE2e(specs) {
  const results = new Map();
  if (specs.length === 0) return results;
  const smoke = await import('../run-e2e-smoke.mjs');
  say(`  booting the application for ${specs.length} browser spec(s)…`);
  try {
    await smoke.seedIdentities();
  } catch (error) {
    for (const s of specs) results.set(s, { result: RESULT.ERROR, detail: `seeding failed: ${error.message}` });
    return results;
  }
  const server = smoke.startDevServer();
  try {
    await smoke.waitForServer(smoke.BASE_URL);
    const env = { ...process.env, BASE_URL: smoke.BASE_URL };
    for (const spec of specs) {
      say(`  ▸ ${spec}`);
      results.set(spec, runPlaywrightSpec(spec, env));
    }
  } catch (error) {
    for (const s of specs) {
      if (!results.has(s)) results.set(s, { result: RESULT.ERROR, detail: `server did not come up: ${error.message}` });
    }
  } finally {
    smoke.stopDevServer(server);
  }
  return results;
}

/* ── rendering ───────────────────────────────────────────────────────────── */

const HEADER = (title, id) => `# ${title}

**Document ID:** ${id}
**Generated by:** \`scripts/ops/generate-validation-package.mjs\` from \`${REGISTRY_PATH}\`.
**Do not edit by hand — regenerate.** A hand edit is invisible to
\`npm run ci:validation-traceability\`, which is the only thing keeping the
citations below honest.

> **What this document is.** Qualification *evidence*, not a qualification. A
> qualification is a protocol executed and signed by a competent person; no
> script can be that. What this removes is the part a quality reviewer should
> never have to establish by hand — which requirement is implemented by which
> code, checked by which test, and whether that test actually ran and passed.
> Review starts from observed fact rather than from a claim.
>
> Every result below was observed at generation time. A verification that was
> not run reads NOT EXECUTED. A suite that could not start reads ERROR. Neither
> is ever rendered as a pass.
`;

const IMPACT_NOTE = `
**Reading the impact column.** \`direct\` means the software itself affects the
integrity, authenticity or content of a regulated record, or decides who may act
on one. \`indirect\` means it supports that work without producing the record.
The distinction sets the assurance effort: a direct-impact requirement cannot be
discharged by inspection, and the gate refuses a registry that tries.
`;

function renderUrs(app, reqs, resultsById) {
  const rows = reqs.map((r) => {
    const ex = resultsById.get(r.id) ?? {};
    return `| ${cell(r.id)} | ${cell(r.statement)} | ${cell(r.csaImpact)} | ${cell(r.assuranceLevel)} | ${cell(r.assuranceTarget ? `→ ${r.assuranceTarget}` : '—')} | ${cell(ex.result ?? RESULT.NOT_EXECUTED)} |`;
  });
  const detail = reqs.map((r) => {
    const ex = resultsById.get(r.id) ?? {};
    const verif = (r.verification ?? [])
      .map((v) => `  - **${v.method}** — ${v.refs.map((p) => `\`${p}\``).join(', ')}`)
      .join('\n');
    const exec = (ex.runs ?? [])
      .map((run) => `  - \`${run.ref}\` → **${run.result}** — ${cell(run.detail)}`)
      .join('\n');
    return `### ${r.id} — ${r.statement}

**Intended use.** ${r.intendedUse}

**If it fails.** ${r.failureMode}

**CSA impact.** ${r.csaImpact} · **assurance level achieved** ${r.assuranceLevel}${
      r.assuranceTarget
        ? `

> **Not yet qualified to the level this risk deserves.** The evidence cited
> below supports **${r.assuranceLevel}** assurance; the risk deserves
> **${r.assuranceTarget}**. Owed: ${r.evidenceOwed} Until that exists this
> requirement is declared and partially evidenced, not qualified, and
> VSR-LAUNCH-001 counts it against the package.`
        : ''
    }

**Implemented by**
${(r.codeRefs ?? []).map((p) => `  - \`${p}\``).join('\n')}

**Verified by**
${verif || '  - _none declared_'}

**Executed**
${exec || '  - NOT EXECUTED — this run did not execute verification.'}
`;
  }).join('\n');

  return `${HEADER(`User requirements — ${app.label}`, `URS-${app.id.toUpperCase()}`)}
## Intended use

${app.intendedUse}

Surfaces in scope: ${(app.surfaces ?? []).map((s) => `\`${s}\``).join(', ') || '_not declared_'}
${IMPACT_NOTE}
## Requirements

| ID | Requirement | Impact | Assurance | Owed | Result |
|---|---|---|---|---|---|
${rows.join('\n')}

## Requirement detail

${detail}
`;
}

function renderRisk(registry, resultsById) {
  const order = { high: 0, medium: 1, low: 2 };
  const reqs = [...registry.requirements].sort(
    (a, b) => (order[a.assuranceLevel] ?? 9) - (order[b.assuranceLevel] ?? 9) || a.id.localeCompare(b.id),
  );
  const rows = reqs.map((r) => {
    const ex = resultsById.get(r.id) ?? {};
    const methods = (r.verification ?? []).map((v) => v.method).join(', ');
    return `| ${cell(r.id)} | ${cell(r.appId)} | ${cell(r.failureMode)} | ${cell(r.csaImpact)} | ${cell(r.assuranceLevel)} | ${cell(r.assuranceTarget ?? '—')} | ${cell(methods)} | ${cell(ex.result ?? RESULT.NOT_EXECUTED)} |`;
  });
  const counts = reqs.reduce((acc, r) => {
    acc[r.assuranceLevel] = (acc[r.assuranceLevel] ?? 0) + 1;
    return acc;
  }, {});
  return `${HEADER('Risk assessment — launch catalog', 'RA-LAUNCH-001')}
## Method

Risk is assessed per requirement, against its intended use, in the manner FDA's
Computer Software Assurance guidance describes: decide what the failure of this
specific function would do to a regulated record or to a decision made from one,
then spend the assurance effort that failure justifies and no more.

Two honesty notes a reviewer should have in front of them:

- That guidance is scoped to device **production and quality-system** software
  and does not modify 21 CFR Part 11. This package borrows its method; it does
  not claim the guidance governs this system. The binding requirements here are
  **21 CFR Part 11** and **EU GMP Annex 11**, with **GAMP 5 (2nd ed.)** as the
  framework.
- Risk here is the risk of the *software* failing. It is not a clinical or
  patient-safety risk assessment, and it does not replace one.

The assurance rule is mechanically enforced, not merely stated:
\`scripts/ci/check-validation-traceability.mjs\` refuses a registry in which a
high-assurance requirement is discharged by inspection or a unit test alone, or
in which a direct-impact requirement carries low assurance.
${IMPACT_NOTE}
## Distribution

| Assurance level | Requirements |
|---|---|
| high | ${counts.high ?? 0} |
| medium | ${counts.medium ?? 0} |
| low | ${counts.low ?? 0} |

## Assessment

| ID | App | Failure mode | Impact | Achieved | Deserves | Verification | Result |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function renderTraceability(registry, resultsById, appById) {
  const rows = [];
  for (const r of registry.requirements) {
    for (const v of r.verification ?? []) {
      for (const ref of v.refs) {
        const ex = (resultsById.get(r.id)?.runs ?? []).find((x) => x.ref === ref);
        rows.push(
          `| ${cell(r.id)} | ${cell(appById.get(r.appId)?.label ?? r.appId)} | ${cell(r.assuranceLevel)} | ${cell(v.method)} | \`${cell(ref)}\` | ${cell(ex?.result ?? RESULT.NOT_EXECUTED)} | ${cell(ex?.detail ?? '')} |`,
        );
      }
    }
  }
  return `${HEADER('Traceability matrix — launch catalog', 'TM-LAUNCH-001')}
## What traces to what

Each row is one requirement, one verification method and one artifact that
performs it, with the result observed when this document was generated. The
matrix is generated from \`${REGISTRY_PATH}\`, and every path in it is checked
to exist by \`npm run ci:validation-traceability\` on every push. A test that is
deleted or renamed breaks that gate rather than quietly emptying a cell here.

Platform-wide 21 CFR Part 11 controls (OQ-01 … OQ-11) are traced separately in
\`docs/validation/IQ_OQ_EVIDENCE_PACK.md\`, generated by
\`scripts/ops/generate-iq-oq-pack.mjs\`. They are referenced rather than
restated, so the two documents cannot disagree.

| Requirement | App | Assurance | Method | Verifying artifact | Result | Observed |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function renderSummary(registry, resultsById, verdict, tally, executed, owed) {
  const failing = registry.requirements
    .filter((r) => (resultsById.get(r.id)?.result ?? RESULT.NOT_EXECUTED) !== RESULT.PASS)
    .map((r) => {
      const ex = resultsById.get(r.id) ?? {};
      return `| ${cell(r.id)} | ${cell(r.appId)} | ${cell(ex.result ?? RESULT.NOT_EXECUTED)} | ${cell((ex.runs ?? []).map((x) => `${x.ref}: ${x.detail}`).join('; ') || 'not executed in this run')} |`;
    });

  return `${HEADER('Validation summary report — launch catalog', 'VSR-LAUNCH-001')}
## Verdict

**${verdict}**

${verdict === 'COMPLETE'
    ? 'Every requirement in the registry has at least one verification that was executed and passed in this run, and no requirement carries an unclosed assurance shortfall.'
    : 'The package is not complete. Either a requirement has no executed, passing verification, or a requirement is not yet qualified to the assurance level its risk deserves. Both lists are below. This verdict is the point of the document: a summary report that could only ever say COMPLETE would evidence nothing.'}

| | Count |
|---|---|
| Launch apps | ${registry.apps.length} |
| Requirements | ${registry.requirements.length} |
| Executed and passed | ${tally[RESULT.PASS] ?? 0} |
| Executed and failed | ${tally[RESULT.FAIL] ?? 0} |
| Could not be executed (ERROR) | ${tally[RESULT.ERROR] ?? 0} |
| Not executed in this run | ${tally[RESULT.NOT_EXECUTED] ?? 0} |
| **Not yet qualified to the level the risk deserves** | ${owed.length} |

Verification was ${executed ? 'executed' : '**not** executed'} in this run${executed ? '' : ' (run with `--run`)'}.

## Outstanding

${failing.length === 0
    ? 'Nothing. Every requirement passed.'
    : `| ID | App | Result | Observed |\n|---|---|---|---|\n${failing.join('\n')}`}

## Not yet qualified to the level the risk deserves

These requirements are implemented and partially evidenced. The evidence that
exists supports a lower assurance level than the requirement's risk justifies,
so they are **declared, not qualified**, and the package cannot read COMPLETE
while any of them stands. Each names the work that would close it.

${owed.length === 0
    ? 'None. Every requirement is evidenced to the level its risk deserves.'
    : `| ID | App | Achieved | Deserves | Evidence owed |\n|---|---|---|---|---|\n${owed
        .map((r) => `| ${cell(r.id)} | ${cell(r.appId)} | ${cell(r.assuranceLevel)} | ${cell(r.assuranceTarget)} | ${cell(r.evidenceOwed)} |`)
        .join('\n')}`}

## What this report does not cover

- **The truth of a requirement.** That the cited code implements the cited
  statement is a reviewer's judgement. Nothing mechanical establishes it, and
  this document does not imply that anything did.
- **Installation.** \`docs/validation/IQ_OQ_EVIDENCE_PACK.md\` records what is
  installed, and \`node scripts/ops/ga-readiness-report.mjs\` records the
  licensed artefacts and credentials a deployment still needs.
- **Performance qualification.** Qualification under production load with real
  data is a separate exercise against a real deployment.
- **The signature.** Quality signs the qualification. This report is its input.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner | | | |
| Qualified reviewer (independent) | | | |

A signature on this page attests to the review of the evidence above, not to
its generation.
`;
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const { registry, errors } = readRegistry();
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    return 1;
  }
  const findings = validateRegistry(registry);
  if (findings.length) {
    console.error(`✗ the registry is not structurally valid; no documents were written.\n`);
    for (const f of findings) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
    console.error('\nRun `npm run ci:validation-traceability` for the same list.');
    return 1;
  }

  const appById = new Map(registry.apps.map((a) => [a.id, a]));
  const resultsById = new Map();

  /* Collect the browser specs first so the application boots once for all of
     them rather than once per requirement. */
  const e2eSpecs = [
    ...new Set(
      registry.requirements.flatMap((r) =>
        (r.verification ?? []).filter((v) => v.method === 'e2e').flatMap((v) => v.refs),
      ),
    ),
  ];
  const e2eResults = RUN && !NO_E2E ? await executeE2e(e2eSpecs) : new Map();

  for (const r of registry.requirements) {
    const runs = [];
    for (const v of r.verification ?? []) {
      for (const ref of v.refs) {
        if (!RUN) { runs.push({ ref, method: v.method, result: RESULT.NOT_EXECUTED, detail: '' }); continue; }
        if (v.method === 'inspection') {
          /* Inspection is a human act. Recording it as executed because a file
             exists would be the package asserting a review nobody performed. */
          runs.push({ ref, method: v.method, result: RESULT.NOT_EXECUTED, detail: 'inspection is performed and signed by the reviewer' });
          continue;
        }
        if (v.method === 'e2e') {
          const got = e2eResults.get(ref) ?? { result: RESULT.NOT_EXECUTED, detail: NO_E2E ? 'browser tier skipped (--no-e2e)' : '' };
          runs.push({ ref, method: v.method, ...got });
          continue;
        }
        say(`  ▸ ${r.id} ${ref}`);
        runs.push({ ref, method: v.method, ...runVitest([ref]) });
      }
    }
    /* A requirement passes when at least one executed verification passed and
       none failed. One passing check does not excuse another that went red. */
    const anyPass = runs.some((x) => x.result === RESULT.PASS);
    const anyFail = runs.some((x) => x.result === RESULT.FAIL);
    const anyError = runs.some((x) => x.result === RESULT.ERROR);
    const result = anyFail ? RESULT.FAIL : anyPass ? RESULT.PASS : anyError ? RESULT.ERROR : RESULT.NOT_EXECUTED;
    resultsById.set(r.id, { result, runs });
  }

  const tally = {};
  for (const [, v] of resultsById) tally[v.result] = (tally[v.result] ?? 0) + 1;
  /* A requirement whose evidence is weaker than its risk deserves is not
     qualified, however green its tests are, so the shortfall list gates the
     verdict exactly as a failing suite does. */
  const owed = registry.requirements.filter((r) => r.assuranceTarget);
  const verdict =
    RUN && (tally[RESULT.PASS] ?? 0) === registry.requirements.length && owed.length === 0
      ? 'COMPLETE'
      : 'INCOMPLETE';

  fs.mkdirSync(rel(OUT_DIR), { recursive: true });
  const written = [];
  for (const app of registry.apps) {
    const reqs = registry.requirements.filter((r) => r.appId === app.id);
    const file = `${OUT_DIR}/URS-${app.id.toUpperCase()}.md`;
    fs.writeFileSync(rel(file), renderUrs(app, reqs, resultsById));
    written.push(file);
  }
  const more = [
    [`${OUT_DIR}/RA-LAUNCH-001-RISK-ASSESSMENT.md`, renderRisk(registry, resultsById)],
    [`${OUT_DIR}/TM-LAUNCH-001-TRACEABILITY-MATRIX.md`, renderTraceability(registry, resultsById, appById)],
    [`${OUT_DIR}/VSR-LAUNCH-001-SUMMARY-REPORT.md`, renderSummary(registry, resultsById, verdict, tally, RUN, owed)],
  ];
  for (const [file, body] of more) { fs.writeFileSync(rel(file), body); written.push(file); }

  if (JSON_MODE) {
    console.log(JSON.stringify({
      verdict, executed: RUN, tally,
      requirements: [...resultsById].map(([id, v]) => ({ id, ...v })),
      written,
    }, null, 2));
  } else {
    say(`\nwrote ${written.length} document(s) to ${OUT_DIR}/`);
    for (const [k, v] of Object.entries(tally)) say(`  ${k}: ${v}`);
    if (owed.length) say(`  not yet qualified to the level the risk deserves: ${owed.length}`);
    say(`\nVerdict: ${verdict}`);
    if (verdict !== 'COMPLETE' && !RUN) say('(nothing was executed — run with --run)');
  }
  return verdict === 'COMPLETE' ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
