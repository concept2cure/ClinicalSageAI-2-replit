/**
 * GET /api/c2c/project-vault/:id: the type a document shows after Edit details.
 *
 * Edit details writes the document type the person chose to vault.documents
 * (document_type). The tree leaf, the flattened list, the uploads lane and the
 * header all read the leaf's `type`, and that label used to come from the
 * classifier's evidence kind first, so a document re-typed to Protocol still
 * read "Test reports" everywhere except its Details block. This pins the label
 * on the tree payload that the list and the lane are built from.
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
const DOC = '66666666-6666-4666-8666-666666666666';
const OTHER_DOC = '77777777-7777-4777-8777-777777777777';

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

/** A filed upload as its row reads once Edit details has recorded PROTOCOL on it. */
const upload = (over: Record<string, unknown>) => ({
  id: DOC, document_code: 'Protocol-Stability.pdf', document_title: 'Protocol-Stability',
  document_type: 'PROTOCOL', classification: 'INTERNAL', version: '1.0',
  file_name: 'Protocol-Stability.pdf', file_size: 1024, mime_type: 'application/pdf',
  content_hash: 'a'.repeat(64), folder_id: 'module-3', evidence_kind: 'report',
  ctd_section: '3.2.P.8', placement_status: 'confirmed', placement_confidence: 'high',
  placement_rationale: null, updated_at: null, owner_name: 'Emily Watson',
  original_file_available: true, disposition: null, version_count: 1, lifecycle_stage: null,
  ...over,
});

function seed(uploads: unknown[]) {
  // The project, then the authored documents (none: so no section read). Every
  // later read is answered by the implementation, the uploads query included.
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: PROJECT, name: 'BX-204', product_type: 'drug' }] })
    .mockResolvedValueOnce({ rows: [] });
  queryMock.mockImplementation(async (sql: string) => {
    if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total: uploads.length, unfiled: 0 }] };
    if (/FROM vault\.documents d\s+LEFT JOIN LATERAL public\.actor_name/.test(sql)) return { rows: uploads };
    return { rows: [] };
  });
}

type Node = { id: string; type?: string; children?: Node[]; filing?: { evidenceKind: string | null } };

/** The leaf with this id, wherever the tree files it. */
function findLeaf(nodes: Node[], id: string): Node | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children ? findLeaf(n.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

beforeEach(() => queryMock.mockReset());

describe('GET /api/c2c/project-vault/:id: the label a document shows is its recorded type', () => {
  it('the filed leaf shows the type Edit details recorded, not the classifier kind', async () => {
    seed([upload({})]);
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    const leaf = findLeaf(res.body.data.tree, `up-${DOC}`);
    expect(leaf, 'the uploaded document is a leaf of the tree').toBeTruthy();
    expect(leaf!.type).toBe('Protocol');
    // The classifier's kind is still what the "Looks like" line reads.
    expect(leaf!.filing?.evidenceKind).toBe('report');
  });

  it('an unfiled document in the Unfiled queue shows the same label', async () => {
    seed([upload({ id: OTHER_DOC, folder_id: null, placement_status: 'unfiled', document_type: 'MODULE_3', evidence_kind: 'cmc' })]);
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(res.status).toBe(200);
    const leaf = findLeaf(res.body.data.tree, `up-${OTHER_DOC}`);
    expect(leaf!.type).toBe('Module 3 · quality');
  });

  it('a document never re-typed keeps the classifier kind as its label', async () => {
    seed([upload({ document_type: 'OTHER', evidence_kind: 'report' })]);
    const res = await request(app()).get(`/api/c2c/project-vault/${PROJECT}`);
    expect(findLeaf(res.body.data.tree, `up-${DOC}`)!.type).toBe('Test reports');
  });
});
