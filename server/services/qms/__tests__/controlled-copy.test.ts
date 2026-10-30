/**
 * MR-12 Stage 8 step 3 (CAT2-24): a controlled copy is the version in force,
 * only while its approval stands, from its signed content, rendered by the one
 * Authoring renderer with the CONTROLLED COPY banner and the QMS approval's
 * manifestation. The renderer and the release readers are stubbed; their own
 * tests hold them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  inForce: null as unknown,
  release: { approval: null as unknown, context: { eligible: true, unavailableReason: null as string | null } },
  render: vi.fn(async (_args: unknown) => ({ fileContent: Buffer.from('docx'), fileName: 'x.docx', contentType: 'docx', artifactSha256: 'a', rendering: 'formatted' })),
}));
vi.mock('../in-force-release', () => ({ resolveInForceRelease: async () => h.inForce }));
vi.mock('../current-release-approval', () => ({ readQmsTrainingReleaseContext: async () => h.release }));
vi.mock('../../authoring/authoring-export', () => ({ renderAuthoringExport: (args: unknown) => h.render(args) }));

import { renderQmsControlledCopy, QmsControlledCopyRefused } from '../controlled-copy';
import type { QmsDocumentRow } from '../document-approval-signature';

const DOC = '22222222-2222-4222-8222-222222222222';
const release: QmsDocumentRow = {
  id: 5, organization_id: 9, doc_number: 'SOP-001', title: 'Complaint handling', doc_type: 'sop', category: null, version: '1.0',
  status: 'effective', effective_date: '2026-09-01', next_review_date: null, author_id: 3, approver_id: 7,
  approved_at: '2026-09-01T09:00:00.000Z', superseded_by_id: null, artifact_id: null, authoring_document_id: DOC,
  metadata: { approval: { by: 7, at: '2026-09-01T09:00:00.000Z' } },
};
const SIGNED = { state: 'valid', signatureId: 41, reason: null, signer: { signerName: 'Dana Whitfield', signedAt: '2026-09-01T09:00:00.000Z', meaning: 'APPROVED' } };
const client = {
  query: vi.fn(async (sql: string) => {
    if (/FROM qms_document_versions/.test(sql)) return { rows: [{ sections: [
      { id: 's2', code: 'qms-scope', title: 'Scope', content: '<p>All complaints.</p>', orderIndex: 1 },
      { id: 's1', code: 'qms-purpose', title: 'Purpose', content: '<p>How complaints are handled.</p>', orderIndex: 0 },
    ] }] };
    if (/FROM authoring_documents/.test(sql)) return { rows: [{ id: DOC, title: 'Complaint handling', status: 'APPROVED' }] };
    return { rows: [] };
  }),
};
const input = { format: 'docx' as const, issuedTo: 'qa@example.test', actor: { id: '8', email: 'qa@example.test' },
  now: new Date('2026-10-29T12:00:00.000Z'), admit: async () => true };
const refusal = (p: Promise<unknown>) => p.then(() => 'issued', (e: unknown) => (e instanceof QmsControlledCopyRefused ? `${e.status} ${e.code}` : String(e)));

beforeEach(() => {
  h.inForce = { release, underRevision: false };
  h.release = { approval: SIGNED, context: { eligible: true, unavailableReason: null } };
  h.render.mockClear();
});

describe('renderQmsControlledCopy', () => {
  it('renders the signed sections of the version in force, with the banner and the approval manifestation', async () => {
    const copy = await renderQmsControlledCopy(client, release, input);
    expect(copy).toMatchObject({ filename: 'SOP-001_v1.0_controlled_copy.docx', version: '1.0', signatureId: 41, authoringDocumentId: DOC });
    const args = h.render.mock.calls[0][0] as { sections: Array<{ id: string }>; controlledCopy: { banner: string; manifest: string[][] }; doc: { title: string } };
    expect(args.sections.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(args.doc.title).toBe('SOP-001 Complaint handling v1.0');
    expect(args.controlledCopy.banner).toBe(
      'CONTROLLED COPY · SOP-001 v1.0 · effective 2026-09-01 · issued 2026-10-29 12:00:00 UTC to qa@example.test · uncontrolled when printed');
    expect(args.controlledCopy.manifest[0]).toEqual(expect.arrayContaining([
      'Approved by: Dana Whitfield', 'Meaning: Approval', 'Executed: 2026-09-01 09:00:00 UTC', 'Signature record: 41']));
  });

  it('issues no copy of a retired document, of an approval that does not stand, or to a reader who may not read it', async () => {
    h.inForce = null;
    expect(await refusal(renderQmsControlledCopy(client, { ...release, status: 'retired' }, input))).toBe('409 QMS_NOTHING_IN_FORCE');
    h.inForce = { release, underRevision: false };
    h.release = { approval: { state: 'changed', signatureId: 41, reason: 'This controlled text no longer matches its recorded approval signature.' }, context: { eligible: false, unavailableReason: null } };
    expect(await refusal(renderQmsControlledCopy(client, release, input))).toBe('409 QMS_RELEASE_NOT_VERIFIED');
    h.release = { approval: SIGNED, context: { eligible: true, unavailableReason: null } };
    expect(await refusal(renderQmsControlledCopy(client, release, { ...input, admit: async () => false }))).toBe('404 QMS_DOCUMENT_VIEW_DENIED');
    expect(h.render).not.toHaveBeenCalled();
  });
});
