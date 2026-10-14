/** The actual download route must bind storage bytes to its recorded pack,
 * not just trust an internally consistent storage sidecar. No live DB or S3. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { computeSha256, StorageIntegrityError } from '../../services/storage/storage-provider';
import { stableStringify } from '../../../shared/canonical-json';

const storage = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/storage/index.js', () => ({ getStorageProvider: () => storage }));
import createIVDRBinderRoutes from '../ivdr-binder-routes';

const ORG = 7;
const PACK = '11111111-1111-4111-8111-111111111111';
const GOOD = Buffer.from('{"approved":"artifact"}');
const CHANGED = Buffer.from('{"modified":"artifact"}');
const FORMATS = ['pdf', 'docx', 'zip', 'manifest'] as const;
const versions = Object.fromEntries(FORMATS.map((f, i) => [f, `00000000-0000-4000-8000-00000000000${i}`]));
let pack: Record<string, unknown>;
let packExists = true;
const query = vi.fn(async (sql: string, _params?: unknown[]) => {
  if (sql.includes('FROM ivdr_packs')) return { rows: packExists ? [pack] : [] };
  return { rows: [] };
});
const pool = { query } as unknown as import('pg').Pool;

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = ORG;
    (req as any).userId = 42;
    (req as any).ivdrPermissions = new Set(['*']);
    next();
  });
  a.use('/api/ivdr', createIVDRBinderRoutes(pool));
  return a;
}

function stored(bytes = GOOD) {
  return { bytes, sha256: computeSha256(bytes), sizeBytes: bytes.length,
    mime: 'application/octet-stream', filename: 'artifact.bin' };
}

function downloaded() {
  return query.mock.calls.filter(([, params]) => params?.[1] === 'PACK_DOWNLOADED');
}

beforeEach(() => {
  query.mockClear();
  storage.get.mockReset();
  packExists = true;
  pack = { id: PACK, project_id: 'programme-a', pack_version: 1, status: 'SUCCEEDED' };
  for (const f of FORMATS) {
    pack[`${f}_vault_version_id`] = versions[f];
    pack[`${f}_sha256`] = computeSha256(GOOD);
    pack[`${f}_size_bytes`] = GOOD.length;
  }
  storage.get.mockResolvedValue(stored());
});

describe('IVDR stored artifact identity', () => {
  it.each(FORMATS)('serves an intact recorded %s artifact with its actual digest', async (format) => {
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=${format}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-sha256']).toBe(computeSha256(GOOD));
    expect(storage.get).toHaveBeenCalledWith(versions[format], ORG);
    expect(downloaded()).toHaveLength(1);
  });

  it.each(FORMATS)('refuses an internally consistent replacement %s from the wrong pack identity', async (format) => {
    // Both file and sidecar changed together: provider self-consistency alone
    // passes, but the immutable filing identity in ivdr_packs is still GOOD.
    storage.get.mockResolvedValue(stored(CHANGED));
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=${format}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
    expect(res.headers['x-content-sha256']).toBeUndefined();
    expect(downloaded()).toHaveLength(0);
  });

  it.each(FORMATS)('refuses %s whose recorded pack byte length was changed', async (format) => {
    pack[`${format}_size_bytes`] = GOOD.length + 1;
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=${format}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
    expect(downloaded()).toHaveLength(0);
  });

  it.each(FORMATS)('refuses %s with no recorded artifact digest', async (format) => {
    pack[`${format}_sha256`] = null;
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=${format}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
    expect(downloaded()).toHaveLength(0);
  });

});

describe('IVDR download control flow', () => {

  it('requests authoritative artifact hashes and sizes from the scoped pack row', async () => {
    await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    const call = query.mock.calls.find(([sql]) => sql.includes('FROM ivdr_packs'));
    expect(call).toBeDefined();
    for (const format of FORMATS) {
      expect(call![0]).toContain(`${format}_sha256`);
      expect(call![0]).toContain(`${format}_size_bytes`);
    }
    expect(call![1]).toEqual([PACK, ORG]);
  });

  it.each(FORMATS)('accepts the PostgreSQL BIGINT decimal byte length for %s', async (format) => {
    pack[`${format}_size_bytes`] = String(GOOD.length);
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=${format}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-sha256']).toBe(computeSha256(GOOD));
  });

  it.each([null, '', ' ', '-1', '1.5', '2e1', '9007199254740993'])('refuses an invalid BIGINT receipt %j', async (value) => {
    pack.pdf_size_bytes = value;
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
    expect(downloaded()).toHaveLength(0);
  });

  it('reports a provider integrity refusal and records no successful download', async () => {
    storage.get.mockRejectedValue(new StorageIntegrityError('digest_mismatch'));
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
    expect(downloaded()).toHaveLength(0);
  });

  it('keeps missing/foreign pack identity absent without reaching storage', async () => {
    packExists = false;
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
    expect(downloaded()).toHaveLength(0);
  });

  it('does not record a successful download when the stored version is missing', async () => {
    storage.get.mockResolvedValue(null);
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(404);
    expect(downloaded()).toHaveLength(0);
  });

  it('does not emit a provider-supplied digest unrelated to the verified bytes', async () => {
    storage.get.mockResolvedValue({ ...stored(), sha256: computeSha256(CHANGED) });
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-sha256']).toBe(computeSha256(GOOD));
  });

  it('refuses to substitute a snapshot when the recorded original manifest is missing', async () => {
    storage.get.mockResolvedValue(null);
    const snapshot = { source: 'a different rendering' };
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM ivdr_packs')) return { rows: [pack] };
      if (sql.includes('FROM ivdr_pack_snapshots')) return { rows: [{ snapshot_json: snapshot }] };
      return { rows: [] };
    });
    try {
      const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=manifest`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PACK_ARTIFACT_MISSING');
      expect(downloaded()).toHaveLength(0);
    } finally {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM ivdr_packs')) return { rows: packExists ? [pack] : [] };
        return { rows: [] };
      });
    }
  });

});

describe('legacy snapshot fallback remains an integrity-checked view', () => {
    const snapshot = { nested: { z: 1, a: 2 }, observations: [3, 4] };
    const snapshotDigest = computeSha256(Buffer.from(stableStringify(snapshot)));
    const installSnapshot = (rowHash: unknown = snapshotDigest) => {
      pack.manifest_vault_version_id = null;
      pack.snapshot_hash_sha256 = snapshotDigest;
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM ivdr_packs')) return { rows: [pack] };
        if (sql.includes('FROM ivdr_pack_snapshots')) return { rows: [{ snapshot_json: snapshot, snapshot_hash_sha256: rowHash }] };
        return { rows: [] };
      });
    };

    it('verifies canonical nested content and hashes the actual rendered JSON', async () => {
      installSnapshot();
      try {
        const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=manifest`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(snapshot);
        expect(res.headers['x-content-sha256']).toBe(computeSha256(Buffer.from(JSON.stringify(snapshot, null, 2))));
        expect(storage.get).not.toHaveBeenCalled();
        expect(downloaded()).toHaveLength(1);
        const call = query.mock.calls.find(([sql]) => sql.includes('FROM ivdr_pack_snapshots'));
        expect(call![1]).toEqual([PACK, ORG]);
        expect(call![0]).toContain('organization_id = $2');
      } finally { resetQuery(); }
    });

    it.each(['row', 'pack', 'missing'] as const)('refuses the snapshot when its %s hash does not establish identity', async (which) => {
      installSnapshot(which === 'row' ? computeSha256(CHANGED) : which === 'missing' ? null : snapshotDigest);
      if (which === 'pack') pack.snapshot_hash_sha256 = computeSha256(CHANGED);
      try {
        const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=manifest`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PACK_ARTIFACT_INTEGRITY_FAILED');
        expect(downloaded()).toHaveLength(0);
      } finally { resetQuery(); }
    });
});

function resetQuery() {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM ivdr_packs')) return { rows: packExists ? [pack] : [] };
    return { rows: [] };
  });
}
