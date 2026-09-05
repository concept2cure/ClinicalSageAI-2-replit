/**
 * Ledger L160 — accepting an AnA batch draft into a coauthor document records
 * lineage in the same transaction, or refuses.
 *
 * Real router, real PGlite with the real evidence-spine and span-lineage
 * migrations; the request-scoped db is a Drizzle handle over that database so
 * the route's raw BEGIN/COMMIT and the gate's adapted client share one
 * connection, exactly as in production.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => holder.db }));
const actor = vi.hoisted(() => ({ id: 501 as number | null, organizationId: 77, name: 'Dana Reviewer', role: 'reviewer' }));

import createBatchDraftRoutes from '../batch-draft-routes';

const ORG = 77;
let pg: PGlite;
let app: express.Express;

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf8');
}
async function spans(documentId: number) {
  const r = await pg.query<{ provenance_kind: string }>(
    `SELECT provenance_kind FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL`,
    [String(documentId)],
  );
  return r.rows;
}
async function seedDoc(content = 'The prior text of the section.'): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, content, status) VALUES ($1, $2, 'draft') RETURNING id`,
    [ORG, content],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE coauthor_documents (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, content TEXT, status TEXT, metadata JSON, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE coauthor_document_versions (id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL, version_number INTEGER NOT NULL, content TEXT, created_by TEXT, change_summary TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE audit_events (id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT, entity_id INTEGER, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT, timestamp TIMESTAMPTZ, reason TEXT, metadata JSONB, regulatory_significant BOOLEAN, gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);
  `);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'org');`);
  await pg.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pg.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  holder.db = drizzle(pg);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = actor.id == null ? { organizationId: actor.organizationId } : { id: actor.id, organizationId: actor.organizationId, name: actor.name, role: actor.role };
    next();
  });
  app.use('/api/batch-draft', createBatchDraftRoutes());
}, 90_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(() => {
  actor.id = 501;
});

describe('POST /api/batch-draft/documents/:id/accept (ledger L160)', () => {
  it('records every clause of the accepted text as the acceptor\'s assertion, in the same transaction as the content and its audit row', async () => {
    const id = await seedDoc();
    const content =
      'The primary endpoint was met at week twelve in the intent-to-treat population. These findings were consistent across every prespecified subgroup we examined.';
    const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send({ content, model: 'test-model' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe(content);
    const rows = await spans(id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.provenance_kind === 'author_assertion')).toBe(true);
    const audit = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE entity_id = $1`, [id]);
    expect(Number(audit.rows[0].n)).toBe(1);
  });

  it('refuses an accept with no identified user, and writes nothing', async () => {
    const id = await seedDoc();
    actor.id = null;
    const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send({ content: 'Unattributed prose that must not land.' });
    expect(res.status).toBe(401);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe('The prior text of the section.');
    expect(await spans(id)).toHaveLength(0);
    const versions = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    expect(Number(versions.rows[0].n)).toBe(0);
  });
});
