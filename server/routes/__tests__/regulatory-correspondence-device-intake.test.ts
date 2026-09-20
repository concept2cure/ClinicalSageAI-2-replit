/**
 * The device taxonomy has to be REACHABLE, not merely written.
 *
 * `runGovernedIssueParser` picks its taxonomy from the submission's type, and
 * the only production caller is `POST /correspondence/intake`. If the route
 * never passes that type, every device letter keeps arriving through the drug
 * rules and the taxonomy beside it is decoration — so this drives the real
 * handler and reads what comes back.
 *
 * The sibling suite (`regulatory-correspondence.test.ts`) mocks every query to
 * return no rows, so its intake case accepts 503 and cannot see any of this.
 * The pool here answers per statement, which is what it takes to reach the
 * parser at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

/** The submission the letter is about. Swapped per test. */
const submission = { type: '510k' as string | null };

const { pool } = vi.hoisted(() => ({
  pool: {
    // Declared with the second (params) argument so `mock.calls` types as
    // `[text: string, params?: unknown[]][]` — the real pool.query is always
    // called with params (server/routes/regulatory-correspondence.ts), and a
    // one-argument mock signature made every recorded call a 1-tuple, so
    // `lookup![1]` below had no element at that index to read.
    query: vi.fn(async (text: string, _params?: unknown[]) => {
      // tableReady()
      if (/to_regclass/.test(text)) return { rows: [{ tbl: 'c2c_submissions' }], rowCount: 1 };
      // The ONE submission lookup intake performs — id, project_id and the
      // type that selects the taxonomy.
      if (/FROM c2c_submissions/.test(text)) {
        return {
          rows: [{ id: 'sub-1', project_id: 7, submission_type: (submissionRef().type) }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
}));
function submissionRef() {
  return submission;
}

/**
 * A permissive Drizzle stand-in. Intake writes several governed side-effects
 * (project memory, blockers, work items) through the query builder; none is
 * what this file is about, and a mock that stops short of them makes intake
 * 500 — which, with an `if (status !== 201) return` in each test, is a suite
 * that passes while asserting nothing. Measured: it did exactly that before
 * this mock existed.
 */
function queryChain(): any {
  const rows: any[] = [];
  const node: any = new Proxy(function () {} as any, {
    get(_t, prop) {
      if (prop === 'then') return undefined; // awaitable-as-value, not a promise
      if (prop === Symbol.iterator) return rows[Symbol.iterator].bind(rows);
      if (prop === 'length') return 0;
      return () => node;
    },
    apply: () => node,
  });
  return node;
}

vi.mock('../../db', () => ({
  db: {
    insert: () => ({ values: async () => undefined, onConflictDoNothing: () => ({ values: async () => undefined }) }),
    select: () => queryChain(),
    update: () => queryChain(),
    execute: async () => ({ rows: [] }),
  },
  pool,
  getPool: () => pool,
  getDb: () => ({}),
}));

import express from 'express';
import request from 'supertest';
import routes from '../regulatory-correspondence';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req: any, _res, next) => {
  req.user = { id: 11, organizationId: 2 };
  req.resolvedOrganizationId = 2;
  req.userId = 11;
  next();
});
app.use('/api/regulatory-correspondence', routes);

const AI_LETTER = `ADDITIONAL INFORMATION REQUEST (AI)
We cannot reach a substantial equivalence determination.
A1. The predicate device K201234 has different technological characteristics.
A2. Your biocompatibility evaluation does not address cytotoxicity per ISO 10993-5.
A3. Provide the cybersecurity risk management report per section 524B.`;

function intake() {
  return request(app)
    .post('/api/regulatory-correspondence/correspondence/intake')
    .send({
      projectId: 7,
      submissionId: 'sub-1',
      subject: 'AI request',
      parsedText: AI_LETTER,
      direction: 'inbound',
      communicationType: 'information_request',
    });
}

describe('POST /correspondence/intake classifies by the submission it is about', () => {
  beforeEach(() => {
    submission.type = '510k';
    pool.query.mockClear();
  });

  it('a 510(k) letter comes back on 510(k) sections, not CTD modules', async () => {
    const r = await intake();
    /* 201 ASSERTED, never tolerated. An `if (status !== 201) return` here is a
       test that passes while checking nothing — and it did: before the Drizzle
       stand-in above, intake 500'd and three cases in this file silently
       asserted zero. */
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(201);
    const sections = new Set<string>(
      (r.body.issues as Array<{ mappedCtdSections: string[] }>).flatMap((i) => i.mappedCtdSections),
    );
    expect(sections.size).toBeGreaterThan(0);
    expect([...sections]).toEqual(expect.arrayContaining(['E1', 'E3', 'C1']));
    for (const s of sections) expect(s).not.toMatch(/^\d/); // no 2.5 / 3.2.S
    expect(r.body.data.parserMetadata.issueTaxonomy).toBe('device:k510');
    expect(r.body.data.parserMetadata.submissionType).toBe('510k');
  });

  it('the type is read from the submission ROW, never from the request body', async () => {
    await intake();
    const lookup = pool.query.mock.calls.find((c) => /FROM c2c_submissions/.test(String(c[0])));
    expect(lookup, 'intake never read the submission').toBeDefined();
    // Tenant-scoped, and selecting the column the taxonomy turns on.
    expect(String(lookup![0])).toMatch(/submission_type/);
    expect(String(lookup![0])).toMatch(/organization_id = \$2/);
    expect((lookup![1] as unknown[])[1]).toBe(2);
  });

  it('reads the submission ONCE — the type does not cost a second round trip', async () => {
    await intake();
    const lookups = pool.query.mock.calls.filter((c) => /FROM c2c_submissions/.test(String(c[0])));
    expect(lookups).toHaveLength(1);
  });

  it('the same letter on a De Novo submission maps to De Novo sections', async () => {
    submission.type = 'de_novo';
    const r = await intake();
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(201);
    const sections = new Set<string>(
      (r.body.issues as Array<{ mappedCtdSections: string[] }>).flatMap((i) => i.mappedCtdSections),
    );
    // De Novo: biocompatibility is D2 and cybersecurity is D5. On a 510(k)
    // those same topics are E1 and E3, and D5 there is "Shelf life".
    expect([...sections]).toEqual(expect.arrayContaining(['D2', 'D5']));
    expect(r.body.data.parserMetadata.issueTaxonomy).toBe('device:denovo');
  });

  it('persists what the parser extracted, not just its category', async () => {
    /* `structured_extraction` and `subcategory` were written nowhere: the
       column did not exist and the INSERT did not name either, so the section
       candidates and the regulator's actual evidence ask lived in this response
       and were gone by the time a response package was compiled. Every package
       then fell back to the generic 'Issue evidence attachment'. */
    const r = await intake();
    expect(r.status).toBe(201);

    const inserts = pool.query.mock.calls.filter((c) =>
      /INSERT INTO c2c_correspondence_issues/.test(String(c[0])),
    );
    // The letter raises several topics, so there are several inserts; the
    // first is whichever rule matched first, not a chosen one.
    expect(inserts.length, 'no issue was persisted').toBeGreaterThan(0);
    const insert = inserts[0];
    const sql = String(insert![0]);
    expect(sql).toMatch(/subcategory/);
    expect(sql).toMatch(/structured_extraction/);

    const params = insert![1] as unknown[];
    // The placeholder count must match the bound values, or Postgres rejects it.
    const placeholders = new Set(sql.match(/\$\d+/g) ?? []);
    expect(placeholders.size).toBe(params.length);

    const extraction = JSON.parse(String(params[params.length - 1]));
    expect(extraction.evidenceNeeds?.length).toBeGreaterThan(0);
    expect(extraction.sectionCandidates?.length).toBeGreaterThan(0);
    // And the device topics reached the rows — across every issue the letter
    // raised, not just whichever matched first.
    const subcategories = inserts.map((c) => (c[1] as unknown[])[3]);
    expect(subcategories).toContain('biocompatibility');
    expect(subcategories).toContain('cybersecurity');
  });

  it('a drug submission still gets the CTD taxonomy', async () => {
    submission.type = 'nda';
    const r = await intake();
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(201);
    expect(r.body.data.parserMetadata.issueTaxonomy).toBe('ctd');
  });
});
