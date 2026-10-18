import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import type { CompanyLegalOriginalSource } from '../../../../shared/company-legal-workflows';
import { readCompanyLegalCopySources } from '../../company-documents/company-copy-lineage';
import { companyLegalVaultTargetRefusal, vaultVersionNotTransmittable } from '../vault-lifecycle';

const ORG = 7;
const HASH = 'a'.repeat(64);
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const PRIVATE_PROJECT = '22222222-2222-4222-8222-222222222222';
let pg: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => pg.query<Record<string, unknown>>(sql, params) };
const target = { programId: PROJECT, country: 'US', agency: 'FDA', submissionType: 'IND' };
function document(id = A, overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument {
  return { id: `legal_${id}`, vaultDocumentId: id, title: 'Private legal original title', kind: 'authorization',
    programId: id === A ? PRIVATE_PROJECT : PROJECT, contentHash: HASH, version: '1', agencies: [], countries: [], submissionTypes: [],
    language: 'en', effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01', registeredBy: '3', ...overrides };
}
function ref(id = A): CompanyLegalOriginalSource {
  const source = document(id);
  return { registryId: source.id, vaultDocumentId: id, programId: source.programId, version: source.version, contentHash: HASH };
}
async function register(value: CompanyLegalDocument, organizationId = ORG) {
  await pg.query(`INSERT INTO company_legal_registry(organization_id,id,document) VALUES($1,$2,$3::jsonb)
    ON CONFLICT(organization_id,id) DO UPDATE SET document=excluded.document`, [organizationId, value.id, JSON.stringify(value)]);
}
async function copyAudit(copy = B, source: unknown = ref(A), organizationId = ORG) {
  await pg.query(`INSERT INTO audit_logs(id,tenant_id,table_name,record_id,action,new_values)
    VALUES($1,$2,'vault_document',$3,'vault.document.ingest',$4::json)`, [`audit_${copy}_${organizationId}`, organizationId, copy, JSON.stringify({ contentHash: HASH, companyLegalSource: source })]);
}
async function withdraw(id = A, invalid = false) {
  const workflow = { custodianUserId: null, reminderDays: [], replacementId: null, revokedAt: invalid ? null : '2026-10-18T00:00:00Z', revokedBy: '3', revocationReason: 'Private legal reason',
    authority: null, signatureEvidence: invalid ? { result: 'invalid' } : null, translationOfId: null, certifiedTranslationEvidence: null, updatedAt: '2026-10-18T00:00:00Z', updatedBy: '3' };
  await register({ ...document(id), active: false, workflow } as CompanyLegalDocument);
}
const transmit = (id = B) => vaultVersionNotTransmittable(q, ORG, id, HASH);
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(`CREATE SCHEMA vault;
    CREATE TABLE vault.documents(id uuid PRIMARY KEY,organization_id integer,program_id uuid,version text,content_hash text,document_code text,supersedes_id uuid,deleted_at timestamptz);
    CREATE TABLE canonical_documents(canonical_id text PRIMARY KEY,organization_id integer,stage text,content_hash text,source_refs jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE company_legal_registry(organization_id integer,id text,document jsonb,PRIMARY KEY(organization_id,id));`);
});
beforeEach(async () => {
  await pg.exec('DELETE FROM audit_logs; DELETE FROM company_legal_registry; DELETE FROM canonical_documents; DELETE FROM vault.documents;');
  for (const id of [A, B, C]) {
    const source = document(id);
    await pg.query(`INSERT INTO vault.documents(id,organization_id,program_id,version,content_hash,document_code) VALUES($1::uuid,$2,$3,'1',$4,$1::text)`, [id, ORG, source.programId, HASH]);
    await pg.query(`INSERT INTO canonical_documents(canonical_id,organization_id,stage,content_hash,source_refs) VALUES($1,$2,'approved',$3,$4::jsonb)`, [id, ORG, HASH, JSON.stringify({ vault_documents: { nativeId: id } })]);
  }
  await register(document());
});
afterAll(async () => pg?.close());
describe('immutable company-original copy ancestry at canonical Vault gates', () => {
  it('blocks a previously approved copy after its exact private original is archived and revoked', async () => {
    await copyAudit(); await register(document(B, { sourceOriginal: ref(A) }));
    expect(await transmit()).toBeNull();
    await withdraw();
    const refusal = await transmit();
    expect(refusal).toMatch(/source original.*revoked/i);
    for (const privateValue of [A, PRIVATE_PROJECT, HASH, 'Private legal']) expect(refusal).not.toContain(privateValue);
    expect(await companyLegalVaultTargetRefusal(q, ORG, B, target, HASH)).toBe(refusal);
  });
  it('follows multiple explicit copy generations, including an unregistered copy left after a partial 201', async () => {
    await copyAudit(); await register(document(B, { sourceOriginal: ref(A) })); await copyAudit(C, ref(B));
    expect(await transmit(C)).toBeNull();
    await withdraw();
    expect(await transmit(C)).toMatch(/revoked/);
    expect(await companyLegalVaultTargetRefusal(q, ORG, C, target, HASH)).toMatch(/revoked/);
  });
  it('propagates a recorded invalid signature finding without transferring the original approval', async () => {
    await copyAudit();
    await pg.query("UPDATE canonical_documents SET stage='draft' WHERE canonical_id=$1", [B]);
    expect(await transmit()).toMatch(/draft, not approved/);
    expect(await companyLegalVaultTargetRefusal(q, ORG, B, target, HASH)).toBeNull();
    await pg.query("UPDATE canonical_documents SET stage='approved' WHERE canonical_id=$1", [B]);
    await withdraw(A, true);
    expect(await transmit()).toMatch(/invalid signature/);
  });
  it('does not infer lineage from an unrelated upload with identical bytes', async () => {
    await withdraw();
    expect(await transmit()).toBeNull();
  });
  it('does not treat archived source metadata alone as withdrawal of an independently approved copy', async () => {
    await copyAudit(); await register(document(A, { active: false }));
    expect(await transmit()).toBeNull();
  });
  it('derives one exact server-only registration reference from legacy audit provenance', async () => {
    await copyAudit(B, { registryId: ref().registryId, vaultDocumentId: A, contentHash: HASH, reason: 'User-requested original copy' });
    expect(await readCompanyLegalCopySources(q, { organizationId: ORG, vaultDocumentId: B, contentHash: HASH })).toEqual([ref()]);
    expect(await transmit(B.toUpperCase())).toBeNull();
    await withdraw(); expect(await transmit(B.toUpperCase())).toMatch(/revoked/);
  });
  it('fails closed if a known copy loses its audit parent or conflicts with it', async () => {
    await register(document(B, { sourceOriginal: ref(A) }));
    expect(await transmit()).toMatch(/could not be verified/);
    await register(document(C)); await copyAudit(B, ref(C));
    expect(await transmit()).toMatch(/could not be verified/);
  });
  it.each(['registry', 'vault', 'hash', 'version'] as const)('fails closed when ancestor %s identity disappears or drifts', async changed => {
    await copyAudit();
    if (changed === 'registry') await pg.exec('DELETE FROM company_legal_registry');
    if (changed === 'vault') await pg.query('DELETE FROM vault.documents WHERE id=$1', [A]);
    if (changed === 'hash') await pg.query('UPDATE vault.documents SET content_hash=$1 WHERE id=$2', ['b'.repeat(64), A]);
    if (changed === 'version') await pg.query("UPDATE vault.documents SET version='2' WHERE id=$1", [A]);
    expect(await transmit()).toMatch(/could not be verified/);
  });
  it('rejects a source registration from another tenant, without disclosing its identity', async () => {
    await pg.exec('DELETE FROM company_legal_registry'); await register(document(), 8); await copyAudit();
    expect(await transmit()).toMatch(/could not be verified/);
    await expect(readCompanyLegalCopySources(q, { organizationId: ORG, vaultDocumentId: B, contentHash: HASH })).rejects.toMatchObject({ code: 'COMPANY_LEGAL_COPY_SOURCE_UNVERIFIED' });
  });
  it('rejects malformed, conflicting and cyclic ancestry instead of choosing an arbitrary parent', async () => {
    await copyAudit(B, { registryId: 'unsafe' }); expect(await transmit()).toMatch(/could not be verified/);
    await pg.exec('DELETE FROM audit_logs'); await copyAudit(); await register(document(C));
    await copyAudit(B, ref(C), ORG + 1);
    await pg.query('UPDATE audit_logs SET tenant_id=$1', [ORG]);
    expect(await transmit()).toMatch(/could not be verified/);
    await pg.exec('DELETE FROM audit_logs'); await copyAudit(); await register(document(B)); await copyAudit(A, ref(B));
    expect(await transmit()).toMatch(/could not be verified/);
  });
  it('allows a normal original with no audit parent, while audit-read failure refuses filing', async () => {
    expect(await transmit()).toBeNull();
    await pg.exec('ALTER TABLE audit_logs RENAME TO unavailable_audit_logs');
    try { expect(await transmit()).toMatch(/could not be verified/); }
    finally { await pg.exec('ALTER TABLE unavailable_audit_logs RENAME TO audit_logs'); }
  });
});
