/**
 * Seal a project's Vault (VR-19, docs/design/VAULT_DATA_ROOM_SEAL_2026-10-29.md).
 *
 * A seal is an e-signed record of every current document as it stood: its
 * identity, version, content hash, filing and lifecycle stage, hashed, written
 * where nothing can alter it, and verifiable later by anyone in the
 * organisation. Real PostgreSQL, as app_service under RLS, through the real
 * signing ceremony (password re-verification, signing authority, one
 * transaction with the ledger pair and the electronic signature).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vseal-${RUN} `;
const CODE = `DBTEST-VSEAL-${RUN}`;
const PASSWORD = 'test-vault-seal-fixture';
const REASON = 'Closing the data room for the partner diligence review.';

type Tenant = { orgId: number; orgUuid: string; programId: string };
type Actor = { userId: number; role: string };
let owner: Pool;
let signer: Actor;
let viewer: Actor;
let mine: Tenant;
let theirs: Tenant;
const docs: string[] = [];

async function appFor(t: Tenant, actor: Actor): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId: actor.userId, tenantId: t.orgId, userRole: actor.role,
      user: { id: actor.userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: actor.role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t, signer)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

const seal = async (t: Tenant, body: Record<string, unknown>, actor: Actor = signer) =>
  request(await appFor(t, actor)).post(`/api/c2c/project-vault/${t.programId}/seals`)
    .send({ password: PASSWORD, meaning: 'approval', reason: REASON, ...body });
const seals = async (t: Tenant, actor: Actor = signer) =>
  request(await appFor(t, actor)).get(`/api/c2c/project-vault/${t.programId}/seals`);
const verify = async (t: Tenant, id: string, query = '', actor: Actor = signer) =>
  request(await appFor(t, actor)).get(`/api/c2c/project-vault/${t.programId}/seals/${id}/verify${query}`);

async function tenant(slug: string, userId: number): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vseal-${RUN}-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Sealia 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  const current = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, current, { userId, namespace: `${PROBE}${slug}-parent` });
  return current;
}

/** As the runtime role, in the tenant's own scope, so row security shows the row and the guard answers. */
async function asRuntime<T>(t: Tenant, sql: string, params: unknown[]): Promise<T> {
  const { getPool } = await import('../../server/db');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { applySessionScope } = await import('../../server/db/sessionScope');
  const { LazyRequestDbClient } = await import('../../server/middleware/lazyRequestDbClient');
  const session = { tenantId: String(t.orgId), orgUuid: t.orgUuid, role: 'admin' };
  return runWithTenantScope({ ...session, source: 'request', caller: 'vault-seal-dbtest' }, async () => {
    const q = new LazyRequestDbClient(getPool(), (client) => applySessionScope(client, session));
    try { return (await q.query(sql, params)) as T; } finally { await q.release(); }
  });
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Sol Sealer', $2, 'active') RETURNING id`,
    [`dbtest-vseal-${RUN}@example.test`, hash],
  );
  signer = { userId: Number(user.rows[0].id), role: 'admin' };
  mine = await tenant('mine', signer.userId);
  theirs = await tenant('theirs', signer.userId);
  const v = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Vic Viewer', $2, 'active') RETURNING id`,
    [`dbtest-vseal-${RUN}-viewer@example.test`, hash],
  );
  viewer = { userId: Number(v.rows[0].id), role: 'viewer' };
  await seedVaultFixtureViewer(owner, mine, { userId: viewer.userId, invitedBy: signer.userId });
  await assertVaultFixtureRuntime(mine);
  docs.push(await ingest(mine, 'Stability protocol for the drug product.', { documentCode: `${CODE}-STAB`, documentTitle: 'Stability protocol', folderId: 'module-3' }));
  docs.push(await ingest(mine, 'Clinical overview of the program.', { documentCode: `${CODE}-CO`, documentTitle: 'Clinical overview' }));
  docs.push(await ingest(mine, 'Investigator brochure, edition 1.', { documentCode: `${CODE}-IB`, documentTitle: 'Investigator brochure', folderId: 'module-1' }));
});

