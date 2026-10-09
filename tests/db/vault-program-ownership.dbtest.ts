/**
 * Who owns a vault document is decided by rows no tenant can write
 * (D3, 2026-09-24; evidence docs/evidence/D3/2026-09-24-vault-program-ownership/).
 *
 * vault.documents and vault.document_chunks authorize every read and write
 * through core.can_access_program / core.can_write_program → identity.*. Those
 * answer from two inputs:
 *
 *   - core.get_program_org_id(program_id): the program's owning org. It read
 *     core.programs, then core.program_ownerships, and only THEN the canonical
 *     registry, public.regulatory_programs → organizations.uuid. Both GCC tables
 *     accept a row from any tenant whose org_id is its own, keyed by any program
 *     id. So tenant A could write `core.programs (id = <B's program>, org_id = A)`
 *     and become that program's owner: A read B's documents, and B lost them.
 *   - identity.org_relationships: sponsor → delegate grants (a CRO reading a
 *     sponsor's submissions). The table had no RLS, and app_service may INSERT
 *     it. So tenant A could write itself a grant FROM B, and read and overwrite
 *     B's documents while B saw nothing change.
 *
 * No application code writes either table today, so no HTTP path is known to
 * reach this. It is a database boundary that any statement run as the runtime
 * role could move, and D3 asks for the boundary itself.
 *
 * Every case runs through the application pool inside a request tenant scope,
 * so each statement is app_service with app.current_org_id set by
 * poolInstrumentation, exactly as a request's statements are. The posture is
 * asserted first, so a superuser connection cannot pass the suite vacuously.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../server/db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

type Side = 'A' | 'B';
const ORG: Record<Side, number> = { A: ORG_A, B: ORG_B };
const uuidOf: Record<Side, string> = { A: '', B: '' };
const programOf: Record<Side, string> = { A: '', B: '' };
const TITLE = { A: `${TAG}-vault-owned-A`, B: `${TAG}-vault-owned-B` };
/** A submission per org in ectd_v4, one of the 43 tables whose policies go
 *  through identity.can_access_org / can_write_org — which trust the same
 *  identity.org_relationships the vault functions do. */
const SUBMISSION = { A: `${TAG}-submission-A`, B: `${TAG}-submission-B` };

beforeAll(async () => {
  await provisionTwoTenantFixture();
  const orgs = await owner.query(
    'SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS]
  );
  for (const row of orgs.rows) uuidOf[row.id === ORG_A ? 'A' : 'B'] = row.uuid;

  for (const side of ['A', 'B'] as const) {
    const prog = await owner.query(
      `INSERT INTO regulatory_programs
         (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1,$2,$3,'IND','drug','FDA',$4) RETURNING id::text AS id`,
      [`${TAG}-own-program-${side}`, `${TAG}-OWN-${side}`, ORG[side], `${TAG} product ${side}`]
    );
    programOf[side] = prog.rows[0].id;
    await owner.query(
      `INSERT INTO vault.documents
         (program_id, organization_id, content_hash, document_title, file_name, status, source_type)
       VALUES ($1,$2,$3,$4,$5,'completed','txt')`,
      [
        programOf[side],
        ORG[side],
        `${TAG}own${side}`.padEnd(64, '0').slice(0, 64),
        TITLE[side],
        `${TITLE[side]}.txt`,
      ]
    );
    await owner.query(
      `INSERT INTO ectd_v4.regulatory_submissions (org_id, application_type, authority_id, sponsor_name)
       VALUES ($1, 'IND', 'FDA', $2)`,
      [uuidOf[side], SUBMISSION[side]]
    );
  }
}, 60_000);

/** Everything the cases below planted, as the owner, before the fixture goes. */
async function removePlantedRows(): Promise<void> {
  const programs = [programOf.A, programOf.B].filter(Boolean);
  const orgs = [uuidOf.A, uuidOf.B].filter(Boolean);
  await owner.query(
    `DELETE FROM identity.org_relationships
      WHERE sponsor_org_id = ANY($1::uuid[]) OR delegate_org_id = ANY($1::uuid[])`,
    [orgs]
  );
  await owner.query('DELETE FROM core.program_ownerships WHERE program_id = ANY($1::uuid[])', [
    programs,
  ]);
  await owner.query('DELETE FROM core.programs WHERE id = ANY($1::uuid[])', [programs]);
}

