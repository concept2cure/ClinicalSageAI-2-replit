/** Actual HTTP/JWT/source admission and Authoring/response writes over PGlite.
 * Ledger sealing and signing authority are scripted; no ceremony/provider is claimed. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, PROGRAM, PREREQ, JWT_SECRET, asToken, makeApp } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';
import { verifyJwtWithRotation } from '../../utils/jwtVerify';
import { canViewVisibilityTier } from '../../services/agency-responses/visibility';
import { registerAgencyResponseRoutes } from '../c2c/agency-responses';
import { projectAdmissionMiddleware } from '../c2c/project-access';
import { agencyResponseDigest, assembleResponsePackage } from '../../services/agency-responses/response-logic';
import { readQuestions } from '../../services/agency-responses/response-service';
import { PROGRAM_B } from './_authoring-canvas-fixture';
import { AGENCY_RESPONSE_SOURCE_DDL, AGENCY_RESPONSE_WRITEBACK_DDL, agencyFixtureExecutor, seedAgencyResponseReceipt } from './_agency-response-authoring-fixture';
import { recordGovernedAction, type RecordGovernedActionParams } from '../c2c/actions';
import { recordMachineSpan } from '../../services/clinical-regulatory-evidence/span-lineage.service';
import { ANA_MACHINE_AUTHOR_ID, WORKFLOW_IMPORT_AUTHOR_ID } from '../../services/authoring/revision-ledger';
import type { WorkflowImportOrigin } from '../../../shared/authoring/source-import';
import type { responseFromSavedEditor } from '../../services/agency-responses/editor-response';

type FixtureAnswer = { response_text: string; response_revision: number };
type FixtureContent = { content: string };
type FixtureCount = { n: number };
type FixtureResponsePayload = Record<string, unknown> & {
  communicationEventId: string; questionRef: string; responseRevision: number; responseDigest: string;
  editorSource: Awaited<ReturnType<typeof responseFromSavedEditor>>['source'];
};
type FixtureCreateMetadata = Record<string, unknown> & { provenance: { importSource: WorkflowImportOrigin } };

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, params?: unknown[]) => (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, params) }));
vi.mock('../../services/audit/chain', async original => ({
  ...(await original<typeof import('../../services/audit/chain')>()),
  computeAuditChainSealed: vi.fn(async () => ({ sha256Chain: 'aa'.repeat(32), hmacSeal: null })),
}));

const sealing = vi.hoisted(() => ({ payloads: [] as Record<string, unknown>[] }));
vi.mock('../commitment-fulfil-route', async original => {
  const actual = await original<typeof import('../commitment-fulfil-route')>();
  return { ...actual, governedRequestWrite: async (_req: unknown, write: RecordGovernedActionParams,
    run: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<{ target: string; body: unknown; payload: Record<string, unknown> }>) => {
    const client = await (h.pool as { connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; release: () => void }> }).connect();
    await client.query('BEGIN');
    try { const result = await run(client);
      const governance = await recordGovernedAction(client, { ...write, target: result.target, payload: result.payload });
      sealing.payloads.push(result.payload); await client.query('COMMIT');
      return { body: result.body, governance };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } };
});
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: vi.fn(async () => null) }));

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
  ], testOnlySql: AGENCY_RESPONSE_SOURCE_DDL + AGENCY_RESPONSE_WRITEBACK_DDL });
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
  const agency = express.Router();
  agency.use(async (req, res, next) => {
    try {
      const payload = verifyJwtWithRotation<{ userId: string; organizationId: number }>(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
      const member = (await db.pglite.query<{ email: string | null; role: string }>('SELECT u.email,ou.role FROM users u JOIN organization_users ou ON ou.user_id=u.id WHERE u.id=$1 AND ou.organization_id=$2',
        [Number(payload.userId), payload.organizationId])).rows[0];
      if (!member) return void res.status(401).json({ error: 'Current member required' });
      Object.assign(req, { user: { id: Number(payload.userId), organizationId: payload.organizationId, email: member.email },
        userId: Number(payload.userId), organizationId: payload.organizationId, userRole: member.role,
        dbClient: { query: (sql: string, values?: unknown[]) => (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, values) } });
      next();
    } catch { res.status(401).json({ error: 'Signed token required' }); }
  });
  agency.use('/projects/:projectId', projectAdmissionMiddleware());
  registerAgencyResponseRoutes(agency, canViewVisibilityTier);
  app.use('/api/concept2cure', agency);
  await db.pool.query(`INSERT INTO concept2cure_agency_communications VALUES
    ($1,$2,42,'Information request','official','2026-10-01','2026-11-01','open','reviewed',true,$3)`,
  [EVENT, ORG, { visibilityTier: 'shared_client_c2c' }]);
  await db.pool.query(`INSERT INTO agency_communication_questions VALUES
    ($1,$2,42,$3,'Q7','Explain the recorded exposure rationale.','clinical','2.7.4',$4,1,$5,'2026-10-01',NULL,NULL)`,
  [QUESTION, ORG, EVENT, ANSWER, Number(AUTHOR.id)]);
  const question = (await readQuestions(db.pool, ORG, 42, EVENT, '2026-10-26'))[0];
  const digest = agencyResponseDigest(question);
  await db.pool.query("INSERT INTO users(id,name,email,status) VALUES(4,'Independent Reviewer','reviewer@canvas.example','active')");
  await db.pool.query(`INSERT INTO electronic_signatures(organization_id,signed_target,bound_payload_digest,signer_id,signer_name,signature_meaning)
    VALUES($1,$2,$3,4,'Independent Reviewer','reviewed')`, [ORG, `agency-question:${QUESTION}`, digest]);
  await db.pool.query(`INSERT INTO agency_question_response_revisions(organization_id,question_id,revision,response_text,response_digest,written_by,reason)
    VALUES($1,$2,1,$3,$4,$5,'Retained original response')`, [ORG, QUESTION, ANSWER, digest, Number(AUTHOR.id)]);
  await recordGovernedAction(db.pool, { orgId: ORG, userId: Number(AUTHOR.id), command: 'update', target: `agency-question:${QUESTION}`,
    domain: 'correspondence', surface: 'communication-center', reason: 'Retained original governed response',
    payload: { communicationEventId: EVENT, questionRef: 'Q7', responseRevision: 1, responseDigest: digest } });
}, 180_000);
afterAll(async () => { await db?.close(); });
beforeEach(() => { sealing.payloads.length = 0; });

const body = (extra: Record<string, unknown> = {}) => ({ programId: PROGRAM, reason: REASON,
  source: { kind: 'agency-response', eventId: EVENT, questionId: QUESTION }, ...extra });
const post = (payload: Record<string, unknown>) => author(request(app).post('/api/authoring/import/source')).send(payload);
const preview = (extra: Record<string, unknown> = {}) => post(body({ previewOnly: true, ...extra }));
async function checkedPreview(questionId = QUESTION, eventId = EVENT) {
  const result = await preview({ source: { kind: 'agency-response', eventId, questionId } });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data;
}

const responsePath = `/api/concept2cure/projects/42/agency-communications/${EVENT}/questions/${QUESTION}/response`;
const editorSources = () => author(request(app).get(responsePath.replace(/\/response$/, '/editor-source')));
async function prepared(text: string, rawHtml = false, questionId = QUESTION, eventId = EVENT) {
  const p = await checkedPreview(questionId, eventId);
  const created = await post(body({ source: { kind: 'agency-response', eventId, questionId }, expectedFingerprint: p.fingerprint }));
  expect([200,201], JSON.stringify(created.body)).toContain(created.status);
  const documentId = created.body.data.doc.id;
  const opened = await author(request(app).get(`/api/authoring/docs/${documentId}/sections`));
  expect(opened.status).toBe(200);
  const section = opened.body.sections.find((row: { code: string }) => row.code === 'agency.response');
  const edited = await author(request(app).patch(`/api/authoring/sections/${section.id}`)).send({ content: rawHtml ? text : `<p>${text}</p>`,
    expectedUpdatedAt: section.updated_at, changeReason: 'Prepare the saved response for independent review' });
  expect(edited.status, JSON.stringify(edited.body)).toBe(200);
  const current = await author(request(app).get(`/api/authoring/docs/${documentId}/sections`));
  const saved = current.body.sections.find((row: { id: string }) => row.id === section.id);
  return { documentId, sectionId: saved.id, expectedSha256: sha(saved.content), expectedUpdatedAt: saved.updated_at };
}

type EditorSource = Awaited<ReturnType<typeof prepared>>;
const recordResponse = (editorSource: EditorSource, expectedRevision = 1, extra: Record<string, unknown> = {}) =>
  author(request(app).put(responsePath)).send({ editorSource, expectedRevision, reason: REASON, ...extra });
const currentQuestion = async () => (await db.pglite.query<FixtureAnswer>('SELECT response_text,response_revision FROM agency_communication_questions WHERE id=$1', [QUESTION])).rows[0];
async function unchangedRefusal(source: EditorSource, statuses: number[], expectedRevision = 1) {
  const before = await currentQuestion();
  const count = (await db.pglite.query<FixtureCount>('SELECT count(*)::int AS n FROM agency_question_response_revisions')).rows[0].n;
  const payloadCount = sealing.payloads.length;
  const result = await recordResponse(source, expectedRevision);
  expect(statuses, JSON.stringify(result.body)).toContain(result.status);
  expect(await currentQuestion()).toEqual(before);
  expect((await db.pglite.query<FixtureCount>('SELECT count(*)::int AS n FROM agency_question_response_revisions')).rows[0].n).toBe(count);
  expect(sealing.payloads).toHaveLength(payloadCount);
  return result;
}

describe('saved-editor version and exact target admission', () => {
  it('refuses stale editor content and time without response or revision writes', async () => {
    const source = await prepared('Current working response for the stale-version control.');
    await unchangedRefusal({ ...source, expectedSha256: 'ab'.repeat(32) }, [409]);
    await unchangedRefusal({ ...source, expectedUpdatedAt: '2025-01-01T00:00:00.000Z' }, [409]);
  });

  it('refuses the question-context section and another document identity', async () => {
    const source = await prepared('Working answer for exact-source controls.');
    const sections = await author(request(app).get(`/api/authoring/docs/${source.documentId}/sections`));
    const context = sections.body.sections.find((row: { code: string }) => row.code === 'agency.context');
    await unchangedRefusal({ documentId: source.documentId, sectionId: context.id, expectedSha256: sha(context.content), expectedUpdatedAt: context.updated_at }, [404]);
    await unchangedRefusal({ ...source, documentId: PROGRAM }, [404]);
  });

  it('refuses a working document moved to a different recorded project', async () => {
    const source = await prepared('Working answer for the other-project control.');
    await db.pool.query('UPDATE authoring_documents SET client_program_id=$1 WHERE id=$2', [PROGRAM_B, source.documentId]);
    try { await unchangedRefusal(source, [404,409]); }
    finally { await db.pool.query('UPDATE authoring_documents SET client_program_id=$1 WHERE id=$2', [PROGRAM, source.documentId]); }
  });

  it('refuses revoked section/document access before reading its saved content', async () => {
    const source = await prepared('Working answer before object access is revoked.');
    const grants = (await db.pglite.query<{ id: string }>('SELECT id::text FROM doc_permissions WHERE doc_id=$1 AND revoked_at IS NULL', [source.documentId])).rows.map(row => row.id);
    await db.pool.query('UPDATE doc_permissions SET revoked_at=NOW() WHERE id=ANY($1::uuid[])', [grants]);
    try { await unchangedRefusal(source, [404]); }
    finally { await db.pool.query('UPDATE doc_permissions SET revoked_at=NULL WHERE id=ANY($1::uuid[])', [grants]); }
  });
});

describe('current response source, visibility and recorded lineage', () => {
  it('previews the exact saved candidate and hides its text after current object access is revoked', async () => {
    const source = await prepared('The exact saved answer shown before the explicit governed write.');
    const before = await currentQuestion();
    const result = await editorSources();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.data).toMatchObject({ programId: PROGRAM, currentRevision: 1,
      source: { kind: 'agency-response', eventId: EVENT, questionId: QUESTION } });
    expect(result.body.data.copies).toContainEqual({ documentId: source.documentId, sectionId: source.sectionId,
      sha256: source.expectedSha256, updatedAt: source.expectedUpdatedAt, sourceRevision: 1,
      ready: true, refusal: null, text: 'The exact saved answer shown before the explicit governed write.' });
    expect(await currentQuestion()).toEqual(before); expect(sealing.payloads).toHaveLength(0);
    const grants = (await db.pglite.query<{ id: string }>('SELECT id::text FROM doc_permissions WHERE doc_id=$1 AND revoked_at IS NULL', [source.documentId])).rows.map(row => row.id);
    await db.pool.query('UPDATE doc_permissions SET revoked_at=NOW() WHERE id=ANY($1::uuid[])', [grants]);
    const mark = trace.stmts.length;
    try {
      const hidden = await editorSources();
      expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
      expect(hidden.body.data.copies.some((copy: { documentId: string }) => copy.documentId === source.documentId)).toBe(false);
      expect(trace.stmts.slice(mark).some(stmt => /SELECT id::text,code,title,content,updated_at FROM authoring_sections/.test(stmt.sql)
        && stmt.params.includes(source.sectionId))).toBe(false);
    } finally { await db.pool.query('UPDATE doc_permissions SET revoked_at=NULL WHERE id=ANY($1::uuid[])', [grants]); }
  });

  it('refuses a response revision or source question changed since the copy was created', async () => {
    const source = await prepared('Working answer before another source edit.');
    await db.pool.query('UPDATE agency_communication_questions SET response_revision=2 WHERE id=$1', [QUESTION]);
    try { await unchangedRefusal(source, [409]); } finally { await db.pool.query('UPDATE agency_communication_questions SET response_revision=1 WHERE id=$1', [QUESTION]); }
    await db.pool.query('UPDATE agency_communication_questions SET question_text=$1 WHERE id=$2', ['Changed recorded agency question.', QUESTION]);
    try { await unchangedRefusal(source, [409]); }
    finally { await db.pool.query('UPDATE agency_communication_questions SET question_text=$1 WHERE id=$2', ['Explain the recorded exposure rationale.', QUESTION]); }
  });

  it('does not trust a body-claimed response revision as a rebase of an old working copy', async () => {
    const source = await prepared('A response retained from revision one.');
    await db.pool.query('UPDATE agency_communication_questions SET response_revision=2 WHERE id=$1', [QUESTION]);
    try { await unchangedRefusal(source, [409], 2); } finally { await db.pool.query('UPDATE agency_communication_questions SET response_revision=1 WHERE id=$1', [QUESTION]); }
  });

  it('refuses current letter visibility denial, closure and question withdrawal', async () => {
    const source = await prepared('Working answer before its letter changes state.');
    await db.pool.query('UPDATE concept2cure_agency_communications SET audit_metadata=$1 WHERE event_id=$2', [{ visibilityTier: 'restricted_legal_sensitive' }, EVENT]);
    try { await unchangedRefusal(source, [404]); }
    finally { await db.pool.query('UPDATE concept2cure_agency_communications SET audit_metadata=$1 WHERE event_id=$2', [{ visibilityTier: 'shared_client_c2c' }, EVENT]); }
    await db.pool.query("UPDATE concept2cure_agency_communications SET closure_status='closed' WHERE event_id=$1", [EVENT]);
    try { await unchangedRefusal(source, [409]); } finally { await db.pool.query("UPDATE concept2cure_agency_communications SET closure_status='open' WHERE event_id=$1", [EVENT]); }
    await db.pool.query('UPDATE agency_communication_questions SET withdrawn_at=NOW() WHERE id=$1', [QUESTION]);
    try { await unchangedRefusal(source, [409]); } finally { await db.pool.query('UPDATE agency_communication_questions SET withdrawn_at=NULL WHERE id=$1', [QUESTION]); }
  });

  it('refuses unrecorded section-content tampering even when its supplied hash and time match', async () => {
    const source = await prepared('A saved response with verified clause lineage.');
    const original = (await db.pglite.query<FixtureContent>('SELECT content FROM authoring_sections WHERE id=$1', [source.sectionId])).rows[0].content;
    const unrecorded = '<p>Unrecorded alteration that has no canonical saved lineage.</p>';
    await db.pool.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [unrecorded, source.sectionId]);
    try { await unchangedRefusal({ ...source, expectedSha256: sha(unrecorded) }, [409]); }
    finally { await db.pool.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [original, source.sectionId]); }
  });

  it('refuses a lossy rich-text projection and ambiguous body-authored text beside editorSource', async () => {
    const source = await prepared('<table><tbody><tr><td>Source-supported table text.</td></tr></tbody></table>', true);
    await unchangedRefusal(source, [409]);
    const mixed = await recordResponse(source, 1, { responseText: 'A body-forged replacement rather than the saved text.' });
    expect(mixed.status).toBe(400); expect(sealing.payloads).toHaveLength(0);
  });

  it('refuses unresolved saved tracked suggestions without accepting or copying them', async () => {
    const source = await prepared('<p>The recorded dose is <del data-author-name="Author">10</del><ins data-author-name="Author">20</ins> mg.</p>', true);
    const result = await unchangedRefusal(source, [409]);
    expect(result.body.error.code).toBe('EDITOR_RESPONSE_PENDING_CHANGES');
    expect((await db.pglite.query<FixtureContent>('SELECT content FROM authoring_sections WHERE id=$1', [source.sectionId])).rows[0].content).toContain('<ins');
  });
});

it('records actual saved editor text through the existing governed answer writer', async () => {
  const editorSource = await prepared('A reviewed answer from the saved editor section.');
  const result = await author(request(app).put(responsePath)).send({ editorSource, expectedRevision: 1, reason: REASON });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const saved = (await db.pglite.query<FixtureAnswer>('SELECT response_text,response_revision FROM agency_communication_questions WHERE id=$1', [QUESTION])).rows[0];
  expect(saved).toMatchObject({ response_text: 'A reviewed answer from the saved editor section.', response_revision: 2 });
  const revision = (await db.pglite.query<{ response_text: string; response_digest: string }>('SELECT response_text,response_digest FROM agency_question_response_revisions WHERE question_id=$1 AND revision=2', [QUESTION])).rows[0];
  expect(revision.response_text).toBe(saved.response_text);
  expect(revision.response_digest).toMatch(/^[a-f0-9]{64}$/);
  expect(sealing.payloads).toHaveLength(1);
  expect(result.body.data).toMatchObject({ responseRevision: 2, state: 'changed-after-approval', approval: null });
  const readback = await author(request(app).get(responsePath.replace(/\/questions\/\d+\/response$/, '/questions')));
  expect(readback.status, JSON.stringify(readback.body)).toBe(200);
  expect(readback.body.data.questions.find((question: { id: number }) => question.id === QUESTION))
    .toMatchObject({ responseText: saved.response_text, responseRevision: 2, state: 'changed-after-approval', approval: null });
  const questions = await readQuestions(db.pool, ORG, 42, EVENT, '2026-10-26');
  expect(questions[0].revisions.find(row => row.revision === 1)?.responseText).toBe(ANSWER);
  expect((await db.pglite.query<FixtureCount>('SELECT count(*)::int AS n FROM electronic_signatures')).rows[0].n).toBe(1);
  const stale = await editorSources();
  expect(stale.status, JSON.stringify(stale.body)).toBe(200);
  expect(stale.body.data).toMatchObject({ programId: PROGRAM, currentRevision: 2 });
  expect(stale.body.data.copies.find((copy: { documentId: string }) => copy.documentId === editorSource.documentId))
    .toMatchObject({ sourceRevision: 1, ready: false, text: null });
  expect(assembleResponsePackage({ eventId: EVENT, communicationType: 'Information request', sourceType: 'official', receivedDate: null, dueDate: null }, questions).ok).toBe(false);
  const refusedPackage = await author(request(app).post(responsePath.replace(/\/questions\/\d+\/response$/, '/response-package'))).send({ format: 'md' });
  expect(refusedPackage.status, JSON.stringify(refusedPackage.body)).toBe(409);
  const earlierDoc = editorSource.documentId;
  const nextSource = await prepared('A second reviewed amendment from the existing editor.');
  expect(nextSource.documentId).not.toBe(earlierDoc);
  const second = await recordResponse(nextSource, 2);
  expect(second.status, JSON.stringify(second.body)).toBe(200);
  expect(await currentQuestion()).toMatchObject({ response_revision: 3, response_text: 'A second reviewed amendment from the existing editor.' });
  const retained = (await db.pglite.query<FixtureContent>('SELECT content FROM authoring_sections WHERE id=$1', [editorSource.sectionId])).rows[0].content;
  expect(retained).toBe('<p>A reviewed answer from the saved editor section.</p>');
  expect((await db.pglite.query<FixtureCount>('SELECT count(*)::int AS n FROM electronic_signatures')).rows[0].n).toBe(1);
  const third = await prepared('A third saved answer before a forged genesis receipt.');
  const origin = (await db.pglite.query<{ metadata: FixtureCreateMetadata }>(`SELECT metadata FROM authoring_audit_trail
    WHERE doc_id=$1 AND operation_type='CREATE' LIMIT 1`, [third.documentId])).rows[0].metadata;
  await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,tenant_id,metadata)
    VALUES($1,$2,'CREATE',$3,$4,$5)`, [third.documentId, third.sectionId, AUTHOR.email, ORG,
    { ...origin, provenance: { ...origin.provenance, importSource: { ...origin.provenance.importSource, id: 'forged-other-question:999' } } }]);
  const refusedGenesis = await unchangedRefusal(third, [409], 3);
  expect(refusedGenesis.body.error.code).toBe('WORKFLOW_ORIGIN_UNVERIFIED');
});

async function storedMachineAnswer(questionId: number, text: string, machineAuthor = ANA_MACHINE_AUTHOR_ID) {
  await db.pool.query(`INSERT INTO agency_communication_questions
    (id,organization_id,project_id,communication_event_id,question_ref,question_text,response_text,response_revision,response_updated_by)
    VALUES($1,$2,42,$3,$4,'Explain the recorded exposure rationale.',$5,1,$6)`,
  [questionId, ORG, EVENT, `Q${questionId}`, ANSWER, Number(AUTHOR.id)]);
  await seedAgencyResponseReceipt(db.pool, { organizationId: ORG, questionId, eventId: EVENT, questionRef: `Q${questionId}`,
    questionText: 'Explain the recorded exposure rationale.', responseText: ANSWER, revision: 1, userId: Number(AUTHOR.id) });
  const source = await prepared(text, false, questionId);
  const content = (await db.pglite.query<FixtureContent>('SELECT content FROM authoring_sections WHERE id=$1', [source.sectionId])).rows[0].content;
  // Retained fixture attribution, not a provider turn or a qualification assertion.
  await recordMachineSpan(ORG, { documentTable: 'authoring_sections', documentId: source.sectionId,
    charStart: 0, charEnd: content.length, spanText: content, machineAuthorId: machineAuthor,
    assertedBy: AUTHOR.id, createdBy: AUTHOR.id }, agencyFixtureExecutor(db));
  const path = responsePath.replace(`/questions/${QUESTION}/`, `/questions/${questionId}/`);
  const saved = await author(request(app).put(path)).send({ editorSource: source, expectedRevision: 1, reason: REASON });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  expect(sealing.payloads.at(-1)?.editorSource).toMatchObject({ machineAuthors: [machineAuthor] });
  return { source, path };
}

it.each([
  { questionId: 702, text: 'The retained AnA assessment identifies exposure of 10 mg with response 42%.', legacy: false },
  { questionId: 703, text: 'Yes.', legacy: true },
  { questionId: 704, text: 'The retained AnA assessment identifies exposure of 20 mg with response 51%.', legacy: true },
])('retains known AnA origin across fresh response copies for question $questionId', async ({ questionId, text, legacy }) => {
  const { path } = await storedMachineAnswer(questionId, text);
  const currentRevision = legacy ? 3 : 2;
  if (legacy) {
    const edited = await author(request(app).put(path)).send({ responseText: text.length < 8 ? text.replace(/\.$/, '!') : `${text.replace(/\.$/, ';')} An additional review is recorded.`,
      expectedRevision: 2, reason: 'Retain the recorded answer while adding review context' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
  }
  const fresh = await checkedPreview(questionId);
  expect(fresh.origin.sectionOrigins.find((section: { code: string }) => section.code === 'agency.response'))
    .toMatchObject({ originalAuthorship: 'machine', model: null, modelEvidence: 'unrecorded' });
  const copy = await post(body({ source: { kind: 'agency-response', eventId: EVENT, questionId }, expectedFingerprint: fresh.fingerprint }));
  expect(copy.status, JSON.stringify(copy.body)).toBe(201);
  const section = copy.body.data.sections.find((row: { code: string }) => row.code === 'agency.response');
  const refused = await author(request(app).put(path)).send({ expectedRevision: currentRevision, reason: REASON,
    editorSource: { documentId: copy.body.data.doc.id, sectionId: section.id, expectedSha256: sha(section.content), expectedUpdatedAt: section.updated_at } });
  expect(refused.status, JSON.stringify(refused.body)).toBe(409);
  expect(refused.body.error.code).toBe('EDITOR_RESPONSE_MODEL_QUALIFICATION_REQUIRED');
});

it.each([
  { questionId: 705, revision: 1, history: [] },
  { questionId: 706, revision: 2, history: [1] },
  { questionId: 707, revision: 3, history: [1, 3] },
])('refuses missing or discontinuous current response history for question $questionId', async ({ questionId, revision, history }) => {
  await db.pool.query(`INSERT INTO agency_communication_questions
    (id,organization_id,project_id,communication_event_id,question_ref,question_text,response_text,response_revision,response_updated_by)
    VALUES($1,$2,42,$3,$4,'Explain the recorded exposure rationale.',$5,$6,$7)`,
  [questionId, ORG, EVENT, `Q${questionId}`, ANSWER, revision, Number(AUTHOR.id)]);
  for (const number of history) await seedAgencyResponseReceipt(db.pool, { organizationId: ORG, questionId, eventId: EVENT,
    questionRef: `Q${questionId}`, questionText: 'Explain the recorded exposure rationale.', responseText: ANSWER,
    revision: number, userId: Number(AUTHOR.id) });
  const result = await preview({ source: { kind: 'agency-response', eventId: EVENT, questionId } });
  expect(result.status, JSON.stringify(result.body)).toBe(409);
  expect(result.body.error).toBe('AGENCY_SOURCE_ORIGIN_UNVERIFIED');
});

it('refuses altered, missing and ambiguous governed machine provenance instead of downgrading it', async () => {
  const questionId = 708;
  await storedMachineAnswer(questionId, 'The retained machine assessment records a response rate of 37%.');
  const payload = sealing.payloads.at(-1)!;
  const saved = (await db.pglite.query<{ id: string; audit_row_id: string; payload: FixtureResponsePayload }>(`SELECT id,audit_row_id::text,payload FROM c2c_ana_actions
    WHERE org_id=$1 AND target=$2 AND payload->>'responseRevision'='2'`, [ORG, `agency-question:${questionId}`])).rows[0];
  const selected = { kind: 'agency-response', eventId: EVENT, questionId };
  const refuse = async () => {
    const result = await preview({ source: selected });
    expect(result.status, JSON.stringify(result.body)).toBe(409);
    expect(result.body.error).toBe('AGENCY_SOURCE_ORIGIN_UNVERIFIED');
  };
  const editor = saved.payload.editorSource;
  for (const altered of [
    { ...saved.payload, editorSource: { ...editor, machineAuthors: [] } },
    { ...saved.payload, editorSource: { ...editor, machineAuthors: ['constructor'] } },
    { ...saved.payload, communicationEventId: 'foreign-letter' },
    { ...saved.payload, responseDigest: '00'.repeat(32) },
    { ...saved.payload, editorSource: { ...editor, sourceResponseRevision: 0 } },
    { ...saved.payload, unsupportedOriginClaim: true },
  ]) {
    await db.pool.query('UPDATE c2c_ana_actions SET payload=$1 WHERE id=$2', [altered, saved.id]);
    try { await refuse(); } finally { await db.pool.query('UPDATE c2c_ana_actions SET payload=$1 WHERE id=$2', [saved.payload, saved.id]); }
  }
  await db.pool.query("UPDATE c2c_ana_actions SET audit_row_id='ffffffff-ffff-4fff-8fff-ffffffffffff' WHERE id=$1", [saved.id]);
  try { await refuse(); } finally { await db.pool.query('UPDATE c2c_ana_actions SET audit_row_id=$1 WHERE id=$2', [saved.audit_row_id, saved.id]); }
  await db.pool.query("UPDATE c2c_ana_actions SET target='agency-question:999' WHERE id=$1", [saved.id]);
  try { await refuse(); } finally { await db.pool.query('UPDATE c2c_ana_actions SET target=$1 WHERE id=$2', [`agency-question:${questionId}`, saved.id]); }
  const duplicate = await recordGovernedAction(db.pool, { orgId: ORG, userId: Number(AUTHOR.id), command: 'update',
    target: `agency-question:${questionId}`, domain: 'correspondence', surface: 'communication-center', reason: 'Ambiguous receipt fixture', payload });
  try { await refuse(); } finally { await db.pool.query('DELETE FROM c2c_ana_actions WHERE id=$1', [duplicate.actionId]); }
  const fresh = await checkedPreview(questionId);
  expect(fresh.origin.sectionOrigins.find((section: { code: string }) => section.code === 'agency.response').originalAuthorship).toBe('machine');
});

it('keeps the deterministic import sentinel distinct from known AnA origin', async () => {
  const questionId = 709;
  await storedMachineAnswer(questionId, 'Retained externally authored source text with recorded deterministic copying.', WORKFLOW_IMPORT_AUTHOR_ID);
  const fresh = await checkedPreview(questionId);
  expect(fresh.origin.sectionOrigins.find((section: { code: string }) => section.code === 'agency.response').originalAuthorship).toBe('unknown');
});

it('does not claim machine origin after legacy editing removes all retained machine clauses', async () => {
  const questionId = 710;
  const { path } = await storedMachineAnswer(questionId, 'The original machine assessment described an exposure of 40 mg.');
  const edited = await author(request(app).put(path)).send({ responseText: 'A distinct independently rewritten rationale addresses the subsequent dataset.',
    expectedRevision: 2, reason: 'Replace the earlier assessment with an independent rationale' });
  expect(edited.status, JSON.stringify(edited.body)).toBe(200);
  const fresh = await checkedPreview(questionId);
  expect(fresh.origin.sectionOrigins.find((section: { code: string }) => section.code === 'agency.response').originalAuthorship).toBe('unknown');
});

it.each([{ questionId: 711, revision: 201, actions: 0 }, { questionId: 712, revision: 0, actions: 401 }])('refuses provenance beyond bounded history/action admission for question $questionId', async ({ questionId, revision, actions }) => {
  await db.pool.query(`INSERT INTO agency_communication_questions
    (id,organization_id,project_id,communication_event_id,question_ref,question_text,response_text,response_revision)
    VALUES($1,$2,42,$3,$4,'Explain the recorded response.','',$5)`, [questionId, ORG, EVENT, `Q${questionId}`, revision]);
  if (actions) await db.pool.query(`INSERT INTO c2c_ana_actions
    (id,org_id,domain,surface,command,target,payload,state,proposed_by)
    SELECT 'act_bound_'||n::text,$1,'correspondence','communication-center','update',$2,
      '{"responseRevision":1}'::jsonb,'executed',$3 FROM generate_series(1,$4) n`,
  [ORG, `agency-question:${questionId}`, Number(AUTHOR.id), actions]);
  const result = await preview({ source: { kind: 'agency-response', eventId: EVENT, questionId } });
  expect(result.status, JSON.stringify(result.body)).toBe(503);
  expect(result.body.error).toBe('AGENCY_SOURCE_ORIGIN_UNVERIFIED');
});

it('exports the actual saved-editor answer only after independent current-text approval standing is recorded', async () => {
  const eventId = 'agency-package-event';
  const questionId = 713;
  const text = 'The independently reviewed final answer addresses the retained exposure evidence and its limitations.';
  await db.pool.query(`INSERT INTO concept2cure_agency_communications VALUES
    ($1,$2,42,'Information request','official','2026-10-01','2026-11-01','open','reviewed',true,$3)`,
  [eventId, ORG, { visibilityTier: 'shared_client_c2c' }]);
  await db.pool.query(`INSERT INTO agency_communication_questions
    (id,organization_id,project_id,communication_event_id,question_ref,question_text,response_text,response_revision,response_updated_by)
    VALUES($1,$2,42,$3,'Q713','Explain the recorded exposure rationale.',$4,1,$5)`, [questionId, ORG, eventId, ANSWER, Number(AUTHOR.id)]);
  await seedAgencyResponseReceipt(db.pool, { organizationId: ORG, questionId, eventId, questionRef: 'Q713',
    questionText: 'Explain the recorded exposure rationale.', responseText: ANSWER, revision: 1, userId: Number(AUTHOR.id) });
  const editorSource = await prepared(text, false, questionId, eventId);
  const path = responsePath.replace(EVENT, eventId).replace(`/questions/${QUESTION}/`, `/questions/${questionId}/`);
  const saved = await author(request(app).put(path)).send({ editorSource, expectedRevision: 1, reason: REASON });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const packagePath = path.replace(/\/questions\/\d+\/response$/, '/response-package');
  expect((await author(request(app).post(packagePath)).send({ format: 'md' })).status).toBe(409);
  const current = (await readQuestions(db.pool, ORG, 42, eventId, '2026-10-26'))[0];
  // Explicit fixture approval standing by another user; no reauthentication/ceremony is claimed.
  await db.pool.query(`INSERT INTO electronic_signatures(organization_id,signed_target,bound_payload_digest,signer_id,signer_name,signature_meaning)
    VALUES($1,$2,$3,4,'Independent Reviewer','reviewed')`, [ORG, `agency-question:${questionId}`, agencyResponseDigest(current)]);
  const download = await author(request(app).post(packagePath)).send({ format: 'md' });
  expect(download.status, JSON.stringify(download.body)).toBe(200);
  expect(download.text).toContain(text); expect(download.text).not.toContain(ANSWER);
  expect(download.headers['x-export-sha256']).toBe(sha(download.text));
  const audits = (await db.pglite.query<{ new_values: { sha256: string; questionCount: number } }>(`SELECT new_values FROM audit_logs
    WHERE tenant_id=$1 AND action='EXPORT_GENERATED' AND record_id=$2`, [ORG, eventId])).rows;
  expect(audits).toHaveLength(1);
  expect(audits[0].new_values).toMatchObject({ sha256: download.headers['x-export-sha256'], questionCount: 1 });
});
