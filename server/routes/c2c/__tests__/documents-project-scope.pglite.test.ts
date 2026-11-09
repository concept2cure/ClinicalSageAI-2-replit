/**
 * /api/c2c/documents holds every read to the projects the person can open, and every write to the projects the
 * person may change (F1, 2026-11-05).
 *
 * The router is mounted with authentication only (server/bootstrap/register-inline-routes.ts), and
 * `c2c_documents.project_id` is a regulatory program. Every read and write selected by organization alone, so any
 * member listed a private project's governed documents, read each section's content and history, and moved, linked,
 * locked or submitted them.
 *
 * The documents' own tables come from their migrations, and the access policy is the real one
 * (getCurrentAccessibleProgramScope, requireCurrentProgramAccess, canAccessReportProject), on PostgreSQL. Only the
 * governed-action ledger, the signer's re-verification and the separation-of-duties lookup are recorded calls: each
 * has its own suite, and each would answer every document alike.
 *
 * Evidence: docs/evidence/F1/2026-11-05-c2c-documents-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
  ledger: [] as string[],
}));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  // The writes run in a transaction on a lent connection: the same single database.
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../actions.js', () => ({
  recordGovernedAction: vi.fn(async (_client: unknown, a: { target: string }) => { h.ledger.push(a.target); }),
  writeMutation: vi.fn(async (_command: string, a: { target: string }) => { h.ledger.push(a.target); return { actionId: 'act_1' }; }),
  verifyReauth: vi.fn(async () => ({ ok: true })),
  separationOfDutiesRefusal: () => null,
}));
vi.mock('../../../services/governance/separation-of-duties.js', () => ({
  assertSignerIsNotAuthor: vi.fn(async () => ({ checked: true })),
}));

import documentsRouter from '../documents';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ORG = 1;
const MEMBER = 7;
const P_OPEN = '11111111-1111-4111-8111-111111111111';
const P_EDIT = '22222222-2222-4222-8222-222222222222';
const P_PRIV = '44444444-4444-4444-8444-444444444444';
const P_THEIRS = '55555555-5555-4555-8555-555555555555';
const P_UNKNOWN = '66666666-6666-4666-8666-666666666666';

const POLICY = `
  CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
  CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
  CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamptz);
  CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid,
    client_workspace_id integer, status text DEFAULT 'active', owner_id integer, created_by_id integer,
    settings jsonb DEFAULT '{}');
  CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
  CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
  CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer, project_id integer);
  CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
  -- The seal guard's read (checkFilingWritable): no authoring document is bound here.
  CREATE TABLE authoring_documents (c2c_document_id text, tenant_id integer, status text, locked_at timestamptz);
  CREATE FUNCTION actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
    LANGUAGE sql AS $$ SELECT u.name, u.email FROM users u WHERE u.id = p_user_id $$;
  CREATE TABLE fda_510k_documents (id integer PRIMARY KEY, project_id integer);
  CREATE TABLE cerv2_510k_sections (id integer PRIMARY KEY, document_id integer, organization_id integer, section_key text);

  INSERT INTO organizations (id) VALUES (1), (2);
  INSERT INTO users (id, name, email) VALUES (7, 'C. Consultant', 'c@cro'), (9, 'P. Owner', 'p@cro');
  INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
  INSERT INTO regulatory_programs (id, organization_id) VALUES
    ('${P_OPEN}', 1), ('${P_EDIT}', 1), ('${P_PRIV}', 1), ('${P_THEIRS}', 2);
  INSERT INTO projects (id, organization_id, regulatory_program_id, owner_id, created_by_id) VALUES
    (10, 1, '${P_OPEN}', 9, 9), (11, 1, '${P_EDIT}', 9, 9), (12, 1, '${P_PRIV}', 9, 9), (20, 2, '${P_THEIRS}', 9, 9);
  INSERT INTO project_visibility_settings VALUES
    (1, 10, 'org_public'), (1, 11, 'org_public'), (1, 12, 'private'), (2, 20, 'org_public');
  -- The member may open 10 and 11, and change 11 only. 12 is its owner's alone.
  INSERT INTO project_members VALUES (1, 11, 7, 'edit', 'active'), (1, 12, 9, 'owner', 'active');
`;

const DOCUMENTS = `
  -- A document with no program: legacy rows have none (migrations/20260529_phase9_backfill.sql, step 1).
  ALTER TABLE c2c_documents ALTER COLUMN project_id DROP NOT NULL;
  INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, updated_at) VALUES
    ('doc_open',  1, '${P_OPEN}',   'ind', 'fda', 'ich-m4-v2.0', 'Open IND',    now() - interval '1 hour'),
    ('doc_edit',  1, '${P_EDIT}',   'ind', 'fda', 'ich-m4-v2.0', 'Edit IND',    now() - interval '2 hours'),
    ('doc_priv',  1, '${P_PRIV}',   'ind', 'fda', 'ich-m4-v2.0', 'Private IND', now() - interval '3 hours'),
    ('doc_noprog', 1, NULL,         'ind', 'fda', 'ich-m4-v2.0', 'No program',  now() - interval '4 hours'),
    ('doc_them',  2, '${P_THEIRS}', 'ind', 'fda', 'ich-m4-v2.0', 'Their IND',   now() - interval '5 hours'),
    ('doc_fda510k_5', 1, '${P_PRIV}', 'k510', 'fda', 'fda-510k-2024', 'Private 510(k)', now()),
    ('doc_fda510k_6', 1, '${P_OPEN}', 'k510', 'fda', 'fda-510k-2024', 'Open 510(k)',    now());
  UPDATE c2c_documents SET created_at = now() - interval '1 day' WHERE id = 'doc_fda510k_5';
  INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status, content)
    SELECT id, '2.5', 'Clinical overview', 10, 'drafted', jsonb_build_object('text', 'Text of ' || id)
      FROM c2c_documents WHERE doc_type = 'ind';
  INSERT INTO c2c_document_section_versions (section_id, version, content, author_id, reason)
    SELECT id, 1, content, 9, 'Earlier text of ' || document_id FROM c2c_document_sections;
  INSERT INTO c2c_document_section_evidence (section_id, evidence_kind, evidence_ref, linked_by)
    SELECT id, 'artifact', 'ev-' || document_id, 9 FROM c2c_document_sections;
  INSERT INTO fda_510k_documents VALUES (1, 5), (2, 6);
  INSERT INTO cerv2_510k_sections VALUES (501, 1, 1, 'A1'), (502, 2, 1, 'A1'), (503, NULL, 1, 'A1');
`;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(POLICY);
  for (const file of ['migrations/20260527_mutation_primitives.sql', 'migrations/20260528_phase9_document_schema.sql']) {
    await h.pg.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
  await h.pg.exec(DOCUMENTS);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.failWhen = null; h.ledger = []; });

function app(user: { id?: number; organizationId: number } = { id: MEMBER, organizationId: ORG }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/api/c2c/documents', documentsRouter);
  return a;
}
const get = (url: string, user?: { id?: number; organizationId: number }) => request(app(user)).get(url);
const listed = (body: { documents?: Array<{ id: string }> }) => (body.documents ?? []).map((d) => d.id).sort();

/** Every read of one document, with the document id in place. */
const DOCUMENT_READS = [
  (id: string) => `/api/c2c/documents/${id}`,
  (id: string) => `/api/c2c/documents/${id}/outline`,
  (id: string) => `/api/c2c/documents/${id}/sections/2.5`,
  (id: string) => `/api/c2c/documents/${id}/sections/2.5/versions`,
];

