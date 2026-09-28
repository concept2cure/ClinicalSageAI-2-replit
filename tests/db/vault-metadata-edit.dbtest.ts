/**
 * Edit details: a Vault version's title, type and classification change only
 * through a person, with a reason, and the change is recorded before and after
 * (VR-05, row D5).
 *
 * Drives editVaultDocumentMetadata on PostgreSQL as the runtime role
 * (app_service, RLS on) inside the tenant scope the request gate opens, with
 * the role that scope carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr05-edit ';
const CODE = 'DBTEST-VR05-EDIT';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
let programId: string;
let documentId: string;

async function asRole<T>(role: string, org: number, uuid: string, fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    { tenantId: String(org), orgUuid: uuid, role, source: 'request', caller: 'tests/db/vault-metadata-edit.dbtest.ts' },
    fn,
  );
}

async function edit(fields: Record<string, unknown>, role = 'member', org = () => orgId, uuid = () => orgUuid) {
  const { editVaultDocumentMetadata } = await import('../../server/services/vault/vault-metadata-edit.service');
  return asRole(role, org(), uuid(), () =>
    editVaultDocumentMetadata({ programId, documentId, organizationId: org(), userId, reason: undefined, ...fields }),
  );
}

const row = async () =>
  (await owner.query('SELECT document_title, document_type, classification FROM vault.documents WHERE id = $1', [documentId]))
    .rows[0];
const auditRows = async () =>
  (
    await owner.query(
      `SELECT new_values FROM audit_logs WHERE record_id = $1 AND action = 'vault.document.metadata_edit' ORDER BY occurred_at`,
      [documentId],
    )
  ).rows as Array<{ new_values: { changes: unknown[]; reason: string } }>;

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.metadata_edit'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${CODE}%`],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

const orgRow = async (name: string, slug: string) => {
  const id = Number(
    (
      await owner.query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name, slug],
      )
    ).rows[0].id,
  );
  return { id, uuid: String((await owner.query('SELECT uuid FROM organizations WHERE id = $1', [id])).rows[0].uuid) };
};

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  ({ id: orgId, uuid: orgUuid } = await orgRow(`${PROBE}tenant`, 'dbtest-vr05-edit-tenant'));
  ({ id: otherOrgId, uuid: otherOrgUuid } = await orgRow(`${PROBE}other`, 'dbtest-vr05-edit-other'));
  userId = Number(
    (
      await owner.query(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        ['dbtest-vr05-edit@example.test', `${PROBE}actor`, 'not-a-real-hash'],
      )
    ).rows[0].id,
  );
  await cleanup();
  programId = String(
    (
      await owner.query(
        `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
         VALUES ($1, 'DBTEST-VR05-E', $2, '510k', 'device', 'FDA', 'AeroFlow AF-1000') RETURNING id`,
        [`${PROBE}program`, orgId],
      )
    ).rows[0].id,
  );
  documentId = String(
    (
      await owner.query(
        `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type,
           version, content_hash, classification, placement_status, processing_status)
         VALUES ($1, $2, $3, 'Protocol', 'OTHER', '1.0', $4, 'INTERNAL', 'unfiled', 'INDEXED') RETURNING id`,
        [programId, orgId, CODE, 'f'.repeat(64)],
      )
    ).rows[0].id,
  );
});

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('Edit details on a Vault version (VR-05, D5)', () => {
  it('refuses a change without a reason, and changes nothing', async () => {
    expect(await edit({ documentTitle: 'Clinical protocol' })).toMatchObject({ ok: false, status: 422, code: 'REASON_REQUIRED' });
    expect(await edit({ documentTitle: 'Clinical protocol', reason: 'short' })).toMatchObject({ ok: false, status: 422, code: 'REASON_REQUIRED' });
    expect(await row()).toMatchObject({ document_title: 'Protocol' });
    expect(await auditRows()).toHaveLength(0);
  });

  it('with a reason, changes the fields and records each before and after, with the reason, once', async () => {
    const reason = 'The sponsor renamed the protocol at the pre-IND meeting.';
    const r = await edit({ documentTitle: 'Clinical protocol', documentType: 'PROTOCOL', classification: 'CONFIDENTIAL', reason });
    expect(r).toMatchObject({ ok: true, unchanged: false });
    expect(await row()).toEqual({ document_title: 'Clinical protocol', document_type: 'PROTOCOL', classification: 'CONFIDENTIAL' });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].new_values.reason).toBe(reason);
    expect(rows[0].new_values.changes).toEqual([
      { field: 'document_title', from: 'Protocol', to: 'Clinical protocol' },
      { field: 'document_type', from: 'OTHER', to: 'PROTOCOL' },
      { field: 'classification', from: 'INTERNAL', to: 'CONFIDENTIAL' },
    ]);
  });

  it('a change to the values already recorded writes nothing', async () => {
    const r = await edit({ classification: 'CONFIDENTIAL', reason: 'Confirming the classification stands.' });
    expect(r).toEqual({ ok: true, unchanged: true, changes: [] });
    expect(await auditRows()).toHaveLength(1);
  });

  it('refuses a type or classification outside the Vault vocabulary', async () => {
    const reason = 'Reclassifying after the document review.';
    expect(await edit({ documentType: 'BANANA', reason })).toMatchObject({ ok: false, status: 422, code: 'INVALID_DOCUMENT_TYPE' });
    expect(await edit({ classification: 'SECRET', reason })).toMatchObject({ ok: false, status: 422, code: 'INVALID_CLASSIFICATION' });
    expect(await row()).toMatchObject({ document_type: 'PROTOCOL', classification: 'CONFIDENTIAL' });
  });

  it('refuses a viewer before anything is read or written', async () => {
    const r = await edit({ documentTitle: 'Viewer title', reason: 'A viewer should not be able to do this.' }, 'viewer');
    expect(r).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(await row()).toMatchObject({ document_title: 'Clinical protocol' });
  });

  it("reports another organization's document as absent", async () => {
    const r = await edit(
      { documentTitle: 'Cross-tenant title', reason: 'Another tenant tries to rename it.' },
      'admin',
      () => otherOrgId,
      () => otherOrgUuid,
    );
    expect(r).toMatchObject({ ok: false, status: 404, code: 'DOCUMENT_NOT_FOUND' });
    expect(await row()).toMatchObject({ document_title: 'Clinical protocol' });
    expect(await auditRows()).toHaveLength(1);
  });
});
