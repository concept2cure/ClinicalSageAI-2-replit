/** Private qualification fixture for actual source-import recovery and preservation.
 * Registers cases against the parent suite's canonical database and HTTP app. */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, ORG, PROGRAM } from './_authoring-canvas-fixture';

interface SourceImportFault {
  mode: string;
  committed: boolean;
  statements: string[];
  release: { (error?: Error): unknown; mockClear: () => unknown };
}

/** Stable pool object: the shipped router captures getPool() once at import. */
export function sourceFaultPool(database: () => JourneyDb, importFault: SourceImportFault) {
  return {
    query: async (sql: string, values?: unknown[]) => {
      if (importFault.committed && importFault.mode === 'readback' && /FROM authoring_sections WHERE doc_id/.test(sql)) throw new Error('Synthetic committed readback loss');
      return database().pool.query(sql, values);
    },
    connect: async () => {
      const client = await database().pool.connect();
      return { query: async (sql: string, values?: unknown[]) => {
        if (importFault.mode !== 'none') importFault.statements.push(sql);
        const result = await client.query(sql, values);
        if (sql === 'COMMIT' && importFault.mode !== 'none') {
          importFault.committed = true;
          if (importFault.mode === 'after-commit') throw new Error('Synthetic lost COMMIT reply');
        }
        return result;
      }, release: (error?: Error) => { importFault.release(error); client.release(); } };
    },
  };
}


interface SourceImportRecoveryFixture {
  current: () => { db: JourneyDb; app: express.Express; author: (test: request.Test) => request.Test };
  versionedSource: (label: string) => Promise<{ sourceId: string; sourceBytes: Buffer; input: Record<string, unknown> }>;
  fault: SourceImportFault;
}

/** Registers the two existing recovery cases in their original describe block. */
export function registerSourceImportRecoveryCases(fixture: SourceImportRecoveryFixture): void {
  it.each(['after-commit', 'readback'])('returns a typed identity and readable exact source copy after %s loss', async fault => {
    const { db, app, author } = fixture.current();
    const importFault = fixture.fault;
    const source = await fixture.versionedSource(`Source recovery qualification ${fault}`);
    const sourceId = source.sourceId;
    const recoveredHash = createHash('sha256').update(source.sourceBytes).digest('hex');
    importFault.mode = fault; importFault.committed = false; importFault.statements = []; importFault.release.mockClear();
    let result: request.Response;
    try { result = await author(request(app).post('/api/authoring/import/source')).send(source.input); }
    finally { importFault.mode = 'none'; }
    expect(result.status, JSON.stringify(result.body)).toBe(503);
    const outcome = fault === 'after-commit' ? 'unconfirmed' : 'committed';
    expect(result.body).toMatchObject({ ok: false, retryAllowed: false, creationOutcome: outcome,
      recovery: { organizationId: ORG, programId: PROGRAM, documentId: expect.stringMatching(/^[a-f0-9-]{36}$/i) } });
    expect(result.body).not.toHaveProperty('data'); expect(result.body).not.toHaveProperty('document');
    expect(importFault.statements.filter(sql => sql === 'COMMIT')).toHaveLength(1); expect(importFault.statements).not.toContain('ROLLBACK');
    expect(importFault.release).toHaveBeenCalledTimes(1);
    const documentId = result.body.recovery.documentId;
    const detail = await author(request(app).get(`/api/authoring/docs/${documentId}?programId=${PROGRAM}`));
    const sections = await author(request(app).get(`/api/authoring/docs/${documentId}/sections?programId=${PROGRAM}`));
    expect(detail.status).toBe(200); expect(sections.status).toBe(200);
    expect(detail.body.document).toMatchObject({ id: documentId, tenant_id: ORG, client_program_id: PROGRAM,
      created_by: AUTHOR.id, readScope: 'document', sourceMetadataState: 'available',
      provenance: { source: 'import', importSource: { id: sourceId, sha256: recoveredHash } } });
    expect(sections.body.readScope).toBe('document'); expect(sections.body.sections).toHaveLength(1);
    expect((await db.pool.query(`SELECT count(*)::int AS n FROM authoring_documents WHERE provenance->'importSource'->>'id'=$1`, [sourceId])).rows).toEqual([{ n: 1 }]);
  });
}

