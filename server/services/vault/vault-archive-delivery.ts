/** Delivery and admission shared by the Vault's verified archive callers. */
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('vault-archive-delivery');
const builds = new Map<string, symbol>();

/** One in-process build per tenant/account across both archive routes. */
export function beginArchiveBuild(organizationId: number, userId: number | undefined): (() => void) | null {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !userId || !Number.isSafeInteger(userId) || userId <= 0) return null;
  const key = `${organizationId}:${userId}`;
  if (builds.has(key)) return null;
  const ticket = Symbol(key);
  builds.set(key, ticket);
  return () => { if (builds.get(key) === ticket) builds.delete(key); };
}

/** Stream a finished archive, or clean up if its reader disconnected while building. */
export function sendStagedArchive(
  res: Response,
  built: { path: string; size: number; sha256: string },
  stage: { cleanup(): Promise<void> },
  fileName: string,
  withheldCount?: number,
): boolean {
  const cleanup = () => { void stage.cleanup().catch((err: unknown) => {
    logger.error('vault archive cleanup failed', { err: err instanceof Error ? err.message : String(err) });
  }); };
  if (res.destroyed || res.writableEnded) { cleanup(); return false; }
  if (withheldCount !== undefined) res.setHeader('X-Archive-Withheld', String(withheldCount));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(built.size));
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Content-SHA256', built.sha256);
  res.setHeader('Cache-Control', 'no-store');
  const stream = createReadStream(built.path);
  res.once('close', () => { stream.destroy(); cleanup(); });
  stream.on('error', (err) => {
    logger.error('vault archive stream failed', { fileName, err: err.message });
    res.destroy(err);
  });
  stream.pipe(res);
  return true;
}
