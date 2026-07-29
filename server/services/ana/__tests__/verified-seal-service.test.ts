/**
 * Transaction + gate tests for sealVerifiedVersion. The pool is injected, so no
 * live DB: a fake client records every query so we can assert that the version,
 * the sealed-record signature, the provenance event, and the audit log are all
 * written inside ONE BEGIN/COMMIT.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  sealVerifiedVersion,
  SealBlockedError,
  type SealPool,
  type SealVerifiedVersionInput,
} from '../verifiedSealService';

/** A fake PoolClient that records queries and returns canned RETURNING rows. */
function makePool() {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (/INSERT INTO concept2cure_artifacts\b/.test(sql)) return { rows: [{ id: 101 }] };
      if (/INSERT INTO concept2cure_artifact_versions\b/.test(sql)) return { rows: [{ id: 202, version: 1 }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool: SealPool = { connect: vi.fn(async () => client) };
  return { pool, client, queries };
}

function baseInput(over: Partial<SealVerifiedVersionInput> = {}): SealVerifiedVersionInput {
  return {
    organizationId: 1,
    projectId: 7,
    userId: 42,
    signerName: 'Dr. Jane Roe',
    signerEmail: 'jane@example.com',
    signerRole: 'ra_lead',
    title: 'Module 3.2.P.8 Stability',
    content: 'The drug product is stable for 24 months at 25°C.',
    manifestation: { printedName: 'Dr. Jane Roe', meaning: 'APPROVER', reasonForChange: 'Verified clean against source.' },
    verification: { ok: true, message: 'Verified.' },
    ...over,
  };
}

describe('sealVerifiedVersion — happy path (one transaction)', () => {
  it('writes version + sealed signature + provenance + audit between BEGIN and COMMIT', async () => {
    const { pool, queries } = makePool();
    const result = await sealVerifiedVersion(baseInput(), pool);

    const sqls = queries.map((q) => q.sql.replace(/\s+/g, ' ').trim());
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifact_versions/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO concept2cure_signatures/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO concept2cure_provenance_events/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO regulatory_audit_logs/.test(s))).toBe(true);
    expect(sqls).not.toContain('ROLLBACK');

    expect(result.versionId).toBe(202);
    expect(result.sealedRecord.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sealedRecord.aiDisclosed).toBe(true);
    expect(result.signatureId).toMatch(/^sig_/);
  });

  it('records the §11.50 meaning + reason in the signature manifest', async () => {
    const { pool, queries } = makePool();
    await sealVerifiedVersion(baseInput(), pool);
    const sig = queries.find((q) => /INSERT INTO concept2cure_signatures/.test(q.sql));
    const manifestParam = (sig?.params ?? []).find(
      (p) => typeof p === 'string' && p.includes('§11.50'),
    ) as string;
    const parsed = JSON.parse(manifestParam);
    expect(parsed.meaning).toBe('APPROVER');
    expect(parsed.reasonForChange).toBe('Verified clean against source.');
    expect(parsed.sealedRecord.algorithm).toBe('sha256');
  });

  it('E11: binds the seal to the EXISTING persisted row resolved from external id + version number (no fallback)', async () => {
    // The client knows only the EXTERNAL artifact id and the version NUMBER — not
    // the row PKs. The service must resolve both org-scoped and seal the existing
    // row, never the fallback INSERT.
    const queries: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        // External-id → artifact PK resolution (org-scoped SELECT).
        if (/SELECT id FROM concept2cure_artifacts/.test(sql)) return { rows: [{ id: 777 }] };
        // version number → version-row PK resolution (org-scoped SELECT).
        if (/SELECT id, version FROM concept2cure_artifact_versions/.test(sql)) return { rows: [{ id: 888, version: 4 }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool: SealPool = { connect: vi.fn(async () => client) };

    const result = await sealVerifiedVersion(
      baseInput({ artifactExternalId: 'artifact_persisted_e11', existingVersionNumber: 4 }),
      pool,
    );

    const sqls = queries.map((q) => q.sql);
    // The persisted rows were RESOLVED, not re-inserted.
    expect(sqls.some((s) => /SELECT id FROM concept2cure_artifacts/.test(s))).toBe(true);
    expect(sqls.some((s) => /SELECT id, version FROM concept2cure_artifact_versions/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifacts\b/.test(s))).toBe(false);
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifact_versions\b/.test(s))).toBe(false);

    // The id threaded all the way through to the seal target.
    expect(result.artifactPk).toBe(777);
    expect(result.artifactId).toBe('artifact_persisted_e11');
    expect(result.versionId).toBe(888);
    expect(result.version).toBe(4);

    // The signature + audit rows point at the resolved version PK.
    const sig = queries.find((q) => /INSERT INTO concept2cure_signatures/.test(q.sql));
    expect(sig?.params).toContain(888);
    const audit = queries.find((q) => /INSERT INTO regulatory_audit_logs/.test(q.sql));
    expect(audit?.params).toContain(String(888));
  });

  it('E11: falls back to a fresh insert when the external id resolves to nothing (foreign/unknown id)', async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (/SELECT id FROM concept2cure_artifacts/.test(sql)) return { rows: [] }; // not found / wrong org
        if (/INSERT INTO concept2cure_artifacts\b/.test(sql)) return { rows: [{ id: 101 }] };
        if (/INSERT INTO concept2cure_artifact_versions\b/.test(sql)) return { rows: [{ id: 202, version: 1 }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool: SealPool = { connect: vi.fn(async () => client) };
    const result = await sealVerifiedVersion(
      baseInput({ artifactExternalId: 'artifact_unknown', existingVersionNumber: 9 }),
      pool,
    );
    const sqls = queries.map((q) => q.sql);
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifacts\b/.test(s))).toBe(true);
    expect(result.versionId).toBe(202);
  });

  it('consumes Build-1 references without re-inserting artifact/version', async () => {
    const { pool, queries } = makePool();
    const result = await sealVerifiedVersion(
      baseInput({ artifactPk: 900, artifactExternalId: 'artifact_b1', existingVersionId: 950, existingVersionNumber: 3 }),
      pool,
    );
    const sqls = queries.map((q) => q.sql);
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifacts\b/.test(s))).toBe(false);
    expect(sqls.some((s) => /INSERT INTO concept2cure_artifact_versions\b/.test(s))).toBe(false);
    expect(result.artifactId).toBe('artifact_b1');
    expect(result.versionId).toBe(950);
    expect(result.version).toBe(3);
  });
});

