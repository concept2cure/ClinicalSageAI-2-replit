import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
// governedExportConsequence's only dependency: the governance registration
// helper (which normally opens a DB transaction). Replace it so we can assert
// what the delivered-artifact hash gets threaded into, without a database.
vi.mock('../../compute/artifactWriteback', () => ({
  registerArtifactWithGovernance: vi.fn(),
}));

// documentExportService's DB + side-effect dependencies for assembleECTDPackage.
const { mockPool } = vi.hoisted(() => ({ mockPool: { query: vi.fn() } }));
vi.mock('../../../db.js', () => ({ pool: mockPool, getPool: () => mockPool }));
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../documentQuality/pdfValidationAttachment', () => ({
  appendVeraPdfValidation: vi.fn(
    async ({ existingValidationReport }: any) => existingValidationReport
  ),
}));

import { createGovernedExportConsequence } from '../governedExportConsequence';
import { registerArtifactWithGovernance } from '../../compute/artifactWriteback';
import { assembleECTDPackage } from '../../documentExportService';

describe('Finding 5 — governed export integrity hash covers the DELIVERED bytes', () => {
  beforeEach(() => {
    (registerArtifactWithGovernance as any).mockReset();
    (registerArtifactWithGovernance as any).mockResolvedValue({
      artifactId: 'artifact_test',
      version: 1,
      artifactTitle: 'X',
      artifactStatus: 'draft',
      placementState: 'unplaced',
      provenanceEventId: 'prov_test',
      auditId: 'audit_test',
    });
  });

  it('returns and persists sha256 of input.binaryOutput, not of the source content', async () => {
    // Source-content JSON deliberately differs from the delivered binary bytes,
    // so a hash over the source can never accidentally equal the delivered hash.
    const contentForArtifact = JSON.stringify({ sections: ['s1', 's2'] });
    const binaryOutput = Buffer.from('%PDF-1.7 delivered-bytes-not-the-source', 'binary');

    const deliveredSha256 = crypto
      .createHash('sha256')
      .update(binaryOutput)
      .digest('hex');
    const sourceSha256 = crypto
      .createHash('sha256')
      .update(contentForArtifact)
      .digest('hex');
    expect(deliveredSha256).not.toBe(sourceSha256); // guard: the two really differ

    const result = await createGovernedExportConsequence({
      organizationId: 1,
      projectId: 2,
      userId: 3,
      title: 'Governed PDF Export',
      contentForArtifact,
      sourceType: 'export_pdf',
      backendRoute: 'POST /api/test/export/pdf',
      binaryOutput,
      mimeType: 'application/pdf',
      filename: 'export.pdf',
    });

    // The record's integrity hash must cover the delivered file's bytes.
    expect(result.delivered_artifact_sha256).toBe(deliveredSha256);
    expect(result.delivered_artifact_sha256).not.toBe(sourceSha256);

    // ...and it must equal a hash recomputed over the ACTUAL delivered payload
    // (base64 of downloadable_output_ref), proving the record verifies the file.
    const recovered = Buffer.from(result.downloadable_output_ref.data, 'base64');
    const recoveredSha256 = crypto.createHash('sha256').update(recovered).digest('hex');
    expect(result.delivered_artifact_sha256).toBe(recoveredSha256);

    // The delivered hash is also persisted into the governance/audit metadata
    // (alongside — not replacing — the source-content provenance).
    const passed = (registerArtifactWithGovernance as any).mock.calls[0][0];
    expect(passed.content).toBe(contentForArtifact); // source provenance preserved
    expect(passed.metadata.deliveredArtifactSha256).toBe(deliveredSha256);
    expect(passed.auditMetadata.deliveredArtifactSha256).toBe(deliveredSha256);
  });
});

describe('Finding 6 — eCTD checksum ↔ bytes ↔ mimeType ↔ extension are consistent', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockImplementation((sql: unknown) => {
      const s = String(sql);
      if (s.includes('concept2cure_artifacts') || s.includes('FROM project_sections')) {
        return Promise.resolve({
          rows: [
            {
              sectionCode: '3.2.S',
              section_code: '3.2.S',
              title: 'Drug Substance',
              content: '# Drug Substance\nSource markdown text — not a PDF.',
              status: 'final',
              updatedAt: '2026-01-01',
              updated_at: '2026-01-01',
              version: '1.0',
            },
          ],
        });
      }
      if (s.includes('FROM projects')) {
        return Promise.resolve({
          rows: [{ name: 'Test Project', description: '', metadata: { submissionType: 'IND' } }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('does NOT advertise application/pdf + a checksum computed over non-PDF source', async () => {
    const res = await assembleECTDPackage({
      projectId: 1,
      organizationId: 1,
      userId: 1,
      sequenceNumber: '0000',
      submissionType: 'IND',
      lifecycleOperation: 'new',
      region: 'us',
    });

    expect(res.success).toBe(true);
    expect(res.files.length).toBe(1);
    const f = res.files[0];

    const sourceText = '# Drug Substance\nSource markdown text — not a PDF.';
    const emittedBytes = Buffer.from(sourceText, 'utf-8');

    // The checksum must be over exactly the bytes that will be filed for this
    // entry (the source text), and size must match those same bytes.
    expect(f.checksum).toBe(crypto.createHash('md5').update(emittedBytes).digest('hex'));
    expect(f.size).toBe(emittedBytes.length);

    // The label must match the bytes: since the emitted bytes are source text
    // (no PDF conversion happens here), the mimeType and extension must be text,
    // NOT a PDF that was never produced. These two assertions fail on the old
    // code, which emitted 'application/pdf' + a '.pdf' path over source bytes.
    expect(f.mimeType).not.toBe('application/pdf');
    expect(f.path.endsWith('.pdf')).toBe(false);
    expect(f.mimeType).toContain('text/plain');
    expect(f.path.endsWith('.txt')).toBe(true);

    // Cross-check the same consistency in the eCTD backbone XML: the
    // <ectd:text mediaType> and <ectd:checksum> describe the same text bytes.
    expect(res.indexXml).toContain('mediaType="text/plain; charset=utf-8"');
    expect(res.indexXml).toContain(`value="${f.checksum}"`);
    expect(res.indexXml).not.toContain('mediaType="application/pdf"');
  });
});