afterAll(async () => {
  if (owner) {
    await removePlantedRows();
    await owner.query('DELETE FROM ectd_v4.regulatory_submissions WHERE sponsor_name = ANY($1)', [
      [SUBMISSION.A, SUBMISSION.B],
    ]);
    await owner.query('DELETE FROM vault.documents WHERE organization_id = ANY($1::int[])', [
      FIXTURE_ORGS,
    ]);
    await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [
      `${TAG}-own-program-%`,
    ]);
  }
  await teardownTwoTenantFixture();
});

/** One statement as tenant `side`'s request would run it. */
function as<T = Record<string, unknown>>(side: Side, sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    {
      tenantId: String(ORG[side]),
      orgUuid: uuidOf[side],
      role: 'member',
      source: 'request',
      caller: 'tests/db/vault-program-ownership.dbtest.ts',
    },
    () => getPool().query<T & Record<string, unknown>>(sql, params)
  );
}

/** Runs a planting statement; a refusal is an acceptable outcome, not a failure. */
async function attempt(side: Side, sql: string, params: unknown[]): Promise<'written' | 'refused'> {
  try {
    await as(side, sql, params);
    return 'written';
  } catch (err) {
    if ((err as { code?: string }).code === '42501') return 'refused';
    throw err;
  }
}

async function submissionsVisibleTo(side: Side): Promise<string[]> {
  const { rows } = await as<{ sponsor_name: string }>(
    side,
    'SELECT sponsor_name FROM ectd_v4.regulatory_submissions WHERE sponsor_name = ANY($1) ORDER BY 1',
    [[SUBMISSION.A, SUBMISSION.B]]
  );
  return rows.map(r => String(r.sponsor_name));
}

async function titlesVisibleTo(side: Side): Promise<string[]> {
  const { rows } = await as<{ document_title: string }>(
    side,
    'SELECT document_title FROM vault.documents WHERE document_title = ANY($1::text[]) ORDER BY 1',
    [[TITLE.A, TITLE.B]]
  );
  return rows.map(r => String(r.document_title));
}

describe('vault ownership comes from rows no other tenant can write (D3)', () => {
  it('posture: the statements run as app_service, RLS enforcing, with the tenant GUC set', async () => {
    const { rows } = await as<{ usr: string; bypass: boolean; enforce: string; org: string }>(
      'A',
      `SELECT current_user AS usr,
              (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) AS bypass,
              current_setting('app.rls_enforce', true) AS enforce,
              current_setting('app.current_org_id', true) AS org`
    );
    expect(rows[0]).toEqual({ usr: 'app_service', bypass: false, enforce: 'on', org: uuidOf.A });
  });

  it('positive control: each tenant sees exactly its own vault document', async () => {
    expect(await titlesVisibleTo('A')).toEqual([TITLE.A]);
    expect(await titlesVisibleTo('B')).toEqual([TITLE.B]);
  });

  it("a core.programs row naming B's program does not make A its owner", async () => {
    // The row itself is within core.programs' own policy (org_id is A's), so
    // it may be written. What it must not do is decide who owns B's program.
    const outcome = await attempt(
      'A',
      "INSERT INTO core.programs (id, name, org_id) VALUES ($1, 'planted', $2)",
      [programOf.B, uuidOf.A]
    );
    expect(outcome, 'the plant must land, or this case proves nothing').toBe('written');
    try {
      expect(await titlesVisibleTo('A'), "B's document reached A").toEqual([TITLE.A]);
      expect(await titlesVisibleTo('B'), 'B lost its own document').toEqual([TITLE.B]);
    } finally {
      await removePlantedRows();
    }
  });

  it('an ownership row behind an org-less core.programs row does not either', async () => {
    // core.programs admits org_id NULL rows from anyone, and the resolver then
    // fell through to core.program_ownerships, which A may also write.
    await attempt(
      'A',
      "INSERT INTO core.programs (id, name, org_id) VALUES ($1, 'planted-orgless', NULL)",
      [programOf.B]
    );
    const outcome = await attempt(
      'A',
      `INSERT INTO core.program_ownerships (program_id, org_id, ownership_role, is_active)
       VALUES ($1, $2, 'OWNER', true)`,
      [programOf.B, uuidOf.A]
    );
    expect(outcome, 'the plant must land, or this case proves nothing').toBe('written');
    try {
      expect(await titlesVisibleTo('A')).toEqual([TITLE.A]);
      expect(await titlesVisibleTo('B')).toEqual([TITLE.B]);
    } finally {
      await removePlantedRows();
    }
  });
});

