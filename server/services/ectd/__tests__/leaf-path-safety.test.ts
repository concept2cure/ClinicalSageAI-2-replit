/**
 * Leaf path-safety gate — fail-closed controls for the packager's caller-facing
 * sourcePath seam. Uses an injected FsProbe so no real filesystem is touched.
 */

import { describe, it, expect } from 'vitest';
import { validateLeafPaths, isContainedIn, type FsProbe } from '../leaf-path-safety';

const ROOT = '/stage';

function probe(files: Record<string, { symlink?: boolean; file?: boolean; size?: number; magic?: string }>): FsProbe {
  return {
    async lstat(p) {
      const f = files[p];
      if (!f) return null;
      return { isSymbolicLink: !!f.symlink, isFile: f.file ?? true, size: f.size ?? 100 };
    },
    async readMagic(p) {
      const f = files[p];
      return f?.magic != null ? Buffer.from(f.magic, 'latin1') : null;
    },
  };
}

const pdf = (over: object = {}) => ({ file: true, size: 100, magic: '%PDF-', ...over });

describe('leaf path safety', () => {
  it('isContainedIn accepts a child under root and rejects traversal', () => {
    expect(isContainedIn(ROOT, '/stage/a.pdf')).toBe(true);
    expect(isContainedIn(ROOT, '/stage/sub/a.pdf')).toBe(true);
    expect(isContainedIn(ROOT, '/etc/passwd')).toBe(false);
    expect(isContainedIn(ROOT, '/stage/../etc/passwd')).toBe(false);
    expect(isContainedIn(ROOT, ROOT)).toBe(false); // the root itself is not a leaf file
  });

  it('passes a clean set of PDF leaves', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'a.pdf', sourcePath: '/stage/a.pdf' }, { fileName: 'b.pdf', sourcePath: '/stage/b.pdf' }],
      { allowedRoot: ROOT },
      probe({ '/stage/a.pdf': pdf(), '/stage/b.pdf': pdf() }),
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('flags a path outside the allowed root', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/etc/passwd' }],
      { allowedRoot: ROOT },
      probe({ '/etc/passwd': pdf() }),
    );
    expect(r.violations.map((v) => v.code)).toContain('OUTSIDE_ALLOWED_ROOT');
  });

  it('flags a traversal path', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/stage/../etc/x.pdf' }],
      { allowedRoot: ROOT },
      probe({}),
    );
    const codes = r.violations.map((v) => v.code);
    expect(codes.some((c) => c === 'PATH_TRAVERSAL' || c === 'OUTSIDE_ALLOWED_ROOT')).toBe(true);
  });

  it('flags a symlink', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/stage/x.pdf' }],
      { allowedRoot: ROOT },
      probe({ '/stage/x.pdf': pdf({ symlink: true }) }),
    );
    expect(r.violations.map((v) => v.code)).toContain('SYMLINK');
  });

  it('flags a missing file (fail-closed when unprobeable)', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/stage/x.pdf' }],
      { allowedRoot: ROOT },
      probe({}),
    );
    expect(r.violations.map((v) => v.code)).toContain('MISSING');
  });

  it('flags an oversize file', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/stage/x.pdf' }],
      { allowedRoot: ROOT, maxBytes: 10 },
      probe({ '/stage/x.pdf': pdf({ size: 1000 }) }),
    );
    expect(r.violations.map((v) => v.code)).toContain('TOO_LARGE');
  });

  it('flags a non-PDF leaf', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'x.pdf', sourcePath: '/stage/x.pdf' }],
      { allowedRoot: ROOT },
      probe({ '/stage/x.pdf': pdf({ magic: '<html' }) }),
    );
    expect(r.violations.map((v) => v.code)).toContain('NOT_PDF');
  });

  it('flags duplicate output file names (package collision)', async () => {
    const r = await validateLeafPaths(
      [{ fileName: 'dup.pdf', sourcePath: '/stage/a.pdf' }, { fileName: 'dup.pdf', sourcePath: '/stage/b.pdf' }],
      { allowedRoot: ROOT },
      probe({ '/stage/a.pdf': pdf(), '/stage/b.pdf': pdf() }),
    );
    expect(r.violations.map((v) => v.code)).toContain('DUPLICATE_OUTPUT_NAME');
  });
});
