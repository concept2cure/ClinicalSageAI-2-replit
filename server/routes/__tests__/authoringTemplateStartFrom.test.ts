/**
 * "Start from" templates — the picker and the create path read the SAME stores.
 *
 * ── The defects these pin against ────────────────────────────────────────────
 * Two template stores exist by design: the GLOBAL regulatory reference store
 * (intelligence.document_templates — agency expectations, untenanted) and the
 * org's own authoring_templates (tenant-scoped). Before this change:
 *   - GET /templates listed ONLY the org store, which ships empty, so the
 *     picker offered nothing for the life of the feature;
 *   - POST /docs resolved template_id ONLY against the global store, and did
 *     so AFTER creating the document — an id that resolved nothing produced a
 *     sectionless document behind a "seeded from <name>" confirmation.
 *
 * These assertions run against the mocked pool and check the queries the
 * handlers BUILD and the ORDER they run in, because that is where both defects
 * lived: the wrong store, and the write before the resolution.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create-with-seed runs on a BEGIN/COMMIT client now; route its queries
// through the same mock so the assertions below see one ordered stream. The
// router's pool is getPool()'s return value, so connect lives there too.
// Both live in vi.hoisted — the mock factory runs during the hoisted router
// import, before ordinary module consts initialize.
const { mockQuery, mockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockPool = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({
      query: (...a: unknown[]) => mockQuery(...a),
      release: () => {},
    }),
  };
  return { mockQuery, mockPool };
});
vi.mock('../../db', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-template-start-from';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return (
    'Bearer ' +
    (await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret))
  );
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const GLOBAL_TPL_ID = '11111111-2222-3333-4444-555555555555';
const ORG_TPL_ID = '99999999-8888-7777-6666-555555555555';

/** All calls whose SQL matches, in issue order. */
function calls(fragment: string): Array<{ sql: string; params: unknown[] }> {
  return mockQuery.mock.calls
    .filter((c) => String(c[0]).includes(fragment))
    .map((c) => ({ sql: String(c[0]), params: (c[1] ?? []) as unknown[] }));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
});

