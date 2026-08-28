/**
 * Filing-cabinet tree merge — the regression this exists to prevent:
 *
 * `POST /api/vault/ingest` wrote `vault.documents` rows and the Vault tree
 * (`GET /api/c2c/project-vault/:id`) never read that table, so a file uploaded
 * FROM the Vault surface did not appear in the tree it was uploaded into. The
 * cabinet is where uploads become visible: placed uploads render inside their
 * taxonomy folder, unplaced ones inside an always-visible Unfiled queue, and
 * every preset folder of the program's view renders even when empty — the
 * cabinet IS the dossier shape, not a list of whatever happens to exist.
 */
import { describe, expect, it } from 'vitest';

import { filingCabinet, uploadLeaf, type UploadRow } from '../project-vault';
import { foldersForView } from '../../../../shared/constants/domain/vault-taxonomy';

function row(over: Partial<UploadRow>): UploadRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    document_code: 'stability-summary-24m.pdf',
    document_title: 'stability-summary-24m',
    document_type: 'OTHER',
    version: '1.0',
    file_name: 'stability-summary-24m.pdf',
    file_size: 1048576,
    mime_type: 'application/pdf',
    content_hash: 'a'.repeat(64),
    folder_id: 'module-3',
    evidence_kind: 'report',
    ctd_section: '3.2.P.8',
    placement_status: 'suggested',
    placement_confidence: 'high',
    placement_rationale: 'CTD pattern "Stability" → Module 3 (3.2.P.8).',
    updated_at: new Date().toISOString(),
    owner_name: 'A. Author',
    ...over,
  };
}

describe('filingCabinet — uploads appear in the tree they were uploaded into', () => {
  it('a suggested upload renders inside its taxonomy folder', () => {
    const cab = filingCabinet('pharma', [row({})]);
    const m3 = cab.children.find(c => 'children' in c && c.id === 'cab-module-3');
    expect(m3, 'the Module 3 folder must exist in the cabinet').toBeTruthy();
    const docs = (m3 as { children: unknown[] }).children;
    expect(docs).toHaveLength(1);
    const doc = docs[0] as ReturnType<typeof uploadLeaf>;
    expect(doc.title).toBe('stability-summary-24m');
    expect(doc.status).toBe('suggested');
    expect(doc.src).toBe('upload');
    expect(doc.filing?.folderId).toBe('module-3');
    expect(doc.filing?.folderLabel).toContain('Module 3');
  });

  it('an unfiled upload renders in the Unfiled queue — visible, never dropped', () => {
    const cab = filingCabinet('pharma', [
      row({ id: '22222222-2222-4222-8222-222222222222', folder_id: null, placement_status: 'unfiled', placement_rationale: null }),
    ]);
    const unfiled = cab.children.find(c => 'children' in c && c.id === 'cab-unfiled');
    expect(unfiled).toBeTruthy();
    const docs = (unfiled as { children: unknown[] }).children;
    expect(docs).toHaveLength(1);
    expect((docs[0] as { status: string }).status).toBe('unfiled');
    expect((docs[0] as { flag?: string }).flag).toMatch(/not filed/i);
  });

  it('every preset folder of the view renders even when empty', () => {
    for (const view of ['pharma', 'device', 'service'] as const) {
      const cab = filingCabinet(view, []);
      const folderIds = cab.children
        .filter(c => 'children' in c)
        .map(c => (c as { id: string }).id);
      for (const preset of foldersForView(view)) {
        expect(folderIds).toContain(`cab-${preset.id}`);
      }
      expect(folderIds).toContain('cab-unfiled');
    }
  });

  it('a confirmed upload counts as placed, and its leaf carries real provenance only', () => {
    const cab = filingCabinet('device', [
      row({
        id: '33333333-3333-4333-8333-333333333333',
        folder_id: 'eng',
        placement_status: 'confirmed',
        ctd_section: null,
        file_name: 'RMF-residual-risk-v3.1.pdf',
        document_title: 'RMF residual risk',
      }),
    ]);
    const eng = cab.children.find(c => 'children' in c && c.id === 'cab-eng');
    const doc = (eng as { children: unknown[] }).children[0] as ReturnType<typeof uploadLeaf>;
    expect(doc.status).toBe('confirmed');
    expect(doc.num).toBe('—');                      // no CTD section → em dash, not invented
    expect(doc.preview).toContain('SHA-256');
    expect(doc.pct).toBe(0);                        // uploads carry no authoring completion
  });

  it('a row with a folder but unfiled status stays in the queue (placement wins over stale folder)', () => {
    const cab = filingCabinet('pharma', [
      row({ id: '44444444-4444-4444-8444-444444444444', folder_id: 'module-3', placement_status: 'unfiled' }),
    ]);
    const unfiled = cab.children.find(c => 'children' in c && c.id === 'cab-unfiled');
    expect((unfiled as { children: unknown[] }).children).toHaveLength(1);
    const m3 = cab.children.find(c => 'children' in c && c.id === 'cab-module-3');
    expect((m3 as { children: unknown[] }).children).toHaveLength(0);
  });
});
