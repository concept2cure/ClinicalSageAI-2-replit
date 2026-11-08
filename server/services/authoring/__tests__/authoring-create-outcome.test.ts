/** Real canonical PGlite writes, with synthetic transport loss (not native socket/provider proof). */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runWithTenantScope } from '../../../db/tenantStore';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, PROGRAM, ORG, AUTHOR, makeApp, mint, asToken } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { AUTHORING_TOOL_MIGRATIONS, DISPOSITION_IMPACT_PREREQ } from '../../ana/__tests__/support/authoring-tool-db';
import { approvedToolHandler } from '../../ana/__tests__/support/approved-tool-handler';
import { createDocumentFromDraft, parseProvenance, verifyRetainedDerivativeGeneration, type CreateDocumentFromDraftOptions } from '../authoring-from-draft';
import { plainTextToHtml } from '../../../../shared/authoring/plain-text-html';
import { runAuthoringIndependentCheck } from '../peer-review';
import { assertIndependentCheckRelease, readIndependentCheckContext } from '../workflow-import-governance';
import { authoringSnapshotHash, fullVisibleAuthoringSnapshot } from '../authoring-content-digests';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';
import { authoringSavedSnapshotSchema } from '../../../../shared/authoring/peer-review';
import type { RequestConnectable } from '../../../db/requestDb';
import { insertDocumentTx, type AuthoringPool, type CreateContext, type DocumentRowSpec } from '../authoring-documents';
import { AuthoringCreateOutcomeError, authoringCreationRecoveryPayload } from '../authoring-create-outcome';
import type { CompanyCorrespondenceOrigin } from '../../../../shared/company-correspondence';

// Test-only mutation control replays the former rollback/clean-release behavior.
// Select only the after-commit case when recording its expected failing proof.
vi.mock('../authoring-create-outcome', async importOriginal => {
  const actual = await importOriginal<typeof import('../authoring-create-outcome')>();
  if (process.env.OCT17_AUTHORING_LEGACY_CONTROL !== '1') return actual;
  const legacy: typeof actual.rejectAuthoringCreateTransaction = async (client, state, error) => {
    await client.query('ROLLBACK').catch(() => { state.discardConnection = new Error('Legacy rollback failed'); });
    throw error;
  };
  return { ...actual, rejectAuthoringCreateTransaction: legacy };
});

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db.js', () => ({
  get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (text: string, params?: unknown[]) => (h.pool as AuthoringPool).query(text, params),
}));
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let pool: AuthoringPool;
let mode: 'none' | 'before-commit' | 'after-commit' | 'readback' | 'revoked' | 'rollback-fails' | 'revoked-during-read' = 'none';
let committed = false;
let releaseCleanup = Promise.resolve();
let statements: string[] = [];
const releases = vi.fn();
const draft = { programId: PROGRAM, title: 'Synthetic creation outcome', module: 'M2',
  sections: [{ code: '2.5', title: 'Overview', content: '<p>Saved synthetic content.</p>' }], provenance: { source: 'seed' as const } };
const ctx = (): CreateContext => ({ pool, tenantId: ORG, actor: { id: String(AUTHOR.id), email: AUTHOR.email },
  audit: { pool, tenantId: ORG, actorId: String(AUTHOR.id), actorEmail: AUTHOR.email, actorRole: 'member', ipAddress: 'test', userAgent: 'test' } });
const correspondenceOrigin: CompanyCorrespondenceOrigin = { version: 1, organizationId: ORG, programId: PROGRAM, projectId: 42,
  submissionId: 5, sequenceId: 9, sequenceNumber: '0000', submissionTitle: 'Correspondence filing', applicationType: 'ind', applicationNumber: 'IND123456',
  applicantName: 'Recorded applicant', country: 'US', agency: 'FDA', recipient: { authority: 'FDA', basis: 'recorded_filing_market' },
  companyDocumentRevision: 4, companyProfileHash: 'a'.repeat(64), companyBrandingApplied: true };

