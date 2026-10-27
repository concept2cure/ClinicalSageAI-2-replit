/** Actual HTTP/JWT/source admission and Authoring writes over isolated PGlite.
 * The agency source schema is minimal read-only input; no provider is called. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_ORG, PROGRAM, PROGRAM_B, PREREQ, JWT_SECRET, asToken, makeApp } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';
import { invalidateOrgMembershipCache } from '../../middleware/orgMembership';
import { savedImportSource, verifySavedWorkflowImport } from '../../services/authoring/import-source-references';
import { AGENCY_RESPONSE_SOURCE_DDL, seedAgencyResponseReceipt } from './_agency-response-authoring-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, params?: unknown[]) => (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, params) }));
vi.mock('../../services/audit/chain', async original => ({
  ...(await original<typeof import('../../services/audit/chain')>()),
  computeAuditChainSealed: vi.fn(async () => ({ sha256Chain: 'aa'.repeat(32), hmacSeal: null })),
}));

let db: JourneyDb;
let app: express.Express;
let author: (req: request.Test) => request.Test;
const trace = newTrace();
const EVENT = 'agency-source-event';
const QUESTION = 701;
const REASON = 'Prepare this recorded agency response in the document editor';
const ANSWER = 'Recorded answer based on the retained source evidence.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');


beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260813_audit_tamper_proof_log.sql',
    'db/migrations/20260725_authoring_signatures_and_workflow.sql',
    'db/migrations/20260725_authoring_signature_freeze_binding.sql',
    'db/migrations/20260730_authoring_runtime_ddl.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql',
    'migrations/20260728_authoring_comments_threading.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260728_authoring_document_governed_binding.sql',
    'migrations/20260814d_document_alias_map.sql',
    'migrations/20260921_audit_logs_chain_seq.sql',
    'migrations/20260921_authoring_document_provenance.sql',
    'migrations/20260527_mutation_primitives.sql',
    'db/migrations/20260730_c2c_ana_actions_command_vocab.sql',
  ], testOnlySql: AGENCY_RESPONSE_SOURCE_DDL });
  h.db = db.db; h.pool = tappedPool(db, trace);
  author = asToken(await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'member' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
  const router = express.Router();
  router.use((req, _res, next) => {
    Object.assign(req, { dbClient: { query: (sql: string, params?: unknown[]) =>
      (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, params) } });
    next();
  });
  router.use((await import('../authoring.router')).default);
  app = makeApp(router);
  await db.pool.query(`INSERT INTO concept2cure_agency_communications VALUES
    ($1,$2,42,'Information request','official','2026-10-01','2026-11-01','open','reviewed',true,$3)`,
  [EVENT, ORG, { visibilityTier: 'shared_client_c2c' }]);
  await db.pool.query(`INSERT INTO agency_communication_questions VALUES
    ($1,$2,42,$3,'Q7','Explain the recorded exposure rationale.','clinical','2.7.4',$4,1,$5,'2026-10-01',NULL,NULL)`,
  [QUESTION, ORG, EVENT, ANSWER, Number(AUTHOR.id)]);
  await seedAgencyResponseReceipt(db.pool, { organizationId: ORG, questionId: QUESTION, eventId: EVENT, questionRef: 'Q7',
    questionText: 'Explain the recorded exposure rationale.', responseText: ANSWER, revision: 1, userId: Number(AUTHOR.id) });
  await db.pool.query(`INSERT INTO agency_communication_questions
    (id,organization_id,project_id,communication_event_id,question_ref,question_text,response_text,response_revision)
    VALUES(702,$1,42,$2,'Q8','Explain the planned source-supported response.','',0)`, [ORG, EVENT]);
}, 180_000);
afterAll(async () => { await db?.close(); });

const body = (extra: Record<string, unknown> = {}) => ({ programId: PROGRAM, reason: REASON,
  source: { kind: 'agency-response', eventId: EVENT, questionId: QUESTION }, ...extra });
const post = (payload: Record<string, unknown>) => author(request(app).post('/api/authoring/import/source')).send(payload);
const preview = (extra: Record<string, unknown> = {}) => post(body({ previewOnly: true, ...extra }));
async function checkedPreview() {
  const result = await preview();
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data;
}
const counts = async () => (await db.pool.query(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
  (SELECT count(*) FROM authoring_sections)::int AS sections,(SELECT count(*) FROM doc_revisions)::int AS revisions`)).rows[0];
const sources = async () => (await db.pool.query('SELECT to_jsonb(q) AS row FROM agency_communication_questions q ORDER BY id')).rows;

describe('exact saved agency response through the existing source working-copy route', () => {
  it('previews exact question and answer versions without writing or transferring approval', async () => {
    const before = await counts();
    const result = await checkedPreview();
    expect(result.origin).toMatchObject({ kind: 'agency-response', id: `${EVENT}:${QUESTION}`, version: '1',
      conversion: 'agency-response-snapshot', sourceScope: { level: 'program', programId: PROGRAM, projectId: 42 },
      selection: { kind: 'agency-response', eventId: EVENT, questionId: QUESTION } });
    expect(result.sections.map((section: { code: string }) => section.code)).toEqual(['agency.context', 'agency.response']);
    expect(result.origin.sectionOrigins.every((row: { originalAuthorship: string; model: unknown }) => row.originalAuthorship === 'unknown' && row.model === null)).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/approval.*signatures.*not transferred/i);
    expect(await counts()).toEqual(before);
  });

  it('creates, reopens and reuses an independent editable copy with retained source hashes', async () => {
    const p = await checkedPreview(); const original = await sources();
    const created = await post(body({ expectedFingerprint: p.fingerprint }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const docId = created.body.data.doc.id;
    const copy = created.body.data.sections;
    expect(copy.find((row: { code: string }) => row.code === 'agency.response').content).toContain(ANSWER);
    expect(copy.find((row: { code: string }) => row.code === 'agency.context').content).toContain('Q7');
    const opened = await author(request(app).get(`/api/authoring/docs/${docId}/sections`));
    expect(opened.status).toBe(200);
    expect(opened.body.sections.map((row: { content: string }) => row.content)).toEqual(copy.map((row: { content: string }) => row.content));
    const stored = (await db.pool.query('SELECT provenance,client_program_id FROM authoring_documents WHERE id=$1', [docId])).rows[0];
    expect(savedImportSource(stored)).toMatchObject({ fingerprint: p.fingerprint });
    await expect(verifySavedWorkflowImport(stored, db.pool, { organizationId: ORG, actor: AUTHOR })).resolves.toMatchObject({ fingerprint: p.fingerprint });
    for (const section of copy) {
      const revision = (await db.pool.query('SELECT content_sha256,inputs FROM doc_revisions WHERE section_id=$1', [section.id])).rows[0];
      expect(revision.content_sha256).toBe(sha(section.content));
      expect(revision.inputs.importSource.fingerprint).toBe(p.fingerprint);
    }
    const responseSection = opened.body.sections.find((row: { code: string }) => row.code === 'agency.response');
    const amendment = '<p>Reviewed working response amended from the retained evidence.</p>';
    const edited = await author(request(app).patch(`/api/authoring/sections/${responseSection.id}`)).send({ content: amendment,
      expectedUpdatedAt: responseSection.updated_at, changeReason: 'Clarify this working response before independent review' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const reused = await post(body({ expectedFingerprint: p.fingerprint }));
    expect(reused.status).toBe(200); expect(reused.body.data.doc.id).toBe(docId); expect(reused.body.data.reused).toBe(true);
    expect(reused.body.data.sections.find((row: { code: string }) => row.code === 'agency.response').content).toBe(amendment);
    expect(await sources()).toEqual(original);
  });

  it('rejects a changed response version before creation and accepts an explicit fresh preview', async () => {
    const p = await checkedPreview(); const before = await counts();
    await db.pool.query('UPDATE agency_communication_questions SET response_text=$1,response_revision=2 WHERE id=$2', ['Changed source response.', QUESTION]);
    const receipt = await seedAgencyResponseReceipt(db.pool, { organizationId: ORG, questionId: QUESTION, eventId: EVENT, questionRef: 'Q7',
      questionText: 'Explain the recorded exposure rationale.', responseText: 'Changed source response.', revision: 2, userId: Number(AUTHOR.id) });
    try {
      const refused = await post(body({ expectedFingerprint: p.fingerprint }));
      expect(refused.status).toBe(409); expect(refused.body.error).toBe('SOURCE_CHANGED'); expect(await counts()).toEqual(before);
      const fresh = await checkedPreview(); expect(fresh.fingerprint).not.toBe(p.fingerprint); expect(fresh.origin.version).toBe('2');
      const created = await post(body({ expectedFingerprint: fresh.fingerprint }));
      expect(created.status).toBe(201); expect(created.body.data.sections.find((row: { code: string }) => row.code === 'agency.response').content).toContain('Changed source response.');
    } finally {
      await db.pool.query('UPDATE agency_communication_questions SET response_text=$1,response_revision=1 WHERE id=$2', [ANSWER, QUESTION]);
      await db.pool.query('DELETE FROM c2c_ana_actions WHERE id=$1', [receipt.actionId]);
      await db.pool.query('DELETE FROM agency_question_response_revisions WHERE id=$1', [receipt.revisionId]);
    }
  });

  it('supports an empty saved response as an empty working response section', async () => {
    const selected = { kind: 'agency-response', eventId: EVENT, questionId: 702 };
    const p = (await preview({ source: selected })).body.data;
    const created = await post(body({ source: selected, expectedFingerprint: p.fingerprint }));
    expect(created.status).toBe(201); const response = created.body.data.sections.find((row: { code: string }) => row.code === 'agency.response');
    expect(response.content.replace(/<[^>]*>/g, '').trim()).toBe(''); expect(p.gaps.join(' ')).toMatch(/no saved response/i);
  });
});

describe('current source access and source state admission', () => {
  it.each([{ eventId: `${EVENT}\n`, questionId: QUESTION }, { eventId: EVENT, questionId: String(QUESTION) },
    { eventId: EVENT, questionId: 0 }])('refuses malformed exact source selection before reading questions: %j', async selected => {
    const before = await counts(); trace.stmts.length = 0;
    const result = await preview({ source: { kind: 'agency-response', ...selected } });
    expect(result.status).toBe(400); expect(await counts()).toEqual(before);
    expect(trace.stmts.some(row => /FROM agency_communication_questions/i.test(row.sql))).toBe(false);
  });
  it('does not import another project or organization letter by its event/question identities', async () => {
    const before = await counts();
    const foreignProject = await preview({ programId: PROGRAM_B });
    expect(foreignProject.status).toBe(404);
    await db.pool.query('UPDATE concept2cure_agency_communications SET organization_id=$1 WHERE event_id=$2', [OTHER_ORG, EVENT]);
    try { expect((await preview()).status).toBe(404); } finally { await db.pool.query('UPDATE concept2cure_agency_communications SET organization_id=$1 WHERE event_id=$2', [ORG, EVENT]); }
    expect(await counts()).toEqual(before);
  });

  it('refuses current visibility denial before reading any question content', async () => {
    await db.pool.query('UPDATE concept2cure_agency_communications SET audit_metadata=$1 WHERE event_id=$2', [{ visibilityTier: 'restricted_legal_sensitive' }, EVENT]);
    try {
      trace.stmts.length = 0;
      const denied = await preview(); expect(denied.status).toBe(404);
      expect(trace.stmts.some(row => /FROM agency_communication_questions/i.test(row.sql))).toBe(false);
    } finally { await db.pool.query('UPDATE concept2cure_agency_communications SET audit_metadata=$1 WHERE event_id=$2', [{ visibilityTier: 'shared_client_c2c' }, EVENT]); }
  });

  it('refuses revoked membership before source content reads', async () => {
    await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]); invalidateOrgMembershipCache();
    try { expect([401, 403]).toContain((await preview()).status); }
    finally { await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]); invalidateOrgMembershipCache(); }
  });

  it('refuses closed letters and withdrawn questions without new authoring writes', async () => {
    const before = await counts();
    await db.pool.query("UPDATE concept2cure_agency_communications SET closure_status='closed' WHERE event_id=$1", [EVENT]);
    try { expect((await preview()).status).toBe(409); } finally { await db.pool.query("UPDATE concept2cure_agency_communications SET closure_status='open' WHERE event_id=$1", [EVENT]); }
    await db.pool.query('UPDATE agency_communication_questions SET withdrawn_at=NOW() WHERE id=$1', [QUESTION]);
    try { expect((await preview()).status).toBe(409); } finally { await db.pool.query('UPDATE agency_communication_questions SET withdrawn_at=NULL WHERE id=$1', [QUESTION]); }
    expect(await counts()).toEqual(before);
  });
});
