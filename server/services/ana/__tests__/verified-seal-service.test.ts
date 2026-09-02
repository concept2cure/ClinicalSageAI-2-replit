/**
 * Transaction + gate tests for sealVerifiedVersion. The pool is injected, so no
 * live DB: a fake client records every query so we can assert that the version,
 * the sealed-record signature, the provenance event, and the audit log are all
 * written inside ONE BEGIN/COMMIT.
 *
 * The signer's §11.50 printed name is RESOLVED on the transaction from the
 * membership record (server/services/part11/resolve-signer-identity.ts), never
 * taken from the caller, so the fixture has to answer that lookup the way the
 * real JOIN would: a row for a member of THIS org, nothing for anyone else.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  sealVerifiedVersion,
  SealBlockedError,
  type SealPool,
  type SealVerifiedVersionInput,
} from '../verifiedSealService';
import { SignerNotAttributableError } from '../../part11/resolve-signer-identity';

/**
 * The one membership the fixture knows: user 42 is a member of org 1.
 *
 * `resolveSignerIdentity` joins `users` to `organization_users` on
 * `(user_id = $1, organization_id = $2)` and reads `name`, `email`, `title`.
 * The answer below is keyed on BOTH params so the fixture models the
 * membership relation, not a bare user lookup — the same signer asked for in
 * another org resolves to nothing, exactly as the real query would.
 */
const MEMBER_USER_ID = 42;
const MEMBER_ORG_ID = 1;
const MEMBER_ROW = { name: 'Dr. Jane Roe', email: 'jane@example.com', title: 'Regulatory Affairs Lead' };
const SIGNER_IDENTITY_SQL = /SELECT u\.name, u\.email, u\.title\s+FROM users u\s+JOIN organization_users ou/;

type Answer = { rows: any[] };
/** Per-test override; return `undefined` to fall through to the canned rows. */
type Answerer = (sql: string, params?: unknown[]) => Answer | undefined;

/** Canned rows for every statement the service issues. `override` is consulted first. */
function answer(sql: string, params: unknown[] | undefined, override?: Answerer): Answer {
  const overridden = override?.(sql, params);
  if (overridden) return overridden;
  if (SIGNER_IDENTITY_SQL.test(sql)) {
    const [userId, orgId] = params ?? [];
    return userId === MEMBER_USER_ID && orgId === MEMBER_ORG_ID ? { rows: [MEMBER_ROW] } : { rows: [] };
  }
  if (/INSERT INTO concept2cure_artifacts\b/.test(sql)) return { rows: [{ id: 101 }] };
  if (/INSERT INTO concept2cure_artifact_versions\b/.test(sql)) return { rows: [{ id: 202, version: 1 }] };
  return { rows: [] };
}

/** A fake PoolClient that records queries and returns canned RETURNING rows. */
function makePool(override?: Answerer) {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return answer(sql, params, override);
    }),
    release: vi.fn(),
  };
  const pool: SealPool = { connect: vi.fn(async () => client) };
  return { pool, client, queries };
}

function baseInput(over: Partial<SealVerifiedVersionInput> = {}): SealVerifiedVersionInput {
  return {
    organizationId: MEMBER_ORG_ID,
    projectId: 7,
    userId: MEMBER_USER_ID,
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

  it('resolves the §11.50 printed name on the SAME transaction, scoped to the signing org', async () => {
    const { pool, queries } = makePool();
    await sealVerifiedVersion(baseInput(), pool);

    const idx = queries.findIndex((q) => SIGNER_IDENTITY_SQL.test(q.sql));
    expect(idx).toBeGreaterThan(0); // after BEGIN …
    expect(queries[idx].params).toEqual([MEMBER_USER_ID, MEMBER_ORG_ID]); // … (user, org) — membership, not a bare PK read
    expect(queries.findIndex((q) => q.sql === 'COMMIT')).toBeGreaterThan(idx); // … before COMMIT

    // The row asserts the RESOLVED identity, not whatever the caller sent.
    const sig = queries.find((q) => /INSERT INTO concept2cure_signatures/.test(q.sql));
    expect(sig?.params).toContain(MEMBER_ROW.name);
    expect(sig?.params).toContain(MEMBER_ROW.email);
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
    const { pool, queries } = makePool((sql) => {
      // External-id → artifact PK resolution (org-scoped SELECT).
      if (/SELECT id FROM concept2cure_artifacts/.test(sql)) return { rows: [{ id: 777 }] };
      // version number → version-row PK resolution (org-scoped SELECT).
      if (/SELECT id, version FROM concept2cure_artifact_versions/.test(sql)) return { rows: [{ id: 888, version: 4 }] };
      return undefined;
    });

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
    const { pool, queries } = makePool((sql) => {
      if (/SELECT id FROM concept2cure_artifacts/.test(sql)) return { rows: [] }; // not found / wrong org
      return undefined;
    });
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
    const { pool, client, queries } = makePool((sql) => {
      if (/INSERT INTO concept2cure_signatures/.test(sql)) throw new Error('db write failed');
      return undefined;
    });
    await expect(sealVerifiedVersion(baseInput(), pool)).rejects.toThrow('db write failed');
    expect(queries.map((q) => q.sql)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('sealVerifiedVersion — §11.100 signer attribution', () => {
  it('refuses a signer who is not a member of the signing org, and writes nothing after the refusal', async () => {
    const { pool, client, queries } = makePool();
    // Same person, a different org: the membership JOIN returns no row. The
    // fixture is keyed on (user, org), so this is the real query's answer —
    // not a hand-tuned "throw here".
    const foreignOrg = MEMBER_ORG_ID + 1;
    const rejection = sealVerifiedVersion(baseInput({ organizationId: foreignOrg }), pool);
    await expect(rejection).rejects.toBeInstanceOf(SignerNotAttributableError);
    await expect(rejection).rejects.toMatchObject({ code: 'SIGNER_NOT_ATTRIBUTABLE' });

    const sqls = queries.map((q) => q.sql);
    const refusedAt = sqls.findIndex((s) => SIGNER_IDENTITY_SQL.test(s));
    expect(refusedAt).toBeGreaterThan(0);
    // The lookup was scoped to the org the signature is being made IN.
    expect(queries[refusedAt].params).toEqual([MEMBER_USER_ID, foreignOrg]);

    // Once the signer cannot be named, nothing else is written: no signature,
    // no provenance, no audit — the only statement after the refusal is the
    // ROLLBACK that discards what preceded it.
    const afterRefusal = sqls.slice(refusedAt + 1);
    expect(afterRefusal.filter((s) => /INSERT INTO/i.test(s))).toEqual([]);
    expect(afterRefusal).toEqual(['ROLLBACK']);
    expect(sqls.some((s) => /INSERT INTO concept2cure_signatures/.test(s))).toBe(false);
    expect(sqls.some((s) => /INSERT INTO concept2cure_provenance_events/.test(s))).toBe(false);
    expect(sqls.some((s) => /INSERT INTO regulatory_audit_logs/.test(s))).toBe(false);
    expect(sqls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