describe('sealVerifiedVersion — fail-closed gates (no DB work)', () => {
  it('blocks when content is not verified clean', async () => {
    const { pool, client } = makePool();
    await expect(sealVerifiedVersion(baseInput({ verification: { ok: false } }), pool)).rejects.toMatchObject({
      code: 'NOT_VERIFIED',
    });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('blocks sample content', async () => {
    const { pool, client } = makePool();
    await expect(sealVerifiedVersion(baseInput({ isSample: true }), pool)).rejects.toBeInstanceOf(SealBlockedError);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('blocks an invalid §11.50 meaning (enum enforced server-side)', async () => {
    const { pool, client } = makePool();
    await expect(
      sealVerifiedVersion(baseInput({ manifestation: { printedName: 'X', meaning: 'approve' as any, reasonForChange: 'long enough reason' } }), pool),
    ).rejects.toMatchObject({ code: 'INVALID_MEANING' });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rolls back when a write fails mid-transaction', async () => {
    const { pool, client, queries } = makePool();
    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (/INSERT INTO concept2cure_artifacts\b/.test(sql)) return { rows: [{ id: 101 }] };
      if (/INSERT INTO concept2cure_artifact_versions\b/.test(sql)) return { rows: [{ id: 202, version: 1 }] };
      if (/INSERT INTO concept2cure_signatures/.test(sql)) throw new Error('db write failed');
      return { rows: [] };
    });
    await expect(sealVerifiedVersion(baseInput(), pool)).rejects.toThrow('db write failed');
    expect(queries.map((q) => q.sql)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
