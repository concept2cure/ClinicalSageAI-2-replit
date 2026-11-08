'use strict';

/**
 * F1 / W1 / D2: reproduce and verify the existing Tier 5 seed's membership repair.
 * Run from the repository root against an already provisioned disposable database:
 *   node docs/evidence/F1/2026-11-08-cross-module-data-flow/verify-tier5-seed.cjs
 *
 * What already exists:
 * - tests/e2e/seed-governed-workflow.cjs owns the four synthetic journey personas,
 *   organization, workspace, project, artifact and seed-data.json handoff.
 * - migrations/20260926_organization_users_own_writes.sql owns the deployed
 *   organization_users_role_known constraint. This verifier never changes it.
 * - tests/e2e/seed-data.json is a tracked fixture, restored byte for byte in finally.
 *
 * This invokes the actual seeds with the operator's ordinary seed/owner connection.
 * It does not qualify app_service, RLS, browser behavior or runtime authorization.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const REPO = path.resolve(__dirname, '../../../..');
const SEED_RELATIVE = 'tests/e2e/seed-governed-workflow.cjs';
const SEED = path.join(REPO, SEED_RELATIVE);
const FIXTURE = path.join(REPO, 'tests/e2e/seed-data.json');
const ORIGINAL_COMMIT = 'c88d892390a15f01d258f7a72fb597858aaf4497';
const KNOWN_DATABASE = 'platform_ci_vault_fixture_20261108_flow';
const ORG_SLUG = 'e2e-test-org';
const ARTIFACT_ID = 'art_synthetic_golden_seed_v1';
const CONSTRAINT = 'organization_users_role_known';
const PERSONAS = [
  { persona: 'admin', email: 'e2e-admin@trialsage.test', role: 'admin' },
  { persona: 'author', email: 'e2e-author@trialsage.test', role: 'member' },
  { persona: 'reviewer', email: 'e2e-reviewer@trialsage.test', role: 'reviewer' },
  { persona: 'viewer', email: 'e2e-viewer@trialsage.test', role: 'viewer' },
];
const secrets = new Set([process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter(Boolean));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/("password"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]*@/gi, '$1[REDACTED]@');
}

function report(label, value) {
  console.info(`${label}: ${redact(JSON.stringify(value))}`);
}

function admitDatabase() {
  const supplied = process.env.DATABASE_URL;
  assert.ok(supplied, 'DATABASE_URL must explicitly identify the disposable provisioned database');
  const connectionString = supplied.replace(/^psql\s+'?/, '').replace(/'$/, '').trim();
  const parsed = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'Expected a PostgreSQL URL');
  if (parsed.password) secrets.add(decodeURIComponent(parsed.password));
  const database = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(database, 'DATABASE_URL must name a database');
  const explicitTestUrl = Boolean(process.env.TEST_DATABASE_URL) &&
    process.env.TEST_DATABASE_URL === supplied;
  assert.ok(database === KNOWN_DATABASE || explicitTestUrl,
    'Refusing a database outside the known disposable fixture; an alternate requires exact TEST_DATABASE_URL equality');
  return { connectionString, database, guard: explicitTestUrl ? 'explicit TEST_DATABASE_URL equality' : 'known disposable database name' };
}

function originalSeed() {
  const result = spawnSync('git', ['--no-optional-locks', 'show', `${ORIGINAL_COMMIT}:${SEED_RELATIVE}`], {
    cwd: REPO, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Cannot read committed original seed: ${redact(result.stderr)}`);
  assert.equal(result.signal, null, 'Original Git-object read was interrupted');
  return result.stdout;
}

function rememberPasswords(source) {
  for (const match of source.matchAll(/password:\s*['"]([^'"]+)['"]/g)) secrets.add(match[1]);
}

function runSeed(label, database, source) {
  const result = spawnSync(process.execPath, source === undefined ? [SEED] : ['--eval', source], {
    cwd: path.dirname(SEED),
    env: { ...process.env, DATABASE_URL: database.connectionString },
    encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  report(label, {
    exitCode: result.status,
    signal: result.signal,
    outputTail: redact(output).split('\n').slice(-24).join('\n'),
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${label} was interrupted`);
  return { exitCode: result.status, output };
}

async function readConstraint(client) {
  const result = await client.query(
    `SELECT c.oid::text AS oid, c.conname, c.contype, c.convalidated,
            pg_get_constraintdef(c.oid, true) AS definition
       FROM pg_constraint c
      WHERE c.conrelid = 'public.organization_users'::regclass AND c.conname = $1`,
    [CONSTRAINT]
  );
  assert.equal(result.rows.length, 1, 'The real membership role constraint must be provisioned');
  assert.equal(result.rows[0].contype, 'c', 'Membership role enforcement must be a CHECK constraint');
  return result.rows[0];
}

async function syntheticOrganization(client, required) {
  const result = await client.query('SELECT id, name FROM organizations WHERE slug = $1', [ORG_SLUG]);
  assert.ok(result.rows.length <= 1, 'Synthetic organization slug must be unique');
  if (required) assert.equal(result.rows.length, 1, 'The seed must create its synthetic organization');
  if (!result.rows.length) return null;
  assert.equal(result.rows[0].name, 'E2E Test Organization', 'Refusing a conflicting organization slug');
  return result.rows[0].id;
}

async function assertSyntheticScope(client) {
  const orgId = await syntheticOrganization(client, false);
  // The actual seed looks up these fixed synthetic emails globally. Refuse any
  // collision before allowing it to update a password outside its own tenant.
  const users = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM users u
        WHERE u.email = ANY($1::text[])
          AND ($2::integer IS NULL OR u.default_organization_id IS DISTINCT FROM $2::integer
            OR EXISTS (SELECT 1 FROM organization_users m
                        WHERE m.user_id = u.id AND m.organization_id <> $2::integer))
     ) AS collision`,
    [PERSONAS.map(persona => persona.email), orgId]
  );
  assert.equal(users.rows[0].collision, false, 'A synthetic email belongs outside the expected seed organization');
  const artifact = await client.query(
    `SELECT EXISTS (SELECT 1 FROM concept2cure_artifacts
                    WHERE artifact_id = $1
                      AND ($2::integer IS NULL OR organization_id IS DISTINCT FROM $2::integer)) AS collision`,
    [ARTIFACT_ID, orgId]
  );
  assert.equal(artifact.rows[0].collision, false, 'The fixed synthetic artifact ID belongs to another organization');
}

async function oneRow(client, text, values, description) {
  const result = await client.query(text, values);
  assert.equal(result.rows.length, 1, `${description} must have exactly one retained identity`);
  return result.rows[0];
}

async function snapshotSeed(client) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const orgId = await syntheticOrganization(client, true);
  assert.equal(fixture.organizationId, orgId);
  assert.equal(fixture.artifactId, ARTIFACT_ID);
  assert.deepEqual(Object.keys(fixture.users).sort(), PERSONAS.map(item => item.persona).sort());
  const memberships = await client.query(
    `SELECT m.id, m.user_id, m.role, u.email
       FROM organization_users m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1 ORDER BY u.email`,
    [orgId]
  );
  assert.equal(memberships.rows.length, 4, 'Synthetic organization must contain exactly the four seed memberships');
  assert.deepEqual(memberships.rows.map(row => row.role).sort(), ['admin', 'member', 'reviewer', 'viewer']);
  const personas = {};
  for (const expected of PERSONAS) {
    const membership = memberships.rows.find(row => row.email === expected.email);
    assert.ok(membership, `Missing synthetic ${expected.persona} membership`);
    assert.equal(membership.role, expected.role, `Wrong organization role for ${expected.persona}`);
    const actual = fixture.users[expected.persona];
    assert.equal(actual.email, expected.email);
    assert.equal(actual.id, membership.user_id);
    personas[expected.persona] = { id: actual.id, email: actual.email };
  }
  const workspace = await oneRow(client,
    'SELECT id FROM client_workspaces WHERE organization_id = $1 AND slug = $2',
    [orgId, 'e2e-test-workspace'], 'Synthetic workspace');
  const project = await oneRow(client,
    'SELECT id, client_workspace_id FROM projects WHERE organization_id = $1 AND name = $2',
    [orgId, 'E2E Governed Workflow Test'], 'Synthetic project');
  assert.equal(project.id, fixture.projectId);
  assert.equal(project.client_workspace_id, workspace.id);
  const artifact = await oneRow(client,
    'SELECT id, project_id FROM concept2cure_artifacts WHERE organization_id = $1 AND artifact_id = $2',
    [orgId, ARTIFACT_ID], 'Synthetic artifact');
  assert.equal(artifact.id, fixture.numericArtifactId);
  assert.equal(artifact.project_id, project.id);
  const version = await oneRow(client,
    'SELECT id FROM concept2cure_artifact_versions WHERE organization_id = $1 AND artifact_id = $2 AND version = $3',
    [orgId, artifact.id, 1], 'Synthetic artifact version 1');
  return { orgId, personas, memberships: memberships.rows, workspace, project, artifact, version };
}

async function verifyAuthorRefused(client, snapshot) {
  let refusal;
  await client.query('BEGIN');
  try {
    const membership = await oneRow(client,
      'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR UPDATE',
      [snapshot.orgId, snapshot.personas.author.id], 'Synthetic author membership');
    assert.equal(membership.role, 'member');
    try {
      await client.query(
        'UPDATE organization_users SET role = $1 WHERE organization_id = $2 AND user_id = $3',
        ['author', snapshot.orgId, snapshot.personas.author.id]
      );
    } catch (error) {
      refusal = { code: error.code, constraint: error.constraint };
    }
  } finally {
    await client.query('ROLLBACK');
  }
  assert.deepEqual(refusal, { code: '23514', constraint: CONSTRAINT },
    'The unsupported organization role must be refused by the unchanged deployed constraint');
  const after = await oneRow(client,
    'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2',
    [snapshot.orgId, snapshot.personas.author.id], 'Synthetic author membership after rollback');
  assert.equal(after.role, 'member', 'Negative check must leave the canonical membership unchanged');
  report('negative_role_update', { ...refusal, rolledBack: true, retainedRole: after.role });
}

async function main() {
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(REPO), 'Invoke this verifier from the repository root');
  const database = admitDatabase();
  const original = originalSeed();
  const sourceBefore = fs.readFileSync(SEED);
  const fixtureBefore = fs.readFileSync(FIXTURE);
  rememberPasswords(original);
  rememberPasswords(sourceBefore.toString('utf8'));
  for (const user of Object.values(JSON.parse(fixtureBefore.toString('utf8')).users || {})) {
    if (typeof user.password === 'string' && user.password) secrets.add(user.password);
  }
  const sourceHash = sha256(sourceBefore);
  const fixtureHash = sha256(fixtureBefore);
  const client = new Client({ connectionString: database.connectionString, connectionTimeoutMillis: 10000, query_timeout: 15000 });
  const failures = [];
  let first;
  try {
    await client.connect();
    const identity = await oneRow(client,
      'SELECT current_database() AS database, current_user AS role', [], 'Database connection');
    assert.equal(identity.database, database.database, 'Connected database differs from the admitted URL');
    report('database_admission', { ...identity, guard: database.guard, authority: 'ordinary seed connection; runtime authorization is not qualified' });
    const constraintBefore = await readConstraint(client);
    report('deployed_constraint', constraintBefore);
    report('source_hashes_before', { originalCommit: ORIGINAL_COMMIT, originalSeedSha256: sha256(original), currentSeedSha256: sourceHash, fixtureSha256: fixtureHash });
    await assertSyntheticScope(client);

    const baseline = runSeed('original_seed_expected_failure', database, original);
    assert.equal(baseline.exitCode, 1, 'The original seed must fail');
    assert.match(baseline.output,
      /Seed failed:.*violates check constraint "organization_users_role_known"/,
      'The original seed must fail specifically at the membership role constraint');
    const orgId = await syntheticOrganization(client, true);
    const originalAuthor = await oneRow(client,
      'SELECT id FROM users WHERE default_organization_id = $1 AND email = $2',
      [orgId, 'e2e-author@trialsage.test'], 'Original synthetic author');

    for (let attempt = 1; attempt <= 2; attempt++) {
      await assertSyntheticScope(client);
      assert.equal(sha256(fs.readFileSync(SEED)), sourceHash, 'The actual seed changed during verification');
      const result = runSeed(`repaired_seed_run_${attempt}`, database);
      assert.equal(result.exitCode, 0, `Repaired seed run ${attempt} must succeed`);
      const snapshot = await snapshotSeed(client);
      assert.equal(snapshot.personas.author.id, originalAuthor.id, 'The original author identity must be retained');
      if (first) assert.deepEqual(snapshot, first, 'Rerunning the seed must preserve every retained identity and role');
      else first = snapshot;
      report(`repaired_seed_snapshot_${attempt}`, snapshot);
    }
    await verifyAuthorRefused(client, first);
    assert.deepEqual(await readConstraint(client), constraintBefore, 'The deployed constraint must remain unchanged');
  } catch (error) {
    failures.push(error);
  } finally {
    // Restore the tracked fixture even when connection, baseline or assertions fail.
    try {
      fs.writeFileSync(FIXTURE, fixtureBefore);
      assert.ok(fs.readFileSync(FIXTURE).equals(fixtureBefore), 'Tracked seed fixture restoration must be byte-exact');
      report('fixture_restored', { sha256: fixtureHash, exactOriginalBytes: true });
    } catch (error) {
      failures.push(error);
    }
    try {
      const sourceAfter = sha256(fs.readFileSync(SEED));
      report('source_hashes_after', { currentSeedSha256: sourceAfter, unchanged: sourceAfter === sourceHash });
      assert.equal(sourceAfter, sourceHash, 'The actual seed source must remain unchanged by verification');
    } catch (error) {
      failures.push(error);
    }
    try {
      await client.end();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(redact(failure.stack || failure.message || failure));
    process.exitCode = 1;
    return;
  }
  report('verification_passed', {
    originalSeedRefused: CONSTRAINT, repairedSeedSuccessfulRuns: 2,
    organizationRoles: ['admin', 'member', 'reviewer', 'viewer'],
    authorPersonaRetained: true, stableIds: true, negativeUpdateRolledBack: true,
    sourceUnchanged: true, trackedFixtureRestored: true,
    scope: 'synthetic seed and deployed role constraint only',
  });
}

main().catch(error => {
  console.error(redact(error.stack || error.message || error));
  process.exitCode = 1;
});