describe('the list holds to the projects the person can open', () => {
  it('with no projectId, lists the open projects only: never a private project, no program, or another organization', async () => {
    const res = await get('/api/c2c/documents');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(listed(res.body)).toEqual(['doc_edit', 'doc_fda510k_6', 'doc_open']);
    expect(JSON.stringify(res.body)).not.toMatch(/doc_priv|Private|doc_noprog|doc_them|doc_fda510k_5/);
  });

  it("a private project's projectId lists nothing, exactly as an unknown project does", async () => {
    const hidden = await get(`/api/c2c/documents?projectId=${P_PRIV}`);
    const unknown = await get(`/api/c2c/documents?projectId=${P_UNKNOWN}`);
    expect(hidden.status).toBe(200);
    expect(hidden.body).toEqual({ documents: [] });
    expect(hidden.body).toEqual(unknown.body);
  });

  it("an open project's projectId lists its documents, the filters still applied", async () => {
    expect(listed((await get(`/api/c2c/documents?projectId=${P_OPEN}`)).body)).toEqual(['doc_fda510k_6', 'doc_open']);
    expect(listed((await get(`/api/c2c/documents?projectId=${P_OPEN.toUpperCase()}&docType=ind`)).body)).toEqual(['doc_open']);
  });
});

describe("a private project's document is answered as a missing one", () => {
  it('the document, its outline, its section and the section history: 404, the same words as a missing id', async () => {
    for (const url of DOCUMENT_READS) {
      const hidden = await get(url('doc_priv'));
      const missing = await get(url('doc_nope'));
      expect(hidden.status, url('doc_priv')).toBe(404);
      expect(hidden.body, url('doc_priv')).toEqual(missing.body);
      expect(JSON.stringify(hidden.body)).not.toMatch(/Private|Text of|Earlier text/);
    }
  });

  it('a document with no program, and another organization\'s, read the same way', async () => {
    for (const id of ['doc_noprog', 'doc_them']) {
      for (const url of DOCUMENT_READS) expect((await get(url(id))).status, url(id)).toBe(404);
    }
  });

  it('the legacy section resolver names only a document the person can read', async () => {
    const hidden = await get('/api/c2c/documents/by-legacy/cerv2-section/501');
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual((await get('/api/c2c/documents/by-legacy/cerv2-section/999')).body);
    expect((await get('/api/c2c/documents/by-legacy/cerv2-section/502')).body)
      .toEqual({ document_id: 'doc_fda510k_6', section_key: 'A1' });
    // An unlinked section falls back to the oldest 510(k) the person can read, not the older private one.
    expect((await get('/api/c2c/documents/by-legacy/cerv2-section/503')).body.document_id).toBe('doc_fda510k_6');
  });
});

