import { z } from 'zod';
import { COMPANY_LEGAL_KINDS, type CompanyDocumentProfile, type TemplateSpec } from '../../../shared/company-documents';
import { normalizeTemplateSpec } from '../../../shared/templates/template-spec';
import { assertUploadSafe } from '../../middleware/uploadSafety';
import { imageSize } from '../templates/imageSize';

export class CompanyDocumentsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'CompanyDocumentsError';
  }
}

const reason = z.string().trim().min(3).max(2000);
const revision = z.number().int().nonnegative();
const text = (max: number) => z.string().trim().max(max);
const scope = z.array(z.string().trim().min(1).max(100)).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.').nullable();

export const profileUpdateSchema = z.object({
  expectedRevision: revision, reason,
  companyName: text(300), address: text(2000), contact: text(2000), registrationDetails: text(2000),
  letterhead: z.record(z.unknown()), importedFrom: text(500).nullable(),
  applyToReports: z.boolean(), applyToSubmissionCorrespondence: z.boolean(),
}).strict();

export const legalRegistrationSchema = z.object({
  expectedRevision: revision, reason, title: text(500).min(1), kind: z.enum(COMPANY_LEGAL_KINDS),
  programId: z.string().uuid(), vaultDocumentId: z.string().uuid(),
  agencies: scope, countries: scope, submissionTypes: scope,
  language: z.string().trim().min(1).max(50),
  effectiveOn: date, expiresOn: date,
}).strict().refine(value => !value.effectiveOn || !value.expiresOn || value.effectiveOn <= value.expiresOn, {
  message: 'The expiry date must be on or after the effective date.', path: ['expiresOn'],
});

export const archiveSchema = z.object({ expectedRevision: revision, reason }).strict();

export function parseCompanyInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CompanyDocumentsError(400, 'INVALID_COMPANY_DOCUMENTS', result.error.issues.map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; '));
  }
  return result.data;
}

export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

function decodedLogo(value: Record<string, unknown>) {
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType : '';
  if (!LOGO_EXTENSIONS[mimeType] || typeof value.dataBase64 !== 'string' || !value.dataBase64.length ||
      value.dataBase64.length > Math.ceil(COMPANY_LOGO_MAX_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64)) {
    throw new CompanyDocumentsError(400, 'INVALID_LOGO', 'Use a base64 PNG, JPEG or GIF logo of at most 2 MB.');
  }
  const bytes = Buffer.from(value.dataBase64, 'base64');
  if (!bytes.length || bytes.length > COMPANY_LOGO_MAX_BYTES) throw new CompanyDocumentsError(400, 'LOGO_TOO_LARGE', 'The logo must be at most 2 MB.');
  return { bytes, mimeType, extension: LOGO_EXTENSIONS[mimeType] };
}

function rasterSignatureMatches(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
}

function assertLogoDimensions(bytes: Buffer): void {
  const dimensions = imageSize(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width > 4096 ||
      dimensions.height > 4096 || dimensions.width * dimensions.height > 16_000_000) {
    throw new CompanyDocumentsError(400, 'LOGO_DIMENSIONS', 'Use a logo no larger than 4096 pixels per side and 16 megapixels.');
  }
}

/** Raster bytes only. Never render an uploaded SVG, URL or HTML in a letterhead. */
export function companyLogoBytes(logo: unknown): { bytes: Buffer; mimeType: string; extension: string } | null {
  if (logo == null) return null;
  if (typeof logo !== 'object' || Array.isArray(logo)) throw new CompanyDocumentsError(400, 'INVALID_LOGO', 'Use a PNG, JPEG or GIF logo.');
  const decoded = decodedLogo(logo as Record<string, unknown>);
  if (!rasterSignatureMatches(decoded.bytes, decoded.mimeType)) {
    throw new CompanyDocumentsError(400, 'INVALID_LOGO', 'The logo bytes do not match its image type.');
  }
  assertLogoDimensions(decoded.bytes);
  return decoded;
}

export async function validateCompanyLetterhead(value: unknown): Promise<TemplateSpec> {
  const raw = value as Record<string, any> | null;
  const logo = companyLogoBytes(raw?.brand?.logo);
  if (logo) await assertUploadSafe(logo.bytes, logo.mimeType, `company-logo.${logo.extension}`);
  const spec = normalizeTemplateSpec(value);
  for (const field of [spec.header?.text, spec.footer?.text, spec.brand.organizationName, spec.brand.confidentialityNotice]) {
    if (field && field.length > 4000) throw new CompanyDocumentsError(400, 'LETTERHEAD_TEXT_TOO_LONG', 'Letterhead text must be at most 4000 characters per field.');
  }
  if (spec.footer?.pageNumberFormat && spec.footer.pageNumberFormat.length > 300) {
    throw new CompanyDocumentsError(400, 'LETTERHEAD_TEXT_TOO_LONG', 'The page number format must be at most 300 characters.');
  }
  return spec;
}

export function assertCompanyRevision(profile: CompanyDocumentProfile, expected: number): void {
  if (profile.revision !== expected) throw new CompanyDocumentsError(409, 'REVISION_CONFLICT', 'Company documents changed. Reload the saved profile before applying this edit.');
}
