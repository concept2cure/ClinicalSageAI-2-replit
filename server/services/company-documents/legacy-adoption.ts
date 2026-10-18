import { createHash } from 'node:crypto';
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import { normalizeTemplateSpec } from '../../../shared/templates/template-spec';
import type { RequestSqlClient } from '../../db/requestDb';
import { asSettings } from '../tenant/tenant-settings-writer';
import { companyLogoBytes, CompanyDocumentsError, validateCompanyLetterhead } from './validation';

export type LegacyCompanyCandidate = Pick<CompanyDocumentProfile, 'companyName' | 'address' | 'contact' | 'registrationDetails' | 'letterhead' | 'importedFrom'>;
export interface LegacyCompanyPreview {
  available: boolean;
  sourceHash: string | null;
  candidate: LegacyCompanyCandidate | null;
  warnings: string[];
}
function applyLegacyTextStyle(raw: Record<string, unknown>, letterhead: CompanyDocumentProfile['letterhead']) {
  const color = typeof raw.primaryColor === 'string' ? raw.primaryColor.replace(/^#/, '') : '';
  if (/^[a-f\d]{6}$/i.test(color)) letterhead.colors.accent = color;
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.length <= 100) {
    letterhead.typography.bodyFont = raw.fontFamily.split(',')[0].replaceAll(/['"]/g, '').trim();
  }
  if (typeof raw.watermarkText === 'string') letterhead.brand.confidentialityNotice = raw.watermarkText.slice(0, 4000);
}
/** Read-only, tenant-bound legacy storage. Never fetch an old URL or render HTML. */
export async function readLegacyCompanyPreview(q: RequestSqlClient, organizationId: number): Promise<LegacyCompanyPreview> {
  const { rows } = await q.query(`SELECT pm.id,pm.content,pm.updated_at,o.name AS organization_name
    FROM project_memory_entries pm JOIN organizations o ON o.id=pm.organization_id
    WHERE pm.organization_id=$1 AND pm.category='client_branding' AND pm.subcategory='settings'
    ORDER BY pm.updated_at DESC,pm.id DESC LIMIT 1`, [organizationId]);
  if (!rows.length) return { available: false, sourceHash: null, candidate: null, warnings: [] };
  const row = rows[0];
  const sourceHash = createHash('sha256').update(JSON.stringify({ id: row.id, content: row.content, updatedAt: row.updated_at, organizationName: row.organization_name })).digest('hex');
  let raw: Record<string, unknown>;
  try { raw = asSettings(typeof row.content === 'string' ? JSON.parse(row.content) : row.content); }
  catch { return { available: true, sourceHash, candidate: null, warnings: ['The legacy branding record could not be parsed. Review replacement branding before adoption.'] }; }
  const warnings: string[] = [];
  const text = (key: string, max: number) => typeof raw[key] === 'string' ? String(raw[key]).slice(0, max) : '';
  const letterhead = normalizeTemplateSpec(raw.letterhead);
  const companyName = text('companyName', 300) || String(row.organization_name ?? '').slice(0, 300);
  letterhead.brand.organizationName = companyName;
  applyLegacyTextStyle(raw, letterhead);
  if (raw.logoBase64) {
    const match = typeof raw.logoBase64 === 'string' ? /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z\d+/=]+)$/.exec(raw.logoBase64) : null;
    if (!match) return { available: true, sourceHash, candidate: null, warnings: ['The legacy logo is not a supported embedded PNG, JPEG or GIF. Upload a reviewed replacement.'] };
    letterhead.brand.logo = { mimeType: match[1] as 'image/png' | 'image/jpeg' | 'image/gif', dataBase64: match[2], placement: 'header' };
    try { companyLogoBytes(letterhead.brand.logo); }
    catch { return { available: true, sourceHash, candidate: null, warnings: ['The legacy logo failed image validation. Upload a reviewed replacement.'] }; }
  } else if (raw.logoUrl) warnings.push('The legacy logo URL was not fetched. Upload the original raster logo if needed.');
  if (raw.headerHtml || raw.footerHtml) warnings.push('Legacy HTML headers and footers are not imported. Recreate their text in the designer.');
  if (raw.letterheadUrl) warnings.push('Import the original Word/PDF stationery to review its formatting; the old URL is not imported.');
  return { available: true, sourceHash, warnings, candidate: {
    companyName, address: text('address', 2000), contact: text('contact', 2000),
    registrationDetails: text('registrationDetails', 2000), letterhead,
    importedFrom: `Legacy branding record ${String(row.id)}`,
  } };
}
export async function validatedLegacyCandidate(q: RequestSqlClient, organizationId: number, sourceHash: string) {
  const preview = await readLegacyCompanyPreview(q, organizationId);
  if (!preview.available || preview.sourceHash !== sourceHash) throw new CompanyDocumentsError(409, 'LEGACY_BRANDING_CHANGED', 'Legacy branding changed. Review its current preview before adopting it.');
  if (!preview.candidate) throw new CompanyDocumentsError(422, 'LEGACY_BRANDING_UNSAFE', preview.warnings.join(' '));
  return { ...preview.candidate, letterhead: await validateCompanyLetterhead(preview.candidate.letterhead) };
}
export async function assertLegacyBrandingDecision(q: RequestSqlClient, organizationId: number,
  profile: CompanyDocumentProfile, decision?: 'replace'): Promise<void> {
  if (profile.brandingAdopted || decision === 'replace') return;
  const legacy = await readLegacyCompanyPreview(q, organizationId);
  if (legacy.available) throw new CompanyDocumentsError(409, 'LEGACY_BRANDING_REVIEW_REQUIRED', 'Existing company branding was found. Review and adopt it, or explicitly choose replacement branding before activating this design.');
}
