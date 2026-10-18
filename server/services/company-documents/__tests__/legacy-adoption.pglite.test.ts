import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
const scan = vi.hoisted(() => vi.fn());
vi.mock('../../../middleware/uploadSafety', () => ({ assertUploadSafe: scan,
  UploadSafetyError: class UploadSafetyError extends Error {} }));
import { assertLegacyBrandingDecision, readLegacyCompanyPreview, validatedLegacyCandidate } from '../legacy-adoption';

let db: PGlite;
let q: RequestSqlClient;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nN0AAAAASUVORK5CYII=';
const profile: CompanyDocumentProfile = { version: 1, revision: 1, companyName: 'Recorded company', address: '', contact: '', registrationDetails: '',
  letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false,
  brandingAdopted: false, legalDocuments: [] };
async function store(value: unknown, organizationId = 7) {
  await db.query(`INSERT INTO project_memory_entries(organization_id,category,subcategory,content)
    VALUES($1,'client_branding','settings',$2)`, [organizationId, typeof value === 'string' ? value : JSON.stringify(value)]);
}
beforeAll(async () => {
  db = new PGlite(); q = db as unknown as RequestSqlClient;
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,name text);
    INSERT INTO organizations VALUES(7,'Recorded company'),(8,'Private other company');
    CREATE TABLE project_memory_entries(id serial PRIMARY KEY,organization_id integer,category text,subcategory text,content text,updated_at timestamptz DEFAULT now());`);
}, 60_000);
beforeEach(async () => { await db.exec('TRUNCATE project_memory_entries'); scan.mockReset(); scan.mockResolvedValue(undefined); });
afterAll(async () => { await db.close(); });

describe('controlled adoption of actual legacy branding records', () => {
  it('keeps the recorded company name when the old logo record has an empty name, and copies exact safe logo bytes', async () => {
    await store({ companyName: '', logoBase64: `data:image/png;base64,${png}`, primaryColor: '#123456', headerHtml: '<script>PRIVATE HTML</script>' });
    const preview = await readLegacyCompanyPreview(q, 7);
    expect(preview.candidate?.companyName).toBe('Recorded company');
    expect(preview.candidate?.letterhead.brand.logo?.dataBase64).toBe(png);
    expect(preview.candidate?.letterhead.colors.accent).toBe('123456');
    expect(JSON.stringify(preview)).not.toContain('PRIVATE HTML');
    expect(preview.warnings.join(' ')).toContain('HTML');
    await validatedLegacyCandidate(q, 7, preview.sourceHash!);
    expect(scan).toHaveBeenCalledTimes(1);
  });
  it('refuses an old preview after the legacy record changes', async () => {
    await store({ companyName: 'Initial company' });
    const old = await readLegacyCompanyPreview(q, 7);
    await store({ companyName: 'Changed company' });
    await expect(validatedLegacyCandidate(q, 7, old.sourceHash!)).rejects.toMatchObject({ code: 'LEGACY_BRANDING_CHANGED' });
  });
  it('never fetches legacy URLs or imports active HTML/SVG logos', async () => {
    await store({ logoBase64: 'data:image/svg+xml;base64,PHN2Zz4=', logoUrl: 'http://169.254.169.254/private' });
    const preview = await readLegacyCompanyPreview(q, 7);
    expect(preview.candidate).toBeNull();
    await expect(validatedLegacyCandidate(q, 7, preview.sourceHash!)).rejects.toMatchObject({ code: 'LEGACY_BRANDING_UNSAFE' });
    expect(scan).not.toHaveBeenCalled();
  });
  it('retains first-save protection after a legal inventory change increments the profile revision', async () => {
    await store({ companyName: 'Old stationery company' });
    await expect(assertLegacyBrandingDecision(q, 7, profile)).rejects.toMatchObject({ code: 'LEGACY_BRANDING_REVIEW_REQUIRED' });
    await expect(assertLegacyBrandingDecision(q, 7, profile, 'replace')).resolves.toBeUndefined();
    await expect(assertLegacyBrandingDecision(q, 7, { ...profile, brandingAdopted: true })).resolves.toBeUndefined();
  });
  it('does not reveal another tenant’s branding or refuse a tenant with no legacy record', async () => {
    await store({ companyName: 'Private other company' }, 8);
    expect(await readLegacyCompanyPreview(q, 7)).toEqual({ available: false, sourceHash: null, candidate: null, warnings: [] });
    await expect(assertLegacyBrandingDecision(q, 7, profile)).resolves.toBeUndefined();
  });
  it('does not adopt valid image bytes when the canonical safety scanner refuses them', async () => {
    await store({ logoBase64: `data:image/png;base64,${png}` });
    const preview = await readLegacyCompanyPreview(q, 7);
    scan.mockRejectedValueOnce(new Error('Upload scanner rejected this asset'));
    await expect(validatedLegacyCandidate(q, 7, preview.sourceHash!)).rejects.toThrow('scanner rejected');
  });
});
