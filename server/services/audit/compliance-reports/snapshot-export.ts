/**
 * Convert a retained, platform-sealed JSON snapshot without running its SQL again.
 * Authorization belongs to the route; this boundary verifies the v2 HMAC, tenant,
 * document shape and the manifest's claims before any values can be exported.
 */
import { z } from 'zod';
import crypto from 'node:crypto';
import { stableStringify } from '../../../../shared/canonical-json';
import { formatAuditExportCsv, sealManifestV2, sha256Hex, verifySignedAuditExport, type ExportManifest, type SignedAuditExport } from '../signedAuditExport';
import type { ResolvedExportSigningKey } from '../auditExportKeyPosture';
import { buildSignedReport, type ComplianceReportManifest, type SignedReport } from './signed-report';

const text = z.string();
const period = z.object({ from: text.nullable(), to: text, kind: z.enum(['range', 'as-of']) });
const report = z.object({ id: text.min(1), title: text.min(1), version: z.literal(1) });
const chain = z.object({
  ok: z.boolean().nullable(), scope: z.enum(['integrity-checks', 'not-checked']),
  rowsChecked: z.number().int().nonnegative().optional(), reason: text.optional(),
  checks: z.object({ total: z.number().int().nonnegative(), intact: z.number().int().nonnegative(), broken: z.number().int().nonnegative(), notVerified: z.number().int().nonnegative() }).optional(),
});
const sectionClaim = z.object({ key: text.min(1), rowCount: z.number().int().nonnegative(), truncated: z.boolean() });
const document = z.object({
  report, organizationId: z.number().int().positive(), period, generatedAt: text.min(1), chain,
  sections: z.array(sectionClaim.extend({
    title: text, columns: z.array(z.object({ key: text.min(1), label: text })),
    rows: z.array(z.record(z.unknown())), notes: z.array(text).optional(),
  })), notRecorded: z.array(text),
});
const packageShape = z.object({
  data: text.max(5_000_000), signature: text.regex(/^[a-f0-9]{64}$/),
  manifest: z.object({
    kind: z.literal('compliance-report'), format: z.literal('json'), manifestVersion: z.literal(2),
    exportId: text.min(1), dataHash: text.regex(/^[a-f0-9]{64}$/), hashAlgorithm: z.literal('SHA-256'),
    signingKeyId: text.min(1), organizationId: z.number().int().positive(), report, period,
    generatedAt: text.min(1), generatedBy: text, generatedByRole: text, sections: z.array(sectionClaim),
    chainAtGeneration: chain, basis: z.array(text),
    compliance: z.object({ standard: text, section: text, description: text }),
  }).passthrough(),
});
const auditPackageShape = z.object({
  data: text.max(5_000_000), signature: text.regex(/^[a-f0-9]{64}$/),
  manifest: z.object({
    format: z.literal('json'), manifestVersion: z.literal(2), exportId: text.min(1),
    dataHash: text.regex(/^[a-f0-9]{64}$/), hashAlgorithm: z.literal('SHA-256'), signingKeyId: text.min(1),
    exportSource: z.literal('Concept2Cure / Concept2Cure Platform'),
    queryFilters: z.object({ organizationId: z.number().int().positive() }).passthrough(),
    exportedAt: text.min(1), exportedBy: text, exportedByRole: text,
    rowCount: z.number().int().nonnegative(), truncated: z.boolean(),
    chainIntegrity: z.object({ status: z.enum(['intact', 'broken', 'unverified', 'unavailable']), verifiedAt: text,
      totalEntries: z.number().int().nonnegative(), brokenLinks: z.number().int().nonnegative(),
    }).passthrough(),
    compliance: z.object({ standard: text, section: text, description: text }).passthrough(),
  }).passthrough(),
});

export class SavedReportExportError extends Error {
  constructor(public readonly status: 400 | 403, public readonly code: string, message: string) { super(message); }
}

