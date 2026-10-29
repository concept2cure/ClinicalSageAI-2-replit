import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { companyLegalVaultTargetRefusal, vaultVersionNotTransmittable } from '../../vault/vault-lifecycle';
import { readCompanyLegalRegistry, readCompanyLegalRegistryForVault, syncCompanyLegalRegistry } from '../legal-registry';

const migration = readFileSync(fileURLToPath(new URL('../../../../migrations/20261018_company_legal_registry.sql', import.meta.url)), 'utf8');
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT = '22222222-2222-4222-8222-222222222222';
const HASH = 'a'.repeat(64);
let db: PGlite;
const q = { query: (sql: string, params?: unknown[]) => db.query(sql, params) };
const document = (overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument => ({
  id: 'legal_original', title: 'Authorization', kind: 'authorization', programId: PROGRAM,
  vaultDocumentId: VAULT, contentHash: HASH, version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_IND'],
  language: 'en', effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z', registeredBy: '3', ...overrides,
});
async function organization(id: number, legalDocuments?: unknown) {
  const companyDocuments = { revision: 4, companyName: 'Sponsor', ...(legalDocuments === undefined ? {} : { legalDocuments }) };
  await db.query('INSERT INTO organizations(id,settings) VALUES($1,$2::json)', [id, JSON.stringify({ security: { secret: 'keep-private' }, companyDocuments })]);
}
async function applyFailure() {
  try { await db.exec(migration); throw new Error('Expected migration refusal'); }
  catch (error) { await db.exec('ROLLBACK'); return error; }
}
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text DEFAULT 'active',settings json);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds(organization_id integer,lifted_at timestamptz);
    CREATE TABLE vault.documents(id uuid,organization_id integer,program_id uuid,document_code text,
      supersedes_id uuid,document_title text,content_hash text,version text,deleted_at timestamptz);
    CREATE TABLE canonical_documents(canonical_id text,organization_id integer,source_refs jsonb,stage text,content_hash text,created_at timestamptz);`);
  await db.exec(AUDIT_LOGS_PGLITE_DDL);
});
afterEach(async () => { await db?.close(); });

describe('canonical company legal registry cutover and controls', () => {
  it('moves more than 500 exact records including archived workflow evidence and replays without duplication', async () => {
    const records = Array.from({ length: 603 }, (_, index) => document({ id: `legal_${index}`, active: index !== 2 }));
    records[2].workflow = { custodianUserId: '3', reminderDays: [30,7], replacementId: null, revokedAt: '2026-10-02T00:00:00Z', revokedBy: '3', revocationReason: 'Authority withdrawn', authority: null, signatureEvidence: null, translationOfId: null, certifiedTranslationEvidence: null, updatedAt: '2026-10-02T00:00:00Z', updatedBy: '3' };
    await organization(1, records);
    await db.exec(migration);
    await db.exec(migration);
    const stored = await readCompanyLegalRegistry(q, 1);
    expect(stored).toHaveLength(603);
    expect(stored.find(row => row.id === 'legal_2')).toEqual(records[2]);
    const { rows } = await db.query<{ settings: any }>('SELECT settings FROM organizations WHERE id=1');
    expect(rows[0].settings).toEqual({ security: { secret: 'keep-private' }, companyDocuments: { revision: 4, companyName: 'Sponsor' } });
  });

  it.each([null, {}, [document({ contentHash: 'missing' })], [document(), document()]])('refuses malformed or duplicate legacy input atomically: %j', async invalid => {
    await organization(1, invalid);
    expect(String(await applyFailure())).toMatch(/Malformed|Invalid or duplicate/);
    expect((await db.query<{ settings: any }>('SELECT settings FROM organizations WHERE id=1')).rows[0].settings.companyDocuments.legalDocuments).toEqual(invalid);
    expect((await db.query<{ relation: string | null }>('SELECT to_regclass(\'public.company_legal_registry\') AS relation')).rows[0].relation).toBeNull();
  });

  it('refuses a preexisting canonical/source mismatch without removing the settings original', async () => {
    await organization(1, [document()]);
    await db.exec('CREATE TABLE company_legal_registry(organization_id integer,id text,document jsonb,PRIMARY KEY(organization_id,id))');
    await db.query('INSERT INTO company_legal_registry VALUES(1,$1,$2::jsonb)', [document().id, JSON.stringify(document({ title: 'Different saved metadata' }))]);
    expect(String(await applyFailure())).toMatch(/Conflicting company legal registry/);
    expect((await db.query<{ settings: any }>('SELECT settings FROM organizations WHERE id=1')).rows[0].settings.companyDocuments.legalDocuments).toEqual([document()]);
    expect((await readCompanyLegalRegistry(q, 1))[0].title).toBe('Different saved metadata');
  });

  it('blocks old workers from reintroducing a settings array, even empty, and rejects immutable source edits', async () => {
    await organization(1, [document()]);
    await db.exec(migration);
    await expect(db.query('UPDATE organizations SET settings=$1::json WHERE id=1', [JSON.stringify({ companyDocuments: { legalDocuments: [] } })])).rejects.toThrow(/canonical registry/);
    await expect(db.query("UPDATE company_legal_registry SET document=jsonb_set(document,'{contentHash}',to_jsonb($1::text)) WHERE organization_id=1", ['b'.repeat(64)])).rejects.toThrow(/immutable/);
    await expect(syncCompanyLegalRegistry(q, 1, [document()], [document({ version: '99' })])).rejects.toMatchObject({ code: 'LEGAL_REGISTRY_IDENTITY_CHANGED' });
    await expect(syncCompanyLegalRegistry(q, 1, [document()], [])).rejects.toMatchObject({ code: 'LEGAL_REGISTRY_RETENTION' });
  });

  it('isolates tenants and exact Vault versions, includes archived records and rejects stale updates', async () => {
    await organization(1); await organization(2); await db.exec(migration);
    await syncCompanyLegalRegistry(q, 1, [], [document({ active: false })]);
    await syncCompanyLegalRegistry(q, 2, [], [document({ title: 'Another organization' })]);
    expect(await readCompanyLegalRegistryForVault(q, 1, VAULT.toUpperCase())).toEqual([document({ active: false })]);
    expect(await readCompanyLegalRegistryForVault(q, 1, PROGRAM)).toEqual([]);
    await expect(syncCompanyLegalRegistry(q, 1, [document()], [document({ title: 'Stale edit' })])).rejects.toMatchObject({ code: 'LEGAL_REGISTRY_CHANGED' });
    expect((await readCompanyLegalRegistry(q, 2))[0].title).toBe('Another organization');
  });

  it('keeps copied-original lineage immutable while permitting a structurally identical metadata edit', async () => {
    await organization(1); await db.exec(migration);
    const sourceOriginal = { registryId: 'legal_source', vaultDocumentId: PROGRAM, programId: PROGRAM, version: '1', contentHash: HASH };
    const before = document({ sourceOriginal });
    await syncCompanyLegalRegistry(q, 1, [], [before]);
    const after = { ...before, title: 'Reviewed inventory title', sourceOriginal: { ...sourceOriginal } };
    await syncCompanyLegalRegistry(q, 1, [before], [after]);
    expect(await readCompanyLegalRegistry(q, 1)).toEqual([after]);
    await expect(syncCompanyLegalRegistry(q, 1, [after], [{ ...after, sourceOriginal: undefined }])).rejects.toMatchObject({ code: 'LEGAL_REGISTRY_IDENTITY_CHANGED' });
    await expect(db.query("UPDATE company_legal_registry SET document=jsonb_set(document,'{sourceOriginal,contentHash}',to_jsonb($1::text)) WHERE organization_id=1", ['b'.repeat(64)])).rejects.toThrow(/immutable/);
  });

  it('retains disposal controls until pending deletion, current platform scope and no legal hold', async () => {
    await organization(1, [document()]); await db.exec(migration);
    await expect(db.query('DELETE FROM company_legal_registry WHERE organization_id=1')).rejects.toThrow(/eligible tenant purge/);
    await db.exec("UPDATE organizations SET status='pending_deletion'; INSERT INTO vault.legal_holds VALUES(1,NULL)");
    await expect(db.query('DELETE FROM company_legal_registry WHERE organization_id=1')).rejects.toThrow(/eligible tenant purge/);
    await db.exec("UPDATE vault.legal_holds SET lifted_at=now(); SET app.rls_enforce='on'; SET app.current_user_role='admin'");
    await expect(db.query('DELETE FROM company_legal_registry WHERE organization_id=1')).rejects.toThrow(/platform purge scope/);
    await db.exec("SET app.current_user_role='app_super_admin'; DELETE FROM company_legal_registry WHERE organization_id=1");
    expect(await readCompanyLegalRegistry(q, 1)).toEqual([]);
  });

  it('enforces registry applicability through ordinary placement and approved Vault transmission without any settings array', async () => {
    await organization(1, [document()]); await db.exec(migration);
    const target = { programId: PROGRAM, agency: 'EMA', country: 'EU', submissionType: 'EU_CTA' };
    expect(await companyLegalVaultTargetRefusal(q, 1, VAULT, target)).toMatch(/agency/);
    await db.query('INSERT INTO vault.documents(id,organization_id,program_id,document_code,content_hash,version) VALUES($1,1,$2,\'authorization\',$3,\'1\')', [VAULT, PROGRAM, HASH]);
    await db.query('INSERT INTO canonical_documents VALUES(\'canonical\',1,$1::jsonb,\'approved\',$2,now())', [JSON.stringify({ vault_documents: { nativeId: VAULT } }), HASH]);
    expect(await vaultVersionNotTransmittable(q, 1, VAULT, HASH, target)).toMatch(/agency/);
    expect(await vaultVersionNotTransmittable(q, 1, VAULT, HASH, { programId: PROGRAM, agency: 'FDA', country: 'US', submissionType: 'US_IND' })).toBeNull();
  });
});
