/** Retained filing content stays reachable when the active IVD binder has a different outline. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FDA_510K_IVD_SECTIONS } from '../../../../shared/regulatory/device-authoring-sections';
import { binderNodes } from '../vault-folders';
import {
  placeAuthoredSectionsInBinder,
  type BinderOutlineDocument,
  type BinderOutlineFolder,
  type BinderOutlineLeaf,
  type BinderOutlineNode,
} from '../vault-binder-outline';

interface PackNode {
  key: string;
  parent_key: string | null;
  label: string;
  mandatory: boolean;
  path_order: number;
}
interface Section extends BinderOutlineLeaf {
  label: string;
  content: string;
  version: number;
  status: string;
}
interface RetainedDocument extends BinderOutlineDocument {
  rule_pack_version: string;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
function readTree(file: string): PackNode[] {
  const sql = readFileSync(path.join(root, file), 'utf8');
  const blob = /\$pack\$([\s\S]*?)\$pack\$/.exec(sql);
  if (!blob) throw new Error(`No retained outline in ${file}`);
  return JSON.parse(blob[1]) as PackNode[];
}
const oldTree = readTree('migrations/20261005c_k510_denovo_estar_outline_v1_1.sql');
const ivdTree = readTree('migrations/20261114_k510_ivd_estar_outline_v1_0.sql');

/** The existing projection's folder/section DTO, with a substantive body and retained section version. */
function authoredDocument(id: string, pack: readonly PackNode[]): { folder: BinderOutlineFolder; sections: Section[] } {
  const sections: Section[] = pack.map(n => ({
    id: `${id}:${n.key}`, label: n.label, filingSectionKey: n.key,
    content: `Retained approved text for ${n.key}: ${n.label}.`, version: 7, status: 'approved',
  }));
  const groups = new Map<string, BinderOutlineFolder>();
  for (const n of pack.filter(n => n.parent_key === null)) {
    groups.set(n.key, { id: `${id}:group:${n.key}`, code: n.key, label: n.label, children: [] });
  }
  for (const section of sections) {
    const spec = pack.find(n => n.key === section.filingSectionKey)!;
    groups.get(spec.parent_key ?? spec.key)!.children.push(section);
  }
  return {
    folder: { id: `doc:${id}`, code: 'K510', label: 'Retained FDA filing', filingDocumentId: id, children: [...groups.values()] },
    sections,
  };
}

function cabinet(): BinderOutlineFolder {
  const headings = new Map<string, BinderOutlineFolder>();
  for (const node of binderNodes(ivdTree)) {
    headings.set(node.key, { id: `cab-bn:${node.key}`, code: node.key, label: node.label, kind: 'binder', children: [] });
  }
  const roots: BinderOutlineFolder[] = [];
  for (const node of binderNodes(ivdTree)) {
    const heading = headings.get(node.key)!;
    if (node.parentKey) headings.get(node.parentKey)!.children.push(heading);
    else roots.push(heading);
  }
  return { id: 'cabinet', code: '', binder: { docType: 'k510', agency: 'fda' }, children: roots };
}
const isFolder = (n: BinderOutlineNode): n is BinderOutlineFolder => 'children' in n;
function leaves(nodes: readonly BinderOutlineNode[]): Section[] {
  return nodes.flatMap(n => isFolder(n) ? leaves(n.children) : [n as Section]);
}
function heading(folder: BinderOutlineFolder, key: string): BinderOutlineFolder | undefined {
  for (const n of folder.children) {
    if (!isFolder(n)) continue;
    if (n.id === `cab-bn:${key}`) return n;
    const nested = heading(n, key);
    if (nested) return nested;
  }
  return undefined;
}
const record = (id: string, version: string): RetainedDocument => ({
  id, doc_type: 'k510', agency: 'fda', filing_scope: 'home', rule_pack_version: version,
});

