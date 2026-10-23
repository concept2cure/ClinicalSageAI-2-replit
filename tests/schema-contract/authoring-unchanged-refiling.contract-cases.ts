/** Registration of the unchanged saved-section cases on the original native
 * contract fixture. No second database, router, migration or filing policy. */
import { describe, it, expect, vi } from 'vitest';
import type request from 'supertest';
import type { JourneyDb } from '../golden-journeys/harness';
import { materializeWorkflowSource } from '../../server/services/authoring/workflow-source-import';
import { hashSpanText } from '../../server/services/clinical-regulatory-evidence/span-lineage.service';

interface RefilingContractHarness {
  q: <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;
  boundAndSaved: (text: string, code?: string) => Promise<{ docId: string; sectionId: string; filingId: string }>;
  rewriteFiling: (filingId: string, text: string) => Promise<void>;
  freezeDoc: (docId: string) => request.Test;
  patchSection: (sectionId: string) => request.Test;
  createSection: () => request.Test;
  getPool: () => JourneyDb['pool'];
  nextSourceJobId: () => number;
  programId: string;
  author: { id: string; email: string };
  timeout: number;
}

function refilingContext(harness: RefilingContractHarness) {
  const { q, boundAndSaved, rewriteFiling, patchSection } = harness;
  const PROJECT = harness.programId;
  async function savedRefileFixture(code = '2.5') {
    const ids = await boundAndSaved('<p>Retained saved words and attribution.</p>', code);
    await rewriteFiling(ids.filingId, 'Divergent filing words.');
    const [section] = await q(`SELECT * FROM authoring_sections WHERE id=$1`, [ids.sectionId]);
    return { ...ids, section, body: { filingOnly: true, expectedDocumentId: ids.docId,
      expectedFilingDocumentId: ids.filingId, expectedProgramId: PROJECT,
      expectedUpdatedAt: new Date(section.updated_at).toISOString(), changeReason: 'Restore the retained saved words to the filing.' } };
  }
  const refile = (fixture: Awaited<ReturnType<typeof savedRefileFixture>>, body: Record<string, unknown> = fixture.body) =>
    patchSection(fixture.sectionId).send(body);
  const filingText = async (filingId: string) => (await q(
    `SELECT content->>'text' AS text FROM c2c_document_sections WHERE document_id=$1 AND section_key='2.5'`, [filingId]))[0].text;

  return { ...harness, PROJECT, AUTHOR: harness.author, T: harness.timeout,
    savedRefileFixture, refile, filingText };
}
type RefilingContext = ReturnType<typeof refilingContext>;