beforeAll(async () => {
  const profileCreator = readFileSync(new URL('../../../../migrations/0013_ana_intelligence_system.sql', import.meta.url), 'utf8')
    .match(/CREATE TABLE IF NOT EXISTS user_intelligence_profiles \([\s\S]*?\n\);/)?.[0];
  if (!profileCreator) throw new Error('Canonical owner-profile fixture DDL is required.');
  jdb = await createJourneyDb({ prereqSql: PREREQ + VAULT_DDL + DISPOSITION_IMPACT_PREREQ,
    migrations: [...AUTHORING_TOOL_MIGRATIONS, 'db/migrations/20260813_ai_gateway_audit_log.sql'],
    testOnlySql: `${AUTHORING_ACCESS_DDL} ${profileCreator} ALTER TABLE organizations ADD COLUMN payment_status text NOT NULL DEFAULT 'active';` });
  pool = {
    query: async (sql, values) => {
      if (committed && mode === 'readback' && /FROM authoring_sections WHERE doc_id/.test(sql)) throw new Error('Synthetic post-commit read failure');
      const result = await jdb.pool.query(sql, values);
      if (committed && mode === 'revoked-during-read' && /FROM authoring_sections WHERE doc_id/.test(sql)) {
        await jdb.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
        await jdb.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      }
      return result;
    },
    connect: async () => ({
      query: async (sql, values) => {
        statements.push(sql);
        if (sql === 'ROLLBACK' && mode === 'rollback-fails') throw new Error('Synthetic rollback failure');
        if (sql === 'COMMIT' && mode === 'before-commit') throw new Error('Synthetic COMMIT send failure');
        const result = await jdb.pool.query(sql, values);
        if (sql === 'COMMIT') {
          committed = true;
          if (mode === 'after-commit') throw new Error('Synthetic lost COMMIT reply');
          if (mode === 'revoked') {
            await jdb.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
            await jdb.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
          }
        }
        return result;
      },
      release: error => {
        releases(error);
        // PGlite has one connection. Model disposal's server-side rollback for
        // the unsent-COMMIT control without issuing ROLLBACK on the tested client.
        if (error && (mode === 'before-commit' || mode === 'rollback-fails')) releaseCleanup = jdb.pool.query('ROLLBACK').then(() => undefined);
      },
    }),
  };
  h.db = jdb.db; h.pool = pool;
  await import('../../ana/AnaToolExecutor');
  author = asToken(await mint(AUTHOR));
  app = makeApp((await import('../../../routes/authoring.router')).default);
}, 240_000);
beforeEach(async () => {
  await releaseCleanup;
  mode = 'none'; committed = false; statements = []; releases.mockClear();
  await jdb.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
  await jdb.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
});
afterAll(async () => { await releaseCleanup; await jdb?.close(); });

async function retained(documentId: string) {
  return (await jdb.pool.query(`SELECT
    (SELECT COUNT(*)::int FROM authoring_documents WHERE id=$1 AND tenant_id=$2) AS documents,
    (SELECT COUNT(*)::int FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2) AS sections,
    (SELECT COUNT(*)::int FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE') AS creates`, [documentId, ORG])).rows[0];
}
function canonicalFixtureSnapshot(document: Record<string, unknown>, sections: Array<Record<string, unknown>>) {
  if (typeof document.id !== 'string') throw new Error('Fixture saved document has no canonical ID');
  const framed = authoringSavedSnapshotSchema.shape.sections.parse(sections.map(section => ({
    id: section.id, code: section.code, title: section.title ?? null, content: section.content,
  })));
  return fullVisibleAuthoringSnapshot({ doc: { ...document, id: document.id }, sections: framed });
}
function expectDiscarded() {
  expect(statements.filter(sql => sql === 'COMMIT')).toHaveLength(1);
  expect(statements).not.toContain('ROLLBACK');
  expect(releases).toHaveBeenCalledTimes(1);
  expect(releases).toHaveBeenCalledWith(expect.any(AuthoringCreateOutcomeError));
}
function checkRecovery(body: Record<string, any>, outcome: 'committed' | 'unconfirmed') {
  expect(body).toMatchObject({ ok: false, retryAllowed: false, creationOutcome: outcome,
    recovery: { organizationId: ORG, programId: PROGRAM, documentId: body.recovery?.documentId } });
  expect(body.recovery?.documentId).toMatch(/^[a-f0-9-]{36}$/);
  expect(body.error).not.toMatch(/nothing (?:was )?(saved|created)|not created|not written/i);
  for (const key of ['content', 'sections', 'document', 'provenance', 'title', 'authoringDocId', 'programId']) expect(body).not.toHaveProperty(key);
  if (outcome === 'unconfirmed') expect(body).not.toHaveProperty('saved');
  else expect(body.saved).toBe(true);
}

