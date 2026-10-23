/** Private qualification fixture for actual source-import HTTP recovery.
 * No writer or database setup: uses the parent suite's canonical fixture. */
import { createHash } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
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
