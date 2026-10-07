/**
 * D4 existing-tool integration regression: the registered, confirmed handler
 * passes verified upload bytes and active context into the canonical derived
 * save, then relays its actual capture/audit receipt without qualifying data.
 * Upload persistence and workbook editing are explicit doubles here. These
 * tests do not establish workbook calculations, SQL atomicity or live RLS.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), apply: vi.fn(),
  resolveSignerOrgRole: vi.fn(async () => 'member'),
}));

// Same confirmed-member role seam as document-intake-tools.test.ts; the real
// registration wrapper still applies its confirmation/editor checks.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../uploaded-file-access.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../uploaded-file-access.js')>()),
  loadUploadedFile: h.load,
  saveDerivedUpload: h.save,
}));
vi.mock('../../documentIntelligence/spreadsheetService.js', () => ({ applyWorkbookEdits: h.apply }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';

const PROGRAM = 'a1111111-1111-4111-8111-111111111111';
const FOREIGN_PROGRAM = 'b2222222-2222-4222-8222-222222222222';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ORIGINAL = Buffer.from('subject_id,assay\n0000123,99.2\n');
const DERIVED = Buffer.from('distinct edited workbook bytes');
const SOURCE_SHA256 = createHash('sha256').update(ORIGINAL).digest('hex');
const UPLOAD = {
  fileId: 'file_original', fileName: 'assay.csv', mimeType: 'text/csv',
  fileSize: ORIGINAL.length, storagePath: 'uploads/org-7/file_original',
  buffer: ORIGINAL, integrity: 'verified' as const,
};
const APPLIED = [{ sheet: 'Assay', cell: 'B7', kind: 'value' }];
const CAPTURED = {
  fileId: 'file_derived', storagePath: 'uploads/org-7/file_derived',
  sourceId: 77, captureStatus: 'captured',
  derivationAudit: { resourceType: 'file_upload', resourceId: 'file_derived' },
};

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return { organizationId: 7, userId: 41, projectRef: PROGRAM, projectId: 83, humanConfirmed: true, ...overrides };
}
function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { file_id: UPLOAD.fileId, edits: [{ sheet: 'Assay', cell: 'B7', value: 99.2 }], ...overrides };
}
async function edit(args = input(), ctx = context()) {
  const handler = getToolHandler('edit_spreadsheet');
  expect(handler).toBeDefined();
  return JSON.parse(await handler!(args, ctx)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.resolveSignerOrgRole.mockResolvedValue('member');
  h.load.mockResolvedValue(UPLOAD);
  h.apply.mockResolvedValue({ buffer: DERIVED, applied: APPLIED, createdSheets: [] });
  h.save.mockResolvedValue(CAPTURED);
});

describe('confirmed edit_spreadsheet — canonical derivation handoff', () => {
  it('passes the actual source hash, normalized edits, created sheets and active actor/project, never input overrides', async () => {
    const normalized = [
      { sheet: 'Assay', cell: 'B7', value: 99.2, formula: undefined },
      { sheet: 'New sheet', cell: 'C8', value: 0, formula: '=SUM(B2:B6)' },
      { sheet: undefined, cell: 'D9', value: null, formula: undefined },
      { sheet: 'Assay', cell: 'E10', value: false, formula: undefined },
    ];
    const applied = [
      { sheet: 'Assay', cell: 'B7', kind: 'value' },
      { sheet: 'New sheet', cell: 'C8', kind: 'formula' },
      { sheet: 'Assay', cell: 'D9', kind: 'clear' },
      { sheet: 'Assay', cell: 'E10', kind: 'value' },
    ];
    h.apply.mockResolvedValueOnce({ buffer: DERIVED, applied, createdSheets: ['New sheet'] });
    const result = await edit(input({
      edits: [null, 'not an edit',
        { sheet: 'Assay', cell: 'B7', value: 99.2, formula: 123 },
        { sheet: 'New sheet', cell: 'C8', value: 0, formula: '=SUM(B2:B6)' },
        { sheet: 123, cell: 'D9', value: null },
        { sheet: 'Assay', cell: 'E10', value: false },
      ],
      create_missing_sheets: true, new_file_name: '  curated assay  ',
      organizationId: 999, organization_id: 999, userId: 999, user_id: 999,
      projectRef: FOREIGN_PROGRAM, projectId: 999, project_id: 999,
      sourceSha256: 'f'.repeat(64), sourceFileId: 'file_malicious',
      derivation: { projectRef: FOREIGN_PROGRAM, sourceSha256: 'f'.repeat(64) },
    }));

    expect(h.resolveSignerOrgRole).toHaveBeenCalledWith(41, 7);
    expect(h.load).toHaveBeenCalledExactlyOnceWith(UPLOAD.fileId, 7);
    expect(h.apply).toHaveBeenCalledExactlyOnceWith(ORIGINAL, UPLOAD.fileName, normalized, { createMissingSheets: true }, 'text/csv');
    expect(h.save).toHaveBeenCalledExactlyOnceWith({
      buffer: DERIVED, fileName: 'curated assay.xlsx', mimeType: MIME_XLSX,
      organizationId: 7, userId: 41,
      derivation: {
        sourceFileId: UPLOAD.fileId, sourceSha256: SOURCE_SHA256, edits: normalized,
        createdSheets: ['New sheet'], projectRef: PROGRAM, projectId: 83,
      },
    });
    expect(SOURCE_SHA256).not.toBe(createHash('sha256').update(DERIVED).digest('hex'));
    expect(result).toMatchObject({
      ok: true, sourceFileId: UPLOAD.fileId, newFileId: CAPTURED.fileId, newFileName: 'curated assay.xlsx',
      sourceSha256: SOURCE_SHA256, sourceId: 77, captureStatus: 'captured',
      derivationAudit: CAPTURED.derivationAudit, appliedEdits: applied, createdSheets: ['New sheet'],
      scientificQualification: 'unassessed', formulaResults: 'not_recalculated',
    });
    expect(result.message).toContain('The original upload is unchanged.');
    expect(result.message).toContain('captured in the open project’s Data Room');
    expect(result.message).toContain('extraction and Vault filing are still required');
    expect(result.message).toContain('Formula results have not been recalculated');
    expect(result.message).toContain('scientific suitability has not been assessed');
  });

  it.each([
    [undefined, 'assay (edited).xlsx'],
    ['  report.csv  ', 'report.csv.xlsx'],
    ['  report.XLSX  ', 'report.XLSX'],
  ])('saves CSV-derived bytes with honest XLSX naming (%s)', async (requested, expected) => {
    const result = await edit(input({ new_file_name: requested }));
    expect(h.save.mock.calls[0][0]).toMatchObject({ fileName: expected, mimeType: MIME_XLSX, buffer: DERIVED });
    expect(result).toMatchObject({ ok: true, newFileName: expected });
  });

  it('relays conversation-only status with no project, despite a model-supplied project override', async () => {
    const saved = { ...CAPTURED, sourceId: null, captureStatus: 'conversation_only' };
    h.save.mockResolvedValueOnce(saved);
    const result = await edit(input({ projectRef: FOREIGN_PROGRAM, projectId: 999 }), context({ projectRef: null, projectId: null }));
    expect(h.save.mock.calls[0][0].derivation).toMatchObject({ projectRef: null, projectId: null, sourceSha256: SOURCE_SHA256 });
    expect(result).toMatchObject({
      ok: true, sourceId: null, captureStatus: 'conversation_only', derivationAudit: saved.derivationAudit,
      scientificQualification: 'unassessed', formulaResults: 'not_recalculated',
    });
    expect(result.message).toContain('remains a conversation upload');
    expect(result.message).toContain('adopt it into a project before Vault filing');
    expect(result.message).not.toContain('captured in the open project');
  });

});

describe('confirmed edit_spreadsheet — failure and authority boundaries', () => {
  it('returns an error, not a successful capture, if the canonical save refuses or fails', async () => {
    h.save.mockRejectedValueOnce(new Error('The source is no longer available. Nothing was saved.'));
    const result = await edit();
    expect(h.save).toHaveBeenCalledOnce();
    expect(result.ok).not.toBe(true);
    expect(result.error).toMatch(/edit_spreadsheet failed:.*source.*no longer available/i);
    expect(result).not.toHaveProperty('sourceId');
    expect(result).not.toHaveProperty('captureStatus');
    expect(result).not.toHaveProperty('derivationAudit');
  });

  it('does not edit or save when canonical source access refuses', async () => {
    h.load.mockRejectedValueOnce(new Error('upload not found'));
    const result = await edit();
    expect(result.ok).not.toBe(true);
    expect(result.error).toMatch(/upload not found/);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('does not save if the canonical workbook edit fails', async () => {
    h.apply.mockRejectedValueOnce(new Error('invalid cell address'));
    const result = await edit();
    expect(result.ok).not.toBe(true);
    expect(result.error).toMatch(/invalid cell address/);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('keeps confirmation in active context: an input flag cannot authorize an unconfirmed edit', async () => {
    const result = await edit(input({ humanConfirmed: true }), context({ humanConfirmed: false }));
    expect(result.ok).not.toBe(true);
    expect(h.load).not.toHaveBeenCalled();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });
});
