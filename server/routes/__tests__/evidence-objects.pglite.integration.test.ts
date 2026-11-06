/**
 * GET /api/evidence-objects — END-TO-END against in-process PGlite.
 *
 * Proves the GA read path: the route SELECTs from the REAL, canonical
 * `evidence_objects` graph table (shared/schema/programs.ts) and maps its real
 * columns to the picker's display contract { id, title, type, category, source }
 * — no blob, no fixture. The DDL below mirrors the true evidence_objects column
 * shape (uuid PK, org-scoped, NOT-NULL title/evidence_type/evidence_category/
 * source_type/status). Locks: org scope, column→contract mapping, the honest
 * `source` derivation (source_reference → source_type → ''), the ILIKE q-filter
 * over real columns, an honest empty state, and 42P01 fail-closed-to-empty.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({ db: null as unknown, failAudit: false, failCommit: false,
  statements: [] as string[], discarded: false }));
let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../db', () => ({
  get db() { return H.db; },
  pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) },
  getPool: () => pool,
}));

import evidenceObjectsRouter from '../evidence-objects.routes';
import evidenceRouter from '../evidence';

const ORG = 7;
const OTHER = 9;

const USER = 11;
const EVIDENCE = 'ecf00001-0000-4000-8000-000000000001';
const PROGRAM = 'a0000000-0000-4000-8000-000000000001';
const PRIVATE_PROGRAM = 'a0000000-0000-4000-8000-000000000002';
const REASON = 'Reviewed the saved source and the stated results.';

// Exercise the full table definitions from their existing creator, including
// source, verification and metadata columns; no separate Atom store.
const creator = readFileSync('migrations/20260524_program_workbench_schema.sql', 'utf8');
const tableDdl = (name: string) => {
  const match = creator.match(new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${name} \([\s\S]*?\n\);`));
  if (!match) throw new Error(`Missing ${name} creator`);
  return match[0];
};
const DDL = `${tableDdl('evidence_objects')} ${tableDdl('evidence_links')}`;
const ACCESS_DDL = `
  ${AUDIT_LOGS_PGLITE_DDL}
  ALTER TABLE audit_logs ADD COLUMN chain_seq BIGSERIAL;
  CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
  CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
  CREATE TABLE organization_users (organization_id integer, user_id integer, role text,
    PRIMARY KEY (organization_id,user_id));
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
  CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, name text, description text, metadata jsonb,
    status text, regulatory_program_id uuid, client_workspace_id integer, owner_id integer, created_by_id integer,
    settings jsonb DEFAULT '{}', created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
  CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
  CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
  CREATE TABLE concept2cure_review_assignments (artifact_id integer, organization_id integer, reviewer_id integer, status text);
  CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
`;

async function insertRow(r: {
  id: string; org: number; title: string; code?: string | null;
  type: string; category: string; sourceType: string; sourceRef?: string | null;
}) {
  await pglite.query(
    `INSERT INTO evidence_objects
       (id, organization_id, title, code, evidence_type, evidence_category, source_type, source_reference, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved')`,
    [r.id, r.org, r.title, r.code ?? null, r.type, r.category, r.sourceType, r.sourceRef ?? null],
  );
}

function appWith(org: number | null, userId: number | null = USER) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) {
      (req as unknown as { organizationId: number }).organizationId = org;
      // The token's role is deliberately stale; persisted membership decides.
      Object.assign(req, { user: userId === null ? undefined : { id: userId, organizationId: org, role: 'admin' },
        userId: userId ?? undefined, tenantContext: { organizationId: org },
        dbClient: { query: async (sql: string, params?: unknown[]) => {
          H.statements.push(sql);
          if (H.failAudit && /INSERT INTO audit_logs/i.test(sql)) throw new Error('fixture audit refused');
          const out = await pool.query(sql, params);
          if (H.failCommit && /^COMMIT/i.test(sql)) throw new Error('fixture commit acknowledgement lost');
          return out;
        }, discard: async () => { H.discarded = true; } } });
    }
    next();
  });
  app.use('/api/evidence-objects', evidenceObjectsRouter);
  app.use('/api/evidence', evidenceRouter);
  return app;
}

beforeAll(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', 'evidence-fixture-only-audit-key-32-bytes-long');
  vi.stubEnv('AUDIT_HMAC_SECRET', 'evidence-fixture-only-tamper-key-32-bytes-long');
  pglite = new PGlite();
  H.db = drizzle(pglite);
  await pglite.exec(ACCESS_DDL + DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  H.failAudit = false; H.failCommit = false; H.discarded = false; H.statements = [];
  await pglite.exec(`DELETE FROM evidence_links; DELETE FROM evidence_objects; DELETE FROM audit_logs;
    DELETE FROM organization_users; DELETE FROM users; DELETE FROM organizations;
    DELETE FROM projects; DELETE FROM regulatory_programs; DELETE FROM project_visibility_settings;
    DELETE FROM project_members;
    INSERT INTO organizations (id) VALUES (${ORG}),(${OTHER});
    INSERT INTO users (id) VALUES (${USER}),(22);
    INSERT INTO organization_users VALUES (${ORG},${USER},'member'),(${OTHER},22,'admin');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',${ORG},NULL),('${PRIVATE_PROGRAM}',${ORG},NULL);
    INSERT INTO projects (id,organization_id,name,status,regulatory_program_id,client_workspace_id,owner_id,created_by_id)
      VALUES (3,${ORG},'Own project','active','${PROGRAM}',51,${USER},${USER}),
             (4,${ORG},'Read-only project','active','${PRIVATE_PROGRAM}',51,22,22);
    INSERT INTO project_visibility_settings VALUES (3,${ORG},'org_public'),(4,${ORG},'org_public');
  `);
});

describe('GET /api/evidence-objects (real evidence_objects store)', () => {
  it('reads real rows org-scoped and maps them to the picker display contract', async () => {
    await insertRow({
      id: 'ecf00005-0000-4000-8000-000000000005', org: ORG, code: 'CSR-099-201',
      title: 'BX-099 gMG Phase 2 clinical study report (MG-ADL change)',
      type: 'study_report', category: 'clinical', sourceType: 'internal',
      sourceRef: 'Internal CSR · TR-099-201',
    });
    await insertRow({
      id: 'ecf00001-0000-4000-8000-000000000001', org: ORG, code: 'CSR-204-301',
      title: 'BX-204 CGM pivotal accuracy study report (MARD 8.1%)',
      type: 'study_report', category: 'clinical', sourceType: 'internal',
      sourceRef: 'Internal CSR · TR-204-301',
    });
    // Another tenant's row must never surface.
    await insertRow({
      id: 'ecf0000f-0000-4000-8000-00000000000f', org: OTHER, code: 'ZZ-1',
      title: 'Some other org evidence', type: 'dataset', category: 'clinical',
      sourceType: 'internal', sourceRef: 'Other lake',
    });

    const res = await request(appWith(ORG)).get('/api/evidence-objects?programId=abc');
    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('evidence_objects');
    const data = res.body.data as Array<Record<string, string>>;
    expect(data).toHaveLength(2);
    // ORDER BY title ASC — BX-099 title sorts before BX-204.
    expect(data.map((d) => d.title)).toEqual([
      'BX-099 gMG Phase 2 clinical study report (MG-ADL change)',
      'BX-204 CGM pivotal accuracy study report (MARD 8.1%)',
    ]);
    const row = data[1];
    expect(row).toEqual({
      id: 'ecf00001-0000-4000-8000-000000000001',
      title: 'BX-204 CGM pivotal accuracy study report (MARD 8.1%)',
      type: 'study_report',
      category: 'clinical',
      source: 'Internal CSR · TR-204-301',
    });
    // No cross-tenant leak.
    expect(data.some((d) => d.title === 'Some other org evidence')).toBe(false);
  });

  it('derives source from source_reference, falling back to source_type when null', async () => {
    await insertRow({
      id: 'ecf00007-0000-4000-8000-000000000007', org: ORG, code: 'DS-099-PK',
      title: 'BX-099 population pharmacokinetics analysis dataset',
      type: 'dataset', category: 'clinical', sourceType: 'internal',
      sourceRef: null, // no explicit provenance ref → falls back to source_type
    });
    const res = await request(appWith(ORG)).get('/api/evidence-objects');
    expect(res.status).toBe(200);
    expect(res.body.data[0].source).toBe('internal');
  });

  it('narrows via ILIKE q across real columns (title / code / source), org-scoped', async () => {
    await insertRow({
      id: 'ecf00001-0000-4000-8000-000000000001', org: ORG, code: 'CSR-204-301',
      title: 'BX-204 CGM pivotal accuracy study report (MARD 8.1%)',
      type: 'study_report', category: 'clinical', sourceType: 'internal',
      sourceRef: 'Internal CSR · TR-204-301',
    });
    await insertRow({
      id: 'ecf0000b-0000-4000-8000-00000000000b', org: ORG, code: 'TX-512-GLP',
      title: 'Vorelinib (BX-512) GLP repeat-dose toxicology summary',
      type: 'study_report', category: 'nonclinical', sourceType: 'internal',
      sourceRef: 'GLP CRO · TX-512-GLP',
    });

    const res = await request(appWith(ORG)).get('/api/evidence-objects?q=512');
    expect(res.status).toBe(200);
    const data = res.body.data as Array<Record<string, string>>;
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Vorelinib (BX-512) GLP repeat-dose toxicology summary');
  });

  it('returns an honest empty list for an org with no evidence', async () => {
    await insertRow({
      id: 'ecf0000f-0000-4000-8000-00000000000f', org: OTHER, code: 'ZZ-1',
      title: 'Other org only', type: 'dataset', category: 'clinical',
      sourceType: 'internal', sourceRef: 'x',
    });
    const res = await request(appWith(ORG)).get('/api/evidence-objects');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('403s without org context', async () => {
    const res = await request(appWith(null)).get('/api/evidence-objects');
    expect(res.status).toBe(403);
  });

  it('fails closed to an empty envelope on 42P01 when the store is absent', async () => {
    await pglite.exec(`ALTER TABLE evidence_objects RENAME TO evidence_objects_unavailable;`);
    try {
      const res = await request(appWith(ORG)).get('/api/evidence-objects');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.pendingStore).toBe(true);
    } finally {
      // Restore for any later run ordering; beforeEach also DELETEs from it.
      await pglite.exec(`ALTER TABLE evidence_objects_unavailable RENAME TO evidence_objects;`);
    }
  });
});

async function savedEvidence() {
  return (await pglite.query<Record<string, unknown>>('SELECT * FROM evidence_objects WHERE id=$1', [EVIDENCE])).rows[0];
}
async function currentHash() {
  const response = await request(appWith(ORG)).get(`/api/evidence/${EVIDENCE}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.meta.contentHash).toMatch(/^[0-9a-f]{64}$/);
  return response.body.meta.contentHash as string;
}
async function decide(approved = true, extras: Record<string, unknown> = {}, userId: number | null = USER) {
  return request(appWith(ORG, userId)).post(`/api/evidence/${EVIDENCE}/verify`)
    .send({ approved, expectedContentHash: await currentHash(), reason: REASON, ...extras });
}
async function auditRows() {
  return (await pglite.query<Record<string, unknown>>('SELECT * FROM audit_logs ORDER BY chain_seq')).rows;
}

async function seedGovernedEvidence() {
    await insertRow({ id: EVIDENCE, org: ORG, title: 'Study results', type: 'clinical_data',
      category: 'clinical', sourceType: 'internal', sourceRef: 'Study source, version 1' });
    await pglite.query(`UPDATE evidence_objects SET status='pending', program_id=$1, document_id=44,
      document_version='1', page_range='12', excerpt='The result was 18.', test_results='{"result":18}',
      metadata='{"method":"saved analysis"}' WHERE id=$2`, [PROGRAM, EVIDENCE]);
}

describe('governed evidence verification', () => {
  beforeEach(seedGovernedEvidence);

  it('binds a human decision to exact material content and the current actor in a real chained audit transaction', async () => {
    const hash = await currentHash();
    const response = await decide();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.meta).toMatchObject({ contentHash: hash, audited: true, verificationMethod: 'human_review' });
    const saved = await savedEvidence();
    expect(saved).toMatchObject({ is_verified: true, status: 'approved', verified_by: String(USER) });
    expect((saved.metadata as Record<string, unknown>).verificationReceipt).toMatchObject({
      schemaVersion: 1, method: 'human_review', contentHash: hash, reviewerUserId: USER, approved: true, reason: REASON,
    });
    expect(await currentHash()).toBe(hash); // review fields never change the reviewed content hash
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant_id: ORG, user_id: USER, action: 'evidence.verified', reason: REASON });
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].hmac_seal).toBeTruthy();
    expect((rows[0].new_values as Record<string, unknown>).receipt).toMatchObject({ contentHash: hash, reviewerUserId: USER });
    const statements = H.statements.map(sql => sql.replace(/\s+/g, ' ').trim());
    expect(statements[0]).toBe('BEGIN');
    expect(statements.findIndex(sql => sql.includes('FROM projects') && sql.includes('FOR UPDATE')))
      .toBeLessThan(statements.findIndex(sql => sql.includes('FROM evidence_objects') && sql.includes('FOR UPDATE')));
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it.each(['false', 'true', 1, 0, null, {}, []])('refuses a nonboolean approval (%j) before a transaction', async approved => {
    const response = await decide(true, { approved });
    expect(response.status).toBe(400);
    expect(H.statements).toEqual([]);
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it('requires a stated reason and rejects caller-supplied reviewer or receipt claims', async () => {
    for (const extras of [{ reason: ' ' }, { expectedContentHash: undefined }, { reviewerUserId: 22 }, { verificationReceipt: { approved: true } }]) {
      const response = await decide(true, extras);
      expect(response.status).toBe(400);
    }
    expect(H.statements).toEqual([]);
    expect(await auditRows()).toHaveLength(0);
  });

  it('records a boolean rejection without describing the evidence as verified', async () => {
    await pglite.query(`INSERT INTO evidence_links (organization_id,evidence_id,target_type,target_id,is_verified)
      VALUES ($1,$2,'claim','rejected-support',true)`, [ORG, EVIDENCE]);
    const response = await decide(false);
    expect(response.status).toBe(200);
    expect(await savedEvidence()).toMatchObject({ status: 'rejected', is_verified: false, verified_by: null, verified_at: null });
    expect((await auditRows())[0].action).toBe('evidence.rejected');
    expect((response.body.data.metadata.verificationReceipt)).toMatchObject({ approved: false, reviewerUserId: USER });
    expect((await pglite.query('SELECT is_verified FROM evidence_links')).rows[0]).toEqual({ is_verified: false });
  });

  it('does not infer verification from approved status or a high quality score', async () => {
    await pglite.query("UPDATE evidence_objects SET status='approved',quality_score=1 WHERE id=$1", [EVIDENCE]);
    const response = await request(appWith(ORG)).get(`/api/evidence/${EVIDENCE}`);
    expect(response.status).toBe(200);
    expect(response.body.data.isVerified).toBe(false);
    expect(response.body.data.metadata.verificationReceipt).toBeUndefined();
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses approval of a stale content hash', async () => {
    const hash = await currentHash();
    await pglite.query('UPDATE evidence_objects SET excerpt=$1 WHERE id=$2', ['The result was 19.', EVIDENCE]);
    const response = await decide(true, { expectedContentHash: hash });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EVIDENCE_CHANGED');
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

});

describe('material evidence changes', () => {
  beforeEach(seedGovernedEvidence);

  it.each([
    ['excerpt', 'The result was 20.'], ['sourceReference', 'Changed source'], ['documentId', 45],
    ['documentVersion', '2'], ['pageRange', '13-14'], ['testResults', { result: 20 }],
    ['metadata', { method: 'changed analysis' }], ['title', 'Changed conclusion'],
  ])('invalidates approval and verified support edges when %s changes', async (key, value) => {
    expect((await decide()).status).toBe(200);
    await pglite.query(`INSERT INTO evidence_links (organization_id,evidence_id,target_type,target_id,is_verified,verified_by,verified_at)
      VALUES ($1,$2,'claim','claim-1',true,'11',NOW())`, [ORG, EVIDENCE]);
    const hash = await currentHash();
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ [key]: value, expectedContentHash: hash, reason: 'Correct the saved source interpretation.' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.meta.verificationInvalidated).toBe(true);
    expect(response.body.meta.reason.changedFields).toContain(key);
    expect(response.body.meta.contentHash).not.toBe(hash);
    const saved = await savedEvidence();
    expect(saved).toMatchObject({ is_verified: false, verified_by: null, verified_at: null, status: 'pending' });
    const metadata = saved.metadata as Record<string, unknown>;
    expect(metadata.verificationReceipt).toBeUndefined();
    expect(metadata.verificationInvalidation).toMatchObject({ previousContentHash: hash, invalidatedBy: USER });
    expect((await pglite.query('SELECT is_verified,verified_by,verified_at FROM evidence_links')).rows[0])
      .toEqual({ is_verified: false, verified_by: null, verified_at: null });
    expect((await auditRows()).at(-1)?.action).toBe('evidence.verification_invalidated');
  });

  it('does not invalidate an unchanged material JSON value or include review metadata in its hash', async () => {
    expect((await decide()).status).toBe(200);
    const hash = await currentHash();
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ metadata: { method: 'saved analysis' }, reason: 'Confirm the existing saved analysis.' });
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ verificationInvalidated: false, contentHash: hash });
    expect(response.body.data.isVerified).toBe(true);
    expect(response.body.data.metadata.verificationReceipt.contentHash).toBe(hash);
  });

  it('invalidates independently verified support even when the evidence itself is not verified', async () => {
    await pglite.query(`INSERT INTO evidence_links (organization_id,evidence_id,target_type,target_id,is_verified)
      VALUES ($1,$2,'claim','independent-support',true)`, [ORG, EVIDENCE]);
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ excerpt: 'Updated unreviewed result.', reason: REASON });
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ verificationInvalidated: false, supportVerificationInvalidated: true });
    expect((await pglite.query('SELECT is_verified FROM evidence_links')).rows[0]).toEqual({ is_verified: false });
  });

  it('hashes saved decimal normalization rather than the unrounded requested value', async () => {
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ qualityScore: 0.999, reason: REASON });
    expect(response.status).toBe(200);
    expect(response.body.meta.contentHash).toBe(await currentHash());
    expect((await savedEvidence()).is_verified).toBe(false);
  });

  it('updates every allowed column through static SQL with real JSON, UUID, date and decimal conversion', async () => {
    expect((await decide()).status).toBe(200);
    const title = "Study quote '; UPDATE evidence_objects SET is_verified=true; --";
    const timestamp = '2026-11-06T12:34:56.000Z';
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`).send({
      title, code: 'RESULT-02', description: 'Updated saved evidence', evidenceType: 'test_report',
      evidenceCategory: 'performance', evidenceLevel: 'II', sourceType: 'external', sourceReference: 'Source 2',
      sourceCitation: 'Citation 2', programId: PROGRAM, documentId: 45, documentVersion: '2', pageRange: '13-14',
      excerpt: 'The result was 20.', qualityScore: 0.999, relevanceScore: 0.125,
      validFrom: timestamp, validUntil: timestamp, publicationDate: timestamp, testDate: timestamp,
      authors: ['Author one', "Author's two"], journal: 'Test journal', doi: '10.000/test', pmid: '12345',
      abstract: 'Measured results', testType: 'Bench', testLab: 'Test laboratory',
      testResults: { result: 20, nested: { status: 'measured', flags: [true, false] } },
      tags: ['bench', 'updated'], metadata: { method: 'new analysis', trace: { source: 'stored' } }, reason: REASON,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const saved = await savedEvidence();
    expect(saved).toMatchObject({ id: EVIDENCE, organization_id: ORG, program_id: PROGRAM,
      title, code: 'RESULT-02', description: 'Updated saved evidence', evidence_type: 'test_report',
      evidence_category: 'performance', evidence_level: 'II', source_type: 'external', source_reference: 'Source 2',
      source_citation: 'Citation 2', document_id: 45, document_version: '2', page_range: '13-14', excerpt: 'The result was 20.',
      authors: ['Author one', "Author's two"], journal: 'Test journal', doi: '10.000/test', pmid: '12345',
      abstract: 'Measured results', test_type: 'Bench', test_lab: 'Test laboratory',
      test_results: { result: 20, nested: { status: 'measured', flags: [true, false] } }, tags: ['bench', 'updated'],
      metadata: { method: 'new analysis', trace: { source: 'stored' }, verificationInvalidation: { invalidatedBy: USER } },
      updated_by: String(USER), is_verified: false, verified_by: null, verified_at: null, status: 'pending' });
    expect(Number(saved.quality_score)).toBe(1);
    expect(Number(saved.relevance_score)).toBe(0.13);
    for (const column of ['valid_from', 'valid_until', 'publication_date', 'test_date']) {
      expect(new Date(saved[column] as string).toISOString()).toBe(timestamp);
    }
    expect(response.body.meta.contentHash).toBe(await currentHash());
    expect(H.statements.every(statement => !statement.includes(title))).toBe(true);
    expect((await auditRows()).at(-1)?.action).toBe('evidence.verification_invalidated');
  });

  it('never accepts a forged verification receipt as ordinary material metadata', async () => {
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ metadata: { verificationReceipt: { approved: true } }, reason: REASON });
    expect(response.status).toBe(400);
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

});

describe('current evidence write authority', () => {
  beforeEach(seedGovernedEvidence);

  it.each(['viewer', 'revoked', 'inactive-user', 'inactive-organization'])('uses current persisted membership: %s refuses despite an admin token', async state => {
    if (state === 'viewer') await pglite.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, USER]);
    if (state === 'revoked') await pglite.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, USER]);
    if (state === 'inactive-user') await pglite.query("UPDATE users SET status='inactive' WHERE id=$1", [USER]);
    if (state === 'inactive-organization') await pglite.query("UPDATE organizations SET status='inactive' WHERE id=$1", [ORG]);
    expect((await decide()).status).toBe(403);
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses an absent actor', async () => {
    expect((await decide(true, {}, null)).status).toBe(401);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses a read-only project, an archived project and moving evidence into a project without edit permission', async () => {
    await pglite.query('UPDATE evidence_objects SET program_id=$1 WHERE id=$2', [PRIVATE_PROGRAM, EVIDENCE]);
    expect((await decide()).status).toBe(403);
    await pglite.query('UPDATE evidence_objects SET program_id=$1 WHERE id=$2', [PROGRAM, EVIDENCE]);
    await pglite.query("UPDATE projects SET status='archived' WHERE id=3");
    expect((await decide()).status).toBe(409);
    await pglite.query("UPDATE projects SET status='active' WHERE id=3");
    const move = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ programId: PRIVATE_PROGRAM, reason: REASON });
    expect(move.status).toBe(403);
    expect((await savedEvidence()).program_id).toBe(PROGRAM);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses another tenant\'s evidence through the authenticated scoped mutation', async () => {
    await pglite.query('UPDATE evidence_objects SET organization_id=$1 WHERE id=$2', [OTHER, EVIDENCE]);
    const response = await request(appWith(ORG)).post(`/api/evidence/${EVIDENCE}/verify`)
      .send({ approved: true, expectedContentHash: 'a'.repeat(64), reason: REASON });
    expect(response.status).toBe(404);
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

});

describe('atomic evidence review writes', () => {
  beforeEach(seedGovernedEvidence);

  it('rolls back the content change, support invalidation and verification receipt when its audit fails', async () => {
    expect((await decide()).status).toBe(200);
    const before = await savedEvidence();
    await pglite.query(`INSERT INTO evidence_links (organization_id,evidence_id,target_type,target_id,is_verified)
      VALUES ($1,$2,'claim','audited-support',true)`, [ORG, EVIDENCE]);
    H.failAudit = true;
    const response = await request(appWith(ORG)).patch(`/api/evidence/${EVIDENCE}`)
      .send({ excerpt: 'An unaudited change', reason: REASON });
    expect(response.status).toBe(500);
    expect(await savedEvidence()).toEqual(before);
    expect((await pglite.query('SELECT is_verified FROM evidence_links')).rows[0]).toEqual({ is_verified: true });
    expect(await auditRows()).toHaveLength(1);
    expect(H.statements.at(-1)).toBe('ROLLBACK');
  });

  it('rolls back an approval when the actual chained audit insert fails', async () => {
    H.failAudit = true;
    const response = await decide();
    expect(response.status).toBe(500);
    expect((await savedEvidence()).is_verified).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it('reports an uncertain commit honestly and discards the request connection instead of claiming rollback', async () => {
    H.failCommit = true;
    const response = await decide();
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('OUTCOME_UNKNOWN');
    expect(H.discarded).toBe(true);
    expect(H.statements.at(-1)).toBe('COMMIT');
    expect((await savedEvidence()).is_verified).toBe(true); // server committed; only its acknowledgement was lost
    expect(await auditRows()).toHaveLength(1);
  });
});