interface SourceImportPlacementFixture {
  current: SourceImportRecoveryFixture['current'];
  versionedSource: (label: string) => Promise<{
    sourceId: string; filePath: string; sourceBytes: Buffer; input: Record<string, unknown>;
  }>;
}

/** The source copy can be edited without writing either filing in the same project. */
export function registerSourceImportPlacementCase(fixture: SourceImportPlacementFixture): void {
  describe('binary source copies require explicit filing placement', () => {
    it('saves and reuses an unbound copy while preserving both 510(k)/CER filings and original bytes', async () => {
      const { db, app, author } = fixture.current();
      const source = await fixture.versionedSource('Shared project source, independent of either filing');
      const hash = createHash('sha256').update(source.sourceBytes).digest('hex');
      const filings = [randomUUID(), randomUUID()];
      await db.pool.query(`CREATE TABLE IF NOT EXISTS c2c_document_sections (
        id serial PRIMARY KEY, document_id text, section_key text, content jsonb,
        status text, version integer, updated_at timestamptz DEFAULT now())`);
      await db.pool.query(`INSERT INTO c2c_documents (id,project_id,org_id,doc_type,agency,title)
        VALUES ($1,$3,$4,'k510','fda','510(k) filing'),($2,$3,$4,'cer','Notified_Body','CER filing')`,
      [...filings, PROGRAM, ORG]);
      await db.pool.query(`INSERT INTO c2c_document_sections (document_id,section_key,content,status,version)
        VALUES ($1,'3.2.S.4.1','{"text":"Recorded 510(k) source"}','drafted',2),
               ($2,'3.2.S.4.1','{"text":"Recorded CER source"}','approved',4)`, filings);
      const filingRows = () => db.pglite.query<Record<string, unknown>>(
        'SELECT * FROM c2c_document_sections WHERE document_id=ANY($1::text[]) ORDER BY document_id', [filings]);
      const before = (await filingRows()).rows;
      const imported = await author(request(app).post('/api/authoring/import/source')).send(source.input);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      const copy = imported.body.data;
      expect(copy).toMatchObject({ reused: false, doc: { client_program_id: PROGRAM, c2c_document_id: null, module: 'M3' },
        origin: { kind: 'vault', id: source.sourceId, sha256: hash } });
      const section = copy.sections[0];
      const content = '<p>Reviewed wording stays in this independent working copy.</p>';
      const saved = await author(request(app).patch(`/api/authoring/sections/${section.id}`)).send({
        content, expectedUpdatedAt: section.updated_at, changeReason: 'Review the source without placing it into either filing',
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body.filing).toMatchObject({ committed: false, reason: expect.stringContaining('not bound') });
      const opened = await author(request(app).get(`/api/authoring/docs/${copy.doc.id}/sections?programId=${PROGRAM}`));
      expect(opened.status).toBe(200);
      expect(opened.body.sections[0].content).toBe(content);
      const reused = await author(request(app).post('/api/authoring/import/source')).send(source.input);
      expect(reused.status, JSON.stringify(reused.body)).toBe(200);
      expect(reused.body.data).toMatchObject({ reused: true, doc: { id: copy.doc.id, c2c_document_id: null } });
      expect(reused.body.data.sections[0].content).toBe(content);
      expect((await db.pglite.query<{ c2c_document_id: string | null }>(
        'SELECT c2c_document_id FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [copy.doc.id, ORG])).rows)
        .toEqual([{ c2c_document_id: null }]);
      expect((await filingRows()).rows).toEqual(before);
      expect(await fs.readFile(source.filePath)).toEqual(source.sourceBytes);
      expect((await db.pglite.query<{ content_hash: string | null }>(
        'SELECT content_hash FROM vault.documents WHERE id=$1 AND organization_id=$2', [source.sourceId, ORG])).rows).toEqual([{ content_hash: hash }]);
      // A previously recorded placement is retained on reuse; forceUnbound applies only to creation.
      await db.pool.query('UPDATE authoring_documents SET c2c_document_id=$1 WHERE id=$2 AND tenant_id=$3', [filings[1], copy.doc.id, ORG]);
      const boundReuse = await author(request(app).post('/api/authoring/import/source')).send(source.input);
      expect(boundReuse.status, JSON.stringify(boundReuse.body)).toBe(200);
      expect(boundReuse.body.data).toMatchObject({ reused: true, doc: { id: copy.doc.id, c2c_document_id: filings[1] } });
      expect((await filingRows()).rows).toEqual(before);
    });
  });
}
