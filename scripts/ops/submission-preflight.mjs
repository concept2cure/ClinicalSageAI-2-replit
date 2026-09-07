#!/usr/bin/env node
/**
 * Submission procurement preflight (CLI).
 *
 * Answers, in one command, "what do we still need to obtain before this platform
 * can file for real?" — the licensed agency artifacts and agency credentials
 * that gate live submission. None of them is code:
 *
 *   1. eCTD DTDs            → assets/ectd-dtd/        (or ECTD_DTD_DIR)
 *   2. FDA eSTAR templates  → assets/estar-templates/ (or ESTAR_TEMPLATE_DIR)
 *   3. Agency validators    → *_VALIDATOR_URL env vars
 *
 * Usage:
 *   node scripts/ops/submission-preflight.mjs          # human-readable
 *   node scripts/ops/submission-preflight.mjs --json   # machine-readable
 *
 * Exit code is 0 when everything is present and 1 when anything is missing, so
 * it can gate a deploy pipeline. It only observes disk + env: it never downloads
 * and never reports a gap as satisfied.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// The expected artifact sets are duplicated here rather than imported, because
// this script must run without a TypeScript build step. The manifest test
// (tests/ops/submission-preflight.test.mjs) pins them against the TS sources so
// the two cannot drift silently.
const ICH_BACKBONE_DTD = 'ich-ectd-3-2.dtd';
const REGIONAL_DTDS = [
  'us-regional-v3-3.dtd',
  'eu-regional.dtd',
  'jp-regional.dtd',
  'ca-regional.dtd',
];
// FDA ships ONE nIVD PDF and ONE IVD PDF, and each carries 510(k), De Novo and
// PMA (assets/estar-templates/README.md, family table). So the six marketing
// descriptors resolve to two files, not six: this list is the DISTINCT set of
// files the manifest actually names. It listed eSTAR-denovo-*.pdf and
// eSTAR-pma-*.pdf until 2026-09-04, which told procurement to obtain four files
// FDA does not publish and reported De Novo and PMA production blocked while it
// was live.
const ESTAR_TEMPLATES = [
  'eSTAR-510k-non-ivd.pdf',
  'eSTAR-510k-ivd.pdf',
  'PreSTAR-q-sub.pdf',
  'PreSTAR-ide.pdf',
  'PreSTAR-513g.pdf',
];
const VALIDATORS = [
  { id: 'fda_evalidator', label: 'FDA eValidator', urlEnv: 'FDA_VALIDATOR_URL' },
  { id: 'ema_validator', label: 'EMA technical validation', urlEnv: 'EMA_VALIDATOR_URL' },
  { id: 'pmda_precheck', label: 'PMDA pre-check', urlEnv: 'PMDA_VALIDATOR_URL' },
];

async function listDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function main() {
  const json = process.argv.includes('--json');
  const dtdDir = process.env.ECTD_DTD_DIR || path.join(repoRoot, 'assets/ectd-dtd');
  const estarDir = process.env.ESTAR_TEMPLATE_DIR || path.join(repoRoot, 'assets/estar-templates');

  const dtdPresent = new Set((await listDir(dtdDir)).map((f) => f.toLowerCase()));
  const estarPresent = new Set((await listDir(estarDir)).map((f) => f.toLowerCase()));

  const items = [];
  for (const f of [ICH_BACKBONE_DTD, ...REGIONAL_DTDS]) {
    items.push({
      category: 'ectd_dtd',
      label: f,
      satisfied: dtdPresent.has(f.toLowerCase()),
      location: path.join(dtdDir, f),
      unblocks: 'DTD-self-contained eCTD packages',
    });
  }
  for (const f of ESTAR_TEMPLATES) {
    items.push({
      category: 'estar_template',
      label: f,
      satisfied: estarPresent.has(f.toLowerCase()),
      location: path.join(estarDir, f),
      unblocks: 'official eSTAR/PreSTAR production',
    });
  }
  for (const v of VALIDATORS) {
    items.push({
      category: 'agency_validator',
      label: v.label,
      satisfied: Boolean(process.env[v.urlEnv]),
      location: `${v.urlEnv} env var`,
      unblocks: 'agency-grade validation before transmit',
    });
  }

  const missing = items.filter((i) => !i.satisfied);
  const report = {
    ready: missing.length === 0,
    total: items.length,
    satisfied: items.length - missing.length,
    missing: missing.length,
    items,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\nSubmission procurement preflight\n' + '='.repeat(60));
    let category = '';
    for (const i of items) {
      if (i.category !== category) {
        category = i.category;
        console.log(`\n${category}:`);
      }
      console.log(`  ${i.satisfied ? '[x]' : '[ ]'} ${i.label}`);
      if (!i.satisfied) console.log(`        → place at: ${i.location}`);
    }
    console.log('\n' + '='.repeat(60));
    console.log(`${report.satisfied}/${report.total} present. ${report.missing} still to obtain.`);
    if (!report.ready) {
      console.log(
        '\nThese are licensed agency artifacts / credentials — obtain them from the\n' +
          'agency and drop them at the paths above. No code change is needed: each\n' +
          'gate flips automatically once the artifact is present.',
      );
    }
  }

  process.exit(report.ready ? 0 : 1);
}

main().catch((err) => {
  console.error('preflight failed:', err?.message || err);
  process.exit(2);
});
