/**
 * Shared by the review-annotation DB suites (vault-version-annotations*.dbtest.ts):
 * tenants, users, ingest and the two Vault routers behind the real tenant
 * scope, and a runtime-role SQL runner. Not a test file.
 */
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { expect } from 'vitest';

export type Tenant = { orgId: number; orgUuid: string; programId: string; projectId: number; slug: string };
export type Outcome = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string };

export function harness(prefix: string) {
  const runId = randomUUID();
  const PROBE = `dbtest-${prefix} ${runId} `;
  const CODE = `DBTEST-${prefix.toUpperCase()}-${runId.slice(0, 12)}`;
  const state = { owner: undefined as unknown as Pool };

  async function user(email: string, name: string): Promise<number> {
    const r = await state.owner.query(
      `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, 'not-a-real-hash', 'active') RETURNING id`,
      [email.replace('@', `+${runId}@`), name],
    );
    return Number(r.rows[0].id);
  }

  /** A member of the organisation, as every real annotator is (actor_name names members only). */
  async function member(t: Tenant, userId: number, role = 'member'): Promise<void> {
    await state.owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
      [t.orgId, userId, role],
    );
  }

  async function tenant(slug: string, ownerUserId: number): Promise<Tenant> {
    const org = (await state.owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$2,'active') RETURNING id,uuid",
      [`${PROBE}${slug}`, `dbtest-${prefix}-${runId}-${slug}`])).rows[0];
    const { ensureOrganizationDefaultWorkspace, poolClientWorkspaceStore } = await import('../../server/services/c2c/organization-default-workspace');
    const client = await state.owner.connect();
    try {
      await client.query('BEGIN');
      await ensureOrganizationDefaultWorkspace(poolClientWorkspaceStore(client), { orgId: Number(org.id), orgName: `${PROBE}${slug}`, orgSlug: `dbtest-${prefix}-${runId}-${slug}` });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return program({ orgId: Number(org.id), orgUuid: String(org.uuid) }, slug, ownerUserId);
  }

  async function program(t: Pick<Tenant, 'orgId' | 'orgUuid'>, slug: string, ownerUserId: number): Promise<Tenant> {
    const { requireProgramProjectAnchor } = await import('../../server/services/c2c/program-project-anchor');
    const client = await state.owner.connect();
    try {
      await client.query('BEGIN');
      const id = String((await client.query(`INSERT INTO regulatory_programs(name,code,organization_id,program_type,product_type,primary_agency,product_name,lead_user_id)
        VALUES($1,$2,$3,'ind','drug','FDA','Invented annotation QA product',$4) RETURNING id`,
      [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, t.orgId, ownerUserId])).rows[0].id);
      const anchor = await requireProgramProjectAnchor({ client, orgId: t.orgId, userId: ownerUserId, programId: id,
        name: `${PROBE}${slug} project`, code: `${CODE}-${slug.toUpperCase()}`, priority: 'normal', metadata: { registryId: 'US_IND', submissionType: 'US_IND' } });
      await client.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'org_public')", [t.orgId, anchor.projectId]);
      await client.query('COMMIT');
      return { ...t, programId: id, projectId: anchor.projectId, slug };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async function appFor(): Promise<express.Express> {
    const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
    const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
    const { requireTenantContext } = await import('../../server/middleware/tenantContext');
    const a = express(); a.use(express.json()); a.use(requireTenantContext);
    a.use('/api/vault/ingest', createVaultIngestRoutes());
    a.use('/api/c2c/project-vault', createProjectVaultRoutes());
    return a;
  }

  async function requestFor(t: Tenant, userId: number, role = 'admin') {
    const token = jwt.sign({ type: 'access', userId: String(userId), organizationId: String(t.orgId), organizationUuid: t.orgUuid, role }, activeJwtSecret(), { expiresIn: '15m' });
    return request.agent(await appFor()).set('Authorization', `Bearer ${token}`);
  }

  async function ingest(t: Tenant, userId: number, file: { bytes: Buffer; name: string; type: string }, fields: Record<string, string>): Promise<string> {
    let r = (await requestFor(t, userId)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    const res = await r.attach('file', file.bytes, { filename: file.name, contentType: file.type });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return String(res.body.document.id);
  }

  /** Fresh run namespaces retain all history instead of disabling guards. */
  async function cleanup(): Promise<void> { /* Retained QA records are intentional. */ }

  const asRuntime = (sql: string, params: unknown[], scope: Tenant | 'system') => runAsRuntime(prefix, sql, params, scope);
  return { PROBE, CODE, state, user, member, tenant, program, appFor, requestFor, ingest, asRuntime, cleanup, removeStorage };
}

/** SQL as the runtime role, in a tenant's scope or the system scope, in its own transaction. */
export async function runAsRuntime(prefix: string, sql: string, params: unknown[], scope: Tenant | 'system'): Promise<Outcome> {
  const { runWithTenantScope, runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const body = async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query('COMMIT');
      return { ok: true, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  };
  const caller = `tests/db/${prefix}.dbtest.ts`;
  if (scope === 'system') return runWithSystemTenantScope(caller, body);
  return runWithTenantScope({ tenantId: String(scope.orgId), orgUuid: scope.orgUuid, role: 'admin', source: 'request', caller }, body);
}

/** Stored QA bytes remain available for the retained evidence rows. */
export async function removeStorage(_tenants: Tenant[]): Promise<void> { /* No teardown deletion. */ }

export const refused = (r: Outcome, pattern = /IMMUTABILITY_VIOLATION|VAULT_ANNOTATION_REFUSED/) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(pattern);
};

export const textFile = (text: string, name = 'notes.txt') => ({ bytes: Buffer.from(text, 'utf8'), name, type: 'text/plain' });

export async function threePagePdf(): Promise<{ bytes: Buffer; name: string; type: string }> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  pdf.addPage();
  return { bytes: Buffer.from(await pdf.save()), name: 'three-pages.pdf', type: 'application/pdf' };
}
