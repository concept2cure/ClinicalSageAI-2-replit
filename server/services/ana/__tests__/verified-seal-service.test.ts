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

/**
 * The §11.50 printed name is RESOLVED from organization_users, not taken from
 * the input (services/part11/resolve-signer-identity.ts). Every mock client
 * here therefore has to answer that lookup, or the seal refuses before it
 * writes anything — so the stub lives in one place rather than in each of the
 * four mocks separately.
 *
 * Returning `null` stands for "this user is not a member of this org", which
 * is what the gate exists to catch; the last test in the file uses it.
 */
const MEMBER_SIGNER = { name: 'Dr. Jane Roe', email: 'jane@example.com', title: 'RA Lead' };

/** The §11.100 attribution lookup: who this user is IN this organization. */
const SIGNER_IDENTITY_SQL = /FROM users u[\s\S]*organization_users/;

function signerLookup(sql: string, signer: typeof MEMBER_SIGNER | null) {
  if (SIGNER_IDENTITY_SQL.test(sql)) {
    return { rows: signer ? [signer] : [] };
  }
  return null;
}

/** A fake PoolClient that records queries and returns canned RETURNING rows. */
function makePool(signer: typeof MEMBER_SIGNER | null = MEMBER_SIGNER) {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      const who = signerLookup(sql, signer);
      if (who) return who;
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
        const who = signerLookup(sql, MEMBER_SIGNER);
        if (who) return who;
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
        const who = signerLookup(sql, MEMBER_SIGNER);
        if (who) return who;
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
      const who = signerLookup(sql, MEMBER_SIGNER);
      if (who) return who;
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

/**
 * The mocks above answer the organization_users lookup, which is what makes the
 * happy paths reachable at all. That answer must not be the only thing the
 * suite ever sees, or these tests would pass by mocking the §11.100 gate away
 * rather than by exercising it.
 */
describe('sealVerifiedVersion — §11.100 signer attribution', () => {
  it('refuses to seal when the signer is not a member of the signing org', async () => {
    const { pool, queries } = makePool(null); // user 42 resolves to no membership row

    await expect(sealVerifiedVersion(baseInput(), pool)).rejects.toMatchObject({
      code: 'SIGNER_NOT_ATTRIBUTABLE',
    });

    // A signature that cannot name its signer is not a weaker signature; it is
    // not a signature. The attribution lookup runs after the version insert and
    // before the signature insert, so the version write is attempted and then
    // undone: what must hold is that no signature row is written and the
    // transaction ends in ROLLBACK, never COMMIT.
    const sqls = queries.map((q) => q.sql.replace(/\s+/g, ' ').trim());
    expect(sqls.some((s) => /INSERT INTO concept2cure_signatures/.test(s))).toBe(false);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');

    // The lookup that refused was scoped to the org the signature is being
    // made IN — a membership anywhere else must not name this signer.
    const refusedAt = queries.findIndex((q) => SIGNER_IDENTITY_SQL.test(q.sql));
    expect(refusedAt).toBeGreaterThan(0);
    expect(queries[refusedAt].params).toEqual([baseInput().userId, baseInput().organizationId]);

    // Nothing at all is written after the refusal: no provenance, no audit —
    // the only statement that follows is the ROLLBACK.
    const afterRefusal = sqls.slice(refusedAt + 1);
    expect(afterRefusal.filter((s) => /INSERT INTO/i.test(s))).toEqual([]);
    expect(afterRefusal).toEqual(['ROLLBACK']);
  });

  it('does not take the printed name from caller input — it resolves it', async () => {
    // The input claims one identity; the membership record holds another. The
    // §11.50 printed name and the §11.200 attribution hash must follow the
    // record, or a signature could be attributed to whoever the caller typed.
    const { pool, queries } = makePool(MEMBER_SIGNER);
    await sealVerifiedVersion(
      baseInput({ signerName: 'Someone Else', signerEmail: 'attacker@example.com' }),
      pool,
    );

    const sig = queries.find((q) => /INSERT INTO concept2cure_signatures/.test(q.sql));
    expect(sig).toBeDefined();
    const params = JSON.stringify(sig!.params ?? []);
    expect(params).toContain('jane@example.com');
    expect(params).not.toContain('attacker@example.com');
  });
});
