/**
 * Drift guard for the submission procurement preflight CLI.
 *
 * scripts/ops/submission-preflight.mjs must run without a TypeScript build, so
 * it duplicates the expected artifact filenames. That duplication is only safe
 * if it cannot drift from the TypeScript sources of truth — if a DTD filename or
 * an eSTAR template name changes in code and the CLI keeps checking the old
 * name, the preflight would cheerfully report "ready" for artifacts the
 * packager will never find. These tests read both sides as text and pin them
 * against each other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');

const CLI = read('scripts/ops/submission-preflight.mjs');
const DTD_BUNDLER = read('server/services/ectd/dtd-bundler.ts');
const ESTAR_REGISTRY = read(
  'server/services/pathway-engines/estar/estar-template-registry.ts',
);

/** Every `expectedFileName: '...'` in the eSTAR manifest. */
function manifestTemplateNames() {
  return [...ESTAR_REGISTRY.matchAll(/expectedFileName:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** The regional DTD filenames + the shared ICH backbone. */
function requiredDtdNames() {
  const regional = [...DTD_BUNDLER.matchAll(/^\s*(?:fda|ema|pmda|ca):\s*'([^']+\.dtd)'/gm)].map(
    (m) => m[1],
  );
  const backbone = DTD_BUNDLER.match(/ICH_BACKBONE_DTD\s*=\s*'([^']+)'/)?.[1];
  assert.ok(backbone, 'ICH_BACKBONE_DTD must be defined in dtd-bundler.ts');
  return [backbone, ...regional];
}

test('the CLI checks every DTD the packager actually requires', () => {
  const required = requiredDtdNames();
  assert.ok(required.length >= 5, `expected backbone + 4 regional DTDs, got ${required.length}`);
  const missing = required.filter((f) => !CLI.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these DTDs are required by dtd-bundler.ts but not checked by the preflight CLI: ` +
      `${missing.join(', ')}. The CLI would report "ready" for a package the ` +
      `packager cannot actually build.`,
  );
});

test('the CLI checks every official eSTAR template in the manifest', () => {
  // The manifest still describes the whole eSTAR program — nine descriptors.
  const descriptors = manifestTemplateNames();
  assert.ok(descriptors.length >= 9, `expected the full eSTAR program, got ${descriptors.length}`);
  // …but they do NOT resolve to nine files. FDA ships one nIVD PDF and one IVD
  // PDF, each carrying 510(k), De Novo and PMA, so the six marketing
  // descriptors name two files between them. This asserted nine DISTINCT files
  // until 2026-09-04, which was only true while De Novo and PMA pointed at
  // eSTAR-denovo-*/eSTAR-pma-* names FDA does not publish. What the CLI owes is
  // coverage of every distinct file the manifest actually names.
  const templates = [...new Set(descriptors)];
  const missing = templates.filter((f) => !CLI.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these templates are in ESTAR_TEMPLATE_MANIFEST but not checked by the ` +
      `preflight CLI: ${missing.join(', ')}.`,
  );
});

test('the CLI does not check artifacts that no source requires (no phantom gaps)', () => {
  // Every *.dtd the CLI names must be one the bundler requires — otherwise the
  // preflight reports a gap nobody can ever close.
  const required = new Set(requiredDtdNames());
  const cliDtds = [...CLI.matchAll(/'([a-z0-9-]+\.dtd)'/gi)].map((m) => m[1]);
  const phantom = cliDtds.filter((f) => !required.has(f));
  assert.deepEqual(phantom, [], `preflight names DTDs no source requires: ${phantom.join(', ')}`);

  // The same rule for the eSTAR templates, which this check did NOT cover until
  // 2026-09-04 — and that blind spot is why the CLI asked procurement for four
  // FDA files that do not exist (eSTAR-denovo-*.pdf, eSTAR-pma-*.pdf) and
  // reported De Novo and PMA blocked, with a green gate, for as long as it did.
  // A preflight naming an artifact no source requires reports a gap nobody can
  // close, which is the same defect wearing the other coat.
  const declared = new Set(manifestTemplateNames());
  const cliTemplates = [...CLI.matchAll(/'([A-Za-z0-9-]+\.pdf)'/g)].map((m) => m[1]);
  const phantomTemplates = cliTemplates.filter((f) => !declared.has(f));
  assert.deepEqual(
    phantomTemplates,
    [],
    `preflight names eSTAR templates ESTAR_TEMPLATE_MANIFEST does not: ${phantomTemplates.join(', ')}`,
  );
});

test('the CLI exits non-zero when artifacts are missing (so it can gate a pipeline)', () => {
  // The contract that makes this usable in CI: ready → 0, missing → 1.
  assert.match(
    CLI,
    /process\.exit\(report\.ready \? 0 : 1\)/,
    'the preflight must exit 0 only when everything is present',
  );
});
