/**
 * The provenance columns have to reach the filer, not just the database.
 *
 * `migrations/20260810c_rule_pack_provenance.sql` recorded whether each filing
 * outline was transcribed from a regulation or constructed by reasoning about
 * one. For a while that was the entire fix: no route selected the columns, so
 * the product still presented every outline with identical authority — the
 * precise sentence the migration was written to make false.
 *
 * These tests lock the two routes that carry it, and the two ways carrying it
 * could quietly fail:
 *
 *   1. Reading the columns with a bare `SELECT source_basis` raises 42703 on a
 *      database that has not taken the migration yet, taking the document
 *      editor down with it. Application code deploys before migrations run, so
 *      that window is real.
 *   2. Emitting the raw columns alongside the normalised object would leave a
 *      second, unguarded copy for a client to read — and NULL read as "no
 *      constraint" is exactly how an unattested outline gets rendered as an
 *      unqualified one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import documentsRouter from '../documents';

/**
 * Mirrors the production mount in server/bootstrap/register-inline-routes.ts:
 * the router lives at /api/c2c/documents, and /api/c2c/rule-packs is a shim
 * that rewrites req.url onto the router's own /rule-packs sub-route. Both URLs
 * under test are therefore the URLs the client actually calls.
 */
function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.get('/api/c2c/rule-packs', (req, res, next) => {
    const q = req.url.indexOf('?');
    req.url = q === -1 ? '/rule-packs' : `/rule-packs${req.url.slice(q)}`;
    (documentsRouter as unknown as (a: Request, b: Response, c: NextFunction) => void)(req, res, next);
  });
  app.use('/api/c2c/documents', documentsRouter);
  return app;
}

/**
 * The SQL with every `to_jsonb(x) ->> 'col' AS col` fragment removed.
 *
 * What must not survive is a BARE reference to one of the columns — that is
 * the form that raises 42703 on a database which has not taken 20260810c.
 * The alias in `AS source_basis` is not such a reference, so it has to be
 * stripped before asserting, or the assertion fails on the very construct it
 * is meant to require.
 */
function withoutProvenanceReads(sql: string): string {
  // Both forms are safe reads and both must be stripped before asserting:
  //   to_jsonb(rp) ->> 'x' AS x     the select-list aliases
  //   to_jsonb(rp) ->> 'x'          bare reads inside the review-state CASE
  // Only the aliased form was stripped originally, so the CASE's own safe
  // reads read as violations of the very rule they satisfy.
  return sql.replace(/to_jsonb\(\w+\)\s*->>\s*'[a-z_]+'(\s+AS\s+[a-z_]+)?/gi, '');
}

beforeEach(() => query.mockReset());

const RAW_COLUMNS = ['source_basis', 'confidence', 'review_status', 'governing_rule', 'uncertainties',
  'reviewed_by', 'reviewed_at', 'review_scope'];

describe('GET /api/c2c/rule-packs — provenance reaches the caller', () => {
  it('emits a normalised provenance object and no raw columns', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          doc_type: 'pma',
          agency: 'fda',
          version: 'cfr-814-20b-2026',
          label: 'PMA',
          required_sections: [],
          esubmit_channel: null,
          effective_from: null,
          source_basis: 'statutory_transcription',
          confidence: 'high',
          review_status: 'unreviewed',
          governing_rule: '21 CFR 814.20(b) — Application contents',
          uncertainties: 'Confirm module placement before filing.',
        },
      ],
    });

    const res = await request(appWith(7)).get('/api/c2c/rule-packs');
    expect(res.status).toBe(200);

    const pack = res.body.rulePacks[0];
    expect(pack.provenance).toEqual({
      sourceBasis: 'statutory_transcription',
      confidence: 'high',
      reviewStatus: 'unreviewed',
      governingRule: '21 CFR 814.20(b) — Application contents',
      uncertainties: 'Confirm module placement before filing.',
      reviewState: 'unreviewed',
      review: { reviewedBy: null, reviewedAt: null, reviewScope: null },
    });

    // No second, un-normalised copy.
    for (const col of RAW_COLUMNS) expect(pack).not.toHaveProperty(col);
    // The rest of the row survives untouched.
    expect(pack.doc_type).toBe('pma');
    expect(pack.version).toBe('cfr-814-20b-2026');
  });

  it('a pre-migration database reports undeclared rather than nothing', async () => {
    // No columns exist, so `to_jsonb(rp) ->> '…'` yields null for all five.
    query.mockResolvedValueOnce({
      rows: [
        {
          doc_type: 'nda',
          agency: 'fda',
          version: 'ich-m4-2016',
          label: 'NDA',
          required_sections: [],
          esubmit_channel: null,
          effective_from: null,
          source_basis: null,
          confidence: null,
          review_status: null,
          governing_rule: null,
          uncertainties: null,
        },
      ],
    });

    const res = await request(appWith(7)).get('/api/c2c/rule-packs');
    expect(res.status).toBe(200);
    expect(res.body.rulePacks[0].provenance).toEqual({
      sourceBasis: 'undeclared',
      confidence: 'unknown',
      reviewStatus: 'unreviewed',
      governingRule: null,
      uncertainties: null,
      reviewState: 'unreviewed',
      review: { reviewedBy: null, reviewedAt: null, reviewScope: null },
    });
  });

  it('reads the columns through to_jsonb, so a missing column cannot 500 the route', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/c2c/rule-packs');

    const [sql] = query.mock.calls[0] as [string];
    for (const col of RAW_COLUMNS) {
      expect(sql).toContain(`to_jsonb(rp) ->> '${col}' AS ${col}`);
    }
    // A bare reference is what raises 42703 before the migration has run.
    const bare = withoutProvenanceReads(sql);
    for (const col of RAW_COLUMNS) expect(bare).not.toContain(col);
  });

  // The mount forwards this URL onto the router's own /rule-packs sub-route by
  // reassigning req.url. Express 5 defines req.query as a LAZY getter that
  // parses req.url when the handler first reads it, which is after the
  // rewrite — so a rewrite that drops the query string makes both filters
  // vanish and the endpoint answer with every pack. It did, until this test.
  it('carries ?docType and ?agency across the mount rewrite', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/c2c/rule-packs?docType=pma&agency=fda');

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM c2c_rule_packs rp');
    expect(sql).toContain('doc_type = $1');
    expect(sql).toContain('agency = $2');
    expect(params).toEqual(['pma', 'fda']);
  });

  it('is unfiltered only when the caller asked for no filter', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/c2c/rule-packs');

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE superseded_by IS NULL');
    expect(sql).not.toContain('doc_type = $1');
    expect(params).toEqual([]);
  });
});

