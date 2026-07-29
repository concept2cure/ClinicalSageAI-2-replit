/**
 * Governed Export Behavioral Tests
 *
 * These tests verify runtime behavior of the governed export pipeline:
 * - registerGovernedExport creates all 5 records (artifact, version, provenance, audit, snapshot)
 * - CER v2 PDF/DOCX routes wire through governed export
 * - 510(k) eSTAR route wires through governed export
 * - Created export artifacts appear in project artifact listing
 * - Governance metadata is correctly structured
 *
 * Tests use mocked DB pool to verify actual SQL queries are issued.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock getPool before import ────────────────────────────────────────────────

const { mockClient, mockPool } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    mockClient: client,
    mockPool: {
      connect: vi.fn().mockResolvedValue(client),
      on: vi.fn(),
      query: vi.fn(),
    },
  };
});

vi.mock('../server/db.ts', () => ({
  getPool: () => mockPool,
}));

// ── Import after mock ─────────────────────────────────────────────────────────

import { registerGovernedExport } from '../server/services/compute/exportGovernance';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeExportInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 1,
    projectId: 42,
    userId: 7,
    userName: 'test-user',
    userRole: 'editor',
    title: 'Test CER Export',
    sourceContent:
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
    exportHash: 'abc123def456',
    exportFormat: 'pdf' as const,
    exportFilename: 'test_export.pdf',
    exportFileSize: 12345,
    docType: 'cerv2_cer',
    backendRoute: 'POST /api/cerv2/export/pdf',
    governance: {
      aiGenerated: true,
      humanReviewApproved: false,
    },
    ipAddress: '10.0.0.1',
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ════════════════════════════════════════════════════════════════════════════════

describe('registerGovernedExport — behavioral', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: simulate successful inserts
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('concept2cure_artifacts')) {
        return {
          rows: [{ id: 100, artifact_id: 'artifact_export_test_abc', version: 1 }],
        };
      }
      if (sql.includes('concept2cure_artifact_versions')) {
        return { rows: [{ id: 200 }] };
      }
      return { rows: [] };
    });
  });

  // ── Test 1: Creates all 5 DB records in a transaction ────────────────────

  it('creates artifact + version + provenance + audit + snapshot in a single transaction', async () => {
    const input = makeExportInput();
    const result = await registerGovernedExport(input);

    expect(result).not.toBeNull();

    // Verify transaction lifecycle
    const calls = mockClient.query.mock.calls.map(c => {
      const sql = typeof c[0] === 'string' ? c[0] : '';
      return sql;
    });

    // Must begin and commit
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('COMMIT');

    // Must insert into all 5 tables
    expect(calls.some(s => s.includes('concept2cure_artifacts'))).toBe(true);
    expect(calls.some(s => s.includes('concept2cure_artifact_versions'))).toBe(true);
    expect(calls.some(s => s.includes('concept2cure_provenance_events'))).toBe(true);
    expect(calls.some(s => s.includes('regulatory_audit_logs'))).toBe(true);
    expect(calls.some(s => s.includes('concept2cure_submission_snapshots'))).toBe(true);
  });

  // ── Test 2: Returns correct artifact identity/status ─────────────────────

  it('returns artifactId, version, status, placementState, governance refs', async () => {
    const result = await registerGovernedExport(makeExportInput());

    expect(result).toMatchObject({
      artifactId: expect.stringContaining('artifact_export_'),
      version: 1,
      artifactStatus: 'draft',
      governanceSource: 'export',
      governed: true,
    });
    expect(result!.provenanceEventId).toMatch(/^prov_export_/);
    expect(result!.auditId).toMatch(/^audit_export_/);
    expect(result!.snapshotId).toMatch(/^snap_export_/);
  });

  // ── Test 3: placementState reflects ctdSection presence ──────────────────

  it('sets placementState to "placed" when ctdSection is provided', async () => {
    const result = await registerGovernedExport(makeExportInput({ ctdSection: '2.5' }));
    expect(result!.placementState).toBe('placed');
  });

  it('sets placementState to "unplaced" when no ctdSection', async () => {
    const result = await registerGovernedExport(makeExportInput({ ctdSection: undefined }));
    expect(result!.placementState).toBe('unplaced');
  });

  // ── Test 4: Artifact metadata includes governance source fields ──────────

  it('persists governance source metadata in artifact record', async () => {
    await registerGovernedExport(makeExportInput({ exportFormat: 'docx' }));

    // Find the artifact INSERT call
    const artifactCall = mockClient.query.mock.calls.find(
      c =>
        typeof c[0] === 'string' &&
        c[0].includes('concept2cure_artifacts') &&
        c[0].includes('INSERT')
    );
    expect(artifactCall).toBeDefined();

    // The metadata param is the 9th positional ($9)
    const metadataJson = JSON.parse(artifactCall![1][8]);
    expect(metadataJson).toMatchObject({
      source: 'governed_export',
      governanceSource: 'export',
      exportFormat: 'docx',
      governed: true,
      provenancePresent: true,
      auditPresent: true,
    });
  });

  // ── Test 5: Provenance event carries export details ──────────────────────

  it('creates provenance event with export hash and format details', async () => {
    await registerGovernedExport(makeExportInput({ exportHash: 'sha256_test_hash' }));

    const provCall = mockClient.query.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('concept2cure_provenance_events')
    );
    expect(provCall).toBeDefined();

    // event_action should be governed_pdf_export
    const params = provCall![1];
    expect(params[4]).toBe('governed_pdf_export'); // event_action

    // details JSON should include exportHash
    const details = JSON.parse(params[7]);
    expect(details.exportHash).toBe('sha256_test_hash');
    expect(details.exportFormat).toBe('pdf');
  });

  // ── Test 6: Audit log marks action as EXPORT with GxP relevance ──────────

  it('creates audit log with EXPORT action and is_gxp_relevant=true', async () => {
    await registerGovernedExport(makeExportInput());

    const auditCall = mockClient.query.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('regulatory_audit_logs')
    );
    expect(auditCall).toBeDefined();

    const sql = auditCall![0] as string;
    // The SQL has TRUE for is_gxp_relevant and 'EXPORT' as a literal in the query
    expect(sql).toContain('TRUE');
    expect(sql).toContain('EXPORT');
    expect(sql).toContain('data-change');
  });

  // ── Test 7: Submission snapshot records file metadata ────────────────────

  it('creates submission snapshot with filename/size/export-format action', async () => {
    await registerGovernedExport(
      makeExportInput({
        exportFilename: 'CER_final.pdf',
        exportFileSize: 98765,
        exportFormat: 'pdf',
      })
    );

    const snapCall = mockClient.query.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('concept2cure_submission_snapshots')
    );
    expect(snapCall).toBeDefined();

    const params = snapCall![1];
    // filename
    expect(params[8]).toBe('CER_final.pdf');
    // file_size
    expect(params[9]).toBe(98765);
    // action_type
    expect(params[10]).toBe('export-pdf');
  });

  // ── Test 8: Rollback on failure — returns null, does not throw ───────────

  it('throws on DB failure and issues ROLLBACK', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
      return Promise.reject(new Error('DB connection lost'));
    });

    await expect(registerGovernedExport(makeExportInput())).rejects.toThrow(
      /governed export registration failed/i
    );

    // Verify ROLLBACK was issued
    const rollbackCall = mockClient.query.mock.calls.find(c => c[0] === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
  });

  // ── Test 9: 510(k) eSTAR export governance metadata ─────────────────────

  it('handles 510k eSTAR export type correctly', async () => {
    const result = await registerGovernedExport(
      makeExportInput({
        docType: 'estar_510k',
        exportFormat: 'zip',
        title: '510(k) eSTAR Build — K123456',
        backendRoute: 'POST /api/510k/estar/build',
        ctdSection: '510k',
      })
    );

    expect(result).not.toBeNull();
    expect(result!.placementState).toBe('placed');

    // Verify artifact metadata
    const artifactCall = mockClient.query.mock.calls.find(
      c =>
        typeof c[0] === 'string' &&
        c[0].includes('concept2cure_artifacts') &&
        c[0].includes('INSERT')
    );
    const metadataJson = JSON.parse(artifactCall![1][8]);
    expect(metadataJson.docType).toBe('estar_510k');
    expect(metadataJson.exportFormat).toBe('zip');
    expect(metadataJson.backendRoute).toBe('POST /api/510k/estar/build');
  });

  // ── Test 10: CERV2 ZIP export governance metadata ───────────────────────

  it('handles CERV2 ZIP export type correctly', async () => {
    const result = await registerGovernedExport(
      makeExportInput({
        docType: 'cerv2_510k',
        exportFormat: 'zip',
        title: 'CERV2 ZIP Package',
        backendRoute: 'POST /api/cerv2/export/zip',
        ctdSection: 'm1.5',
      })
    );

    expect(result).not.toBeNull();
    expect(result!.placementState).toBe('placed');

    const artifactCall = mockClient.query.mock.calls.find(
      c =>
        typeof c[0] === 'string' &&
        c[0].includes('concept2cure_artifacts') &&
        c[0].includes('INSERT')
    );
    const metadataJson = JSON.parse(artifactCall![1][8]);
    expect(metadataJson.docType).toBe('cerv2_510k');
    expect(metadataJson.exportFormat).toBe('zip');
    expect(metadataJson.backendRoute).toBe('POST /api/cerv2/export/zip');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Route-level behavioral verification (source analysis)
// ════════════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('CER v2 export routes — governed wiring', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/routes/cerv2-export-routes.ts'), 'utf-8');

  it('imports createGovernedExportConsequence from governed service', () => {
    expect(src).toContain('import { createGovernedExportConsequence }');
    expect(src).toContain('governedExportConsequence');
  });

  it('PDF route calls createGovernedExportConsequence before response', () => {
    const pdfSection = src.split("router.post('/pdf'")[1]?.split("router.post('/docx'")[0] || '';
    expect(pdfSection).toContain('createGovernedExportConsequence');
  });

  it('DOCX route calls createGovernedExportConsequence before response', () => {
    const docxSection = src.split("router.post('/docx'")[1]?.split("router.post('/zip'")[0] || '';
    expect(docxSection).toContain('createGovernedExportConsequence');
  });

  it('sets X-Concept2Cure-Governance-Persistence header to "governed"', () => {
    expect(src).toContain("'X-Concept2Cure-Governance-Persistence', 'governed'");
  });

  it('does not have old "none" governance persistence default', () => {
    expect(src).not.toContain("'X-Concept2Cure-Governance-Persistence', 'none'");
  });

  it('consequence includes sourceType export_pdf and export_docx', () => {
    expect(src).toContain("sourceType: 'export_pdf'");
    expect(src).toContain("sourceType: 'export_docx'");
    expect(src).toContain("sourceType: 'export_zip'");
  });

  it('consequence includes backendRoute for traceability', () => {
    expect(src).toContain("backendRoute: 'POST /api/cerv2/export/pdf'");
    expect(src).toContain("backendRoute: 'POST /api/cerv2/export/docx'");
    expect(src).toContain("backendRoute: 'POST /api/cerv2/export/zip'");
  });
});

describe('510(k) eSTAR build route — governed wiring', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/routes/510k-estar-routes.ts'), 'utf-8');

  it('imports createGovernedExportConsequence', () => {
    expect(src).toContain('import { createGovernedExportConsequence }');
  });

  it('calls createGovernedExportConsequence in build handler', () => {
    expect(src).toContain('createGovernedExportConsequence');
    // Verify it appears after the import (i.e. it's called, not just imported)
    const importIdx = src.indexOf('import { createGovernedExportConsequence }');
    const callIdx = src.indexOf('createGovernedExportConsequence(');
    expect(callIdx).toBeGreaterThan(importIdx);
  });

  it('accepts projectId in request schema', () => {
    expect(src).toContain('projectId:');
  });

  it('consequence sourceType is export_estar_zip', () => {
    expect(src).toContain("'export_estar_zip'");
  });
});

// ProjectWorkspaceShell.tsx was removed in the design-system port (CLAUDE.md).
// These UI-shell assertions move to the Phase 3 workbench when it ships.
describe.skip('UI consequence loop — export artifacts visible in project context', () => {
  const shellSrc = '';

  it('displays "Export" source labels for export-type artifacts', () => {
    // Upstream uses specific source types: export_pdf, export_docx, export_zip, export_estar_zip
    expect(shellSrc).toContain("source === 'export_pdf'");
    expect(shellSrc).toContain("source === 'export_docx'");
    expect(shellSrc).toContain("source === 'export_zip'");
    expect(shellSrc).toContain("source === 'export_estar_zip'");
    // Also supports governed_export as fallback
    expect(shellSrc).toContain("source === 'governed_export'");
  });

  it('shows governed indicator for artifacts with governed metadata', () => {
    expect(shellSrc).toContain('metadata?.governed');
    expect(shellSrc).toContain('Governed');
  });

  it('shows provenance indicator for artifacts with provenancePresent', () => {
    expect(shellSrc).toContain('metadata?.provenancePresent');
    expect(shellSrc).toContain('Prov ✓');
  });

  it('shows audit indicator for artifacts with auditPresent', () => {
    expect(shellSrc).toContain('metadata?.auditPresent');
    expect(shellSrc).toContain('Audit ✓');
  });

  it('has Open, Provenance, Audit, and Place buttons for each artifact', () => {
    // Check for button labels in the Recent Governed Documents section
    expect(shellSrc).toContain('Open');
    expect(shellSrc).toContain('Provenance');
    expect(shellSrc).toContain('Audit');
    expect(shellSrc).toContain('Place');
  });
});

// useDeliverable.ts was removed with the disconnected legacy island in the
// design-system port (CLAUDE.md) — it was unreachable from ZenApp. The
// client-side governed-export consequence loop moves to the Phase 3 workbench
// when it ships. Server-side governed wiring stays covered above.
describe.skip('useDeliverable — governed export consequence loop', () => {
  const src = '';

  it('reads X-Concept2Cure-Artifact-Id from response headers', () => {
    expect(src).toContain("response.headers.get('X-Concept2Cure-Artifact-Id')");
  });

  it('reads governance persistence status from response headers', () => {
    expect(src).toContain('X-Concept2Cure-Governance-Persistence');
  });

  it('invalidates project artifact queries after governed export', () => {
    expect(src).toContain('invalidateQueries');
    expect(src).toContain('/artifacts');
  });

  it('includes governed artifact ID in toast notification', () => {
    expect(src).toContain('Governed artifact');
  });
});