describe('a document of a project the person can open still reads', () => {
  it('the document, its outline, its section content and history', async () => {
    const doc = await get('/api/c2c/documents/doc_open');
    expect(doc.status, JSON.stringify(doc.body)).toBe(200);
    expect(doc.body).toMatchObject({ id: 'doc_open', project_id: P_OPEN });
    const outline = await get('/api/c2c/documents/doc_open/outline');
    expect(outline.status, JSON.stringify(outline.body)).toBe(200);
    expect(outline.body.outline.find((s: { key: string }) => s.key === '2.5')).toMatchObject({ status: 'drafted' });
    const section = await get('/api/c2c/documents/doc_open/sections/2.5');
    expect(section.body.content).toEqual({ text: 'Text of doc_open' });
    const versions = await get('/api/c2c/documents/doc_open/sections/2.5/versions');
    expect(versions.body.data).toMatchObject([{ reason: 'Earlier text of doc_open', authorName: 'P. Owner' }]);
  });
});

describe('an access check that cannot run is an error with a code, never an empty result', () => {
  const READS = ['/api/c2c/documents', ...DOCUMENT_READS.map((url) => url('doc_open')), '/api/c2c/documents/by-legacy/cerv2-section/502'];

  it('the sharing policy cannot be read', async () => {
    h.failWhen = /project_members/;
    for (const url of READS) {
      const res = await get(url);
      expect(res.status, url).toBe(503);
      expect(res.body, url).toMatchObject({ code: 'PROJECT_ACCESS_UNAVAILABLE' });
      expect(res.body.documents ?? res.body.outline ?? res.body.content ?? res.body.data, url).toBeUndefined();
    }
  });

  it('a caller who is not a current member, or no identified caller, is refused', async () => {
    for (const user of [{ id: 55, organizationId: ORG }, { organizationId: ORG }]) {
      for (const url of READS) {
        const res = await get(url, user);
        expect(res.status, url).toBe(403);
        expect(res.body.code, url).toBe('PROJECT_ACTOR_ACCESS_DENIED');
      }
    }
  });
});

