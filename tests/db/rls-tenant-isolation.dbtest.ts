/**
 * Tenant isolation, executed — not asserted against a stub.
 *
 * ── What was wrong with the coverage this replaces ───────────────────────────
 * The repo has 787 RLS policies with correct USING / WITH CHECK semantics, and
 * they filter nothing in practice, because the application connects as a role
 * that owns every table and is a PostgreSQL superuser. A superuser bypasses RLS
 * unconditionally; an owner bypasses it unless the table carries FORCE. No test
 * could catch that, because the only pool available to a test was mocked, and a
 * mock has no notion of a role at all. The nearest existing test
 * (server/db/__tests__/rlsEnforcement.test.ts) hands assessRlsCatalogPosture a
 * hand-written `posturePool` whose rows are literals in the test file — it
 * verifies the function's arithmetic over invented input, never that the SQL it
 * sends is valid or that its verdict matches a real catalog.
 *
 * ── What these tests establish ───────────────────────────────────────────────
 * Against a live server, with the canonical policy installed and
 * RLS_ENFORCE=on:
 *
 *   1. the policy genuinely filters for the non-superuser runtime role that
 *      scripts/db/provision-app-role.mjs mints — reads, writes and deletes;
 *   2. a superuser/owner connection is NOT filtered, which is the mechanism
 *      behind the live cross-tenant read, and therefore the reason the role
 *      split is a prerequisite rather than a nicety; and
 *   3. assessRlsCatalogPosture, run against a real pg catalog, reports that
 *      difference correctly — it fails the superuser and passes the runtime
 *      role.
 *
 * Together these are the regression harness for the role split: when the
 * runtime is pointed at APP_DATABASE_URL, these tests are what proves it took.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createScratchSchema, withSession, tenantIsolationPolicySql } from './harness';
import type { ScratchSchema } from './harness';
import { databaseUrl } from '../setup.db';
import { assessRlsCatalogPosture } from '../../server/db/rlsEnforcement';

const TENANT_A = 26;
const TENANT_B = 27;

let scratch: ScratchSchema;
let table: string;

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  table = await scratch.createTenantTable('authoring_documents_probe');
  // Seeded as the owner, which is not filtered — exactly how a migration or an
  // installer would write reference rows.
  await scratch.ownerPool.query(
    `INSERT INTO ${table} (organization_id, title) VALUES ($1, $2), ($3, $4)`,
    [TENANT_A, 'RLSPROBE-A', TENANT_B, 'RLSPROBE-B']
  );
});

afterAll(async () => {
  if (scratch) await scratch.destroy();
});

describe('RLS filters for the non-superuser runtime role', () => {
  it('SELECT returns only the scoped tenant\'s rows', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    const rows = await withSession(
      runtime,
      { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(TENANT_A) },
      client => client.query(`SELECT organization_id, title FROM ${table} ORDER BY id`)
    );

    expect(rows.rows).toEqual([{ organization_id: TENANT_A, title: 'RLSPROBE-A' }]);
    // The assertion that matters: tenant B's row is not merely last, it is absent.
    expect(rows.rows.some(r => r.organization_id === TENANT_B)).toBe(false);
  });

  it('UPDATE cannot reach another tenant\'s row', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    const updated = await withSession(
      runtime,
      { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(TENANT_A) },
      client =>
        client.query(`UPDATE ${table} SET title = 'TAMPERED' WHERE organization_id = $1`, [TENANT_B])
    );
    expect(updated.rowCount).toBe(0);

    const survived = await scratch.ownerPool.query(
      `SELECT title FROM ${table} WHERE organization_id = $1`,
      [TENANT_B]
    );
    expect(survived.rows[0].title).toBe('RLSPROBE-B');
  });

  it('DELETE cannot reach another tenant\'s row', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    const deleted = await withSession(
      runtime,
      { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(TENANT_A) },
      client => client.query(`DELETE FROM ${table} WHERE organization_id = $1`, [TENANT_B])
    );
    expect(deleted.rowCount).toBe(0);

    const stillThere = await scratch.ownerPool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`,
      [TENANT_B]
    );
    expect(stillThere.rows[0].n).toBe(1);
  });

  it('INSERT of a foreign tenant_id is refused by WITH CHECK', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    // WITH CHECK is the half of the policy that stops a tenant from *planting*
    // a row in someone else's scope. USING alone would allow the write and only
    // hide it afterwards.
    await expect(
      withSession(
        runtime,
        { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(TENANT_A) },
        client =>
          client.query(`INSERT INTO ${table} (organization_id, title) VALUES ($1, $2)`, [
            TENANT_B,
            'PLANTED-BY-A',
          ])
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it('an unscoped connection sees nothing at all, rather than everything', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    // Fail-closed: with enforcement on and no tenant set, the tenant clauses
    // are NULL and the policy admits no rows. The dangerous alternative — a
    // missing scope meaning "unfiltered" — is what this pins against.
    const rows = await withSession(runtime, { 'app.rls_enforce': 'on' }, client =>
      client.query(`SELECT * FROM ${table}`)
    );
    expect(rows.rowCount).toBe(0);
  });

  it('RLS_ENFORCE=off compiles the policy to a no-op — the documented shadow mode', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    const rows = await withSession(
      runtime,
      { 'app.rls_enforce': 'off', 'app.current_tenant_id': String(TENANT_A) },
      client => client.query(`SELECT organization_id FROM ${table} ORDER BY organization_id`)
    );
    // Both tenants visible. This is the shipped rollout knob behaving as
    // designed, and it is also precisely why "the app works today" is not
    // evidence that isolation holds.
    expect(rows.rows.map(r => r.organization_id)).toEqual([TENANT_A, TENANT_B]);
  });
});

describe('the same policy does NOT filter a superuser/owner connection', () => {
  it('reads both tenants\' rows with enforcement fully on', async () => {
    // Reproduces the assessment's psql proof in an executable form. This is not
    // a bug in the policy — it is Postgres behaving as documented — but it is
    // the mechanism that makes all 787 policies inert while the app connects
    // as the owning superuser, so it is pinned here rather than described.
    const rows = await withSession(
      scratch.ownerPool,
      { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(TENANT_A) },
      client => client.query(`SELECT organization_id FROM ${table} ORDER BY organization_id`)
    );

    const visible = rows.rows.map(r => r.organization_id);
    expect(visible).toContain(TENANT_A);
    expect(visible).toContain(TENANT_B);
  });
});

describe('assessRlsCatalogPosture against a real catalog', () => {
  it('flags a superuser runtime role as a failure', async () => {
    // The existing unit test feeds this function literal rows. Here the rows
    // come from pg_roles, which also proves the catalog SQL it issues parses
    // and returns the columns it reads.
    const report = await assessRlsCatalogPosture(scratch.ownerPool);
    expect(report.roleIsSuperuser).toBe(true);
    expect(report.failures.join(' ')).toMatch(/is a PostgreSQL superuser/);
  });

  it('does not flag the provisioned runtime role as superuser or BYPASSRLS', async () => {
    const runtime = await scratch.connectAsRuntimeRole();
    const report = await assessRlsCatalogPosture(runtime);

    expect(report.role).toBe(scratch.runtimeRole);
    expect(report.roleIsSuperuser).toBe(false);
    expect(report.roleBypassesRls).toBe(false);
    expect(report.failures.join(' ')).not.toMatch(/superuser|BYPASSRLS/);
  });
});

describe('the harness policy matches the migration it stands in for', () => {
  it('uses the same four clauses 0021_enable_rls_everywhere.sql installs', () => {
    // The migration builds its policy inside a PL/pgSQL loop over the live
    // catalog, so the harness cannot execute it against one scratch table and
    // has to restate it. This keeps the restatement honest: if the migration's
    // clauses change, the copy stops matching and this fails.
    //
    // Two differences are expected and normalized away rather than asserted on:
    // the migration reaches format() so its tenant column is the `%I`
    // placeholder, and it pads its operands to align the OR clauses by eye.
    // Everything else must agree literally.
    const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();
    const migration = normalize(
      fs.readFileSync(path.join(__dirname, '../../migrations/0021_enable_rls_everywhere.sql'), 'utf8')
    );
    const harnessPolicy = normalize(tenantIsolationPolicySql('t')).replaceAll(
      'organization_id',
      '%I'
    );

    for (const clause of [
      "NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'",
      "%I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT",
      "%I = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT",
      "current_setting('app.current_user_role', TRUE) = 'app_super_admin'",
    ]) {
      expect(harnessPolicy).toContain(clause);
      expect(migration).toContain(clause);
    }

    // The policy must constrain writes as well as reads. A USING-only policy
    // hides a foreign-tenant row after allowing it to be written, which is a
    // materially weaker guarantee than the one the INSERT test above pins.
    expect(harnessPolicy).toContain('WITH CHECK');
    expect(migration).toContain('WITH CHECK');
  });
});
