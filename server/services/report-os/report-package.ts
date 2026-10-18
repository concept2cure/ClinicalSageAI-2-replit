/** Report copies and selected unchanged legal originals; this archive asserts no agency acceptance. */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { z } from 'zod';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '../../../shared/company-documents';
import { companyLegalDocumentRefusal } from '../../../shared/company-documents';
import { stableStringify } from '../../../shared/canonical-json';
import { getMaxGovernedExportBytes } from '../export/governedExportConsequence';
import type { ReportPackPdfConstituent } from './pdf/bundle-pdf';
import type { VaultVersionLifecycle } from '../vault/vault-lifecycle';

export const reportPackageInputSchema = z.object({
  legalDocumentIds: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  variantId: z.string().uuid().optional(),
}).strict().refine(input => new Set(input.legalDocumentIds).size === input.legalDocumentIds.length,
  'Select each legal document only once.');

export class ReportPackageError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'ReportPackageError'; }
}

export interface ReportLegalInventoryEntry {
  registryId: string;
  title: string;
  kind: string;
  programId: string;
  vaultDocumentId: string;
  version: string;
  sourceSha256: string;
  shippedSha256: string;
  path: string;
  byteLength: number;
  agencies: string[];
  countries: string[];
  submissionTypes: string[];
  language: string;
  effectiveOn: string | null;
  expiresOn: string | null;
  approval: { verdict: 'current-approved-exact-version'; checkedAt: string; canonicalId: string; stage: string;
    signatureRef: string | null; signedAt: string | null; manifestation: VaultVersionLifecycle['approval'] };
  cryptographicSignatureValidation: 'not-performed-by-this-export';
  embeddedSignature: 'present' | 'absent';
  registration: Omit<CompanyLegalDocument, 'transmitRefusal'>;
  registrationSha256: string;
}
export interface ReportLegalOriginal { document: CompanyLegalDocument; inventory: ReportLegalInventoryEntry; bytes: Buffer; fingerprint: string }
export interface ReportPackageBranding { applied: boolean; revision?: number; profileHash?: string; renderer?: string; variantId?: string;
  selection?: 'organization-default' | 'explicit-variant';
  /** Presentation-only snapshot: never includes the tenant's private legal registry. */
  presentation?: CompanyDocumentProfile }
export interface ReportPackageManifest {
  version: 1;
  exportId: string;
  exportedAt: string;
  bundleId: string;
  bundleName: string;
  purpose: 'retained-reports-with-selected-legal-originals';
  notice: string;
  branding: ReportPackageBranding;
  reports: { path: string; sha256: string; byteLength: number; constituents: ReportPackPdfConstituent[] };
  legalDocuments: ReportLegalInventoryEntry[];
  packageContentSha256: string;
  packageContentHashPolicy: string;
  exactZipHashLocation: string;
}
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Report companions are explicit copies, not an agency-specific filing decision. */
export function reportLegalRefusal(document: CompanyLegalDocument): string | null {
  return companyLegalDocumentRefusal(document, { programId: document.programId,
    agency: document.agencies[0], country: document.countries[0], submissionType: document.submissionTypes[0] });
}

export function requireReportPackageSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength > getMaxGovernedExportBytes()) {
    throw new ReportPackageError(413, 'REPORT_PACKAGE_TOO_LARGE', 'The selected reports and legal originals exceed the governed export size limit. Select fewer companions or create smaller report bundles. Nothing was exported.');
  }
}

export async function buildReportLegalPackage(input: {
  exportId: string; exportedAt: string; bundleId: string; bundleName: string; branding: ReportPackageBranding;
  reportPdf: Buffer; constituents: ReportPackPdfConstituent[]; legalOriginals: ReportLegalOriginal[];
}) {
  if (!input.legalOriginals.length) throw new ReportPackageError(400, 'REPORT_PACKAGE_LEGAL_SELECTION_REQUIRED', 'Select the legal originals to accompany these reports.');
  requireReportPackageSize(input.reportPdf.length + input.legalOriginals.reduce((sum, item) => sum + item.bytes.length, 0));
  const zip = new JSZip();
  const reportPath = 'reports/report-pack.pdf';
  zip.file(reportPath, input.reportPdf);
  const paths = new Set([reportPath]);
  for (const original of input.legalOriginals) {
    if (paths.has(original.inventory.path) || !/^legal\/\d+-[a-f\d-]{36}\.pdf$/i.test(original.inventory.path)
      || !originalInventoryMatches(original)) {
      throw new ReportPackageError(409, 'REPORT_LEGAL_ORIGINAL_CHANGED', 'A selected legal original or its export identity could not be verified. Nothing was exported.');
    }
    paths.add(original.inventory.path);
    zip.file(original.inventory.path, original.bytes);
  }
  const reports = { path: reportPath, sha256: digest(input.reportPdf), byteLength: input.reportPdf.length, constituents: input.constituents };
  const content = { exportId: input.exportId, exportedAt: input.exportedAt, bundleId: input.bundleId, bundleName: input.bundleName,
    branding: input.branding, reports, legalDocuments: input.legalOriginals.map(item => item.inventory) };
  const manifest: ReportPackageManifest = { version: 1, ...content,
    purpose: 'retained-reports-with-selected-legal-originals',
    notice: 'Reports retain their individual status, signatures and seal disclosures. Legal originals are unchanged, explicitly selected copies. This archive has no independent approval and makes no agency acceptance or legal-completeness determination.',
    packageContentSha256: digest(stableStringify(content)),
    packageContentHashPolicy: 'SHA-256 of canonical export identity, branding, report digest/constituents and legal inventory with exact source/shipped digests.',
    exactZipHashLocation: 'The exact ZIP SHA-256 is recorded in the chained export audit and X-Export-Sha256 response header; it cannot be embedded in the ZIP it hashes.',
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  requireReportPackageSize(input.reportPdf.length + input.legalOriginals.reduce((sum, item) => sum + item.bytes.length, 0) + manifestBytes.length);
  zip.file('manifest.json', manifestBytes);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  requireReportPackageSize(bytes.length);
  const actual = await JSZip.loadAsync(bytes);
  for (const [path, hash] of [[reportPath, reports.sha256], ['manifest.json', digest(manifestBytes)], ...manifest.legalDocuments.map(item => [item.path, item.sourceSha256])]) {
    const member = actual.file(path);
    if (!member || digest(await member.async('nodebuffer')) !== hash) throw new ReportPackageError(409, 'REPORT_PACKAGE_INTEGRITY_FAILED', 'The final archive did not preserve its selected content. Nothing was exported.');
  }
  return { bytes, sha256: digest(bytes), manifest, manifestSha256: digest(manifestBytes) };
}

function originalInventoryMatches(original: ReportLegalOriginal): boolean {
  const { inventory, document, bytes } = original;
  return digest(bytes) === inventory.sourceSha256 && inventory.shippedSha256 === inventory.sourceSha256 &&
    bytes.length === inventory.byteLength && inventory.registryId === document.id &&
    inventory.vaultDocumentId === document.vaultDocumentId && inventory.sourceSha256 === document.contentHash &&
    inventory.version === document.version && inventory.programId === document.programId &&
    digest(stableStringify(inventory.registration)) === inventory.registrationSha256;
}
