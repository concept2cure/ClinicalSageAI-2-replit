/**
 * Route test for GET /api/c2c/project-vault/:id — what "% complete" means.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The vault tree rendered two different meanings of `pct` in the same column:
 *
 *   document row   pct = c2c_documents.readiness — the proportion of that
 *                        document's sections approved or locked, maintained by
 *                        the c2c_recompute_document_readiness() trigger
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

import createProjectVaultRoutes from '../project-vault';

const PROJECT = '11111111-2222-3333-4444-555555555555';

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
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
    // 3) live section rows
    .mockResolvedValueOnce({
      rows: [
        { section_key: '2.5', status: 'drafted', version: 3, updated_at: null, has_content: true, owner_name: null },
        { section_key: '2.6', status: 'approved', version: 1, updated_at: null, has_content: true, owner_name: null },
      ],
    });
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
