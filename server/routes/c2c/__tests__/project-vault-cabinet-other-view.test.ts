/**
 * The filing cabinet shows every document it counts.
 *
 * It rendered an upload only when the upload's folder belonged to the view
 * resolved at read time, and the view is not stored on the row. A document
 * filed under another view's folder — a device 510(k) folder on a program that
 * now resolves to the pharma view, or a transient error at ingest that fell back
 * to the service view — appeared in no folder and not in Unfiled, while the
 * branch's count still included it. Found by the 2026-09-24 Vault-against-Veeva
 * mapping (a probe rendered 2 of 3 uploads in the device view, 1 of 3 in pharma).
 */
import { describe, expect, it } from 'vitest';

import { filingCabinet, type UploadRow } from '../project-vault';

function row(over: Partial<UploadRow>): UploadRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    document_code: 'doc.pdf', document_title: 'doc', document_type: 'OTHER', version: '1.0',
    file_name: 'doc.pdf', file_size: 1024, mime_type: 'application/pdf', content_hash: 'a'.repeat(64),
    folder_id: 'module-3', evidence_kind: 'report', ctd_section: null,
    placement_status: 'confirmed', placement_confidence: 'high', placement_rationale: null,
    updated_at: new Date().toISOString(), owner_name: 'A. Author',
    ...over,
  };
}

type Node = { id: string; label?: string; children?: Node[]; flag?: string; title?: string };
const leaves = (n: Node): Node[] => (n.children ? n.children.flatMap(leaves) : [n]);

describe('filingCabinet — a document filed under another view', () => {
  const uploads = [
    row({ id: 'a1111111-1111-4111-8111-111111111111', document_title: 'in-view', folder_id: 'module-3' }),
    row({ id: 'b1111111-1111-4111-8111-111111111111', document_title: 'device-folder', folder_id: 'k510' }),
    row({ id: 'c1111111-1111-4111-8111-111111111111', document_title: 'unfiled', folder_id: null, placement_status: 'unfiled' }),
  ];

  it('every upload the cabinet is given appears in it exactly once', () => {
    const cab = filingCabinet('pharma', uploads) as unknown as Node;
    const titles = leaves(cab).map((l) => l.title).filter(Boolean).sort();
    expect(titles).toEqual(['device-folder', 'in-view', 'unfiled']);
  });

  it('shows it under a folder that says it was filed under another view, naming where', () => {
    const cab = filingCabinet('pharma', uploads) as unknown as Node;
    const other = cab.children!.find((c) => c.id === 'cab-other-view');
    expect(other, 'the other-view folder must exist when such a document does').toBeTruthy();
    expect(other!.label).toMatch(/another view/i);
    const leaf = other!.children![0];
    expect(leaf.title).toBe('device-folder');
    expect(leaf.flag).toMatch(/510\(k\) submissions/);
    expect(leaf.flag).toMatch(/Medical Device/);
  });

  it('adds no such folder when every document is in view', () => {
    const cab = filingCabinet('pharma', [uploads[0], uploads[2]]) as unknown as Node;
    expect(cab.children!.find((c) => c.id === 'cab-other-view')).toBeUndefined();
  });
});
