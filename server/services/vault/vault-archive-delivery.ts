/**
 * Handing a finished Vault archive to the person who asked for it: a seal's
 * closing archive (VR-20) and a folder's export (MR-08 Stage 6 step 3).
 *
 * Two rules from the security review of 2026-10-30
 * (`docs/evidence/D5/2026-10-30-vault-archive-review-fixes/`):
 *   - The staged plaintext files and the ZIP leave no copy at rest. A person
 *     who closes the request before the archive is ready used to leave the
 *     whole staging directory in tmp: the response's `close` had already fired
 *     when the send listened for it. A response that is already closed is
 *     cleaned up at once, and nothing is sent.
 *   - One person builds one archive at a time. Each build reads, writes,
 *     compresses and hashes every file it holds, so a second build by the
 *     same person waits for the first rather than doubling that work.
 */
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('vault-archive-delivery');

/** Stream a finished archive with its recorded SHA-256, then remove its staging directory. */
export function sendStagedArchive(
  res: Response,
  built: { path: string; size: number; sha256: string },
  stage: { cleanup(): Promise<void> },
  fileName: string,
): void {
  if (res.destroyed || res.writableEnded) {
    // Gone before the archive was ready: nothing to send, and nothing may stay behind.
    void stage.cleanup().catch(() => undefined);
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(built.size));
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Content-SHA256', built.sha256);
  res.setHeader('Cache-Control', 'no-store');
  const stream = createReadStream(built.path);
  res.on('close', () => { stream.destroy(); void stage.cleanup().catch(() => undefined); });
  stream.on('error', (err) => {
    logger.error('vault archive stream failed', { fileName, err: err.message });
    res.destroy(err);
  });
  stream.pipe(res);
}

const building = new Set<string>();

/**
 * Begin one person's archive build, or null while another of theirs is being
 * built. The returned function ends it; call it once, in a `finally`. This
 * holds per server process; each process bounds its own work.
 */
export function beginArchiveBuild(organizationId: number, userId: number | string | undefined): (() => void) | null {
  const key = `${organizationId}:${userId ?? 'anonymous'}`;
  if (building.has(key)) return null;
  building.add(key);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    building.delete(key);
  };
}

export const ARCHIVE_BUSY = {
  error: 'ARCHIVE_BUSY',
  message: 'Another archive you asked for is still being built. Try again when it has finished. Nothing was sent.',
} as const;
