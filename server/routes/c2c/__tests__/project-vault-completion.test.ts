/**
 * Route test for GET /api/c2c/project-vault/:id — what "% complete" means.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The vault tree rendered two different meanings of `pct` in the same column:
 *
 *   document row   pct = c2c_documents.readiness — the proportion of that
 *                        document's counted sections (an empty heading is not
 *                        one) approved or locked, kept by the readiness trigger
 *   section leaf   pct = hasContent ? 100 : 0
 *
 * So a section with one sentence typed into it reported 100% complete, directly
 * beneath a document reporting 0% because nothing had been approved. On a filing
 * checklist that tells a regulatory affairs lead a section is finished when
 * nobody has reviewed a word of it.
 *
 * c2c-section-completion.contract.test.ts pins the definition itself, including
 * that it still matches the trigger. This file pins that the ROUTE uses it —
 * without this, the helper could be perfect and the vault could go on ignoring
 * it, which is how the has_content predicate got out of step in the first place.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

/* The current-access gate (installProjectRouteAccess, 14362ef00) admits every
   /:id on a current member of the caller's organization. Its reads are answered
   from seats (support/current-member.ts); an unseated caller or program is
   refused as the real gate refuses. */
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import createProjectVaultRoutes from '../project-vault';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const PROJECT = '11111111-2222-3333-4444-555555555555';
const USER = 41;

beforeEach(() => {
  clearSeats();
  seatMember(7, USER, 'member');
  seatProgram(7, PROJECT);
});

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
    // The session's user, as the auth middleware sets both (authBoundary, auth.ts).
    req.userId = USER;
    req.user = { id: USER };
    // The request's own connection, which the production request scope supplies.
    req.dbClient = { query: (...args: unknown[]) => queryMock(...args) };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/**
 * Three sections on one document: one drafted (text, not approved), one
 * approved, one never touched.
 */
function seed(readiness: number) {
  queryMock
    // 1) project (org-scoped)
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    // 2) documents on the project, with their rule-pack section specs
    .mockResolvedValueOnce({
      rows: [{
        id: 'doc1', doc_type: 'ind', agency: 'fda', rule_pack_version: 'v1',
        title: 'IND', status: 'draft', readiness, updated_at: null, owner_name: null,
        required_sections: [
          { key: '2.5', label: 'Clinical overview', mandatory: true, path_order: 1 },
          { key: '2.6', label: 'Nonclinical summaries', mandatory: true, path_order: 2 },
          { key: '2.7', label: 'Clinical summary', mandatory: true, path_order: 3 },
        ],
      }],
    })
    /* 3) live section rows.
       `document_id` is not decoration: the route reads every document's
       sections in ONE query and buckets the rows by it, so a row without it
       lands in no bucket and every section renders as untouched. That is how
       this fixture drifted from the route — silently, with the sections simply
       looking never-started. */
    .mockResolvedValueOnce({
      rows: [
        { document_id: 'doc1', section_key: '2.5', status: 'drafted', version: 3, updated_at: null, has_content: true, owner_name: null },
        { document_id: 'doc1', section_key: '2.6', status: 'approved', version: 1, updated_at: null, has_content: true, owner_name: null },
      ],
    })
    // 4+) the derived branches (Module 3 artifacts, vault uploads) — empty
    // here; project-vault-branches.test.ts covers them.
    .mockResolvedValue({ rows: [] });
}

/**
 * Every VaultDoc leaf in the response, keyed by its section number.
 * The tree mixes VaultFolder (has `children`) and VaultDoc (does not) at every
 * level — the same discriminator countDocs() uses in the router.
 */
function leavesByNum(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  const walk = (nodes: any[]) => {
    for (const n of nodes ?? []) {
      if (Array.isArray(n.children)) walk(n.children);
      else out[n.num] = n;
    }
  };
  walk(body?.data?.tree ?? []);
  return out;
}

beforeEach(() => queryMock.mockReset());

