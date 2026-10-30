/** Archive delivery and build admission shared by folder and closing archives. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { Response } from 'express';
import { beginArchiveBuild, sendStagedArchive } from '../vault-archive-delivery';

class ArchiveResponse extends Writable {
  readonly chunks: Buffer[] = [];
  readonly headers = new Map<string, string>();
  readonly setHeader = vi.fn((name: string, value: string) => {
    this.headers.set(name, value);
    return this;
  });

  override _write(chunk: Buffer, _encoding: string, done: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    done();
  }
}

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-delivery-test-'));
  await fs.writeFile(path.join(directory, 'archive.zip'), 'verified archive bytes');
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const built = () => ({ path: path.join(directory, 'archive.zip'), size: 22, sha256: 'a'.repeat(64) });
const stage = () => ({ cleanup: vi.fn(() => fs.rm(directory, { recursive: true, force: true })) });
const asResponse = (response: ArchiveResponse) => response as unknown as Response;

describe('sending a staged Vault archive', () => {
  it('cleans up a response already destroyed without setting headers or opening its file', async () => {
    const response = new ArchiveResponse();
    response.destroy();
    const staged = stage();
    expect(sendStagedArchive(asResponse(response), { ...built(), path: '/must-not-be-opened' }, staged, 'export.zip')).toBe(false);
    expect(response.setHeader).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(staged.cleanup).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await fs.stat(directory).catch(() => null)).toBeNull());
  });

  it('cleans up an already ended response without setting headers', async () => {
    const response = new ArchiveResponse({ autoDestroy: false });
    response.end();
    const staged = stage();
    expect(sendStagedArchive(asResponse(response), built(), staged, 'export.zip')).toBe(false);
    expect(response.setHeader).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(staged.cleanup).toHaveBeenCalledOnce());
  });

  it('streams the finished file with its receipt headers and cleans up on close', async () => {
    const response = new ArchiveResponse();
    const staged = stage();
    expect(sendStagedArchive(asResponse(response), built(), staged, 'export.zip')).toBe(true);
    await vi.waitFor(() => expect(response.writableFinished).toBe(true));
    expect(Buffer.concat(response.chunks).toString('utf8')).toBe('verified archive bytes');
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'Content-Type': 'application/zip',
      'Content-Length': '22',
      'Content-Disposition': 'attachment; filename="export.zip"',
      'X-Content-SHA256': 'a'.repeat(64),
      'Cache-Control': 'no-store',
    });
    await vi.waitFor(() => expect(staged.cleanup).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await fs.stat(directory).catch(() => null)).toBeNull());
  });
});

describe('admitting one archive build per user', () => {
  it('refuses a second build until the first releases its place', () => {
    const release = beginArchiveBuild(701, 801);
    expect(release).toBeTypeOf('function');
    try { expect(beginArchiveBuild(701, 801)).toBeNull(); }
    finally { release?.(); }
    const again = beginArchiveBuild(701, 801);
    expect(again).toBeTypeOf('function');
    again?.();
  });

  it('admits separate users and the same user in separate organizations independently', () => {
    const releases = [beginArchiveBuild(702, 802), beginArchiveBuild(702, 803), beginArchiveBuild(703, 802)];
    try { for (const release of releases) expect(release).toBeTypeOf('function'); }
    finally { for (const release of releases) release?.(); }
  });

  it('does not let a repeated release free a later build', () => {
    const earlier = beginArchiveBuild(704, 804);
    earlier?.();
    const later = beginArchiveBuild(704, 804);
    try {
      expect(later).toBeTypeOf('function');
      earlier?.();
      expect(beginArchiveBuild(704, 804)).toBeNull();
    } finally { later?.(); }
  });

  it('refuses to build without an accountable user', () => {
    expect(beginArchiveBuild(705, undefined)).toBeNull();
  });
});