afterAll(async () => {
  // Retain new namespaces, source bytes and append-only history, including failures.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

let sealId = '';

describe('sealing a Vault (VR-19)', () => {
  it('records every current document, hashes the record, and binds the signature and the audit row to that hash', async () => {
    const res = await seal(mine, {});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    sealId = res.body.data.seal.id;
    expect(res.body.data.seal).toMatchObject({ documentCount: 3, reason: REASON, sealedBy: signer.userId });

    const row = (await owner.query(
      'SELECT organization_id, program_id::text, manifest, manifest_sha256, document_count FROM public.vault_data_room_seals WHERE id = $1', [sealId])).rows[0];
    expect(row).toMatchObject({ organization_id: mine.orgId, program_id: mine.programId, document_count: 3 });
    expect(row.manifest.documents.map((d: { id: string }) => d.id).sort()).toEqual([...docs].sort());
    const { stableStringify } = await import('../../shared/canonical-json');
    expect(createHash('sha256').update(stableStringify(row.manifest), 'utf8').digest('hex')).toBe(row.manifest_sha256);
    expect(res.body.data.seal.manifestSha256).toBe(row.manifest_sha256);
    const filed = row.manifest.documents.find((d: { id: string }) => d.id === docs[0]);
    expect(filed).toMatchObject({ folderId: 'module-3', placementStatus: 'confirmed', title: 'Stability protocol' });
    expect(filed.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const audit = (await owner.query(
      `SELECT user_id, new_values, sha256_chain FROM audit_logs WHERE action = 'vault.data_room.seal' AND record_id = $1`, [sealId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].new_values).toMatchObject({ manifestSha256: row.manifest_sha256, documentCount: 3 });
    expect(audit[0].sha256_chain).toBeTruthy();

    const signature = (await owner.query(
      `SELECT signer_id, signature_meaning, binding_basis, bound_payload_digest FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2`, [mine.orgId, `vault-data-room-seal:${sealId}`])).rows;
    expect(signature).toEqual([{ signer_id: signer.userId, signature_meaning: 'approval',
      binding_basis: 'vault-data-room-seal-manifest-sha256', bound_payload_digest: row.manifest_sha256 }]);
  });

  it('lists the seal with who sealed it and why', async () => {
    const res = await seals(mine);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.seals).toEqual([expect.objectContaining({ id: sealId, reason: REASON, documentCount: 3, sealedByName: 'Sol Sealer' })]);
  });

  it('verifies intact when nothing changed, its stored files included', async () => {
    const res = await verify(mine, sealId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.verification).toMatchObject({ verdict: 'intact', changed: [], unreadable: [], manifestIntact: true, bytesChecked: false });
    const bytes = await verify(mine, sealId, '?bytes=1');
    expect(bytes.body.data.verification).toMatchObject({ verdict: 'intact', bytesChecked: true });
  });
});

describe('what a seal refuses, and what nobody can do to one', () => {
  it('refuses a seal with no reason, and writes nothing', async () => {
    const before = (await owner.query('SELECT count(*)::int AS n FROM public.vault_data_room_seals WHERE organization_id = $1', [mine.orgId])).rows[0].n;
    const res = await seal(mine, { reason: '' });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect((await owner.query('SELECT count(*)::int AS n FROM public.vault_data_room_seals WHERE organization_id = $1', [mine.orgId])).rows[0].n).toBe(before);
  });

  it('refuses a wrong password, and a viewer', async () => {
    expect((await seal(mine, { password: 'not-the-password' })).status).toBe(401);
    expect((await seal(mine, {}, viewer)).status).toBe(403);
  });

  it("refuses another organisation's project, and shows that organisation nothing", async () => {
    const foreign = await request(await appFor(theirs, signer)).post(`/api/c2c/project-vault/${mine.programId}/seals`)
      .send({ password: PASSWORD, meaning: 'approval', reason: REASON });
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(404);
    expect((await seals(theirs)).body.data.seals).toEqual([]);
    expect((await verify(theirs, sealId)).status).toBe(404);
  });

  it('the runtime role can neither change nor remove a seal', async () => {
    await expect(asRuntime(mine, `UPDATE public.vault_data_room_seals SET reason = 'rewritten' WHERE id = $1`, [sealId])).rejects.toThrow(/VAULT_SEAL_IMMUTABLE/);
    await expect(asRuntime(mine, 'DELETE FROM public.vault_data_room_seals WHERE id = $1', [sealId])).rejects.toThrow(/VAULT_SEAL_IMMUTABLE/);
    await expect(asRuntime(mine, 'TRUNCATE public.vault_data_room_seals', [])).rejects.toThrow();
    expect((await owner.query('SELECT reason FROM public.vault_data_room_seals WHERE id = $1', [sealId])).rows).toEqual([{ reason: REASON }]);
  });
});

describe('a seal says when the Vault no longer matches it', () => {
  it('could not verify, never intact, when a sealed file can no longer be read', async () => {
    const { getStorageProvider } = await import('../../server/services/storage/index');
    const target = docs[1];
    const stored = (await owner.query('SELECT storage_version_id FROM vault.documents WHERE id = $1', [target])).rows[0].storage_version_id;
    const store = getStorageProvider() as unknown as { delete?: (id: string, org: number) => Promise<unknown> };
    expect(typeof store.delete, 'the test store can remove an object').toBe('function');
    await store.delete!(stored, mine.orgId);
    const res = await verify(mine, sealId, '?bytes=1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.verification.verdict).toBe('could_not_verify');
    expect(res.body.data.verification.unreadable.map((u: { id: string }) => u.id)).toEqual([target]);
  });
});

describe('the tenant purge removes seals through its door', () => {
  it('refuses while the organisation is not pending deletion, then removes them', async () => {
    const purge = (org: number) => owner.query('SELECT seals FROM public.purge_tenant_vault_seals($1)', [org]);
    await expect(purge(theirs.orgId)).rejects.toThrow(/not pending deletion/);
    const s = await seal(theirs, {});
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    await owner.query(`UPDATE organizations SET status = 'pending_deletion' WHERE id = $1`, [theirs.orgId]);
    expect((await purge(theirs.orgId)).rows).toEqual([{ seals: 1 }]);
    expect((await owner.query('SELECT count(*)::int AS n FROM public.vault_data_room_seals WHERE organization_id = $1', [theirs.orgId])).rows[0].n).toBe(0);
  });
});
