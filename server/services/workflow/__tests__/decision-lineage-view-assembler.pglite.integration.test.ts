/**
 * assembleOrgDecisionLineage — enumeration END-TO-END against in-process PGlite.
 *
 * Proves the GA read: the LIST of governed artifacts is enumerated from the REAL store
 * (org's unified_documents that actually have a decision trail — a workflow or an audit
 * log), each built into a graph via the real decisionLineageService and tagged with its
 * artifactLabel. Locks: strict org scope, artifacts with no trail are excluded, an
 * artifact whose graph resolves to zero nodes is dropped (no empty cards). The graph
 * assembly itself is the separately-real DecisionLineageService (drizzle) — mocked here
 * so this test isolates the new enumeration + shaping.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

// The per-artifact graph builder is the separately-real service; stub it so this test
// isolates enumeration. It returns a one-node graph for every doc EXCEPT id 500 (which
// resolves to zero nodes and must be dropped).
const getLineageGraph = vi.fn(async (_type: string, id: number, _org?: number) => ({
  rootEntityType: 'artifact',
  rootEntityId: id,
  nodes: id === 500 ? [] : [{ id: `n-${id}`, nodeType: 'document_state', action: 'created' }],
  edges: [],
  metadata: { totalDecisions: 0, totalApprovals: 0, totalRejections: 0, totalDelegations: 0, chainVerified: true, complianceFrameworks: [] },
}));
vi.mock('../DecisionLineageService', () => ({
  decisionLineageService: { getLineageGraph: (t: string, id: number, org?: number) => getLineageGraph(t, id, org) },
}));

import { assembleOrgDecisionLineage } from '../decision-lineage-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE unified_documents (id serial PRIMARY KEY, title text, organization_id int, updated_at timestamptz DEFAULT now());
CREATE TABLE document_workflows (id serial PRIMARY KEY, document_id int);
CREATE TABLE document_audit_logs (id serial PRIMARY KEY, document_id int);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM unified_documents; DELETE FROM document_workflows; DELETE FROM document_audit_logs;`);
  getLineageGraph.mockClear();
});

async function doc(id: number, org: number, title: string): Promise<void> {
  await pglite.query(`INSERT INTO unified_documents (id, organization_id, title) VALUES ($1,$2,$3)`, [id, org, title]);
}

describe('assembleOrgDecisionLineage', () => {
  it('enumerates only the org artifacts with a real trail, tagging artifactLabel', async () => {
    await doc(100, ORG, 'Doc A (has workflow)');
    await pglite.query(`INSERT INTO document_workflows (document_id) VALUES (100)`);
    await doc(200, ORG, 'Doc B (has audit log)');
    await pglite.query(`INSERT INTO document_audit_logs (document_id) VALUES (200)`);
    await doc(300, ORG, 'Doc C (no trail)');                  // excluded — no workflow/audit
    await doc(400, OTHER, 'Doc D (other org)');               // excluded — other tenant
    await pglite.query(`INSERT INTO document_workflows (document_id) VALUES (400)`);

    const rows = await assembleOrgDecisionLineage(ORG) as any[];
    const ids = rows.map((r) => r.rootEntityId).sort((a, b) => a - b);
    expect(ids).toEqual([100, 200]);
    const a = rows.find((r) => r.rootEntityId === 100);
    expect(a.artifactLabel).toBe('Doc A (has workflow)');
    expect(a.nodes.length).toBeGreaterThan(0);
    // Never built graphs for the no-trail or other-tenant docs.
    const built = getLineageGraph.mock.calls.map((c) => c[1]).sort((x, y) => x - y);
    expect(built).toEqual([100, 200]);
  });

  it('drops an artifact whose graph resolves to zero nodes (no empty cards)', async () => {
    await doc(500, ORG, 'Doc with empty graph');
    await pglite.query(`INSERT INTO document_workflows (document_id) VALUES (500)`);
    await doc(600, ORG, 'Doc with a node');
    await pglite.query(`INSERT INTO document_workflows (document_id) VALUES (600)`);
    const rows = await assembleOrgDecisionLineage(ORG) as any[];
    expect(rows.map((r) => r.rootEntityId)).toEqual([600]);
  });

  it('returns [] for an org with no lineage artifacts', async () => {
    await doc(700, OTHER, 'Other org only');
    await pglite.query(`INSERT INTO document_audit_logs (document_id) VALUES (700)`);
    expect(await assembleOrgDecisionLineage(ORG)).toEqual([]);
  });
});
