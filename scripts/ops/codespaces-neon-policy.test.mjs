import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const NEON_WORKFLOWS = [
  '.github/workflows/c2c-agent.yml',
  '.github/workflows/neon-provisioning.yml',
  '.github/workflows/neon-preview-db.yml',
];

test('Neon automation never silently clones the previous production/default branch', () => {
  for (const path of NEON_WORKFLOWS) {
    const workflow = read(path);
    assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.NEON_PROD_BRANCH\s*\}\}/, path);
    assert.match(workflow, /NEON_SAFE_PARENT_BRANCH/, path);
  }
  assert.match(read('.github/workflows/neon-provisioning.yml'),
    /missing="\$missing NEON_SAFE_PARENT_BRANCH/);
  assert.match(read('.github/workflows/neon-preview-db.yml'),
    /vars\.NEON_PREVIEW_ENABLED == 'true'/);
  assert.match(read('.github/workflows/neon-preview-db.yml'),
    /parent_branch: \$\{\{ vars\.NEON_SAFE_PARENT_BRANCH \}\}/);
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
