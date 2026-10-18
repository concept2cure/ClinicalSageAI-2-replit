import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../db', () => ({ pool: {}, db: {} }));
import { bindStudyDesignTx, createProtocolDocumentTx, fileProtocolProgramTx } from '../protocol-development-service';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
const client = { query: (sql: string, params?: unknown[]) => db.query(sql, params) };
const migration = readFileSync(resolve('migrations/20261014_protocol_program_scope.sql'), 'utf8');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id int PRIMARY KEY, status text);
    CREATE TABLE users (id int PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id int, user_id int, role text);
    INSERT INTO organizations VALUES (7,'active'),(9,'active');
    INSERT INTO users VALUES (11,'active'),(12,'active');
    INSERT INTO organization_users VALUES (7,11,'member'),(7,12,'member');
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL, lead_user_id int, deleted_at timestamptz);
    INSERT INTO regulatory_programs (id, organization_id,lead_user_id) VALUES ('${P1}',7,11),('${P2}',7,11),('${FOREIGN}',9,11);
    CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int, protocol_kind text, linked_protocol_id int, protocol_number text, title text,
      design_type text, phase text, therapeutic_area text, version text, status text, synopsis text, created_by int, sponsor text, principal_investigator text,
      updated_at timestamptz DEFAULT now(), deleted_at timestamptz, study_design_id text, study_design_linked_at timestamptz, study_design_linked_by int);
    CREATE TABLE protocol_sections (id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_key text, title text, required boolean, status text, order_index int, created_by int);
    CREATE TABLE cdisc_prm_studies (study_id text PRIMARY KEY, tenant_id int, program_id uuid, protocol_title text);
    INSERT INTO protocol_documents (organization_id,title,status) VALUES (7,'Historical unfiled','draft');
  `);
  await db.exec(migration); await db.exec(migration);
}, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`DELETE FROM protocol_sections; DELETE FROM protocol_documents WHERE title <> 'Historical unfiled';
    UPDATE protocol_documents SET program_id=NULL,study_design_id=NULL,status='draft' WHERE title='Historical unfiled'; DELETE FROM cdisc_prm_studies;`);
});
async function create(programId = P1) {
  await db.exec('BEGIN');
  try {
    const result = await createProtocolDocumentTx(client, 7, 11, { protocolKind: 'clinical', title: 'Initial protocol', programId });
    await db.exec('COMMIT'); return result;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}

describe('Protocol program association and binding', () => {
  it('replays without rewriting legacy rows and enforces the same-organization foreign key', async () => {
    const legacy = await db.query<{ program_id: string | null }>(`SELECT program_id FROM protocol_documents WHERE title='Historical unfiled'`);
    expect(legacy.rows[0].program_id).toBeNull();
    await expect(db.query('INSERT INTO protocol_documents (organization_id, program_id, title) VALUES (7,$1,\'Invalid association\')', [FOREIGN])).rejects.toMatchObject({ code: '23503' });
    const keys = await db.query(`SELECT conname FROM pg_constraint WHERE conname='protocol_documents_program_same_org_fk'`);
    expect(keys.rows).toHaveLength(1);
  });

  it('creates and seeds the real canonical document under its live owned program', async () => {
    const result = await create();
    const stored = await db.query('SELECT program_id,organization_id,status,created_by FROM protocol_documents WHERE id=$1', [result.id]);
    expect(stored.rows[0]).toMatchObject({ program_id: P1, organization_id: 7, status: 'draft', created_by: 11 });
    const sections = await db.query('SELECT * FROM protocol_sections WHERE protocol_document_id=$1', [result.id]);
    expect(sections.rows.length).toBe(result.sectionsSeeded);
    expect(result.sectionsSeeded).toBeGreaterThan(0);
  });

  it('explicitly files an editable legacy document once and refuses moving it to another program', async () => {
    const legacy = await db.query<{ id: number }>("SELECT id FROM protocol_documents WHERE title='Historical unfiled'");
    const id = legacy.rows[0].id;
    await fileProtocolProgramTx(client, 7, id, P1, 11);
    expect((await db.query('SELECT program_id FROM protocol_documents WHERE id=$1', [id])).rows[0]).toMatchObject({ program_id: P1 });
    await expect(fileProtocolProgramTx(client, 7, id, P2, 11)).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(fileProtocolProgramTx(client, 9, id, FOREIGN, 11)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses filing a legacy document with a mismatched bound design, inactive actor or finalized status', async () => {
    const legacy = await db.query<{ id: number }>("SELECT id FROM protocol_documents WHERE title='Historical unfiled'");
    const id = legacy.rows[0].id;
    await db.exec("INSERT INTO cdisc_prm_studies VALUES ('sd_unfiled',7,NULL,'Legacy design'); UPDATE protocol_documents SET study_design_id='sd_unfiled' WHERE title='Historical unfiled'");
    await expect(fileProtocolProgramTx(client, 7, id, P1, 11)).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(fileProtocolProgramTx(client, 7, id, P1, 12)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.query("UPDATE protocol_documents SET status='finalized' WHERE id=$1", [id]);
    await expect(fileProtocolProgramTx(client, 7, id, P1, 11)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await db.query('SELECT program_id FROM protocol_documents WHERE id=$1', [id])).rows[0]).toMatchObject({ program_id: null });
  });

  it('refuses foreign and deleted programs before creating a protocol or section', async () => {
    await expect(create(FOREIGN)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [P2]);
    try { await expect(create(P2)).rejects.toMatchObject({ code: 'NOT_FOUND' }); }
    finally { await db.query('UPDATE regulatory_programs SET deleted_at=NULL WHERE id=$1', [P2]); }
    expect((await db.query("SELECT id FROM protocol_documents WHERE title='Initial protocol'")).rows).toEqual([]);
    expect((await db.query('SELECT id FROM protocol_sections')).rows).toEqual([]);
  });

  it('refuses an active non-lead member, then admits an actual persisted manager and refuses revoked membership', async () => {
    const input = { protocolKind: 'clinical' as const, title: 'Member protocol', programId: P1 };
    await expect(createProtocolDocumentTx(client, 7, 12, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.exec("UPDATE organization_users SET role='manager' WHERE user_id=12");
    try {
      const manager = await createProtocolDocumentTx(client, 7, 12, input);
      expect(manager.id).toBeGreaterThan(0);
      await db.exec("UPDATE users SET status='inactive' WHERE id=12");
      await expect(createProtocolDocumentTx(client, 7, 12, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally { await db.exec("UPDATE organization_users SET role='member' WHERE user_id=12; UPDATE users SET status='active' WHERE id=12"); }
  });

  it('binds the persisted id only in the same program and records the actual actor', async () => {
    const { id } = await create();
    await db.query(`INSERT INTO cdisc_prm_studies VALUES ('sd_same',7,$1,'Initial design')`, [P1]);
    await db.exec('BEGIN');
    await bindStudyDesignTx(client, 7, id, 'sd_same', 11); await db.exec('COMMIT');
    const doc = await db.query<{ study_design_id: string; study_design_linked_by: number; study_design_linked_at: unknown }>('SELECT study_design_id,study_design_linked_by,study_design_linked_at FROM protocol_documents WHERE id=$1', [id]);
    expect(doc.rows[0]).toMatchObject({ study_design_id: 'sd_same', study_design_linked_by: 11 });
    expect(doc.rows[0].study_design_linked_at).toBeTruthy();
  });

  it.each([P2, null])('refuses a design from another program or unfiled scope (%s)', async (programId) => {
    const { id } = await create();
    await db.query(`INSERT INTO cdisc_prm_studies VALUES ('sd_other',7,$1,'Other design')`, [programId]);
    await db.exec('BEGIN');
    try { await expect(bindStudyDesignTx(client, 7, id, 'sd_other', 11)).rejects.toMatchObject({ code: 'BAD_INPUT' }); }
    finally { await db.exec('ROLLBACK'); }
    expect((await db.query('SELECT study_design_id FROM protocol_documents WHERE id=$1', [id])).rows[0]).toMatchObject({ study_design_id: null });
  });

  it('refuses foreign protocols and designs and finalized documents', async () => {
    const { id } = await create();
    await db.query(`INSERT INTO cdisc_prm_studies VALUES ('sd_foreign',9,$1,'Foreign design')`, [FOREIGN]);
    await expect(bindStudyDesignTx(client, 7, id, 'sd_foreign', 11)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(bindStudyDesignTx(client, 9, id, 'sd_foreign', 11)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.query("UPDATE protocol_documents SET status='finalized' WHERE id=$1", [id]);
    await expect(bindStudyDesignTx(client, 7, id, 'sd_foreign', 11)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