describe('vault delegation is granted by the sponsor alone (D3)', () => {
  it('A cannot grant itself delegate access to B, and gains nothing by trying', async () => {
    const outcome = await attempt(
      'A',
      `INSERT INTO identity.org_relationships
         (sponsor_org_id, delegate_org_id, contract_start_date, scope_all_programs)
       VALUES ($1, $2, CURRENT_DATE, true)`,
      [uuidOf.B, uuidOf.A]
    );
    try {
      expect(outcome).toBe('refused');
      expect(await titlesVisibleTo('A')).toEqual([TITLE.A]);
      const tampered = await as(
        'A',
        "UPDATE vault.documents SET document_title = document_title || ' (tampered)' WHERE document_title = $1 RETURNING 1",
        [TITLE.B]
      );
      expect(tampered.rowCount, "A rewrote B's document").toBe(0);
    } finally {
      await removePlantedRows();
    }
  });

  it('nor does trying reach the org-policied schemas that trust the same table', async () => {
    // identity.can_access_org / can_write_org read only identity.org_relationships,
    // and 43 tables (ai, ectd_v4, fhir, innovation, product_master, identity.users)
    // are policied through them. Positive control first: each sees its own.
    expect(await submissionsVisibleTo('A')).toEqual([SUBMISSION.A]);
    expect(await submissionsVisibleTo('B')).toEqual([SUBMISSION.B]);
    const outcome = await attempt(
      'A',
      `INSERT INTO identity.org_relationships
         (sponsor_org_id, delegate_org_id, contract_start_date, scope_all_programs)
       VALUES ($1, $2, CURRENT_DATE, true)`,
      [uuidOf.B, uuidOf.A]
    );
    try {
      expect(outcome).toBe('refused');
      expect(await submissionsVisibleTo('A'), "B's submission reached A").toEqual([SUBMISSION.A]);
      const tampered = await as(
        'A',
        "UPDATE ectd_v4.regulatory_submissions SET sponsor_name = sponsor_name || ' (tampered)' WHERE sponsor_name = $1 RETURNING 1",
        [SUBMISSION.B]
      );
      expect(tampered.rowCount, "A rewrote B's submission").toBe(0);
    } finally {
      await removePlantedRows();
    }
  });

  it('a grant B makes still works, a delegate cannot widen it, and revoking it ends it', async () => {
    // Positive control for the delegation feature: the policy must not have
    // broken the one legitimate writer, the sponsor granting its own data.
    const granted = await attempt(
      'B',
      `INSERT INTO identity.org_relationships
         (sponsor_org_id, delegate_org_id, contract_start_date, scope_all_programs,
          can_view_submissions, can_edit_submissions)
       VALUES ($1, $2, CURRENT_DATE, true, true, false)`,
      [uuidOf.B, uuidOf.A]
    );
    try {
      expect(granted).toBe('written');
      expect(await titlesVisibleTo('A'), 'the sponsor-granted read').toEqual([TITLE.A, TITLE.B]);
      expect(await submissionsVisibleTo('A'), 'the same grant, org-level').toEqual([
        SUBMISSION.A,
        SUBMISSION.B,
      ]);

      // Read-only grant: the delegate may not promote it to read-write.
      const widened = await as(
        'A',
        `UPDATE identity.org_relationships SET can_edit_submissions = true
          WHERE sponsor_org_id = $1 AND delegate_org_id = $2 RETURNING 1`,
        [uuidOf.B, uuidOf.A]
      ).catch((err: { code?: string }) =>
        err.code === '42501' ? { rowCount: 0 } : Promise.reject(err)
      );
      expect(widened.rowCount, 'the delegate widened its own grant').toBe(0);
      const wrote = await as(
        'A',
        'UPDATE vault.documents SET document_title = document_title WHERE document_title = $1 RETURNING 1',
        [TITLE.B]
      );
      expect(wrote.rowCount, 'a read-only delegate wrote the document').toBe(0);

      await as(
        'B',
        'DELETE FROM identity.org_relationships WHERE sponsor_org_id = $1 AND delegate_org_id = $2',
        [uuidOf.B, uuidOf.A]
      );
      expect(await titlesVisibleTo('A'), 'the revoked grant still reads').toEqual([TITLE.A]);
    } finally {
      await removePlantedRows();
    }
  });
});

