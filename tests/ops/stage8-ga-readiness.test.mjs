import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('stage8 required integration artifacts exist', () => {
  const required = [
    'docs/integration/MERGE_RISK_MAP.md',
    'docs/integration/CURRENT_CANONICAL_STATE.md',
    'docs/integration/MERGE_BACK_PLAN.md',
    'docs/proof/BETA_CORE_PULSE_PROOF.md',
    'tests/e2e/beta-core-pulse.e2e.ts',
    'scripts/integration/stage8_compare_map.sh',
    'tests/integration/stage8_compare_map.test.sh',
  ];
  for (const rel of required) {
    assert.equal(fs.existsSync(path.join(repoRoot, rel)), true, `${rel} should exist`);
  }
});

test('beta pulse e2e covers required core pulse cases', () => {
  const src = read('tests/e2e/beta-core-pulse.e2e.ts');
  const tokens = [
    'Root entry should not settle on dead portal truth',
    'Login redirect behavior should preserve concept2cure target',
    '/client-portal/* compatibility fence should not dead-end',
    'Authenticated /concept2cure/project/:projectId',
    'Project shell load',
    'Governed workspace shell visible',
    'Open at least one project context surface',
    'Open workspace and return without blank state',
    'No route lands in dead portal truth',
    'No primary beta CTA lands in unmapped/dead route',
  ];
  for (const token of tokens) {
    assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('route truth contract remains anchored for root/login/project routes', () => {
  // After the App.jsx refactor, the root `/` redirect lives inside the
  // ZenRouter bundle rather than at the App.jsx shell layer. The intent
  // ("root path is reachable; login + project routes exist under
  // /concept2cure") is unchanged; the location moved. Test now asserts
  // the current contract.
  const appSrc = read('client/src/App.jsx');
  const routerSrc = read('client/src/concept2cure/router/ZenRouter.tsx');

  // App.jsx still mounts ZenRouter and the standard auth redirects.
  assert.match(appSrc, /<Route path="\/sign-in">/);
  assert.match(appSrc, /Redirect to="\/concept2cure\/login"/);

  // ZenRouter owns the canonical login + project paths and the root
  // entry point.
  assert.match(routerSrc, /<Route path="\/concept2cure\/login">/);
  assert.match(routerSrc, /<Route path="\/concept2cure\/project\/:projectId">/);
  assert.match(routerSrc, /<Route path="\/">/);
});

test('compare script fails closed when base ref is absent', () => {
  const script = path.join(repoRoot, 'scripts/integration/stage8_compare_map.sh');
  const result = spawnSync(script, ['definitely-missing-ref', 'also-missing-ref'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ERROR: missing ref 'definitely-missing-ref'/);
});

test('compare script self-test harness passes', () => {
  const out = execFileSync(path.join(repoRoot, 'tests/integration/stage8_compare_map.test.sh'), {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.match(out, /PASS/);
});


test('redirect utility enforces canonical beta redirect prefixes', () => {
  const redirectSrc = read('client/src/concept2cure/auth/redirectUtils.ts');
  assert.match(redirectSrc, /ALLOWED_REDIRECT_PREFIXES/);
  assert.match(redirectSrc, /\/concept2cure/);
  assert.match(redirectSrc, /\/client-portal/);
  assert.match(redirectSrc, /normalizeRedirectCandidate/);
  assert.match(redirectSrc, /isAllowedPathname/);
});


test('auth middleware includes hardened bearer extraction helpers', () => {
  const authSrc = read('server/auth.ts');
  assert.match(authSrc, /extractBearerToken/);
  assert.match(authSrc, /parseFiniteInt/);
  assert.match(authSrc, /authorizationHeader\.trim\(\)\.split\(/);
});