describe('POST /docs — create from a template', () => {
  it('seeds the skeleton from the global reference store, resolved BEFORE the document is written', async () => {
    let sectionSeq = 0;
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM intelligence.template_sections ts')) {
        return {
          rowCount: 2,
          rows: [
            { section_code: '3.2.S.1', section_title: 'General Information', ordering: 100 },
            { section_code: '3.2.S.7', section_title: 'Stability (Drug Substance)', ordering: 700 },
          ],
        };
      }
      if (sql.includes('INSERT INTO authoring_documents')) {
        return { rowCount: 1, rows: [{ id: (params as unknown[])[0], title: (params as unknown[])[1], module: 'M3', status: 'draft' }] };
      }
      if (sql.includes('INSERT INTO authoring_sections')) {
        sectionSeq += 1;
        return { rowCount: 1, rows: [{ id: `sec-${sectionSeq}`, code: (params as unknown[])[1], content: (params as unknown[])[3] }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/docs')
      .set('Authorization', await bearer())
      .send({ title: '3.2.S Drug Substance — BX-701', module: 'M3', template_id: GLOBAL_TPL_ID });

    expect(res.status).toBe(201);
    expect(res.body.sections_seeded).toBe(2);

    // Resolution BEFORE the write — the old order (write, then look up) is the
    // defect that produced sectionless documents.
    const resolveIdx = mockQuery.mock.calls.findIndex((c) => String(c[0]).includes('FROM intelligence.template_sections ts'));
    const insertIdx = mockQuery.mock.calls.findIndex((c) => String(c[0]).includes('INSERT INTO authoring_documents'));
    expect(resolveIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(resolveIdx);

    // Both sections seeded with the template's codes; global scaffolds start empty.
    const seeded = calls('INSERT INTO authoring_sections');
    expect(seeded.map((c) => c.params[1])).toEqual(['3.2.S.1', '3.2.S.7']);
    expect(seeded.every((c) => c.params[3] === '')).toBe(true);
  });

  it('falls back to the org template store and seeds ITS content', async () => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM intelligence.template_sections ts')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM authoring_templates') && sql.includes('template_content')) {
        // Tenant scoping on the org store is part of the contract.
        expect(params?.[1]).toBe(7);
        return {
          rowCount: 1,
          rows: [{ template_content: { sections: [{ code: 'A1', title: 'House section', content: '<p>house text</p>', order_index: 0 }] } }],
        };
      }
      if (sql.includes('INSERT INTO authoring_documents')) {
        return { rowCount: 1, rows: [{ id: (params as unknown[])[0], title: (params as unknown[])[1], status: 'draft' }] };
      }
      if (sql.includes('INSERT INTO authoring_sections')) {
        return { rowCount: 1, rows: [{ id: 'sec-org-1', code: (params as unknown[])[1], content: (params as unknown[])[3] }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/docs')
      .set('Authorization', await bearer())
      .send({ title: 'House SOP doc', module: 'M3', template_id: ORG_TPL_ID });

    expect(res.status).toBe(201);
    expect(res.body.sections_seeded).toBe(1);
    const seeded = calls('INSERT INTO authoring_sections');
    expect(seeded[0].params[1]).toBe('A1');
    expect(seeded[0].params[3]).toBe('<p>house text</p>');
  });

  it('refuses an id that resolves nothing in either store — and writes NO document', async () => {
    // Default mock answers every lookup with zero rows.
    const res = await request(makeApp())
      .post('/api/authoring/docs')
      .set('Authorization', await bearer())
      .send({ title: 'Doomed', module: 'M3', template_id: GLOBAL_TPL_ID });

    expect(res.status).toBe(404);
    expect(String(res.body.error)).toMatch(/No template with this id has any sections/);
    expect(calls('INSERT INTO authoring_documents')).toHaveLength(0);
    expect(calls('INSERT INTO authoring_sections')).toHaveLength(0);
  });

  it('refuses a malformed template_id with a clean 400 before any query can throw', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/docs')
      .set('Authorization', await bearer())
      .send({ title: 'Doomed', module: 'M3', template_id: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(calls('INSERT INTO authoring_documents')).toHaveLength(0);
  });
});

describe('GET /templates — the picker lists what create consumes', () => {
  it('merges global reference templates after the org rows, dropping sectionless globals', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM authoring_templates t')) {
        return { rowCount: 1, rows: [{ id: ORG_TPL_ID, name: 'House template', template_type: 'sop', section_count: 3, active: true }] };
      }
      if (sql.includes('FROM intelligence.document_templates t')) {
        return {
          rowCount: 2,
          rows: [
            { id: GLOBAL_TPL_ID, name: '3.2.S Drug Substance', template_type: 'cmc', category: 'Regulatory reference', section_count: 7, active: true },
            { id: '22222222-3333-4444-5555-666666666666', name: 'Empty outline', template_type: 'section', category: 'Regulatory reference', section_count: 0, active: true },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .get('/api/authoring/templates')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    // The shared catalog read succeeded and the response says so.
    expect(res.body.globalCatalog).toBe('ok');
    const names = res.body.templates.map((t: { name: string }) => t.name);
    // Org row first, real global next; the zero-section global cannot seed
    // anything and must not be offered.
    expect(names).toEqual(['House template', '3.2.S Drug Substance']);
    expect(res.body.count).toBe(2);
  });

  it('drops sectionless ORG rows too — the picker must not offer what POST /docs refuses', async () => {
    // POST /templates does not validate template_content.sections, so an org
    // row with none can exist; POST /docs 404s it. Listing it offered an
    // option the create endpoint was guaranteed to reject.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM authoring_templates t')) {
        return {
          rowCount: 2,
          rows: [
            { id: ORG_TPL_ID, name: 'House template', template_type: 'sop', section_count: 3, active: true },
            { id: '33333333-4444-5555-6666-777777777777', name: 'Hollow org outline', template_type: 'sop', section_count: 0, active: true },
          ],
        };
      }
      if (sql.includes('FROM intelligence.document_templates t')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .get('/api/authoring/templates')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    expect(res.body.templates.map((t: { name: string }) => t.name)).toEqual(['House template']);
    expect(res.body.count).toBe(1);
  });

  it('fail-soft: an unreachable global store still lists the org templates', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM authoring_templates t')) {
        return { rowCount: 1, rows: [{ id: ORG_TPL_ID, name: 'House template', template_type: 'sop', section_count: 3, active: true }] };
      }
      if (sql.includes('FROM intelligence.document_templates t')) {
        throw new Error('relation "intelligence.document_templates" does not exist');
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .get('/api/authoring/templates')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    expect(res.body.templates.map((t: { name: string }) => t.name)).toEqual(['House template']);
    // The response SAYS the shared catalog failed — a short list and a failed
    // half are different facts, and the picker renders the difference.
    expect(res.body.globalCatalog).toBe('unavailable');
  });
});

describe('POST /docs — create-with-seed is one transaction', () => {
  it('a mid-seed failure rolls the whole create back, so "nothing was persisted" is true', async () => {
    // Before the transaction, a failure in the seeding loop left a COMMITTED
    // document with some of its sections while the client reported nothing
    // was persisted. The mock fails the SECOND section insert; the handler
    // must ROLLBACK and never COMMIT.
    let sectionInserts = 0;
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM intelligence.template_sections ts')) {
        return {
          rowCount: 2,
          rows: [
            { section_code: '3.2.S.1', section_title: 'General Information', ordering: 100 },
            { section_code: '3.2.S.2', section_title: 'Manufacture (Drug Substance)', ordering: 200 },
          ],
        };
      }
      if (sql.includes('INSERT INTO authoring_documents')) {
        return { rowCount: 1, rows: [{ id: (params as unknown[])[0], title: (params as unknown[])[1], status: 'draft' }] };
      }
      if (sql.includes('INSERT INTO authoring_sections')) {
        sectionInserts += 1;
        if (sectionInserts === 2) throw new Error('audit store unavailable');
        return { rowCount: 1, rows: [{ id: 'sec-1', code: (params as unknown[])[1], content: (params as unknown[])[3] }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/docs')
      .set('Authorization', await bearer())
      .send({ title: 'Doomed halfway', module: 'M3', template_id: GLOBAL_TPL_ID });

    expect(res.status).toBe(500);
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});