/** One statement in the system scope the platform's own jobs and admin routes use. */
function asPlatform(sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    {
      tenantId: '0',
      orgUuid: null,
      role: 'app_super_admin',
      source: 'request',
      caller: 'tests/db/vault-program-ownership.dbtest.ts',
    },
    () => getPool().query(sql, params)
  );
}

/** rowCount of a write, with a refusal counted as nothing written. */
async function rowsWritten(run: () => Promise<{ rowCount: number | null }>): Promise<number> {
  try {
    return (await run()).rowCount ?? 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42501') return 0;
    throw err;
  }
}

/** Puts both fixture orgs back on their own uuids if a case moved them. */
async function restoreOrgUuids(): Promise<void> {
  const { rows } = await owner.query(
    'SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS]
  );
  const moved = rows.some(r => r.uuid !== uuidOf[r.id === ORG_A ? 'A' : 'B']);
  if (!moved) return;
  // Park both first so neither restore collides with the other's unique uuid.
  await owner.query('UPDATE organizations SET uuid = gen_random_uuid() WHERE id = ANY($1::int[])', [
    FIXTURE_ORGS,
  ]);
  await owner.query('UPDATE organizations SET uuid = $2 WHERE id = $1', [ORG_A, uuidOf.A]);
  await owner.query('UPDATE organizations SET uuid = $2 WHERE id = $1', [ORG_B, uuidOf.B]);
}

describe("an organization's tenant key cannot be moved, by its own tenant or any other (D3)", () => {
  it("A cannot hand B's organization its uuid, and B's vault stays B's", async () => {
    // Measured before the fix as app_service with RLS enforcing: A moved its
    // own org to a fresh uuid, gave B's org A's old one, and read B's vault —
    // core.get_program_org_id maps a program's org to organizations.uuid.
    try {
      const movedOwn = await rowsWritten(() =>
        as('A', 'UPDATE organizations SET uuid = gen_random_uuid() WHERE id = $1', [ORG_A])
      );
      const movedB = await rowsWritten(() =>
        as('A', 'UPDATE organizations SET uuid = $2 WHERE id = $1', [ORG_B, uuidOf.A])
      );
      expect(await titlesVisibleTo('A'), "B's document reached A").toEqual([TITLE.A]);
      expect(await titlesVisibleTo('B'), 'B lost its own document').toEqual([TITLE.B]);
      expect({ movedOwn, movedB }).toEqual({ movedOwn: 0, movedB: 0 });
    } finally {
      await restoreOrgUuids();
    }
  });

  it('the other writers still write, and none of them, the platform included, can move a key', async () => {
    // Positive controls first: the trigger must not break an org updating its
    // own row, nor the platform scope (admin routes, the Stripe webhook)
    // updating any org's. A no-op write, so nothing changes either way.
    const touch = 'UPDATE organizations SET updated_at = updated_at WHERE id = $1';
    expect(await rowsWritten(() => as('A', touch, [ORG_A])), 'an org updating itself').toBe(1);
    expect(await rowsWritten(() => asPlatform(touch, [ORG_B])), 'the platform scope').toBe(1);
    try {
      const moved = await rowsWritten(() =>
        asPlatform('UPDATE organizations SET uuid = gen_random_uuid() WHERE id = $1', [ORG_B])
      );
      expect(moved, "the platform scope moved B's uuid").toBe(0);
    } finally {
      await restoreOrgUuids();
    }
  });
});