function registerIdentityCases({ q, AUTHOR, savedRefileFixture, refile, filingText }: RefilingContext) {
  describe('deliberate unchanged saved-section filing', () => {
    it('records one COMMIT act with the exact saved and filing identity and stated reason', async () => {
      const f = await savedRefileFixture();
      const before = await q(`SELECT id FROM authoring_audit_trail WHERE section_id=$1`, [f.sectionId]);
      const timestamp = f.body.expectedUpdatedAt.replace('.000Z', 'Z');
      const result = await refile(f, { ...f.body, expectedUpdatedAt: timestamp });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.source.updatedAt).toBe(timestamp);
      const acts = await q(`SELECT * FROM authoring_audit_trail WHERE section_id=$1 ORDER BY created_at,id`, [f.sectionId]);
      expect(acts).toHaveLength(before.length + 1);
      const act = acts.find(row => row.operation_type === 'COMMIT');
      expect(act).toMatchObject({ actor_id: AUTHOR.id, change_reason: f.body.changeReason,
        before_content: null, after_content: null, metadata: { filingOnly: true, revision_created: false,
          source: result.body.source, filing: result.body.filing } });
      const chained = await q(`SELECT * FROM audit_logs WHERE record_id=$1 AND action='authoring.section.COMMIT'`, [f.sectionId]);
      expect(chained).toHaveLength(1);
      expect(JSON.stringify(result.body)).not.toContain(f.section.content);
    });

    it.each([
      ['false intent', { filingOnly: false }], ['nonboolean intent', { filingOnly: 'true' }],
      ['content', { content: '<p>Claimed replacement.</p>' }], ['metadata', { title: 'New title' }],
      ['accepted attribution', { acceptedAuthors: [{ id: 'ana' }] }],
      ['missing timestamp', { expectedUpdatedAt: undefined }], ['ambiguous date', { expectedUpdatedAt: 'October 23, 2026' }],
      ['invalid date', { expectedUpdatedAt: '2026-02-30T12:00:00Z' }],
      ['missing document', { expectedDocumentId: undefined }], ['invalid program', { expectedProgramId: '42' }],
      ['empty native filing', { expectedFilingDocumentId: '' }], ['reason', { changeReason: 'short' }],
    ])('refuses %s without falling through to an ordinary save', async (_name, change) => {
      const f = await savedRefileFixture();
      const result = await refile(f, { ...f.body, ...change });
      expect(result.status, JSON.stringify(result.body)).toBe(400);
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      expect((await q(`SELECT * FROM authoring_sections WHERE id=$1`, [f.sectionId]))[0]).toEqual(f.section);
    });

    it.each([
      ['document', { expectedDocumentId: '00000000-0000-4000-8000-000000000001' }],
      ['project', { expectedProgramId: '00000000-0000-4000-8000-000000000001' }],
      ['native filing', { expectedFilingDocumentId: 'another_native_filing' }],
      ['saved version', { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }],
    ])('refuses a changed %s binding', async (_name, change) => {
      const f = await savedRefileFixture();
      const result = await refile(f, { ...f.body, ...change });
      expect(result.status, JSON.stringify(result.body)).toBe(_name === 'project' ? 404 : 409);
      expect(result.body.code).toBe(_name === 'project' ? 'PROJECT_NOT_FOUND' : 'REFILING_SOURCE_CHANGED');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
    });
  });
}

function registerLineageCases({ q, rewriteFiling, patchSection, createSection, savedRefileFixture, refile, filingText }: RefilingContext) {
  describe('deliberate unchanged filing preserves all existing lineage', () => {
    it.each(['missing', 'wrong hash', 'out-of-bounds'])('refuses %s existing lineage rather than generating new authorship', async kind => {
      const f = await savedRefileFixture();
      await q(kind === 'missing' ? `UPDATE document_span_lineage SET deleted_at=NOW() WHERE document_id=$1`
        : kind === 'wrong hash' ? `UPDATE document_span_lineage SET span_text_sha256=repeat('a',64) WHERE document_id=$1`
          : `UPDATE document_span_lineage SET char_end=99999 WHERE document_id=$1`, [f.sectionId]);
      const spans = await q(`SELECT * FROM document_span_lineage WHERE document_id=$1 ORDER BY id`, [f.sectionId]);
      const result = await refile(f);
      expect(result.status, JSON.stringify(result.body)).toBe(409);
      expect(result.body.code).toBe('LINEAGE_UNVERIFIED');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      expect(await q(`SELECT * FROM document_span_lineage WHERE document_id=$1 ORDER BY id`, [f.sectionId])).toEqual(spans);
    });

    it('restores the complete canonical assembled node while preserving every saved contributor', async () => {
      const f = await savedRefileFixture('2.5.1');
      const sibling = await createSection().send({
        doc_id: f.docId, code: '2.5.2', title: 'Second saved contributor', content: '', order_index: 200,
      });
      expect(sibling.status).toBe(201);
      const saved = await patchSection(sibling.body.section.id).send({
        content: '<p>The independently saved sibling.</p>', changeReason: 'Draft the second saved clinical contributor.',
      });
      expect(saved.status).toBe(200);
      const assembled = await filingText(f.filingId);
      expect(assembled).toContain(f.section.content);
      expect(assembled).toContain('The independently saved sibling.');
      const before = await q(`SELECT * FROM authoring_sections WHERE doc_id=$1 ORDER BY id`, [f.docId]);
      const spans = await q(`SELECT * FROM document_span_lineage WHERE document_id=ANY($1) ORDER BY id`,
        [[f.sectionId, sibling.body.section.id]]);
      const [current] = await q(`SELECT updated_at FROM authoring_sections WHERE id=$1`, [f.sectionId]);
      await rewriteFiling(f.filingId, 'Divergent assembled copy.');
      const result = await refile(f, { ...f.body, expectedUpdatedAt: new Date(current.updated_at).toISOString() });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.filing).toMatchObject({ committed: true, documentId: f.filingId, sectionKey: '2.5', partOf: '2.5' });
      expect(await filingText(f.filingId)).toBe(assembled);
      expect(await q(`SELECT * FROM authoring_sections WHERE doc_id=$1 ORDER BY id`, [f.docId])).toEqual(before);
      expect(await q(`SELECT * FROM document_span_lineage WHERE document_id=ANY($1) ORDER BY id`,
        [[f.sectionId, sibling.body.section.id]])).toEqual(spans);
      // The selected section alone is insufficient evidence for the assembled
      // filing: an invalid sibling must stop a subsequent repair of that node.
      await rewriteFiling(f.filingId, 'Divergent assembled copy.');
      await q(`UPDATE document_span_lineage SET span_text_sha256=repeat('b',64) WHERE document_id=$1`, [sibling.body.section.id]);
      const refused = await refile(f, { ...f.body, expectedUpdatedAt: new Date(current.updated_at).toISOString() });
      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.code).toBe('LINEAGE_UNVERIFIED');
      expect(await filingText(f.filingId)).toBe('Divergent assembled copy.');
    });
  });
}

