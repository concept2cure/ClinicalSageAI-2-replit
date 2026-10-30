/**
 * Every reader of a project sees, on the document, that it is on legal hold
 * (MR-08 Stage 5 step 5, CAT1-15,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * The hold register is in Admin Settings and the hold list is read by the
 * hold-authority roles only, so the Vault said nothing to a custodian about to
 * withdraw a held document. Now the Vault read carries the project's active
 * holds: matter reference and date, never the reason.
 *
 * On real PostgreSQL as app_service under RLS, through the real Vault read, as
 * a viewer:
 *   - a project hold and a document hold are listed, with reference and date;
 *   - their reasons are not;
 *   - a lifted hold, a hold on another project and another organization's hold
 *     are not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vhold-${RUN} `;
const SECRET = 'Privileged: counsel advises preservation pending the dosing dispute.';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let viewerId: number;
let mine: Tenant;
let elsewhere: Tenant;
let theirs: Tenant;

async function appFor(t: Tenant, role: string, actor: number): Promise<express.Express> {
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId: actor, tenantId: t.orgId, userRole: role,
      user: { id: actor, organizationId: t.orgId, organizationUuid: t.orgUuid, role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function org(slug: string): Promise<{ id: number; uuid: string }> {
  const o = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vhold-${RUN}-${slug}`]);
  return { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid) };
}
async function program(o: { id: number; uuid: string }, code: string): Promise<Tenant> {
  const p = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Holdia 5mg') RETURNING id`,
    [`${PROBE}${code}`, `${code}-${RUN}`, o.id]);
  const t = { orgId: o.id, orgUuid: o.uuid, programId: String(p.rows[0].id) };
  await seedVaultFixtureParent(owner, t, { userId, namespace: `${PROBE}${code}` });
  return t;
}
async function hold(t: Tenant, reference: string, target: { programId?: string; documentId?: string }, lifted = false): Promise<void> {
  const id = randomUUID();
  await owner.query(
    `INSERT INTO vault.legal_holds (id, organization_id, reference, reason, scope, program_id, document_id, placed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, t.orgId, reference, SECRET, target.documentId ? 'document' : 'program', target.programId ?? null, target.documentId ?? null, userId]);
  if (lifted) {
    await owner.query(`UPDATE vault.legal_holds SET lifted_at = NOW(), lifted_by = $2, lift_reason = 'Matter closed.' WHERE id = $1`, [id, userId]);
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  userId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Hana Holder', 'x', 'active') RETURNING id`,
    [`dbtest-vhold-${RUN}@example.test`])).rows[0].id);
  viewerId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Vera Viewer', 'x', 'active') RETURNING id`,
    [`dbtest-vhold-${RUN}-viewer@example.test`])).rows[0].id);
  const o = await org('mine');
  mine = await program(o, 'DBTEST-VHOLD-A');
  elsewhere = await program(o, 'DBTEST-VHOLD-B');
  theirs = await program(await org('theirs'), 'DBTEST-VHOLD-C');
  await seedVaultFixtureViewer(owner, mine, { userId: viewerId, invitedBy: userId });
  await assertVaultFixtureRuntime(mine);
}, 60_000);

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('the Vault read says what is on legal hold', () => {
  it('lists a project hold and a document hold to a viewer, with reference and date, and no reason', async () => {
    const doc = randomUUID();
    await owner.query(`INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, version, content_hash)
      VALUES ($1, $2, $3, $4, 'Clinical overview', '1.0', $5)`, [doc, mine.programId, mine.orgId, `DBTEST-VHOLD-${RUN}`, createHash('sha256').update(`vhold ${RUN}`).digest('hex')]);
    await hold(mine, `MATTER-P-${RUN}`, { programId: mine.programId });
    await hold(mine, `MATTER-D-${RUN}`, { documentId: doc });
    await hold(mine, `MATTER-LIFTED-${RUN}`, { programId: mine.programId }, true);
    await hold(elsewhere, `MATTER-ELSEWHERE-${RUN}`, { programId: elsewhere.programId });
    await hold(theirs, `MATTER-THEIRS-${RUN}`, { programId: theirs.programId });

    const res = await request(await appFor(mine, 'viewer', viewerId)).get(`/api/c2c/project-vault/${mine.programId}`);
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    const holds = res.body.data.legalHolds as Array<Record<string, unknown>>;
    expect(holds.map((h) => [h.scope, h.reference, h.documentId])).toEqual([
      ['program', `MATTER-P-${RUN}`, null],
      ['document', `MATTER-D-${RUN}`, doc],
    ]);
    for (const h of holds) expect(Object.keys(h).sort()).toEqual(['documentId', 'placedAt', 'reference', 'scope']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(res.body.data.unavailable ?? []).not.toContainEqual(expect.objectContaining({ branch: 'legalHolds' }));
  });

  it('says nothing is held where nothing is', async () => {
    const res = await request(await appFor(elsewhere, 'admin', userId)).get(`/api/c2c/project-vault/${theirs.programId}`);
    expect(res.status).toBe(404);
    const clear = await program({ id: mine.orgId, uuid: mine.orgUuid }, 'DBTEST-VHOLD-D');
    const ok = await request(await appFor(clear, 'admin', userId)).get(`/api/c2c/project-vault/${clear.programId}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.legalHolds).toEqual([]);
  });
});