describe('GET /api/c2c/documents/:id/outline — provenance travels with the tree', () => {
  const DOC_ID = '11111111-2222-3333-4444-555555555555';

  function mockOutline(provenanceCols: Record<string, string | null>) {
    // 1st query: document joined to its rule pack. 2nd: live sections.
    query.mockResolvedValueOnce({
      rows: [
        {
          id: DOC_ID,
          doc_type: 'mdr',
          agency: 'ema',
          rule_pack_version: 'mdr-annex-ii-iii-2026',
          title: 'Technical Documentation',
          status: 'draft',
          readiness: 12,
          required_sections: [
            { key: 'A', parent_key: null, label: 'Device description', mandatory: true, path_order: 1 },
          ],
          ...provenanceCols,
        },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
  }

  it('carries the outline basis on the document the editor renders', async () => {
    mockOutline({
      source_basis: 'statutory_transcription',
      confidence: 'high',
      review_status: 'unreviewed',
      governing_rule: 'Regulation (EU) 2017/745 (MDR), Annex II',
      uncertainties: 'Notified Body expectations vary by device class.',
    });

    const res = await request(appWith(7)).get(`/api/c2c/documents/${DOC_ID}/outline`);
    expect(res.status).toBe(200);
    expect(res.body.document.provenance).toEqual({
      sourceBasis: 'statutory_transcription',
      confidence: 'high',
      reviewStatus: 'unreviewed',
      governingRule: 'Regulation (EU) 2017/745 (MDR), Annex II',
      uncertainties: 'Notified Body expectations vary by device class.',
      reviewState: 'unreviewed',
      review: { reviewedBy: null, reviewedAt: null, reviewScope: null },
    });
    // The outline itself is unchanged by this.
    expect(res.body.outline).toHaveLength(1);
    expect(res.body.outline[0].key).toBe('A');
  });

  it('a pre-migration database still yields a stated basis, the undeclared one', async () => {
    mockOutline({
      source_basis: null,
      confidence: null,
      review_status: null,
      governing_rule: null,
      uncertainties: null,
    });

    const res = await request(appWith(7)).get(`/api/c2c/documents/${DOC_ID}/outline`);
    expect(res.status).toBe(200);
    expect(res.body.document.provenance.sourceBasis).toBe('undeclared');
    expect(res.body.document.provenance.reviewStatus).toBe('unreviewed');
  });

  it('reads the columns through to_jsonb here too', async () => {
    mockOutline({ source_basis: null, confidence: null, review_status: null, governing_rule: null, uncertainties: null });
    await request(appWith(7)).get(`/api/c2c/documents/${DOC_ID}/outline`);

    const [sql] = query.mock.calls[0] as [string];
    for (const col of RAW_COLUMNS) {
      expect(sql).toContain(`to_jsonb(rp) ->> '${col}' AS ${col}`);
    }
    for (const col of RAW_COLUMNS) expect(withoutProvenanceReads(sql)).not.toContain(col);
  });

  it('403 without org context, before any query runs', async () => {
    const res = await request(appWith(null)).get(`/api/c2c/documents/${DOC_ID}/outline`);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
