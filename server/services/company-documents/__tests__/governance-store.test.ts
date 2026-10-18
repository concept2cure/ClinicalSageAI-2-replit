import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
import { companyCapabilities } from '../capabilities';
import { readCompanyPresentationRevision, retainCompanyPresentationRevision } from '../history';

let db: PGlite;
let q: RequestSqlClient;
function profile(revision: number): CompanyDocumentProfile {
  return { version: 1, revision, companyName: 'Recorded company', address: '10 Test Street', contact: '', registrationDetails: '',
    letterhead: globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null, applyToReports: false,
    applyToSubmissionCorrespondence: false, brandingAdopted: true,
    legalDocuments: [{ title: 'PRIVATE LEGAL TITLE', id: 'private' } as CompanyDocumentProfile['legalDocuments'][number]] };
}
beforeAll(async () => {
  db = new PGlite();
  q = db as unknown as RequestSqlClient;
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text NOT NULL);
    CREATE TABLE users(id integer PRIMARY KEY);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds(organization_id integer,lifted_at timestamptz);
    INSERT INTO organizations VALUES(7,'active'),(8,'pending_deletion'),(9,'pending_deletion');
    INSERT INTO users VALUES(3),(4);`);
  await db.exec(await readFile('migrations/20261018_company_document_governance.sql', 'utf8'));
}, 60_000);
afterAll(async () => { await db.close(); });

describe('retained company presentation proof', () => {
  it('retains actual presentation without historical legal metadata and reads its verified hash', async () => {
    await retainCompanyPresentationRevision(q, 7, profile(1), 3, 'Reviewed presentation');
    const saved = await readCompanyPresentationRevision(q, 7, 1);
    expect(saved.companyName).toBe('Recorded company');
    expect(saved.legalDocuments).toEqual([]);
    const stored = await db.query<{ profile: unknown }>('SELECT profile FROM company_document_revisions WHERE organization_id=7 AND revision=1');
    expect(JSON.stringify(stored.rows)).not.toContain('PRIVATE LEGAL TITLE');
  });
  it('accepts the same retained revision but refuses a changed presentation at the same revision', async () => {
    await retainCompanyPresentationRevision(q, 7, profile(2), 3, 'Reviewed presentation');
    await retainCompanyPresentationRevision(q, 7, profile(2), 3, 'Repeated retained proof');
    await expect(retainCompanyPresentationRevision(q, 7, { ...profile(2), companyName: 'Changed after approval' }, 3, 'Overwrite attempt'))
      .rejects.toMatchObject({ code: 'COMPANY_REVISION_CHANGED' });
    expect((await readCompanyPresentationRevision(q, 7, 2)).companyName).toBe('Recorded company');
  });
  it('refuses a retained payload whose checksum does not match', async () => {
    await db.query('INSERT INTO company_document_revisions(organization_id,revision,profile,sha256,created_by,reason) VALUES($1,$2,$3,$4,3,$5)',
      [7, 3, JSON.stringify(profile(3)), 'a'.repeat(64), 'Deliberately invalid proof']);
    await expect(readCompanyPresentationRevision(q, 7, 3)).rejects.toMatchObject({ code: 'COMPANY_REVISION_UNVERIFIED' });
  });
  it('does not return another organization’s revision', async () => {
    await expect(readCompanyPresentationRevision(q, 8, 1)).rejects.toMatchObject({ status: 404 });
  });
  it('database refuses update and ordinary deletion of a retained revision', async () => {
    await retainCompanyPresentationRevision(q, 7, profile(4), 3, 'Retain governed revision');
    await expect(db.query('UPDATE company_document_revisions SET reason=$1 WHERE organization_id=7 AND revision=4', ['Altered reason'])).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM company_document_revisions WHERE organization_id=7 AND revision=4')).rejects.toThrow('immutable');
  });
  it('active legal holds prevent disposal of company presentation snapshots', async () => {
    await retainCompanyPresentationRevision(q, 8, profile(1), 3, 'Retain held revision');
    await db.query('INSERT INTO vault.legal_holds(organization_id) VALUES(8)');
    await expect(db.query('DELETE FROM company_document_revisions WHERE organization_id=8')).rejects.toThrow('immutable');
  });
  it('requires canonical platform scope for eligible deletion under enforced RLS', async () => {
    await retainCompanyPresentationRevision(q, 9, profile(1), 3, 'Retain eligible revision');
    await db.query("SELECT set_config('app.rls_enforce','on',false)");
    await expect(db.query('DELETE FROM company_document_revisions WHERE organization_id=9')).rejects.toThrow('platform purge scope');
    await db.query("SELECT set_config('app.current_user_role','app_super_admin',false)");
    await db.query('DELETE FROM company_document_revisions WHERE organization_id=9');
    expect((await db.query('SELECT * FROM company_document_revisions WHERE organization_id=9')).rows).toHaveLength(0);
  });
});

describe('delegated company capabilities', () => {
  it('does not turn brand duties into legal or permission administration', async () => {
    await db.query('INSERT INTO company_document_grants(organization_id,user_id,manage_brand,manage_legal,updated_by) VALUES(7,4,true,false,3)');
    expect(await companyCapabilities(q, 7, 4, 'member')).toEqual({ manageBrand: true, manageLegal: false, managePermissions: false });
    expect(await companyCapabilities(q, 8, 4, 'member')).toEqual({ manageBrand: false, manageLegal: false, managePermissions: false });
    expect(await companyCapabilities(q, 7, 3, 'admin')).toEqual({ manageBrand: true, manageLegal: true, managePermissions: true });
  });
});