describe('canonical authoring creation recovery', () => {
  it('retains server-only correspondence origin in the canonical draft and genesis audit, without binding the dossier', async () => {
    const reserve = vi.fn(async (q: { query: (sql: string) => Promise<unknown> }) => { await q.query('SELECT 1'); });
    const outcome = await createDocumentFromDraft(ctx(), { ...draft, module: 'M1', documentType: 'company_correspondence' },
      { companyCorrespondence: { origin: correspondenceOrigin, reserve }, changeReason: 'Prepare correspondence for review' });
    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') throw new Error('Expected draft');
    expect(outcome.binding.documentId).toBeNull(); expect(outcome.provenance.companyCorrespondence).toEqual(correspondenceOrigin);
    expect(reserve).toHaveBeenCalledTimes(1);
    const provenance = ((await jdb.pool.query('SELECT provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [outcome.document.id, ORG])).rows[0] as { provenance: { companyCorrespondence: unknown } }).provenance;
    expect(provenance.companyCorrespondence).toEqual(correspondenceOrigin);
    const audits = (await jdb.pool.query('SELECT metadata,change_reason FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type=\'CREATE\'', [outcome.document.id, ORG])).rows as Array<{ metadata: unknown; change_reason: string }>;
    expect(audits).toHaveLength(1); expect(JSON.stringify(audits[0].metadata)).toContain('IND123456');
    expect(audits[0].change_reason).toBe('Prepare correspondence for review');
    expect(statements.indexOf('SELECT 1')).toBeLessThan(statements.findIndex(sql => /INSERT INTO authoring_documents/.test(sql)));
  });

  it('writes no draft when correspondence admission fails inside the canonical create transaction', async () => {
    const before = ((await jdb.pool.query('SELECT count(*)::int AS count FROM authoring_documents')).rows[0] as { count: number }).count;
    await expect(createDocumentFromDraft(ctx(), draft, { companyCorrespondence: { origin: correspondenceOrigin, reserve: async () => { throw new Error('Filing identity changed'); } } })).rejects.toThrow('Filing identity changed');
    expect(((await jdb.pool.query('SELECT count(*)::int AS count FROM authoring_documents')).rows[0] as { count: number }).count).toBe(before);
    expect(statements).toContain('ROLLBACK'); expect(statements.some(sql => /INSERT INTO authoring_documents/.test(sql))).toBe(false);
  });

  it('drops public caller assertions of correspondence origin', async () => {
    const response = await author(request(app).post('/api/authoring/docs/from-draft')).send({ ...draft, provenance: { source: 'seed', companyCorrespondence: correspondenceOrigin } });
    expect(response.status).toBe(201); expect(response.body.data.doc.provenance.companyCorrespondence).toBeUndefined();
  });
  it.each(['before-commit', 'after-commit'] as const)('evicts without rollback/retry when %s cannot be confirmed', async fault => {
    mode = fault;
    let error: unknown;
    try { await createDocumentFromDraft(ctx(), draft); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AuthoringCreateOutcomeError);
    const body = authoringCreationRecoveryPayload(error as AuthoringCreateOutcomeError);
    checkRecovery(body, 'unconfirmed'); expectDiscarded(); await releaseCleanup;
    expect(await retained(body.recovery.documentId)).toEqual(fault === 'after-commit'
      ? { documents: 1, sections: 1, creates: 1 } : { documents: 0, sections: 0, creates: 0 });
  });

  it.each(['readback', 'revoked', 'revoked-during-read'] as const)('retains confirmed identity without private content after %s failure', async fault => {
    mode = fault;
    let error: unknown;
    try { await createDocumentFromDraft(ctx(), draft); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AuthoringCreateOutcomeError);
    const body = authoringCreationRecoveryPayload(error as AuthoringCreateOutcomeError);
    checkRecovery(body, 'committed');
    expect(await retained(body.recovery.documentId)).toEqual({ documents: 1, sections: 1, creates: 1 });
    expect(statements).not.toContain('ROLLBACK'); expect(releases).toHaveBeenCalledWith(undefined);
  });

  it.each(['draft_authoring_document', 'save_document_to_vault'].flatMap(tool => ['after-commit', 'readback'].map(fault => [tool, fault])))('%s carries actual creation identity after %s without content or retry', async (tool, fault) => {
    mode = fault as typeof mode;
    const handler = approvedToolHandler(tool)!;
    const input = tool === 'draft_authoring_document' ? draft : { title: draft.title, content: 'A synthetic draft.', reason: 'Saving the synthetic qualification draft.' };
    const body = await runWithTenantScope({ tenantId: String(ORG), accountId: Number(AUTHOR.id), role: 'member', source: 'test', caller: 'authoring-create-outcome' }, async () => {
      await jdb.pool.query("SELECT set_config('app.current_tenant_id',$1,false),set_config('app.current_account_id',$2,false)", [String(ORG), AUTHOR.id]);
      return JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, humanConfirmed: true, sqlClient: pool }));
    });
    checkRecovery(body, fault === 'after-commit' ? 'unconfirmed' : 'committed');
    if (fault === 'after-commit') expectDiscarded();
    else expect(releases).toHaveBeenCalledWith(undefined);
    expect(await retained(body.recovery.documentId)).toEqual({ documents: 1, sections: 1, creates: 1 });
  });

  it.each(['/docs', '/docs/from-draft'])('%s returns 503 and real recovery IDs after a committed lost reply', async route => {
    mode = 'after-commit';
    const res = await author(request(app).post(`/api/authoring${route}`)).send(route === '/docs' ? { title: draft.title, client_program_id: PROGRAM } : draft);
    expect(res.status).toBe(503); checkRecovery(res.body, 'unconfirmed'); expectDiscarded();
    expect((await retained(res.body.recovery.documentId)) as Record<string, unknown>).toMatchObject({ documents: 1 });
  });

  it.each([false, true])('rolls back pre-commit failures and discards on rollback failure: %s', async rollbackFails => {
    if (rollbackFails) mode = 'rollback-fails';
    const spec: DocumentRowSpec = { docId: randomUUID(), title: draft.title, module: 'M2', productCode: null, locale: 'en-US', templateId: null, clientProgramId: PROGRAM, binding: { documentId: null } };
    await expect(insertDocumentTx(ctx(), spec, [], async () => { throw new Error('Before any write'); })).rejects.toThrow('Before any write');
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(releases).toHaveBeenCalledWith(rollbackFails ? expect.any(Error) : undefined); await releaseCleanup;
    expect(await retained(spec.docId)).toEqual({ documents: 0, sections: 0, creates: 0 });
  });

  it('confirmed creation returns the canonical saved record and audited section', async () => {
    const outcome = await createDocumentFromDraft(ctx(), draft);
    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') throw new Error('Expected created record');
    expect(outcome.sections).toHaveLength(1);
    expect(await retained(String(outcome.document.id))).toEqual({ documents: 1, sections: 1, creates: 1 });
    expect(releases).toHaveBeenCalledWith(undefined);
  });
});

