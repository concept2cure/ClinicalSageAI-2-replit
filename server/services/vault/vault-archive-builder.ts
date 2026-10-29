/**
 * The Vault's one archive builder (VR-20, docs/design/VAULT_CLOSING_ARCHIVE_2026-10-29.md).
 *
 * A ZIP that proves itself: each document's original bytes at an index-ordered
 * path, `manifest.json`, a printable `INDEX.txt`, any attachments the caller
 * adds (the audit extract), and `SHA256SUMS` over every other file.
 *
 * It is staged on disk and finished before any byte is sent, so what is served
 * is exactly what was verified. A document goes in only when its bytes hash to
 * the hash the caller expects; one that does not, or that has no recorded hash,
 * is a refusal the caller reports, and the archive is never finished with a gap.
 * The heap holds one document at a time: each is written to the staging
 * directory as it is handed in.
 *
 * The seal's archive hands documents in from the seal's own byte check
 * (`verifySeal`'s `checkBytes`), so each file is read once and the bytes that
 * made the verdict are the bytes archived. The tenant data return and a bulk
 * export of a selection (MR-08 Stage 6) are to use the same builder.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { compareSectionCode } from '../../../shared/regulatory/section-code.js';

/** One document as the caller hands it in. */
export interface ArchiveDocument {
  id: string;
  title: string | null;
  fileName: string | null;
  /** The tree's index number (VR-15), the first sort key. */
  indexNumber: string | null;
  /** The hash the bytes must have: the seal's, or the record's. */
  sha256: string | null;
}

/** One document as the archive holds it. */
export interface ArchivedFile {
  path: string;
  id: string;
  title: string | null;
  indexNumber: string | null;
  sha256: string;
  size: number;
}

export interface FinishedArchive {
  path: string;
  size: number;
  sha256: string;
  files: ArchivedFile[];
}

export interface VaultArchiveStage {
  /** Stage one document's bytes. Null when staged; otherwise why it was refused. */
  put(doc: ArchiveDocument, bytes: Buffer): Promise<string | null>;
  /** Write the ZIP from what was staged, and hash it. */
  finish(input: {
    manifest: (files: ArchivedFile[]) => Record<string, unknown>;
    indexHeader: string[];
    attachments?: Array<{ path: string; content: string }>;
  }): Promise<FinishedArchive>;
  /** Remove the staging directory. Safe to call more than once. */
  cleanup(): Promise<void>;
}

const sha256Of = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
/** Locale-free order, so the same names sort the same on every server. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A file name that is one path segment of plain characters, never a traversal. */
export function safeArchiveName(doc: Pick<ArchiveDocument, 'id' | 'title' | 'fileName'>): string {
  const raw = doc.fileName || doc.title || doc.id;
  const cleaned = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  const base = cleaned.slice(0, 100).replace(/[.-]+$/, '');
  return base || doc.id;
}

/** Index order: the index number, then the title, then the id, so one input always gives one order. */
export function archiveOrder(a: ArchiveDocument, b: ArchiveDocument): number {
  if (a.indexNumber && b.indexNumber) {
    const byNumber = compareSectionCode(a.indexNumber, b.indexNumber);
    if (byNumber !== 0) return byNumber;
  } else if (a.indexNumber || b.indexNumber) {
    return a.indexNumber ? -1 : 1;
  }
  return (a.title ?? '').localeCompare(b.title ?? '', 'en') || byCodeUnit(a.id, b.id);
}

/** Each document's archive path, `documents/<NNN>-<safe name>`, in index order. */
export function archivePaths<T extends ArchiveDocument>(docs: T[]): Array<T & { path: string }> {
  const width = Math.max(3, String(docs.length).length);
  return [...docs].sort(archiveOrder).map((d, i) => ({
    ...d, path: `documents/${String(i + 1).padStart(width, '0')}-${safeArchiveName(d)}`,
  }));
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Open a staging directory for one archive. The caller always calls cleanup. */
export async function openVaultArchive(stagingRoot: string = os.tmpdir()): Promise<VaultArchiveStage> {
  const dir = await fs.mkdtemp(path.join(stagingRoot, 'vault-archive-'));
  const staged: Array<ArchiveDocument & { blob: string; size: number; sha256: string }> = [];
  let finished = false;
  let removed = false;

  return {
    async put(doc, bytes) {
      if (finished) throw new Error('The archive is already finished.');
      const expected = doc.sha256?.trim().toLowerCase() || null;
      if (!expected) return 'No content hash is recorded for it, so its bytes cannot be shown to be the recorded ones.';
      const actual = sha256Of(bytes);
      if (actual !== expected) return 'The bytes read do not match the hash recorded for it.';
      if (staged.some((s) => s.id === doc.id)) return 'It was handed in twice.';
      const blob = path.join(dir, `blob-${staged.length}`);
      await fs.writeFile(blob, bytes);
      staged.push({ ...doc, sha256: actual, blob, size: bytes.length });
      return null;
    },

    async finish({ manifest, indexHeader, attachments = [] }) {
      if (finished) throw new Error('The archive is already finished.');
      finished = true;
      const placed = archivePaths(staged);
      const files: ArchivedFile[] = placed.map((d) => ({
        path: d.path, id: d.id, title: d.title, indexNumber: d.indexNumber, sha256: d.sha256, size: d.size,
      }));
      const manifestJson = `${JSON.stringify(manifest(files), null, 2)}\n`;
      const index = [
        ...indexHeader,
        '',
        ...files.map((f, i) => [String(i + 1).padStart(3, ' '), f.indexNumber ?? '-', f.title ?? f.id, f.sha256, f.path].join('  ')),
        '',
      ].join('\n');
      const texts = [
        { path: 'manifest.json', content: manifestJson },
        { path: 'INDEX.txt', content: index },
        ...attachments,
      ];
      const reserved = new Set(['SHA256SUMS', ...files.map((f) => f.path)]);
      for (const t of texts) {
        if (reserved.has(t.path) || t.path.split('/').some((seg) => !seg || seg === '..' || seg === '.')) {
          throw new Error(`An attachment cannot be written at ${t.path}.`);
        }
        reserved.add(t.path);
      }
      const sums = [
        ...files.map((f) => [f.sha256, f.path] as const),
        ...texts.map((t) => [sha256Of(t.content), t.path] as const),
      ].sort((a, b) => byCodeUnit(a[1], b[1])).map(([digest, name]) => `${digest}  ${name}`).join('\n');

      const zipPath = path.join(dir, 'archive.zip');
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(zipPath);
        const zip = archiver('zip', { zlib: { level: 9 } });
        out.on('close', () => resolve());
        out.on('error', reject);
        zip.on('error', reject);
        zip.on('warning', reject);
        zip.pipe(out);
        for (const d of placed) zip.file(d.blob, { name: d.path });
        for (const t of texts) zip.append(t.content, { name: t.path });
        zip.append(`${sums}\n`, { name: 'SHA256SUMS' });
        void zip.finalize().catch(reject);
      });
      const { size } = await fs.stat(zipPath);
      return { path: zipPath, size, sha256: await hashFile(zipPath), files };
    },

    async cleanup() {
      if (removed) return;
      removed = true;
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