/** One write per route, against a document, and how to tell whether it changed anything. */
const WRITES: Array<{ name: string; send: (id: string) => Promise<request.Response>; state: (id: string) => Promise<unknown> }> = [
  {
    name: 'PATCH a section',
    send: async (id) => request(app()).patch(`/api/c2c/documents/${id}/sections/2.5`).send({ status: 'review', reason: 'Ready for review.' }),
    state: async (id) => (await h.pg.query('SELECT status FROM c2c_document_sections WHERE document_id = $1', [id])).rows,
  },
  {
    name: 'link evidence',
    send: async (id) => request(app()).post(`/api/c2c/documents/${id}/sections/2.5/evidence`).send({ evidenceKind: 'artifact', evidenceRef: 'ev-new' }),
    state: (id) => evidenceOf(id),
  },
  {
    name: 'unlink evidence',
    send: async (id) => request(app()).delete(`/api/c2c/documents/${id}/sections/2.5/evidence/${(await evidenceOf(id))[0]?.id ?? 0}`).send(),
    state: (id) => evidenceOf(id),
  },
  {
    name: 'lock',
    send: async (id) => request(app()).post(`/api/c2c/documents/${id}/lock`).send({ reason: 'Final.', reauth: { password: 'x' } }),
    state: (id) => documentState(id),
  },
  {
    name: 'submit',
    send: async (id) => request(app()).post(`/api/c2c/documents/${id}/submit`)
      .send({ reason: 'Filed.', externalFiling: { channel: 'ESG', reference: 'R-1', filedAt: '2026-11-01' } }),
    state: (id) => documentState(id),
  },
];
async function evidenceOf(id: string) {
  return (await h.pg.query<{ id: number; evidence_ref: string }>(`SELECT e.id, e.evidence_ref FROM c2c_document_section_evidence e
    JOIN c2c_document_sections s ON s.id = e.section_id WHERE s.document_id = $1 ORDER BY e.id`, [id])).rows;
}
async function documentState(id: string) {
  return (await h.pg.query('SELECT status, locked_at, submitted_at FROM c2c_documents WHERE id = $1', [id])).rows;
}