function registerGovernanceCases({ q, getPool, patchSection, savedRefileFixture, refile, filingText }: RefilingContext) {
  describe('deliberate unchanged filing retains current locked governance', () => {
    it('rolls back canonical committed:false, including the parent reservation', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE c2c_document_sections SET status='locked' WHERE document_id=$1`, [f.filingId]);
      const [parent] = await q(`SELECT updated_at FROM authoring_documents WHERE id=$1`, [f.docId]);
      const result = await refile(f);
      expect(result.status, JSON.stringify(result.body)).toBe(409);
      expect(result.body.code).toBe('REFILING_NOT_COMMITTED');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      expect((await q(`SELECT updated_at FROM authoring_documents WHERE id=$1`, [f.docId]))[0]).toEqual(parent);
      expect(await q(`SELECT id FROM authoring_audit_trail WHERE section_id=$1 AND operation_type='COMMIT'`, [f.sectionId])).toHaveLength(0);
    });

    it.each(['locked', 'submitted'])('retains the %s filing refusal', async status => {
      const f = await savedRefileFixture();
      await q(`UPDATE c2c_documents SET status=$2 WHERE id=$1`, [f.filingId, status]);
      const result = await refile(f);
      expect(result.status, JSON.stringify(result.body)).toBe(403);
      expect(result.body.code).toBe(status === 'locked' ? 'FILING_LOCKED' : 'FILING_SUBMITTED');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
    });

    it('retains the immutable-document middleware refusal', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE authoring_documents SET status='FROZEN' WHERE id=$1`, [f.docId]);
      expect((await refile(f)).status).toBe(403);
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
    });

    it('requires full-document view even when the selected section remains editable', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE doc_permissions SET revoked_at=NOW() WHERE doc_id=$1 AND role='OWNER'`, [f.docId]);
      await q(`UPDATE doc_permissions SET section_id=$2 WHERE doc_id=$1 AND role='AUTHOR'`, [f.docId, f.sectionId]);
      const result = await refile(f);
      expect(result.status, JSON.stringify(result.body)).toBe(403);
      expect(result.body.code).toBe('REFILING_PERMISSION_DENIED');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      // This correction must not redefine the existing ordinary section save.
      const save = await patchSection(f.sectionId).send({
        content: '<p>The authorized section edit remains available.</p>', changeReason: 'Edit only the authorized saved section.',
      });
      expect(save.status, JSON.stringify(save.body)).toBe(200);
    });

    it('rechecks current QMS control inside the filing transaction', async () => {
      const f = await savedRefileFixture();
      await q(`INSERT INTO qms_documents (organization_id,authoring_document_id,status) VALUES (1,$1,'draft')`, [f.docId]);
      const original = getPool().connect.bind(getPool());
      const connect = vi.spyOn(getPool(), 'connect').mockImplementation(async () => {
        const client = await original();
        return { ...client, query: async (sql, params) => {
          const result = await client.query(sql, params);
          if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ') {
            await client.query(`UPDATE qms_documents SET status='in_review' WHERE authoring_document_id=$1`, [f.docId]);
          }
          return result;
        } };
      });
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(409);
        expect(result.body.code).toBe('QMS_DOCUMENT_CONTROLLED');
        expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      } finally { connect.mockRestore(); }
    });

    it('refuses an unavailable declared saved source', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE authoring_documents SET provenance=$2::jsonb WHERE id=$1`, [f.docId,
        JSON.stringify({ projectSourceReferences: [{ sources: [{ documentId: 'not-a-verified-source' }] }] })]);
      const result = await refile(f);
      expect(result.status, JSON.stringify(result.body)).toBe(409);
      expect(result.body.code).toBe('SOURCE_REFERENCES_UNAVAILABLE');
      expect(await filingText(f.filingId)).toBe('Divergent filing words.');
    });
  });
}

