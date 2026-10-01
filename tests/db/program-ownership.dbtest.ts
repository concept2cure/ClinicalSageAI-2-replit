/**
 * "Is this program the caller's organization's?" has one answer, and it holds
 * as the role production runs as.
 *
 * Launch row D3. `programInOrganization` (server/services/c2c/program-access.ts)
 * is the one program check; `npm run ci:program-ownership-single-source`
 * refuses a second. Until 2026-10-01 there were 51 copies, and they disagreed.
 * Two of them are pinned here against a real database because a mocked pool
 * cannot show the difference:
 *
 *   - a deleted project: most copies admitted it; the Projects surface 404s it.
 *   - the RBM site-risk read: it asked whether the caller held RBM records that
 *     mention the program (`rbm_*` carries no foreign key on program_id), not
 *     whether the caller owns it. So a KRI naming another tenant's program made
 *     that program "theirs", and the owner of a program with no RBM records yet
 *     was refused its own. site_intel.sites' own policy
 *     (core.can_access_program) is what kept the other tenant's site rows out,
 *     so the foreign read came back as a healthy study with no sites — "not
 *     yours" rendered as "nothing there", the collapse that module exists to
 *     prevent.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * The non-superuser, NOBYPASSRLS runtime role minted by the real
 * scripts/db/provision-app-role.mjs; the tenant scope set on the connection as
 * the pool sets it in production (app.current_tenant_id, app.rls_enforce).
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbpo": organizations 91870 and 91871 and the rows below. Only those go.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, withSession, type ScratchSchema } from './harness';
import { programInOrganization } from '../../server/services/c2c/program-access';
import { readProgramSites } from '../../server/services/rbm/site-risk-engine';

const ORG_A = 91870;
const ORG_B = 91871;
const PROGRAM_A = randomUUID();
const PROGRAM_A_DELETED = randomUUID();
const PROGRAM_B = randomUUID();
/** A program that exists only in the legacy `programs` registry, which nothing writes. */
const LEGACY_ONLY = randomUUID();

let scratch: ScratchSchema;

const enforced = (org: number) => ({ 'app.rls_enforce': 'on', 'app.current_tenant_id': String(org) });

async function cleanup() {
  const owner = scratch.ownerPool;
  await owner.query(`DELETE FROM site_intel.sites WHERE program_id = ANY($1::uuid[])`, [[PROGRAM_A, PROGRAM_B]]);
  await owner.query(`DELETE FROM rbm_site_risk_scores WHERE organization_id = ANY($1::int[])`, [[ORG_A, ORG_B]]);
  await owner.query(`DELETE FROM rbm_kris WHERE organization_id = ANY($1::int[])`, [[ORG_A, ORG_B]]);
  await owner.query(`DELETE FROM regulatory_programs WHERE organization_id = ANY($1::int[])`, [[ORG_A, ORG_B]]);
  await owner.query(`DELETE FROM programs WHERE id = $1`, [LEGACY_ONLY]).catch(() => {});
  await owner.query(`DELETE FROM core.programs WHERE id = $1`, [PROGRAM_A]).catch(() => {});
  await owner.query(`DELETE FROM organizations WHERE id = ANY($1::int[])`, [[ORG_A, ORG_B]]);
}

