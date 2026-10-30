/**
 * Handing a finished Vault archive over (security review, 2026-10-30):
 * a request closed before its archive was ready leaves nothing in tmp, and one
 * person builds one archive at a time.
 */
import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beginArchiveBuild, sendStagedArchive } from '../vault-archive-delivery';

const built = (file: string) => ({ path: file, size: 5, sha256: 'a'.repeat(64) });

describe('sending a staged archive', () => {
  it('sends nothing to a request already closed, and removes the staging directory', async () => {
    const cleanup = vi.fn(async () => undefined);
    const res = { destroyed: true, writableEnded: false, setHeader: vi.fn(), on: vi.fn() };
    sendStagedArchive(res as never, built('/no/such/archive.zip'), { cleanup }, 'x.zip');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.on).not.toHaveBeenCalled();
  });

  it('streams the archive with its recorded hash to an open request, and removes the staging directory when it closes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-delivery-test-'));
    const file = path.join(dir, 'archive.zip');
    await fs.writeFile(file, 'PK-ok');
    const cleanup = vi.fn(async () => { await fs.rm(dir, { recursive: true, force: true }); });
    const res = Object.assign(new PassThrough(), { setHeader: vi.fn() });
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    sendStagedArchive(res as never, built(file), { cleanup }, 'x.zip');
    await new Promise((resolve) => res.on('close', resolve));
    expect(Buffer.concat(chunks).toString()).toBe('PK-ok');
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-SHA256', 'a'.repeat(64));
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  });
});

describe('one archive at a time for each person', () => {
  it('refuses a second build by the same person until the first ends, and only theirs', () => {
    const end = beginArchiveBuild(1, 7);
    expect(end).not.toBeNull();
    expect(beginArchiveBuild(1, 7)).toBeNull();
    const colleague = beginArchiveBuild(1, 8);
    const otherOrganisation = beginArchiveBuild(2, 7);
    expect(colleague).not.toBeNull();
    expect(otherOrganisation).not.toBeNull();
    end!();
    end!(); // ending twice frees nothing else
    expect(beginArchiveBuild(1, 8)).toBeNull();
    const again = beginArchiveBuild(1, 7);
    expect(again).not.toBeNull();
    for (const f of [again, colleague, otherOrganisation]) f!();
  });
});