describe('GET /api/c2c/project-vault/:id — section completion', () => {
  it('a drafted section is not 100% — it is 0% until the filing approves it', async () => {
    seed(33);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);

    const leaves = leavesByNum(res.body);
    expect(Object.keys(leaves).length).toBeGreaterThan(0);

    // THE defect. `hasContent ? 100 : 0` reported this one finished.
    expect(leaves['2.5']).toBeTruthy();
    expect(leaves['2.5'].pct).toBe(0);
    // The drafting IS still visible — it moved to the field that means it.
    expect(leaves['2.5'].status).toBe('draft');
  });

  it('an approved section is 100%', async () => {
    seed(33);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    const leaves = leavesByNum(res.body);

    expect(leaves['2.6'].pct).toBe(100);
    expect(leaves['2.6'].status).toBe('approved');
  });

  it('an untouched mandatory section is 0% and still flags itself as a blocker', async () => {
    seed(33);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    const leaves = leavesByNum(res.body);

    expect(leaves['2.7'].pct).toBe(0);
    expect(leaves['2.7'].status).toBe('not_started');
    // No signal was traded away for the honesty: the mandatory-with-no-content
    // warning is untouched.
    expect(leaves['2.7'].blocker).toBe(true);
  });
});

/* F23 (7/9). A market added to a project (F22) holds only its own part of the
   filing: Module 1 and 3.2.R. Its folder was built from the whole market pack,
   so an MAA showed every Module 2-5 section as "Mandatory section — no content
   yet", sections the home filing holds and the market never will. And a
   document with no section spec and no sections showed 0%, a measured-looking
   figure over nothing. */
describe('GET /api/c2c/project-vault/:id — a market document shows its own part', () => {
  const MAA_PACK = [
    { key: 'M1', label: 'Module 1 · Administrative (EU)', mandatory: false, path_order: 1 },
    { key: '1.2', parent_key: 'M1', label: 'Application form', mandatory: true, path_order: 2 },
    { key: 'M2', label: 'Module 2', mandatory: false, path_order: 3 },
    { key: '2.5', parent_key: 'M2', label: 'Clinical overview', mandatory: true, path_order: 4 },
    { key: 'M3', label: 'Module 3', mandatory: false, path_order: 5 },
    { key: '3.2.P', parent_key: 'M3', label: 'Drug product', mandatory: true, path_order: 6 },
    { key: '3.2.R', parent_key: 'M3', label: 'Regional information', mandatory: false, path_order: 7 },
    { key: '3.2.R.1', parent_key: '3.2.R', label: 'Process validation scheme', mandatory: true, path_order: 8 },
  ];
  function seedDocs(docs: unknown[], live: unknown[] = []) {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
      .mockResolvedValueOnce({ rows: docs })
      .mockResolvedValueOnce({ rows: live })
      .mockResolvedValue({ rows: [] });
  }
  const doc = (over: Record<string, unknown>) => ({
    id: 'doc1', doc_type: 'nda', agency: 'fda', rule_pack_version: 'v1', title: 'NDA', status: 'draft',
    readiness: 0, updated_at: null, owner_name: null, filing_scope: 'home', required_sections: null, ...over,
  });

  it('a market document holds Module 1 and 3.2.R only, never the home filing’s Module 2 (at head: 2.5 and 3.2.P too)', async () => {
    seedDocs([doc({ id: 'ema1', doc_type: 'maa', agency: 'ema', title: 'MAA (EU)', filing_scope: 'market', required_sections: MAA_PACK })]);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    const nums = Object.keys(leavesByNum(res.body));
    expect(nums).toEqual(expect.arrayContaining(['1.2', '3.2.R.1']));
    expect(nums).not.toContain('2.5');
    expect(nums).not.toContain('3.2.P');
    // The documents read carries the scope, tolerantly (a database before
    // 20261015e reads every document as home).
    const docsSql = String(queryMock.mock.calls.find(([sql]) => /FROM c2c_documents d/.test(String(sql)))?.[0]);
    expect(docsSql).toMatch(/to_jsonb\(d\)->>'filing_scope' AS filing_scope/);
  });

  it('the home filing still shows its whole outline', async () => {
    seedDocs([doc({ required_sections: MAA_PACK })]);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(Object.keys(leavesByNum(res.body))).toEqual(expect.arrayContaining(['1.2', '2.5', '3.2.P', '3.2.R.1']));
  });

  it('a document with no section spec and no sections has no completion figure (at head: 0)', async () => {
    seedDocs([doc({ readiness: 0 })]);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    const leaf = leavesByNum(res.body)['—'];
    expect(leaf).toBeTruthy();
    expect(leaf.pct).toBeNull();
  });

  it('a document with no section spec but with sections keeps its measured figure', async () => {
    seedDocs([doc({ readiness: 40 })], [{ document_id: 'doc1', section_key: 'A', status: 'approved', version: 1, updated_at: null, has_content: true, owner_name: null }]);
    const res = await request(app(7)).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(leavesByNum(res.body)['—'].pct).toBe(40);
  });
});
