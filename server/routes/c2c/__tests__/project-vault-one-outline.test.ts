/**
 * One outline per filing in the Vault's Library (P-123 item 8, 2026-11-12).
 *
 * The Library listed a filing's outline twice: the filing binder (the files placed against each heading) and, below
 * it, the authored filing document's own sections under the same headings. Seen on a 510(k) and on two INDs. Each
 * authored section now sits in the binder heading with its code, keeping its filing reference for the editor door;
 * a section the binder has no heading for stays under its document.
 */
import { describe, expect, it } from 'vitest';
import { filingCabinet, type UploadRow } from '../project-vault';
import { binderNodes, buildFolderIndex } from '../../../services/vault/vault-folders';
import { placeAuthoredSectionsInBinder, type BinderOutlineNode, type BinderOutlineFolder, type BinderOutlineLeaf } from '../../../services/vault/vault-binder-outline';

const PACK = [
  { key: 'A', label: 'Administrative', path_order: 1 },
  { key: 'A1', label: 'Cover letter', parent_key: 'A', path_order: 2, mandatory: true },
  { key: 'A2', label: 'Submitter information', parent_key: 'A', path_order: 3 },
  { key: 'B', label: 'Device description', path_order: 4 },
  { key: 'B1', label: 'Device description and principles of operation', parent_key: 'B', path_order: 5, mandatory: true },
];
const binder = { docType: 'K510', agency: 'FDA', version: 'fda-estar-510k-v1.1', label: '510(k) × FDA · eSTAR', nodes: binderNodes(PACK) };
const upload = (id: string, folder: string): UploadRow => ({
  id, document_code: `${id}.pdf`, document_title: `File ${id}`, document_type: 'REPORT', version: '1.0',
  file_name: `${id}.pdf`, file_size: 1, mime_type: 'application/pdf', content_hash: 'a'.repeat(64),
  folder_id: folder, evidence_kind: 'report', ctd_section: null, placement_status: 'confirmed',
  placement_confidence: 'high', placement_rationale: null, updated_at: new Date().toISOString(), owner_name: 'A. Author',
} as unknown as UploadRow);

/** The authored filing document's folder, as project-vault.ts `documentFolder` builds it. */
function authored(id: string, code: string, sections: string[]): BinderOutlineFolder {
  const leaf = (key: string): BinderOutlineLeaf & Record<string, unknown> => ({ id: `sec-${id}-${key}`, filingSectionKey: key, num: key, title: key, type: 'Required' });
  const byParent = new Map<string, string[]>();
  for (const key of sections) byParent.set(key[0], [...(byParent.get(key[0]) ?? []), key]);
  return {
    id: `vaultdoc-${id}`, filingDocumentId: id, code, label: `${code} filing`,
    children: [...byParent].map(([parent, keys]) => ({ id: `sec-${id}-${parent}`, code: parent, label: parent, children: keys.map(leaf) })),
  };
}
const cabinetWith = (uploads: UploadRow[] = []) =>
  filingCabinet('device', uploads, buildFolderIndex('device', { binder }, [])) as unknown as BinderOutlineFolder;
const doc = (id: string, over: Record<string, unknown> = {}) => ({ id, doc_type: 'k510', agency: 'fda', filing_scope: 'home', ...over });

function find(nodes: BinderOutlineNode[], id: string): BinderOutlineFolder | undefined {
  for (const n of nodes) {
    if (!('children' in n)) continue;
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}
const leafIds = (f: BinderOutlineFolder | undefined) => (f?.children ?? []).filter((c) => !('children' in c)).map((c) => c.id);

describe('the Library shows a filing\'s outline once: its sections are in the binder\'s headings', () => {
  it('puts each authored section in its heading, first among the files there, with its filing reference', () => {
    const tree: BinderOutlineNode[] = [cabinetWith([upload('u1', 'bn:A1')]), authored('d1', 'K510', ['A1', 'A2', 'B1'])];
    placeAuthoredSectionsInBinder(tree, [doc('d1')]);
    expect(tree.map((n) => n.id)).toEqual(['cabinet']);
    expect(leafIds(find(tree, 'cab-bn:A1'))).toEqual(['sec-d1-A1', 'up-u1']);
    expect(leafIds(find(tree, 'cab-bn:B1'))).toEqual(['sec-d1-B1']);
    const section = find(tree, 'cab-bn:A1')!.children[0] as BinderOutlineLeaf;
    expect(section).toMatchObject({ filingSectionKey: 'A1', filingDocumentId: 'd1', filingFamily: 'K510' });
  });

  it('keeps under its document a section the binder has no heading for, and nothing else', () => {
    const tree: BinderOutlineNode[] = [cabinetWith(), authored('d1', 'K510', ['A1', 'Z9'])];
    placeAuthoredSectionsInBinder(tree, [doc('d1')]);
    expect(tree.map((n) => n.id)).toEqual(['cabinet', 'vaultdoc-d1']);
    expect(leafIds(find(tree, 'sec-d1-Z'))).toEqual(['sec-d1-Z9']);
    expect(find(tree, 'sec-d1-A')).toBeUndefined();
    expect(leafIds(find(tree, 'cab-bn:A1'))).toEqual(['sec-d1-A1']);
  });

  it('leaves the tree as it was for a market\'s part, for two documents of the filing, for another document type, and with no binder', () => {
    const cases: Array<[string, BinderOutlineNode[], Array<ReturnType<typeof doc>>]> = [
      ['a market\'s part (F22)', [cabinetWith(), authored('d1', 'K510', ['A1'])], [doc('d1', { filing_scope: 'market' })]],
      ['two documents of the filing', [cabinetWith(), authored('d1', 'K510', ['A1']), authored('d2', 'K510', ['A1'])], [doc('d1'), doc('d2')]],
      ['another document type', [cabinetWith(), authored('d1', 'CSR', ['A1'])], [doc('d1', { doc_type: 'csr' })]],
      ['another agency', [cabinetWith(), authored('d1', 'K510', ['A1'])], [doc('d1', { agency: 'ema' })]],
      ['no binder', [filingCabinet('device', [], buildFolderIndex('device', { binder: null, reason: 'none' }, [])) as unknown as BinderOutlineFolder,
        authored('d1', 'K510', ['A1'])], [doc('d1')]],
    ];
    for (const [what, tree, docs] of cases) {
      const before = JSON.stringify(tree);
      placeAuthoredSectionsInBinder(tree, docs);
      expect(JSON.stringify(tree), what).toBe(before);
    }
  });
});
