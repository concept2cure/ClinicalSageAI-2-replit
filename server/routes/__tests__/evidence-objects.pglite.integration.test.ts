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
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

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
vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

import evidenceObjectsRouter from '../evidence-objects.routes';

const ORG = 7;
const OTHER = 9;

/** Faithful subset of the real evidence_objects columns the route reads/needs. */
const DDL = `
CREATE TABLE evidence_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,
  program_id uuid,
  title text NOT NULL,
  code varchar(100),
  description text,
  evidence_type text NOT NULL,
  evidence_category text NOT NULL,
  source_type text NOT NULL,
  source_reference text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
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

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/evidence-objects', evidenceObjectsRouter);
  return app;
}

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM evidence_objects;`); });

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
    await pglite.exec(`DROP TABLE evidence_objects;`);
    try {
      const res = await request(appWith(ORG)).get('/api/evidence-objects');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.pendingStore).toBe(true);
    } finally {
      // Restore for any later run ordering; beforeEach also DELETEs from it.
      await pglite.exec(DDL);
    }
  });
});