/** Owner-seeded transport ledger is the premise here; gateway component tests
 * prove only its private derivative capability can mint this reserved record.
 * No live provider or PQ PASS is supplied by this creation fixture. */
async function recordedDerivative() {
  const rawContent = 'Exact nested model text, with <markup> treated as text.';
  const contentSha256 = createHash('sha256').update(rawContent).digest('hex');
  const generated: NonNullable<CreateDocumentFromDraftOptions['generatedDerivative']> = {
    receipt: { requestId: randomUUID(), provider: 'anthropic', model: 'claude-opus-5',
      resolvedModel: 'claude-opus-5-20261101', contentSha256 },
    derivativeId: randomUUID(), payloadSha256: 'd'.repeat(64), rawContent,
    reserve: vi.fn(async q => { await q.query('SELECT 1'); }),
  };
  const documentId = randomUUID(), sourceText = 'Confidential source retained for the exact nested generation.';
  const sourceBinding = { documentId, programId: PROGRAM, projectId: 42,
    contentHash: createHash('sha256').update(documentId).digest('hex'),
    extractedTextSha256: createHash('sha256').update(sourceText).digest('hex') };
  await jdb.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,classification,content_hash,extracted_text)
    VALUES($1::uuid,$2,$3,$1::uuid::text,'Confidential derivative source','csr','CONFIDENTIAL',$4,$5)`,
  [documentId, PROGRAM, ORG, sourceBinding.contentHash, sourceText]);
  await jdb.pool.query(`INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',$3)`, [documentId, sourceBinding.contentHash, sourceText.length]);
  const proof = { requestId: generated.receipt.requestId, derivativeId: generated.derivativeId,
    payloadSha256: generated.payloadSha256, outputSha256: contentSha256, organizationId: ORG,
    userId: Number(AUTHOR.id), projectId: 42, provider: generated.receipt.provider, model: generated.receipt.model,
    resolvedModel: generated.receipt.resolvedModel, resultingContentTier: 2, semanticVerified: false, sourceBinding };
  await jdb.pool.query(`INSERT INTO ai.gateway_audit_log
    (request_id,provider,model,resolved_model,task_type,strategy,organization_id,user_id,project_id,caller_module,success,cached,deterministic,metadata)
    VALUES($1,$2,$3,$4,'document_drafting','explicit',$5,$6,'42','approved-derivative',true,false,false,$7)`,
  [generated.receipt.requestId, generated.receipt.provider, generated.receipt.model, generated.receipt.resolvedModel,
    String(ORG), AUTHOR.id, JSON.stringify({ verifiedDerivativeGeneration: proof })]);
  const input = { ...draft, provenance: { source: 'ana' as const, turnId: 'parent-conversation-context' },
    sections: [{ code: '2.5', title: 'Derivative draft', content: plainTextToHtml(rawContent) }] };
  return { generated, input, sourceBinding };
}