async function seedProgram(id: string, org: number, deleted = false) {
  await scratch.ownerPool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, deleted_at)
     VALUES ($1, $2, $3, $4, 'IND', 'drug', 'FDA', 'dbpo product', $5)`,
    [id, org, `dbpo ${id.slice(0, 8)}`, `DBPO-${id.slice(0, 6)}`, deleted ? new Date() : null],
  );
}

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  await scratch.connectAsRuntimeRole();
  await cleanup();
  for (const org of [ORG_A, ORG_B]) {
    await scratch.ownerPool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)`, [org, `dbpo ${org}`, `dbpo-${org}`]);
  }
  await seedProgram(PROGRAM_A, ORG_A);
  await seedProgram(PROGRAM_A_DELETED, ORG_A, true);
  await seedProgram(PROGRAM_B, ORG_B);
  await scratch.ownerPool.query(
    `INSERT INTO programs (id, name, organization_id) VALUES ($1, 'dbpo legacy', $2)`,
    [LEGACY_ONLY, ORG_B],
  );
  // Tenant B holds an RBM record that names tenant A's program. Nothing stops
  // it: rbm_kris.program_id has no foreign key, and RLS checks the row's own
  // organization (B), not the program's.
  await scratch.ownerPool.query(
    `INSERT INTO rbm_kris (organization_id, program_id, name) VALUES ($1, $2, 'dbpo KRI naming another tenant''s program')`,
    [ORG_B, PROGRAM_A],
  );
  // Tenant A's site, which tenant B must never be able to read for.
  // site_intel.sites.program_id references core.programs, a registry nothing in
  // the server writes; the row is seeded there so the site can exist at all.
  await scratch.ownerPool.query(`INSERT INTO core.programs (id, name) VALUES ($1, 'dbpo core mirror')`, [PROGRAM_A]);
  await scratch.ownerPool.query(
    `INSERT INTO site_intel.sites (program_id, site_number, site_name, country_code, quality_score)
     VALUES ($1, 'DBPO-001', 'Tenant A site', 'US', 40)`,
    [PROGRAM_A],
  );
}, 120_000);

afterAll(async () => {
  if (!scratch) return;
  await cleanup().catch(() => {});
  await scratch.destroy();
});

describe('programInOrganization, as the production runtime role with RLS enforcing', () => {
  it("is true for the caller's own live program", async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_A), async c => {
      expect(await programInOrganization(c, PROGRAM_A, ORG_A)).toBe(true);
    });
  });

  it("is false for another organization's program", async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_B), async c => {
      expect(await programInOrganization(c, PROGRAM_A, ORG_B)).toBe(false);
    });
  });

  it('is false for a deleted program — and true only when the caller opts in by name', async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_A), async c => {
      expect(await programInOrganization(c, PROGRAM_A_DELETED, ORG_A)).toBe(false);
      expect(await programInOrganization(c, PROGRAM_A_DELETED, ORG_A, { includeDeleted: true })).toBe(true);
    });
  });

  it('is false for a program only the legacy registry holds', async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_B), async c => {
      expect(await programInOrganization(c, LEGACY_ONLY, ORG_B)).toBe(false);
    });
  });

  it('answers the same with the organization as a digit string', async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_A), async c => {
      expect(await programInOrganization(c, PROGRAM_A, String(ORG_A))).toBe(true);
    });
  });

  it('throws VerificationUnavailableError, not false, when it cannot run', async () => {
    await withSession(scratch.runtimePool!, enforced(ORG_A), async c => {
      const broken = { query: (sql: string, p?: unknown[]) => c.query(sql.replace('regulatory_programs', 'regulatory_programs_absent'), p) };
      await expect(programInOrganization(broken, PROGRAM_A, ORG_A)).rejects.toMatchObject({
        name: 'VerificationUnavailableError',
      });
    });
  });
});

describe("the RBM site-risk read asks whether the caller owns the program, not whether it mentions it", () => {
  it("refuses tenant B a read for tenant A's program, though B holds a KRI naming it (RLS enforcing)", async () => {
    const out = await withSession(scratch.runtimePool!, enforced(ORG_B), c => readProgramSites(c, ORG_B, PROGRAM_A));
    // Before 2026-10-01: { ok: true, rows: [] } — a foreign program reported as
    // a healthy study with no sites.
    expect(out).toEqual({ ok: false, reason: 'not_in_tenant' });
  });

  it('does not refuse tenant A its own program for having no RBM records yet', async () => {
    // Before 2026-10-01: { ok: false, reason: 'not_in_tenant' } — the owner was
    // refused until some RBM record named the program.
    const out = await withSession(scratch.runtimePool!, enforced(ORG_A), c => readProgramSites(c, ORG_A, PROGRAM_A));
    expect(out.ok).toBe(true);
  });
});
