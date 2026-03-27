#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const REQUIRED_DOCS = [
  'docs/audits/OSS_STACK_REPO_TRUTH_RECONCILIATION.md',
  'docs/plans/OSS_STACK_PROGRAM_PLAN.md',
  'docs/architecture/OSS_STACK_TARGET_ARCHITECTURE.md',
  'docs/architecture/OSS_STACK_SERVICE_BOUNDARIES.md',
  'docs/architecture/OSS_STACK_DATA_CONTRACTS.md',
  'docs/release/OSS_STACK_BETA_GATES.md',
  'docs/release/OSS_STACK_GA_GATES.md',
  'docs/plans/OSS_STACK_WORKSTREAM_EXECUTION_BOARD.md',
  'docs/release/OSS_STACK_HUMAN_USER_TEST_PLAN.md',
  'docs/evals/OSS_STACK_SCORING_RUBRIC.md',
  'docs/evals/OSS_STACK_GOLDEN_TASKS.md',
  'docs/release/OSS_STACK_GA_HUMAN_TESTING_RUNBOOK.md',
  'docs/evals/oss_stack_human_sessions.template.json',
  'docs/evals/oss_stack_regulatory_uat_catalog.json',
  'docs/evals/oss_stack_medical_writing_checklist.json',
];

const NO_BREAK_SURFACES = [
  'server/services/export/governedExportConsequence.ts',
  'server/routes/510k-estar-routes.ts',
  'server/routes/cerv2-export-routes.ts',
  'server/routes/conversation-os.ts',
];


const CHECKPOINT_DIR = 'docs/audits/checkpoints';

const REQUIRED_FLAG_KEYS = [
  'oss.ingestion.docling_primary',
  'oss.ingestion.unstructured_fallback',
  'oss.retrieval.qdrant_enabled',
  'oss.retrieval.byaldi_pilot',
  'oss.policy.opa_decisions',
  'oss.obs.langfuse_enabled',
  'oss.workflow.temporal_enabled',
  'oss.compute.e2b_pilot',
];

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function check(label, condition, passMessage, failMessage) {
  if (condition) {
    console.log(`✅ [${label}] ${passMessage}`);
    return true;
  }
  console.error(`❌ [${label}] ${failMessage}`);
  return false;
}

let allGood = true;

for (const doc of REQUIRED_DOCS) {
  allGood = check('required-doc', exists(doc), `${doc} present`, `${doc} missing`) && allGood;
}

for (const surface of NO_BREAK_SURFACES) {
  allGood =
    check('no-break-surface', exists(surface), `${surface} present`, `${surface} missing`) && allGood;
}

const flagFile = 'server/config/ossStackFeatureFlags.ts';
allGood = check('flag-registry', exists(flagFile), `${flagFile} present`, `${flagFile} missing`) && allGood;

if (exists(flagFile)) {
  const content = read(flagFile);
  for (const key of REQUIRED_FLAG_KEYS) {
    allGood =
      check('flag-key', content.includes(`'${key}'`), `${key} declared`, `${key} not declared`) &&
      allGood;
  }
}


allGood =
  check(
    'checkpoint-dir',
    exists(CHECKPOINT_DIR),
    `${CHECKPOINT_DIR} present`,
    `${CHECKPOINT_DIR} missing`
  ) && allGood;

const requiredNpmScripts = ['typecheck', 'test', 'test:ana', 'oss:eval:check', 'oss:ga:check', 'oss:uat:metrics', 'oss:scorecard:sync', 'oss:reg:check', 'oss:medwrite:check'];
const packageJsonPath = 'package.json';
if (exists(packageJsonPath)) {
  const pkg = JSON.parse(read(packageJsonPath));
  const scripts = pkg.scripts || {};
  for (const scriptName of requiredNpmScripts) {
    allGood =
      check(
        'npm-script',
        typeof scripts[scriptName] === 'string' && scripts[scriptName].length > 0,
        `npm script '${scriptName}' present`,
        `npm script '${scriptName}' missing`
      ) && allGood;
  }
} else {
  allGood = check('package-json', false, '', 'package.json missing') && allGood;
}

if (!allGood) {
  console.error('\nSupervisor audit failed. Fix findings before merging.');
  process.exit(1);
}

console.log('\nSupervisor audit passed. Repo is ready for the next controlled workstream step.');
