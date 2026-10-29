/**
 * The Vault's one archive builder (VR-20): paths and order are deterministic,
 * a document whose bytes do not match is refused, SHA256SUMS checks every file,
 * and nothing is left on disk after cleanup.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { archivePaths, openVaultArchive, safeArchiveName, type ArchiveDocument, type VaultArchiveStage } from '../vault-archive-builder';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const doc = (id: string, text: string, over: Partial<ArchiveDocument> = {}): [ArchiveDocument, Buffer] => {
  const bytes = Buffer.from(text, 'utf8');
  return [{ id, title: `Title ${id}`, fileName: `${id}.txt`, indexNumber: null, sha256: sha(bytes), ...over }, bytes];
};

let stages: VaultArchiveStage[] = [];
afterEach(async () => {
  for (const s of stages) await s.cleanup();
  stages = [];
});
const open = async () => {
  const s = await openVaultArchive();
  stages.push(s);
  return s;
};

describe('archive paths', () => {
  it('orders by index number, then title, then id, the same way every time', () => {
    const docs: ArchiveDocument[] = [
      { id: 'c', title: 'Zeta', fileName: 'z.pdf', indexNumber: null, sha256: null },
      { id: 'b', title: 'Beta', fileName: 'b.pdf', indexNumber: '3.2.P.8', sha256: null },
      { id: 'a', title: 'Alpha', fileName: 'a.pdf', indexNumber: '1.4', sha256: null },
      { id: 'd', title: 'Alpha', fileName: 'd.pdf', indexNumber: null, sha256: null },
      { id: 'e', title: 'Gamma', fileName: 'e.pdf', indexNumber: '3.2.P.10', sha256: null },
    ];
    const once = archivePaths(docs).map((d) => d.path);
    expect(once).toEqual(['documents/001-a.pdf', 'documents/002-b.pdf', 'documents/003-e.pdf', 'documents/004-d.pdf', 'documents/005-z.pdf']);
    expect(archivePaths([...docs].reverse()).map((d) => d.path)).toEqual(once);
  });

  it('never lets a file name leave its folder', () => {
    expect(safeArchiveName({ id: 'x1', title: null, fileName: '../../etc/passwd' })).toBe('etc-passwd');
    expect(safeArchiveName({ id: 'x2', title: null, fileName: '..' })).toBe('x2');
    expect(safeArchiveName({ id: 'x3', title: 'Résumé / CV: draft', fileName: null })).toBe('Resume-CV-draft');
  });
});

describe('building an archive', () => {
  it('holds each document, the manifest, the index, attachments and SHA256SUMS over every other file', async () => {
    const stage = await open();
    const [a, ab] = doc('a', 'first', { indexNumber: '2' });
    const [b, bb] = doc('b', 'second', { indexNumber: '1' });
    expect(await stage.put(a, ab)).toBeNull();
    expect(await stage.put(b, bb)).toBeNull();
    const built = await stage.finish({
      manifest: (files) => ({ schema: 'test/1', files }),
      indexHeader: ['Test archive'],
      attachments: [{ path: 'audit/audit-trail.json', content: '{"entries":[]}\n' }],
    });
    const body = await fs.readFile(built.path);
    expect(built.sha256).toBe(sha(body));
    expect(built.size).toBe(body.length);
    expect(built.files.map((f) => [f.path, f.id])).toEqual([['documents/001-b.txt', 'b'], ['documents/002-a.txt', 'a']]);

    const zip = new AdmZip(body);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual(['INDEX.txt', 'SHA256SUMS', 'audit/audit-trail.json', 'documents/001-b.txt', 'documents/002-a.txt', 'manifest.json']);
    expect(zip.readAsText('documents/002-a.txt')).toBe('first');
    const sums = zip.readAsText('SHA256SUMS').trim().split('\n').map((l) => l.split('  '));
    expect(sums.map(([, n]) => n)).toEqual(names.filter((n) => n !== 'SHA256SUMS'));
    for (const [digest, name] of sums) expect(sha(zip.readFile(name)!), name).toBe(digest);
    expect(JSON.parse(zip.readAsText('manifest.json')).files).toEqual(built.files);
    expect(zip.readAsText('INDEX.txt')).toMatch(/^Test archive\n\n {2}1 {2}1 {2}Title b {2}[0-9a-f]{64} {2}documents\/001-b\.txt\n/);
  });

  it('refuses bytes that do not match, bytes with no recorded hash, and the same document twice', async () => {
    const stage = await open();
    const [a, ab] = doc('a', 'first');
    expect(await stage.put({ ...a, sha256: sha('other') }, ab)).toMatch(/do not match/);
    expect(await stage.put({ ...a, sha256: null }, ab)).toMatch(/No content hash/);
    expect(await stage.put(a, ab)).toBeNull();
    expect(await stage.put(a, ab)).toMatch(/twice/);
    const built = await stage.finish({ manifest: (files) => ({ files }), indexHeader: [] });
    expect(built.files.map((f) => f.id)).toEqual(['a']);
  });

  it('refuses an attachment that would overwrite a file or leave the archive', async () => {
    for (const bad of ['SHA256SUMS', 'manifest.json', '../escape.json', 'audit//x.json']) {
      const stage = await open();
      await expect(stage.finish({ manifest: () => ({}), indexHeader: [], attachments: [{ path: bad, content: '{}' }] }))
        .rejects.toThrow(/cannot be written/);
    }
  });

  it('leaves nothing on disk after cleanup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-archive-test-'));
    const stage = await openVaultArchive(root);
    const [a, ab] = doc('a', 'first');
    await stage.put(a, ab);
    const built = await stage.finish({ manifest: () => ({}), indexHeader: [] });
    expect(existsSync(built.path)).toBe(true);
    await stage.cleanup();
    await stage.cleanup();
    expect(await fs.readdir(root)).toEqual([]);
    await fs.rm(root, { recursive: true, force: true });
  });
});
