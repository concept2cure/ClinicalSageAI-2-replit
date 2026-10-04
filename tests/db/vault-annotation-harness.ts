/**
 * Shared by the review-annotation DB suites (vault-version-annotations*.dbtest.ts):
 * tenants, users, ingest and the two Vault routers behind the real tenant
 * scope, and a runtime-role SQL runner. Not a test file.
 */
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

export type Tenant = { orgId: number; orgUuid: string; programId: string; slug: string };
export type Outcome = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string };

export function harness(prefix: string) {
  const PROBE = `dbtest-${prefix} `;
  const CODE = `DBTEST-${prefix.toUpperCase()}`;
  const state = { owner: undefined as unknown as Pool };

  async function user(email: string, name: string): Promise<number> {
    const r = await state.owner.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [email, name],
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

  async function tenant(slug: string): Promise<Tenant> {
    const org = await state.owner.query(
      `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
      [`${PROBE}${slug}`, `dbtest-${prefix}-${slug}`],
    );
    const prog = await state.owner.query(
      `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Annota 5mg') RETURNING id`,
      [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
    );
    return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id), slug };
  }

  async function appFor(t: Tenant, userId: number, role = 'admin'): Promise<express.Express> {
    const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
    const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
    const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      Object.assign(req, {
        userId, tenantId: t.orgId, userRole: role,
        user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role },
      });
      next();
    });
    a.use(establishRequestTenantScope);
    a.use('/api/vault/ingest', createVaultIngestRoutes());
    a.use('/api/c2c/project-vault', createProjectVaultRoutes());
    return a;
  }

  async function ingest(t: Tenant, userId: number, file: { bytes: Buffer; name: string; type: string }, fields: Record<string, string>): Promise<string> {
    let r = request(await appFor(t, userId)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    const res = await r.attach('file', file.bytes, { filename: file.name, contentType: file.type });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return String(res.body.document.id);
  }

  async function cleanup(): Promise<void> {
    const orgs = `(SELECT id FROM organizations WHERE slug LIKE 'dbtest-${prefix}-%')`;
    const client = await state.owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
      await client.query(`DELETE FROM audit_logs WHERE tenant_id IN ${orgs}`);
      await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
    // Versions first, as the owner: their annotations and relationships follow by cascade.
    await state.owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
    await state.owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
    await state.owner.query(`DELETE FROM canonical_documents WHERE organization_id IN ${orgs}`).catch(() => {});
    await state.owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
    await state.owner.query(`DELETE FROM organization_users WHERE organization_id IN ${orgs}`).catch(() => {});
    await state.owner.query(`UPDATE organizations SET status = 'active' WHERE slug LIKE 'dbtest-${prefix}-%'`).catch(() => {});
  }

  const asRuntime = (sql: string, params: unknown[], scope: Tenant | 'system') => runAsRuntime(prefix, sql, params, scope);
  return { PROBE, CODE, state, user, member, tenant, appFor, ingest, asRuntime, cleanup, removeStorage };
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

export async function removeStorage(tenants: Tenant[]): Promise<void> {
  for (const t of tenants) {
    if (t) await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(t.orgId)), { recursive: true, force: true }).catch(() => {});
}
  }

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