describe('the active IVD binder and retained filing sections', () => {
  it('keeps the meaning of every shared key and the blueprint matches the migrated 47-node outline', () => {
    expect(ivdTree).toHaveLength(47);
    expect(oldTree).toHaveLength(38);
    const oldByKey = new Map(oldTree.map(n => [n.key, n]));
    for (const node of ivdTree) {
      const old = oldByKey.get(node.key);
      if (old) expect({ label: node.label, parent: node.parent_key }).toEqual({ label: old.label, parent: old.parent_key });
    }
    expect(oldTree.filter(n => !ivdTree.some(next => next.key === n.key))).toEqual([]);
    expect(FDA_510K_IVD_SECTIONS.map(s => ({ key: s.code, label: s.title, mandatory: s.required })))
      .toEqual(ivdTree.map(n => ({ key: n.key, label: n.label, mandatory: n.mandatory })));
  });

  it('preserves all retained bytes, versions and editor targets, placing bench and animal content under their unchanged headings', () => {
    const doc = record('retained-generic-ivd', 'fda-estar-510k-v1.1');
    const beforeRecord = globalThis.structuredClone(doc);
    const old = authoredDocument(doc.id, oldTree);
    const originalBodies = old.sections.map(({ id, label, content, version, status }) => ({ id, label, content, version, status }));
    const active = cabinet();
    const tree: BinderOutlineNode[] = [active, old.folder];

    placeAuthoredSectionsInBinder(tree, [doc]);

    const after = leaves(tree);
    expect(after).toHaveLength(38);
    expect(new Set(after.map(s => s.id)).size).toBe(38);
    expect(after.map(({ id, label, content, version, status }) => ({ id, label, content, version, status })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(originalBodies.sort((a, b) => a.id.localeCompare(b.id)));
    for (const section of old.sections) expect(after.find(s => s.id === section.id)).toBe(section);
    expect(doc).toEqual(beforeRecord);
    expect(tree).toEqual([active]);
    for (const key of ['E5', 'E6']) {
      const original = old.sections.find(s => s.filingSectionKey === key)!;
      expect(heading(active, key)!.label).toBe(original.label);
      expect(leaves(heading(active, key)!.children)).toEqual([original]);
      expect(original.filingDocumentId).toBe(doc.id);
    }
    for (const section of leaves(active.children)) {
      expect(section.filingDocumentId).toBe(doc.id);
      expect(section.filingFamily).toBe('K510');
    }
    const bio = heading(active, 'E1')!;
    expect(bio.label).toBe('Biocompatibility');
    expect(leaves(bio.children).map(s => s.content)).toEqual([old.sections.find(s => s.filingSectionKey === 'E1')!.content]);
    expect(heading(active, 'E9')!.label).toContain('Analytical performance');
    expect(leaves(heading(active, 'E9')!.children)).toEqual([]);
  });

  it('puts the current IVD filing into its matching binder without hiding or duplicating a section', () => {
    const doc = record('current-ivd', 'fda-estar-510k-ivd-v1.0');
    const draft = authoredDocument(doc.id, ivdTree);
    const active = cabinet();
    const tree: BinderOutlineNode[] = [active, draft.folder];
    placeAuthoredSectionsInBinder(tree, [doc]);
    expect(tree).toEqual([active]);
    expect(leaves(tree)).toHaveLength(47);
    expect(new Set(leaves(tree).map(s => s.id)).size).toBe(47);
    for (const section of draft.sections) expect(leaves(tree).find(s => s.id === section.id)).toBe(section);
    expect(leaves(heading(active, 'E9')!.children)[0].filingDocumentId).toBe(doc.id);
    expect(doc.rule_pack_version).toBe('fda-estar-510k-ivd-v1.0');
  });

  it('keeps competing home filings in their own folders when the binder cannot identify one owner', () => {
    const first = authoredDocument('first', oldTree);
    const second = authoredDocument('second', ivdTree);
    const active = cabinet();
    const tree: BinderOutlineNode[] = [active, first.folder, second.folder];
    const before = globalThis.structuredClone(tree);
    placeAuthoredSectionsInBinder(tree, [record('first', 'fda-estar-510k-v1.1'), record('second', 'fda-estar-510k-ivd-v1.0')]);
    expect(tree).toEqual(before);
    expect(leaves(first.folder.children)).toHaveLength(38);
    expect(leaves(second.folder.children)).toHaveLength(47);
    expect(leaves(active.children)).toEqual([]);
  });
});
