#!/usr/bin/env node
/**
 * check-validation-traceability.mjs — refuse a validation package that cites
 * code or tests which are not there.
 *
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D4 asks for a traceability matrix
 * "generated from tests". Generation alone is not the guarantee; a generator
 * happily renders a row whose cited test was deleted last week, and the
 * resulting matrix looks exactly like a correct one. This gate is what makes
 * the citation load-bearing: move a route, delete a suite, rename a spec, and
 * the build goes red with the requirement id that now has nothing behind it.
 *
 * What it checks is in scripts/ops/validation/registry.mjs — structure, unique
 * and well-formed ids, resolvable citations, a verification per requirement,
 * and assurance effort proportional to declared risk. What it deliberately does
 * NOT check is whether a requirement is true of the code; no gate can, and the
 * rendered package says so rather than implying a machine reviewed the claim.
 *
 * Usage:
 *   node scripts/ci/check-validation-traceability.mjs
 *   node scripts/ci/check-validation-traceability.mjs --self-test
 *
 * Exit 0 when every finding list is empty; 1 otherwise.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRegistry, validateRegistry, repoRoot } from '../ops/validation/registry.mjs';

const SELF_TEST = process.argv.includes('--self-test');

/* ── the real check ──────────────────────────────────────────────────────── */

function checkRepo() {
  const { registry, errors } = readRegistry();
  if (errors.length) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    return 1;
  }
  const findings = validateRegistry(registry);
  if (findings.length === 0) {
    const count = registry.requirements.length;
    const apps = registry.apps.length;
    console.log(`✓ validation traceability: ${count} requirements across ${apps} launch apps, every citation resolves`);
    return 0;
  }
  console.error(`✗ validation traceability: ${findings.length} finding(s)\n`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
  console.error(
    '\nA citation that does not resolve is not a traceability matrix. Fix the\n' +
      `reference or remove the requirement in ${'docs/validation/launch/urs-registry.json'}.`,
  );
  return 1;
}

/* ── the self-test ───────────────────────────────────────────────────────────
 * Each case constructs a registry that breaks exactly one rule and asserts the
 * validator catches it. The first case is the control: a registry that should
 * produce no findings at all. Without that control, a validator that returned
 * "everything is broken" would pass every other case.
 */

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urs-selftest-'));
  fs.mkdirSync(path.join(root, 'server', '__tests__'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests', 'e2e'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server', 'real.ts'), '// implementation\n');
  fs.writeFileSync(path.join(root, 'server', '__tests__', 'real.test.ts'), '// test\n');
  fs.writeFileSync(path.join(root, 'tests', 'e2e', 'real.spec.ts'), '// e2e\n');

  const clean = () => ({
    apps: [{ id: 'vault', label: 'Vault', intendedUse: 'Store controlled records.' }],
    requirements: [
      {
        id: 'URS-VAULT-01',
        appId: 'vault',
        statement: 'The system shall retain every version of a controlled record.',
        intendedUse: 'A reviewer can read what was approved, not only what is current.',
        csaImpact: 'direct',
        assuranceLevel: 'high',
        failureMode: 'A superseded version is lost, so an approval cannot be reconstructed.',
        codeRefs: ['server/real.ts'],
        verification: [{ method: 'e2e', refs: ['tests/e2e/real.spec.ts'] }],
      },
    ],
  });

  const cases = [
    ['control — a well-formed registry', clean, 0],
    [
      'a cited implementation file that does not exist',
      () => { const r = clean(); r.requirements[0].codeRefs = ['server/ghost.ts']; return r; },
      1,
    ],
    [
      'a cited test file that does not exist',
      () => { const r = clean(); r.requirements[0].verification = [{ method: 'e2e', refs: ['tests/e2e/ghost.spec.ts'] }]; return r; },
      1,
    ],
    [
      'a requirement nothing verifies',
      () => { const r = clean(); r.requirements[0].verification = []; return r; },
      1,
    ],
    [
      'high assurance satisfied only by inspection',
      () => {
        const r = clean();
        r.requirements[0].verification = [{ method: 'inspection', refs: ['server/real.ts'] }];
        return r;
      },
      1,
    ],
    [
      'a direct-impact requirement carrying low assurance',
      () => { const r = clean(); r.requirements[0].assuranceLevel = 'low'; return r; },
      1,
    ],
    [
      'two requirements sharing one id',
      () => { const r = clean(); r.requirements.push({ ...r.requirements[0] }); return r; },
      1,
    ],
    [
      'a requirement written as a description rather than an obligation',
      () => { const r = clean(); r.requirements[0].statement = 'Versions are retained by the vault.'; return r; },
      1,
    ],
    [
      'a launch app with no requirements at all',
      () => {
        const r = clean();
        r.apps.push({ id: 'qms', label: 'QMS', intendedUse: 'Controlled documents.' });
        return r;
      },
      1,
    ],
    [
      'a requirement pointing at an app that is not in the launch catalog',
      () => { const r = clean(); r.requirements[0].appId = 'digital-twin'; return r; },
      1,
    ],
    [
      'a requirement with no implementing code cited',
      () => { const r = clean(); r.requirements[0].codeRefs = []; return r; },
      1,
    ],
    /* The honest-shortfall rules. A declared gap is allowed; a declared gap with
       nobody to close it, or one that claims to be a gap while asking for
       nothing more than it already has, is not. */
    [
      'control — a declared assurance shortfall with the work named',
      () => {
        const r = clean();
        r.requirements[0].assuranceLevel = 'medium';
        r.requirements[0].verification = [{ method: 'unit', refs: ['server/__tests__/real.test.ts'] }];
        r.requirements[0].assuranceTarget = 'high';
        r.requirements[0].evidenceOwed = 'an integration test that drives the real route against a database';
        return r;
      },
      0,
    ],
    [
      'an assurance target with no evidence owed — a gap with nobody to close it',
      () => {
        const r = clean();
        r.requirements[0].assuranceLevel = 'medium';
        r.requirements[0].verification = [{ method: 'unit', refs: ['server/__tests__/real.test.ts'] }];
        r.requirements[0].assuranceTarget = 'high';
        return r;
      },
      1,
    ],
    [
      'an assurance target no higher than the level already achieved',
      () => { const r = clean(); r.requirements[0].assuranceTarget = 'high'; r.requirements[0].evidenceOwed = 'nothing at all, really'; return r; },
      1,
    ],
    [
      'evidence owed with no target — says nothing about what is missing',
      () => { const r = clean(); r.requirements[0].evidenceOwed = 'some test somebody should write'; return r; },
      1,
    ],
  ];

  let failures = 0;
  for (const [name, build, expectFindings] of cases) {
    const findings = validateRegistry(build(), root);
    const caught = findings.length > 0 ? 1 : 0;
    const ok = caught === expectFindings;
    if (!ok) failures += 1;
    const detail = findings.length ? ` (${findings.map((f) => f.rule).join(', ')})` : '';
    console.log(`  ${ok ? '✓' : '✗'} ${name}${expectFindings ? '' : detail}`);
    if (!ok && expectFindings === 1) {
      console.log('      NOT CAUGHT — this mutation survived the validator');
    }
    if (!ok && expectFindings === 0) {
      console.log(`      false positive: ${findings.map((f) => `${f.rule}/${f.detail}`).join('; ')}`);
    }
  }

  fs.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`\n✗ self-test: ${failures} case(s) wrong. The gate does not do what it claims.`);
    return 1;
  }
  console.log(`\n✓ self-test: ${cases.length} cases, every mutation caught and the control clean`);
  return 0;
}

process.exit(SELF_TEST ? selfTest() : checkRepo());
