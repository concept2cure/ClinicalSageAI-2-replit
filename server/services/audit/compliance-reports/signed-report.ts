/**
 * A compliance report as a sealed package: the data (JSON or CSV), a version-2
 * manifest over its exact bytes, and the signature.
 *
 * Sealed by the ONE audit export signer (signedAuditExport.ts sealManifestV2),
 * so `verifySignedAuditExport` — and POST /api/audit/export/verify — checks a
 * report exactly as it checks a signed audit export: SHA-256 of the data
 * against `dataHash`, then the HMAC over the canonical manifest under the key
 * the manifest names.
 *
 * @module server/services/audit/compliance-reports/signed-report
 */
import crypto from 'node:crypto';

import type { ResolvedExportSigningKey } from '../auditExportKeyPosture';
import { sealManifestV2, sha256Hex } from '../signedAuditExport';
import { formatReportCsv } from './csv';
import type { ChainSummary, ReportData, ReportPeriod } from './types';

export type ReportFormat = 'json' | 'csv';

export interface ComplianceReportManifest {
  exportId: string;
  kind: 'compliance-report';
  report: ReportData['report'];
  organizationId: number;
  period: ReportPeriod;
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  format: ReportFormat;
  sections: { key: string; rowCount: number; truncated: boolean }[];
  dataHash: string;
  hashAlgorithm: 'SHA-256';
  chainAtGeneration: ChainSummary;
  basis: string[];
  compliance: { standard: string; section: string; description: string };
  manifestVersion: 2;
  signingKeyId: string;
}

export interface SignedReport {
  data: string;
  manifest: ComplianceReportManifest;
  signature: string;
  filename: string;
  contentType: string;
}

export interface SignedReportOptions {
  format: ReportFormat;
  generatedBy: string;
  generatedByRole: string;
  basis: string[];
  /** What the report says about the audit chain (the same object as `data.chain`). */
  chain: ChainSummary;
  /** The key resolved before the run; resolved here when omitted. */
  signingKey?: ResolvedExportSigningKey;
}

/*
 * What the seal is and who can check it, said plainly (review round 1, DP-48).
 * The signature is an HMAC under a key the platform holds, so only the platform
 * can check it: a reader without that key cannot verify the file alone.
 */
export const VERIFY_INSTRUCTION =
  'The seal is an HMAC-SHA256 under an audit export key the platform holds; manifest.signingKeyId names the key, and ' +
  'manifest.dataHash is the SHA-256 of data. To verify a saved file, a signed-in member of the organisation sends ' +
  '{ data, manifest, signature } to POST /api/audit/export/verify. For a CSV, data is the CSV text exactly as saved, and ' +
  'manifest and signature come from the .manifest.json saved with it. An inspector verifies through the organisation.';

export function buildSignedReport(data: ReportData, opts: SignedReportOptions): SignedReport {
  const body = opts.format === 'csv' ? formatReportCsv(data) : JSON.stringify(data, null, 2);
  const suffix = crypto.randomBytes(4).toString('hex');
  const exportId = `COMPLIANCE-REPORT-${Date.now()}-${suffix}`;
  const unsealed = {
    exportId,
    kind: 'compliance-report' as const,
    report: data.report,
    organizationId: data.organizationId,
    period: data.period,
    generatedAt: data.generatedAt,
    generatedBy: opts.generatedBy,
    generatedByRole: opts.generatedByRole,
    format: opts.format,
    sections: data.sections.map((s) => ({ key: s.key, rowCount: s.rowCount, truncated: s.truncated })),
    dataHash: sha256Hex(body),
    hashAlgorithm: 'SHA-256' as const,
    chainAtGeneration: opts.chain,
    basis: [...opts.basis],
    compliance: {
      standard: '21 CFR Part 11',
      section: '§11.10(e)',
      description: "Compliance report generated from the organisation's records, sealed with the platform's audit export key",
    },
  };
  const { manifest, signature } = sealManifestV2(unsealed, opts.signingKey);
  const span = data.period.from ? `${data.period.from}_${data.period.to}` : data.period.to;
  return {
    data: body,
    manifest,
    signature,
    filename: `${data.report.id}_${span}_${suffix}.${opts.format}`,
    contentType: opts.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
  };
}
