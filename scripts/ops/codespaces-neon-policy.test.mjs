import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const NEON_WORKFLOWS = [
  '.github/workflows/neon-provisioning.yml',
  '.github/workflows/neon-preview-db.yml',
];

test('Neon automation never silently clones the previous production/default branch', () => {
  for (const path of NEON_WORKFLOWS) {
    const workflow = read(path);
    assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.NEON_PROD_BRANCH\s*\}\}/, path);
    assert.match(workflow, /NEON_SAFE_PARENT_BRANCH/, path);
    assert.match(workflow, /branch_type: schema-only/, path);
    assert.match(workflow, /parent_branch: \$\{\{ vars\.NEON_SAFE_PARENT_BRANCH \}\}/, path);
    assert.match(workflow, /create-branch-action@fb620d43d4c565abaf088b848a4e28e5c4ea4d9c/, path);
  }
  assert.match(read('.github/workflows/neon-provisioning.yml'),
    /missing="\$missing NEON_SAFE_PARENT_BRANCH/);
  assert.match(read('.github/workflows/neon-preview-db.yml'),
    /vars\.NEON_PREVIEW_ENABLED == 'true'/);
  assert.match(read('.github/workflows/neon-preview-db.yml'),
    /parent_branch: \$\{\{ vars\.NEON_SAFE_PARENT_BRANCH \}\}/);
});

test('general C2C agent does not create a second untracked Neon PR branch', () => {
  const workflow = read('.github/workflows/c2c-agent.yml');
  assert.doesNotMatch(workflow, /neondatabase\/create-branch-action@/);
  assert.doesNotMatch(workflow, /neon_branch:\s*\$\{\{/);
  assert.match(workflow, /branching is owned exclusively by neon-preview-db\.yml/);
});

test('Neon proof refuses reused branch and fails if cleanup could not delete its created ID', () => {
  const w = read('.github/workflows/neon-provisioning.yml');
  assert.match(w, /Require a newly created proof branch/);
  assert.match(w, /steps\.neon\.outputs\.created/);
  assert.match(w, /\*-pooler\.\*/);
  assert.match(w, /if: always\(\) && steps\.neon\.outputs\.created == 'true'/);
  assert.match(w, /branch: \$\{\{ steps\.neon\.outputs\.branch_id \}\}/);
  const cleanup = w.slice(w.lastIndexOf('- name: Delete the Neon branch'));
  assert.doesNotMatch(cleanup, /continue-on-error: true/);
});

test('PR cleanup never claims deletion when action fails or preview was disabled', () => {
  const w = read('.github/workflows/neon-preview-db.yml');
  const cleanup = w.slice(w.indexOf('  cleanup_preview_db:'));
  assert.match(cleanup, /vars\.NEON_PREVIEW_ENABLED == 'true'/);
  assert.match(cleanup, /vars\.NEON_SAFE_PARENT_BRANCH != ''/);
  assert.match(cleanup, /id: delete/);
  assert.match(cleanup, /if: success\(\) && steps\.delete\.outcome == 'success'/);
  assert.doesNotMatch(cleanup, /continue-on-error: true/);
  assert.match(w, /npm run ci:tables-live-schema/);
  assert.match(w, /No PR merge-base can be resolved; migration verification did not run/);
});

test('enabled PR preview migration never uses unmasked credentials or a pooled DDL endpoint', () => {
  const workflow = read('.github/workflows/neon-preview-db.yml');
  assert.match(workflow, /DIRECT_DB_URL: \$\{\{ steps\.neon\.outputs\.db_url \}\}/);
  assert.match(workflow, /::add-mask::\$DB_URL/);
  assert.match(workflow, /Migration target is a pooled Neon endpoint/);
  assert.doesNotMatch(workflow, /DB_URL='\$\{\{ steps\.neon\.outputs\.db_url/);
  assert.doesNotMatch(workflow, /npm run test:unit --if-present/);
  assert.match(workflow, /npm run codespaces:doctor:test/);
});

test('Codespaces agent config has no committed production Neon parent or owner runtime secret', () => {
  const agent = read('.github/c2c-agent.yml');
  const container = read('.devcontainer/devcontainer.json');
  assert.doesNotMatch(agent + '\n' + container, /ep-wild-forest-ahbojhu4|NEON_PROD_BRANCH/);
  assert.doesNotMatch(agent, /DATABASE_NEON_NEW_SECRET/);
  assert.match(agent, /connection_string: '\$\{APP_DATABASE_URL\}'/);
  assert.match(agent, /auto_run: false/);
  assert.match(agent, /preview_branches:\s*\n\s*enabled: false/);
  assert.match(agent, /model_registry_source: 'server\/services\/ai-governance\/approved-models\.ts'/);
});

test('agent policy does not claim GPT automatically qualifies as a regulatory drafter', () => {
  const agent = read('.github/c2c-agent.yml');
  assert.doesNotMatch(agent, /capability: 'regulatory-drafting'\s*\n\s*model: 'gpt-4o'/);
  assert.doesNotMatch(agent, /data_retention_policy: 'zero'/);
  assert.match(agent, /production_drafting_rule: 'pq\.status=passed'/);
});

test('Codespaces keeps real tenant isolation on without permitting owner credentials', () => {
  const container = read('.devcontainer/devcontainer.json');
  const doctor = read('scripts/ops/codespaces-doctor.mjs');
  assert.match(container, /"RLS_ENFORCE": "on"/);
  assert.match(doctor, /DB_OWNER_CREDENTIAL_IN_APP/);
  assert.match(doctor, /runtimeIsolationFailures/);
  assert.match(doctor, /current_setting\('app\.rls_enforce'/);
});