describe('every write needs a project the person can open, then its edit right', () => {
  for (const write of WRITES) {
    it(`${write.name}: a private project's document is answered as a missing one, and nothing changes`, async () => {
      const before = await write.state('doc_priv');
      const hidden = await write.send('doc_priv');
      const missing = await write.send('doc_nope');
      expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      expect(await write.state('doc_priv')).toEqual(before);
      expect(h.ledger).toEqual([]);
    });

    it(`${write.name}: a project the person can open but not change is refused, and nothing changes`, async () => {
      const before = await write.state('doc_open');
      const res = await write.send('doc_open');
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body).toMatchObject({ code: 'PROJECT_WRITE_ACCESS_DENIED' });
      expect(res.body.message).toMatch(/Nothing was changed\.$/);
      expect(await write.state('doc_open')).toEqual(before);
      expect(h.ledger).toEqual([]);
    });

    it(`${write.name}: an edit check that cannot run changes nothing, and says so`, async () => {
      const before = await write.state('doc_edit');
      h.failWhen = /project_members\s+WHERE[\s\S]*FOR SHARE/;
      const res = await write.send('doc_edit');
      h.failWhen = null;
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body).toMatchObject({ code: 'PROJECT_ACCESS_UNAVAILABLE' });
      expect(await write.state('doc_edit')).toEqual(before);
      expect(h.ledger).toEqual([]);
    });
  }

  it('with the edit right, each write is made and audited', async () => {
    for (const write of WRITES) {
      const before = await write.state('doc_edit');
      const res = await write.send('doc_edit');
      expect(res.status, `${write.name}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
      expect(await write.state('doc_edit'), write.name).not.toEqual(before);
    }
    expect(h.ledger).toHaveLength(WRITES.length);
  });
});

/* F1 (the coordinating session, 2026-11-02): a submit names a FILED sequence as its evidence, by the one filed rule
   (isFiledDispatchStatus, server/services/submission-service/filed-dispatch.ts: 'sent', 'acknowledged'). A sequence
   frozen and dispatched but never received by the agency — its send pending, in flight or rejected, or never made —
   is not a filing, and 'submitted' is a regulatory claim. */
describe('a submit takes a sequence as evidence only once the agency has received it', () => {
  const NOT_FILED = (n: string, status: string | null) =>
    `Sequence ${n} has not been received by the agency (its send is ${status ?? 'not recorded'}), so it is not ` +
    'evidence of a filing. A sequence is filed once its send is sent or acknowledged. Nothing was submitted.';
  const CASES = [
    { id: 31, number: '0001', dispatchStatus: 'pending' },
    { id: 32, number: '0002', dispatchStatus: 'transmitting' },
    { id: 33, number: '0003', dispatchStatus: 'rejected' },
    { id: 34, number: '0004', dispatchStatus: null },
  ];
  const submitWith = (sequenceId: number) =>
    request(app()).post('/api/c2c/documents/doc_file/submit').send({ reason: 'Filed in the sequence.', sequenceId });

  beforeAll(async () => {
    await h.pg.exec(`
      CREATE TABLE IF NOT EXISTS ectd_sequences (id integer PRIMARY KEY, organization_id integer NOT NULL, status text,
        dispatch_status text, sequence_number text, region text, deleted_at timestamptz);
      INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title)
        VALUES ('doc_file', 1, '${P_EDIT}', 'ind', 'fda', 'ich-m4-v2.0', 'IND to file');`);
    for (const c of CASES) {
      await h.pg.query(`INSERT INTO ectd_sequences VALUES ($1, 1, 'dispatched', $2, $3, 'us', NULL)`,
        [c.id, c.dispatchStatus, c.number]);
    }
    await h.pg.query(`INSERT INTO ectd_sequences VALUES (35, 1, 'dispatched', 'acknowledged', '0005', 'us', NULL)`);
    initialStatus = (await documentState('doc_file'))[0].status;
  });
  // Each case starts from the document as it was made, so no case reads another's outcome.
  let initialStatus = '';
  beforeEach(async () => {
    await h.pg.query(`UPDATE c2c_documents SET status = $1, submitted_at = NULL WHERE id = 'doc_file'`, [initialStatus]);
  });

  for (const c of CASES) {
    it(`refuses a dispatched sequence whose send is ${c.dispatchStatus ?? 'not recorded'}, and nothing changes`, async () => {
      const before = await documentState('doc_file');
      const res = await submitWith(c.id);
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body).toMatchObject({ error: 'SEQUENCE_NOT_FILED', message: NOT_FILED(c.number, c.dispatchStatus) });
      expect(await documentState('doc_file')).toEqual(before);
      expect(h.ledger).toEqual([]);
    });
  }

  it('takes a sequence the agency acknowledged, and records it as the filing', async () => {
    const res = await submitWith(35);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'submitted', filing: { sequence: { sequenceId: 35, dispatchStatus: 'acknowledged' } } });
    expect((await documentState('doc_file'))[0].status).toBe('submitted');
    expect(h.ledger).toEqual(['document:doc_file']);
  });
});