function registerCurrentAccessCases({ q, getPool, AUTHOR, savedRefileFixture, refile, filingText }: RefilingContext) {
  describe('deliberate unchanged filing rechecks current write access', () => {
    it('uses the current account email when a stale JWT still matches an old email-only document grant', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE doc_permissions SET principal_id='999' WHERE doc_id=$1`, [f.docId]);
      await q(`INSERT INTO doc_permissions (doc_id,section_id,tenant_id,principal_id,email,role,granted_by)
        VALUES ($1,$2,1,'42',NULL,'AUTHOR','42')`, [f.docId, f.sectionId]);
      await q(`UPDATE users SET email='current-author@filing.example' WHERE id=42`);
      const queries: string[] = [];
      const original = getPool().connect.bind(getPool());
      const connect = vi.spyOn(getPool(), 'connect').mockImplementation(async () => {
        const client = await original();
        return { ...client, query: async (sql, params) => { queries.push(sql); return client.query(sql, params); } };
      });
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(403);
        expect(result.body.code).toBe('REFILING_PERMISSION_DENIED');
        expect(queries.some(sql => /SELECT d\.\* FROM authoring_documents/.test(sql))).toBe(false);
        expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      } finally { connect.mockRestore(); await q(`UPDATE users SET email=$1 WHERE id=42`, [AUTHOR.email]); }
    });

    it('refuses project read access that does not permit the actual write', async () => {
      const f = await savedRefileFixture();
      await q(`UPDATE projects SET owner_id=99,created_by_id=99 WHERE id=1`);
      await q(`INSERT INTO project_members VALUES (1,1,42,'viewer','active')`);
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(403);
        expect(result.body.code).toBe('PROJECT_PERMISSION_DENIED');
        expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      } finally {
        await q(`DELETE FROM project_members WHERE user_id=42`);
        await q(`UPDATE projects SET owner_id=42,created_by_id=42 WHERE id=1`);
      }
    });

    it.each(['membership', 'object permission', 'saved timestamp'])('rechecks %s after the HTTP middleware and transaction reservation', async gate => {
      const f = await savedRefileFixture();
      const original = getPool().connect.bind(getPool());
      const connect = vi.spyOn(getPool(), 'connect').mockImplementation(async () => {
        const client = await original();
        return { ...client, query: async (sql, params) => {
          const result = await client.query(sql, params);
          if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ') {
            if (gate === 'membership') await client.query(`UPDATE users SET status='inactive' WHERE id=42`);
            else if (gate === 'object permission') await client.query(`UPDATE doc_permissions SET revoked_at=NOW() WHERE doc_id=$1`, [f.docId]);
            else await client.query(`UPDATE authoring_sections SET updated_at='2020-01-01' WHERE id=$1`, [f.sectionId]);
          }
          return result;
        } };
      });
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(gate === 'saved timestamp' ? 409 : gate === 'object permission' ? 404 : 403);
        expect(result.body.code).toBe(gate === 'membership' ? 'PROJECT_ACTOR_ACCESS_DENIED'
          : gate === 'object permission' ? 'AUTHORING_DOCUMENT_NOT_FOUND' : 'REFILING_SOURCE_CHANGED');
        expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      } finally { connect.mockRestore(); }
    });
  });
}

function registerWorkflowCases({ q, boundAndSaved, rewriteFiling, getPool, patchSection, nextSourceJobId, PROJECT, AUTHOR, filingText }: RefilingContext) {
  describe('deliberate unchanged filing retains current full workflow release gates', () => {
    it.each([true, false])('does not release a retained workflow source with generated=%s', async generated => {
      const prose = 'The retained clinical source states a prespecified efficacy result that requires scientific verification and the existing independent governance before regulatory release.';
      const ids = await boundAndSaved(`<p>${prose}</p>`);
      await rewriteFiling(ids.filingId, 'Divergent filing words.');
      const jobId = nextSourceJobId();
      await q(`INSERT INTO csr_build_jobs (id,organization_id,project_id,study_id,status,sections_to_generate,study_info_snapshot)
        VALUES ($1,1,1,'refile-source','complete',ARRAY['13'],'{}')`, [jobId]);
      await q(`INSERT INTO csr_section_outputs (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated)
        VALUES (1,1,$1,'13',$2,$3,$4)`, [jobId, prose, hashSpanText(prose), generated]);
      const source = await materializeWorkflowSource({ organizationId: 1, userId: 42,
        target: { programId: PROJECT, projectId: 1 }, source: { kind: 'csr', jobId } }, getPool());
      await q(`UPDATE authoring_documents SET provenance=$2::jsonb WHERE id=$1`,
        [ids.docId, JSON.stringify({ importSource: source.origin })]);
      await q(`INSERT INTO authoring_audit_trail
        (doc_id,section_id,operation_type,actor_email,actor_id,tenant_id,metadata)
        VALUES ($1,$2,'CREATE',$3,'42',1,$4::jsonb)`, [ids.docId, ids.sectionId, AUTHOR.email,
        JSON.stringify({ provenance: { importSource: source.origin }, section_code: '13' })]);
      const [section] = await q(`SELECT * FROM authoring_sections WHERE id=$1`, [ids.sectionId]);
      const spans = await q(`SELECT * FROM document_span_lineage WHERE document_id=$1 ORDER BY id`, [ids.sectionId]);
      const result = await patchSection(ids.sectionId).send({
        filingOnly: true, expectedDocumentId: ids.docId, expectedFilingDocumentId: ids.filingId,
        expectedProgramId: PROJECT, expectedUpdatedAt: new Date(section.updated_at).toISOString(),
        changeReason: 'Restore only the retained saved regulatory source.',
      });
      expect(result.status, JSON.stringify(result.body)).toBe(409);
      expect(result.body.code).toBe(generated ? 'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' : 'WORKFLOW_HUMAN_ADOPTION_REQUIRED');
      expect(await filingText(ids.filingId)).toBe('Divergent filing words.');
      expect(await q(`SELECT * FROM document_span_lineage WHERE document_id=$1 ORDER BY id`, [ids.sectionId])).toEqual(spans);
      expect((await q(`SELECT * FROM authoring_sections WHERE id=$1`, [ids.sectionId]))[0]).toEqual(section);
    });
  });
}

function registerOutcomeCases({ q, getPool, PROJECT, savedRefileFixture, refile, filingText }: RefilingContext) {
  describe('deliberate unchanged filing has atomic and nonreplayable outcomes', () => {
    it('rolls back the filing repair when its COMMIT audit cannot be stored', async () => {
      const f = await savedRefileFixture();
      await q(`CREATE FUNCTION reject_refile_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.operation_type='COMMIT' THEN RAISE EXCEPTION 'private audit failure'; END IF; RETURN NEW; END $$`);
      await q(`CREATE TRIGGER reject_refile_audit BEFORE INSERT ON authoring_audit_trail FOR EACH ROW EXECUTE FUNCTION reject_refile_audit()`);
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(503);
        expect(result.body.code).toBe('REFILING_UNAVAILABLE');
        expect(JSON.stringify(result.body)).not.toMatch(/private audit|INSERT|SELECT/);
        expect(await filingText(f.filingId)).toBe('Divergent filing words.');
      } finally {
        await q(`DROP TRIGGER reject_refile_audit ON authoring_audit_trail`);
        await q(`DROP FUNCTION reject_refile_audit()`);
      }
    });

    it.each(['COMMIT', 'ROLLBACK'])('holds against replay after lost %s acknowledgment', async boundary => {
      const f = await savedRefileFixture();
      if (boundary === 'ROLLBACK') await q(`UPDATE c2c_document_sections SET status='locked' WHERE document_id=$1`, [f.filingId]);
      const original = getPool().connect.bind(getPool());
      const released = vi.fn();
      const connect = vi.spyOn(getPool(), 'connect').mockImplementation(async () => {
        const client = await original();
        return { query: async (sql, params) => {
          const result = await client.query(sql, params);
          if (sql === boundary) throw new Error('private lost transaction acknowledgment');
          return result;
        }, release: released };
      });
      try {
        const result = await refile(f);
        expect(result.status, JSON.stringify(result.body)).toBe(503);
        expect(result.body).toMatchObject({ success: false, code: 'OUTCOME_UNKNOWN', retryAllowed: false,
          source: { documentId: f.docId, sectionId: f.sectionId, programId: PROJECT, filingDocumentId: f.filingId,
            updatedAt: f.body.expectedUpdatedAt } });
        expect(JSON.stringify(result.body)).not.toContain('private lost');
        expect(released).toHaveBeenCalledWith(expect.any(Error));
        expect(await filingText(f.filingId)).toBe(boundary === 'COMMIT' ? f.section.content : 'Divergent filing words.');
      } finally { connect.mockRestore(); }
    });
  });
}

async function verifyUnchangedSavedText({ q, boundAndSaved, rewriteFiling, freezeDoc, patchSection, PROJECT }: RefilingContext) {
  const { docId, sectionId, filingId } = await boundAndSaved('<p>The unchanged saved source.</p>');
  await rewriteFiling(filingId, 'A divergent filing copy.');
  const [before] = await q(`SELECT content, updated_at FROM authoring_sections WHERE id = $1`, [sectionId]);
  const revisions = await q(`SELECT id FROM doc_revisions WHERE section_id = $1 ORDER BY id`, [sectionId]);
  const spans = await q(`SELECT * FROM document_span_lineage WHERE document_table = 'authoring_sections' AND document_id = $1 ORDER BY id`, [sectionId]);
  const response = await patchSection(sectionId).send({
    filingOnly: true, expectedDocumentId: docId, expectedFilingDocumentId: filingId,
    expectedProgramId: PROJECT, expectedUpdatedAt: new Date(before.updated_at).toISOString(),
    changeReason: 'Restoring the unchanged saved source to its filing.',
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body).toMatchObject({
    success: true, refiled: true, revision_created: false,
    source: { documentId: docId, sectionId, filingDocumentId: filingId, programId: PROJECT,
      updatedAt: new Date(before.updated_at).toISOString() },
    filing: { committed: true, documentId: filingId, sectionKey: '2.5' },
  });
  expect((await q(`SELECT content, updated_at FROM authoring_sections WHERE id = $1`, [sectionId]))[0]).toEqual(before);
  expect(await q(`SELECT id FROM doc_revisions WHERE section_id = $1 ORDER BY id`, [sectionId])).toEqual(revisions);
  expect(await q(`SELECT * FROM document_span_lineage WHERE document_table = 'authoring_sections' AND document_id = $1 ORDER BY id`, [sectionId])).toEqual(spans);
  expect((await q(`SELECT content FROM c2c_document_sections WHERE document_id = $1 AND section_key = '2.5'`, [filingId]))[0].content).toEqual({ text: before.content });
  expect((await freezeDoc(docId)).status).toBe(200);
}

/** Called at the original declaration point; all cases use its same fixture.
 * Return the positive callback to preserve its existing freeze-suite ancestry. */
export function registerUnchangedRefilingCases(harness: RefilingContractHarness): () => Promise<void> {
  const context = refilingContext(harness);
  registerIdentityCases(context);
  registerLineageCases(context);
  registerGovernanceCases(context);
  registerCurrentAccessCases(context);
  registerWorkflowCases(context);
  registerOutcomeCases(context);
  return () => verifyUnchangedSavedText(context);
}