describe('canonical derivative generation attribution', () => {
  it('records the actual nested model and exact plain-text/HTML hashes independently of the parent turn', async () => {
    const { generated, input } = await recordedDerivative();
    const result = await createDocumentFromDraft(ctx(), input, { generatedDerivative: generated });
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') throw new Error('Expected nested generation draft');
    expect(result.provenance).toMatchObject({ model: generated.receipt.resolvedModel, turnId: 'parent-conversation-context',
      generatedDerivative: { requestId: generated.receipt.requestId, outputSha256: generated.receipt.contentSha256,
        storedHtmlSha256: createHash('sha256').update(result.sections[0].content as string).digest('hex') } });
    expect(result.provenance.servedBy?.[0].pq).not.toBe('passed');
    const genesis = await jdb.pool.query('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type=$2', [result.document.id, 'CREATE']);
    expect((genesis.rows[0] as any).metadata).toMatchObject({ independentCheck: { required: true },
      provenance: { generatedDerivative: { requestId: generated.receipt.requestId } } });
    const released = { organizationId: ORG, creatorUserId: Number(AUTHOR.id), currentReaderUserId: Number(AUTHOR.id),
      programId: PROGRAM, genesisHtml: String(result.sections[0].content), proof: result.provenance.generatedDerivative! };
    expect(await verifyRetainedDerivativeGeneration(jdb.pool, released)).toBe(true);
    expect(await verifyRetainedDerivativeGeneration(jdb.pool, { ...released, genesisHtml: `${released.genesisHtml}!` })).toBe(false);
    const previousEnvironment = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      // The actual registry is still PQ-pending. A dev fixture's admitted tuple
      // is not production qualification, even with an intact nested receipt.
      expect(await verifyRetainedDerivativeGeneration(jdb.pool, released)).toBe(false);
    } finally { process.env.NODE_ENV = previousEnvironment; }
    expect(statements.indexOf('SELECT 1')).toBeLessThan(statements.findIndex(sql => /INSERT INTO authoring_documents/.test(sql)));
  });

  it.each(['missing-record', 'cached', 'deterministic', 'forged-metadata', 'wrong-actor', 'text-change', 'html-change', 'custody-revoked', 'source-extraction', 'source-classification'])(
    'refuses %s before any document or genesis write', async defect => {
      const { generated, input, sourceBinding } = await recordedDerivative();
      if (defect === 'missing-record') generated.receipt.requestId = randomUUID();
      if (defect === 'cached') await jdb.pool.query('UPDATE ai.gateway_audit_log SET cached=true WHERE request_id=$1', [generated.receipt.requestId]);
      if (defect === 'deterministic') await jdb.pool.query('UPDATE ai.gateway_audit_log SET deterministic=true WHERE request_id=$1', [generated.receipt.requestId]);
      if (defect === 'forged-metadata') await jdb.pool.query("UPDATE ai.gateway_audit_log SET metadata='{}' WHERE request_id=$1", [generated.receipt.requestId]);
      if (defect === 'wrong-actor') await jdb.pool.query("UPDATE ai.gateway_audit_log SET user_id='999' WHERE request_id=$1", [generated.receipt.requestId]);
      if (defect === 'text-change') generated.rawContent += '!';
      if (defect === 'html-change') input.sections[0].content += '<p>Unrecorded words.</p>';
      if (defect === 'custody-revoked') generated.reserve = async () => { throw new Error('Private custody details'); };
      if (defect === 'source-extraction') await jdb.pool.query("UPDATE vault.documents SET extracted_text='Changed after generation' WHERE id=$1", [sourceBinding.documentId]);
      if (defect === 'source-classification') await jdb.pool.query("UPDATE vault.documents SET classification='CONTROLLED' WHERE id=$1", [sourceBinding.documentId]);
      statements = [];
      const result = await createDocumentFromDraft(ctx(), input, { generatedDerivative: generated });
      expect(result.kind).toBe('refused');
      expect(statements.some(sql => /INSERT INTO authoring_documents/.test(sql))).toBe(false);
    });

  it('drops every attempted generation authority field in public provenance', () => {
    expect(parseProvenance({ source: 'ana', model: 'forged', generatedDerivative: { requestId: randomUUID() } }))
      .toEqual({ ok: true, value: { source: 'ana' } });
  });

  it('invalidates a current independent receipt when its exact original Vault extraction changes', async () => {
    const { generated, input, sourceBinding } = await recordedDerivative();
    const result = await createDocumentFromDraft(ctx(), input, { generatedDerivative: generated });
    if (result.kind !== 'created') throw new Error('Expected nested generation draft');
    const actor = { tenantId: ORG, actorId: AUTHOR.id, documentId: String(result.document.id) };
    const snapshot = canonicalFixtureSnapshot(result.document, result.sections);
    const checked = await runAuthoringIndependentCheck(pool as unknown as RequestConnectable,
      { ...actor, expectedSnapshotHash: authoringSnapshotHash(snapshot) }, { ipAddress: 'test', userAgent: 'source-binding-proof' });
    expect(checked.independentCheck.standing).toBe('current');
    const subject = { organizationId: ORG, doc: { ...result.document, id: actor.documentId },
      sections: snapshot.sections, actor: ctx().actor };
    await expect(assertIndependentCheckRelease(pool, subject)).resolves.toBeUndefined();
    await jdb.pool.query("UPDATE vault.documents SET extracted_text='Extraction changed after the independent check' WHERE id=$1", [sourceBinding.documentId]);
    await expect(assertIndependentCheckRelease(pool, subject)).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    expect((await readIndependentCheckContext(pool, subject))?.standing).toBe('stale');
  });

  it('holds ordinary sourced prose when the Vault extraction changes under the same original hash and version', async () => {
    const { sourceBinding } = await recordedDerivative();
    const source = (await jdb.pool.query('SELECT extracted_text,updated_at FROM vault.documents WHERE id=$1', [sourceBinding.documentId])).rows[0] as { extracted_text: string; updated_at: unknown };
    const span = { start: 0, end: source.extracted_text.length, totalChars: source.extracted_text.length };
    const input = { ...draft, provenance: { source: 'ana' as const }, sections: [{ code: '2.5', title: 'Sourced protocol',
      content: '<p>The protocol specified the study procedures.</p>', sourceReferences: [{ documentId: sourceBinding.documentId,
        contentHash: sourceBinding.contentHash, span, ...draftSourceIdentityForText(source.extracted_text, span) }] }] };
    const result = await createDocumentFromDraft(ctx(), input);
    if (result.kind !== 'created') throw new Error('Expected ordinary sourced draft');
    const documentId = String(result.document.id), snapshot = canonicalFixtureSnapshot(result.document, result.sections);
    await runAuthoringIndependentCheck(pool as unknown as RequestConnectable, { tenantId: ORG, actorId: AUTHOR.id,
      documentId, expectedSnapshotHash: authoringSnapshotHash(snapshot) }, { ipAddress: 'test', userAgent: 'ordinary-source-pin-proof' });
    const subject = { organizationId: ORG, doc: { ...result.document, id: documentId }, sections: snapshot.sections, actor: ctx().actor };
    await expect(assertIndependentCheckRelease(pool, subject)).resolves.toBeUndefined();
    await jdb.pool.query('UPDATE vault.documents SET extracted_text=$1,updated_at=$2 WHERE id=$3', ['Changed extraction with unchanged original bytes.', source.updated_at, sourceBinding.documentId]);
    await expect(assertIndependentCheckRelease(pool, subject)).rejects.toMatchObject({ code: 'INDEPENDENT_CHECK_REQUIRED' });
    expect((await readIndependentCheckContext(pool, subject))?.standing).toBe('stale');
  });
});
