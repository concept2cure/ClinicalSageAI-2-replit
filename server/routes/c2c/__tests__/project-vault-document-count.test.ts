/**
 * GET /api/c2c/project-vault/:id — what "N documents" counts.
 *
 * URS-VAULT-004 asks for an honest `documentCount`. It was `countDocs(tree)`,
 * every LEAF in the tree, and the Vault header and AnA's screen context counted
 * the same leaves on the client. So:
 *
 *   - an authored document counted once per rule-pack section — one IND with a
 *     40-section pack and no uploads read "40 documents";
 *   - uploads counted as the rows on the capped page (VAULT_TREE_MAX_DOCS), not
 *     the programme's uploads — while the note under the header, from the
 *     same response, said "showing 2 of 2,500".
 *
 * A document is an authored document, a governed CMC artifact, or an upload.
 * Each branch is counted where it is known, and a branch that could not be
 * read is null in the breakdown — unknown, not zero.
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

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 7;
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const upload = (id: string) => ({
  id, document_code: `${id}.pdf`, document_title: id, document_type: 'OTHER', version: '1.0',
  file_name: `${id}.pdf`, file_size: 1024, mime_type: 'application/pdf', content_hash: 'a'.repeat(64),
  folder_id: null, evidence_kind: null, ctd_section: null, placement_status: 'unfiled',
  placement_confidence: null, placement_rationale: null, updated_at: null, owner_name: null,
});

/** One authored IND with three rule-pack sections; `uploads` on the page, `total` in the programme. */
function seed(opts: { uploads: string[]; total: number }) {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'doc1', doc_type: 'ind', agency: 'fda', rule_pack_version: 'v1',
        title: 'IND', status: 'draft', readiness: 0, updated_at: null, owner_name: null,
        required_sections: [
          { key: '2.5', label: 'Clinical overview', mandatory: true, path_order: 1 },
          { key: '2.6', label: 'Nonclinical summaries', mandatory: true, path_order: 2 },
          { key: '2.7', label: 'Clinical summary', mandatory: true, path_order: 3 },
        ],
      }],
    })
    .mockResolvedValueOnce({ rows: [] });
  queryMock.mockImplementation(async (sql: string) => {
    if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total: opts.total, unfiled: opts.total }] };
    if (/FROM vault\.documents d\s+LEFT JOIN users/.test(sql)) return { rows: opts.uploads.map(upload) };
    return { rows: [] };
  });
}

beforeEach(() => queryMock.mockReset());

describe('GET /api/c2c/project-vault/:id — documentCount counts documents', () => {
  it('an authored document is one document, however many sections its rule pack has', async () => {
    seed({ uploads: [], total: 0 });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documentCount).toBe(1);
    expect(res.body.data.documentCounts).toMatchObject({ authored: 1, uploads: 0 });
  });

  it('uploads count the programme, not the page the tree carries', async () => {
    seed({ uploads: ['u1', 'u2'], total: 2500 });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.uploadsWindow).toMatchObject({ shown: 2, total: 2500 });
    expect(res.body.data.documentCounts).toMatchObject({ authored: 1, uploads: 2500 });
    expect(res.body.data.documentCount).toBe(1 + 2500 + (res.body.data.documentCounts.cmcArtifacts ?? 0));
  });

  it('a branch that could not be read is unknown in the breakdown, not zero', async () => {
    seed({ uploads: [], total: 0 });
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM vault\.documents/.test(sql)) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      return { rows: [] };
    });
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.documentCounts.uploads).toBeNull();
    expect(res.body.data.unavailable.map((u: { branch: string }) => u.branch)).toContain('Uploaded files');
  });
});