export function exportSavedReportCsv(raw: unknown, orgId: number, signingKey: ResolvedExportSigningKey): SignedReport {
  const parsed = packageShape.safeParse(raw);
  if (!parsed.success) throw new SavedReportExportError(400, 'BAD_REPORT_SNAPSHOT', 'A saved, sealed JSON compliance report is required.');
  const source = parsed.data;
  if (source.manifest.organizationId !== orgId) throw new SavedReportExportError(403, 'REPORT_SNAPSHOT_TENANT_MISMATCH', 'The saved report belongs to another organisation.');
  if (!verifySignedAuditExport(source.data, source.manifest as never, source.signature).valid) {
    throw new SavedReportExportError(400, 'REPORT_SNAPSHOT_INVALID', 'The saved report seal does not verify. Nothing was exported.');
  }
  let json: unknown;
  try { json = JSON.parse(source.data); } catch { throw new SavedReportExportError(400, 'BAD_REPORT_SNAPSHOT', 'The saved report is not a JSON report snapshot.'); }
  const validated = document.safeParse(json);
  if (!validated.success) throw new SavedReportExportError(400, 'BAD_REPORT_SNAPSHOT', 'The saved report has an unsupported document shape.');
  const data = validated.data;
  const manifest = source.manifest as ComplianceReportManifest;
  const claims = data.sections.map(({ key, rowCount, truncated }) => ({ key, rowCount, truncated }));
  const mismatch = data.organizationId !== orgId ||
    stableStringify(data.report) !== stableStringify(manifest.report) ||
    stableStringify(data.period) !== stableStringify(manifest.period) ||
    data.generatedAt !== manifest.generatedAt ||
    stableStringify(data.chain) !== stableStringify(manifest.chainAtGeneration) ||
    stableStringify(claims) !== stableStringify(manifest.sections) ||
    new Set(data.sections.map((s) => s.key)).size !== data.sections.length ||
    data.sections.some((s) => s.rowCount !== s.rows.length || new Set(s.columns.map((c) => c.key)).size !== s.columns.length);
  if (mismatch) throw new SavedReportExportError(400, 'REPORT_SNAPSHOT_INVALID', 'The saved report document does not match its sealed manifest.');
  return buildSignedReport(data, {
    format: 'csv', generatedBy: manifest.generatedBy, generatedByRole: manifest.generatedByRole,
    basis: manifest.basis, chain: data.chain, signingKey,
    sourceExport: { exportId: manifest.exportId, dataHash: manifest.dataHash, format: 'json' },
  });
}

/** The audit-trail catalog entry uses the existing signed audit export shape. */
export function exportSavedAuditCsv(
  raw: unknown, orgId: number, signingKey: ResolvedExportSigningKey, actor: { generatedBy: string; role: string },
): SignedAuditExport {
  const parsed = auditPackageShape.safeParse(raw);
  if (!parsed.success) throw new SavedReportExportError(400, 'BAD_REPORT_SNAPSHOT', 'A saved, sealed JSON audit export is required.');
  const source = parsed.data;
  if (source.manifest.queryFilters.organizationId !== orgId) throw new SavedReportExportError(403, 'REPORT_SNAPSHOT_TENANT_MISMATCH', 'The saved report belongs to another organisation.');
  if (!verifySignedAuditExport(source.data, source.manifest as never, source.signature).valid) {
    throw new SavedReportExportError(400, 'REPORT_SNAPSHOT_INVALID', 'The saved report seal does not verify. Nothing was exported.');
  }
  let json: unknown;
  try { json = JSON.parse(source.data); } catch { throw new SavedReportExportError(400, 'BAD_REPORT_SNAPSHOT', 'The saved audit export is not a JSON snapshot.'); }
  const validated = z.array(z.record(z.unknown())).safeParse(json);
  if (!validated.success || validated.data.length !== source.manifest.rowCount || validated.data.some((r) =>
    !['audit_events', 'audit_logs'].includes(String(r.source)) || Number(r.organization_id) !== orgId)) {
    throw new SavedReportExportError(400, 'REPORT_SNAPSHOT_INVALID', 'The saved audit rows do not match their sealed manifest and organisation.');
  }
  const data = formatAuditExportCsv(validated.data);
  const original = source.manifest as ExportManifest;
  const { exportRecord, ...claims } = original;
  const exportId = `AUDIT-EXPORT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const { manifest, signature } = sealManifestV2({
    ...claims, exportId, format: 'csv', dataHash: sha256Hex(data), exportedAt: new Date().toISOString(),
    exportedBy: actor.generatedBy, exportedByRole: actor.role,
    sourceExport: { exportId: original.exportId, dataHash: original.dataHash, format: 'json' as const, exportedAt: original.exportedAt,
      ...(exportRecord ? { exportRecord } : {}) },
  }, signingKey);
  return { data, manifest, signature, filename: `audit_export_${exportId}.csv`, contentType: 'text/csv; charset=utf-8' };
}
