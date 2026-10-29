/**
 * The exact bytes a transmittal sent can be downloaded, by someone who may read
 * its project, and the download is recorded (2026-10-29, W5/D7).
 *
 * The guarded transmit keeps the package before the wire and names the copy on
 * the transmittal row (sent-package-archive.ts). Nothing could read it back.
 * GET /api/mdx/gateways/transmittals/:id/sent-package now does, beside the
 * acknowledgement download. Each refusal says why and that nothing was
 * downloaded, and a missing or altered copy is never handed back as a file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'crypto';

const h = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  access: { refuse: null as null | { status: number; code: string } },
  stored: { bytes: null as null | Buffer, throws: null as null | Error },
  logAction: vi.fn(async () => ({ persisted: true })),
  queries: [] as Array<{ sql: string; args: unknown[] }>,
}));

vi.mock('../../../db', () => {
  const query = async (sql: string, args: unknown[] = []) => {
    h.queries.push({ sql, args });
    if (sql.includes('FROM submission_transmittals WHERE id = $1 AND organization_id = $2')) {
      return { rows: h.row && args[1] === 99 ? [h.row] : [], rowCount: h.row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../c2c/current-program-access', async (orig) => {
  const real = await orig<typeof import('../../c2c/current-program-access')>();
  return {
    ...real,
    requireCurrentProgramAccess: vi.fn(async () => {
      if (h.access.refuse) throw new real.ProgramReadAccessError(h.access.refuse.status as 403, h.access.refuse.code, 'Current project access does not permit this operation.');
      return { actor: { userId: 777, role: 'member' }, programId: 'p', projectId: 1, clientWorkspaceId: null };
    }),
  };
});
vi.mock('../../storage', async (orig) => {
  const real = await orig<typeof import('../../storage')>();
  return {
    ...real,
    getStorageProviderFor: () => ({
      get: async () => {
        if (h.stored.throws) throw h.stored.throws;
        return h.stored.bytes ? { bytes: h.stored.bytes, sizeBytes: h.stored.bytes.length, sha256: 'x', mime: 'application/zip', filename: 'x.zip' } : null;
      },
    }),
  };
});
vi.mock('../../auditService', () => ({ default: { logAction: h.logAction } }));

import gatewayRouter from '../../../routes/mdx-submission-gateway';
import { StorageIntegrityError } from '../../storage/storage-provider';

const BYTES = Buffer.from('PK\u0003\u0004 the exact package FDA received');
const SHA = createHash('sha256').update(BYTES).digest('hex');
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const KEPT = { storageVersionId: '22222222-2222-4222-8222-222222222222', provider: 's3', sha256: SHA, sizeBytes: BYTES.length, filename: `fda-esg-${SHA}.zip` };

function app() {
  const a = express();
  a.use((req, _res, next) => { (req as any).user = { id: 777, organizationId: 99, role: 'member' }; next(); });
  a.use('/api/mdx', gatewayRouter);
  return a;
}
const download = (id = 4242) => request(app()).get(`/api/mdx/gateways/transmittals/${id}/sent-package`)
  .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
const json = (body: Buffer) => JSON.parse(body.toString('utf8'));

beforeEach(() => {
  h.row = { program_id: PROGRAM, bundle_sha256: SHA, sent: KEPT };
  h.access.refuse = null;
  h.stored.bytes = BYTES;
  h.stored.throws = null;
  h.logAction.mockReset();
  h.logAction.mockResolvedValue({ persisted: true });
  h.queries.length = 0;
});

describe('GET /gateways/transmittals/:id/sent-package', () => {
  it('hands back the exact bytes sent, recorded first with their digest', async () => {
    const res = await download();
    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toContain(KEPT.filename);
    expect(res.headers['x-export-sha256']).toBe(SHA);
    expect(h.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EXPORT_GENERATED', organizationId: 99, userId: 777,
      resourceType: 'submission_transmittal_sent_package', resourceId: '4242',
      details: expect.objectContaining({ sha256: SHA, storageVersionId: KEPT.storageVersionId }),
    }));
  });

  it('is read under the project’s own access', async () => {
    h.access.refuse = { status: 403, code: 'PROJECT_PERMISSION_DENIED' };
    const res = await download();
    expect(res.status).toBe(403);
    expect(json(res.body).details?.code ?? json(res.body).code).toBe('PROJECT_PERMISSION_DENIED');
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it.each([
    ['another organization’s transmittal', () => { h.row = null; }, 404, 'TRANSMITTAL_NOT_FOUND'],
    ['a transmittal sent before packages were kept', () => { h.row = { ...h.row!, sent: null }; }, 404, 'SENT_PACKAGE_NOT_KEPT'],
    ['a transmittal that names no project', () => { h.row = { ...h.row!, program_id: null }; }, 409, 'SENT_PACKAGE_UNSCOPED'],
    ['a record naming another package than the one sent', () => { h.row = { ...h.row!, bundle_sha256: 'f'.repeat(64) }; }, 409, 'SENT_PACKAGE_MISMATCH'],
    ['a copy missing from storage', () => { h.stored.bytes = null; }, 409, 'SENT_PACKAGE_MISSING'],
    ['a copy whose bytes changed', () => { h.stored.bytes = Buffer.concat([BYTES, Buffer.from('x')]); }, 409, 'SENT_PACKAGE_INTEGRITY'],
    ['a copy the store reports altered', () => { h.stored.throws = new StorageIntegrityError('digest_mismatch'); }, 409, 'SENT_PACKAGE_INTEGRITY'],
  ])('refuses %s, and hands back no file', async (_label, arrange, status, code) => {
    arrange();
    const res = await download();
    expect(res.status).toBe(status);
    expect(json(res.body).details.code).toBe(code);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('delivers nothing when its record cannot be written', async () => {
    h.logAction.mockResolvedValue({ persisted: false });
    const res = await download();
    expect(res.status).toBe(503);
    expect(json(res.body).error).toMatch(/not delivered/i);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});
