/**
 * Ledger L154 — the two drafting tools carry source lineage through the same
 * gate as the human accept route, inside their own transaction.
 *
 * The database and the gate are doubles here (the gate itself is proven on
 * PGlite in drafting-source-lineage.pglite.integration.test.ts); what this
 * pins is the CONTRACT of the tools: which gate is called with which sources,
 * that an unresolvable source is dropped and named in the result rather than
 * cited, that no sources means author-only lineage, and that a kit write with
 * no identified author is refused before anything is written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, client, pool, enforceAuthorLineage, enforceSourceAndAuthorLineage } = vi.hoisted(() => {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO q_sub_section_bodies')) {
        return { rows: [{ id: 55, section_key: params?.[2], draft_source: 'ana', drafted_at: 't0' }] };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 77, content: 'old prose', status: 'drafting', completion_percentage: 10 }] };
      }
      if (sql.includes('UPDATE cerv2_510k_sections')) {
        return {
          rows: [{ id: 77, section_number: '1', section_title: 'SE', section_key: 'substantial-equivalence', status: 'drafting', completionPercentage: 60, draftedAt: 't0' }],
        };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async () => ({ rows: [{ ok: 1 }] })), // tenant gate: the Q-Sub belongs to the org
    connect: vi.fn(async () => client),
  };
  const enforceAuthorLineage = vi.fn(async () => undefined);
  const enforceSourceAndAuthorLineage = vi.fn(async () => ({ sourceSpans: 1, authorSpans: 2, distinctSources: 1, coverage: 0.4 }));
  return { calls, client, pool, enforceAuthorLineage, enforceSourceAndAuthorLineage };
});
vi.mock('../../../db', () => ({ getPool: () => pool, pool, db: {} }));

vi.mock('../../clinical-regulatory-evidence/lineage-gate', () => ({ enforceAuthorLineage, enforceSourceAndAuthorLineage }));

// The resolver verifies existence + tenant ownership; here 7 and 'art-1' exist, nothing else does.
vi.mock('../../clinical-regulatory-evidence/retrieval-source-link', () => ({
  resolveEvidenceSourceIdsByArtifact: vi.fn(async (_org: number, keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) {
      if (k === 'cre_source:7') m.set(k, 7);
      if (k === 'art-1') m.set(k, 9);
    }
    return m;
  }),
}));
vi.mock('../../cerv2/section-version', () => ({ recordCerv2SectionVersion: vi.fn(async () => undefined) }));
vi.mock('../../auditService', () => ({ auditLog: vi.fn(async () => undefined) }));

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 5, userId: 41, organizationUuid: 'org-uuid' };
const Q_SUB = '11111111-2222-4333-8444-555555555555';
const PROSE = 'The primary endpoint was met at week twelve in the intent-to-treat population. The rest is ours.';

beforeEach(() => {
  calls.length = 0;
  enforceAuthorLineage.mockClear();
  enforceSourceAndAuthorLineage.mockClear();
  pool.connect.mockClear();
});

describe('write_q_sub_section', () => {
  it('records the resolvable sources through the source-and-author gate and NAMES the one it dropped', async () => {
    const handler = getToolHandler('write_q_sub_section')!;
    const out = JSON.parse(
      await handler(
        {
          q_sub_id: Q_SUB,
          section_key: 'device_description',
          content: PROSE,
          sources: [
            { evidence_source_id: 7, excerpt: 'The primary endpoint was met at week twelve in the intent-to-treat population.' },
            { evidence_source_id: 999, excerpt: 'a source this tenant does not have' },
            { artifact_id: 'art-1', excerpt: 'from an artifact id' },
          ],
        },
        CTX as never,
      ),
    );
    expect(out.ok).toBe(true);
    expect(enforceSourceAndAuthorLineage).toHaveBeenCalledTimes(1);
    const [exec, org, ref, content, actor, sources] = enforceSourceAndAuthorLineage.mock.calls[0] as unknown[];
    expect(exec).toBe(client); // the content write's own transaction client
    expect(org).toBe(5);
    expect(ref).toEqual({ documentTable: 'q_sub_section_bodies', documentId: '55' });
    expect(content).toBe(PROSE);
    expect(actor).toBe('41');
    expect((sources as Array<{ sourceId: number }>).map((s) => s.sourceId)).toEqual([7, 9]);
    expect(enforceAuthorLineage).not.toHaveBeenCalled();
    expect(out.lineage.citedSources).toBe(1);
    expect(out.lineage.sourcesDropped).toEqual([
      { index: 1, reason: 'not a Data Room source visible to this organization' },
    ]);
    expect(out.lineage.note).toMatch(/1 cited source\(s\) were dropped/);
    // Lineage ran before COMMIT, inside the transaction.
    const commitAt = calls.findIndex((c) => c.sql === 'COMMIT');
    expect(commitAt).toBeGreaterThan(0);
    expect(enforceSourceAndAuthorLineage.mock.invocationCallOrder[0]).toBeLessThan(
      client.query.mock.invocationCallOrder[commitAt],
    );
  });

  it('without sources, every clause is the author\'s assertion — the author-only gate, and the result says so', async () => {
    const handler = getToolHandler('write_q_sub_section')!;
    const out = JSON.parse(
      await handler({ q_sub_id: Q_SUB, section_key: 'device_description', content: PROSE }, CTX as never),
    );
    expect(out.ok).toBe(true);
    expect(enforceAuthorLineage).toHaveBeenCalledTimes(1);
    expect(enforceSourceAndAuthorLineage).not.toHaveBeenCalled();
    expect(out.lineage.citedSources).toBe(0);
    expect(out.lineage.note).toMatch(/No sources were cited/);
  });
});

describe('write_kit_section', () => {
  it('refuses without an identified author, before touching the database', async () => {
    const handler = getToolHandler('write_kit_section')!;
    const out = JSON.parse(
      await handler(
        { section_key: 'substantial-equivalence', content: PROSE },
        { organizationId: 5, userId: null } as never,
      ),
    );
    expect(out.error).toMatch(/requires user context/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('runs the source-and-author gate against the kit section row inside the write transaction', async () => {
    const handler = getToolHandler('write_kit_section')!;
    const out = JSON.parse(
      await handler(
        {
          section_key: 'substantial-equivalence',
          content: PROSE,
          sources: [{ evidence_source_id: 7, excerpt: 'The primary endpoint was met at week twelve in the intent-to-treat population.' }],
        },
        CTX as never,
      ),
    );
    expect(out.error).toBeUndefined();
    expect(enforceSourceAndAuthorLineage).toHaveBeenCalledTimes(1);
    const [exec, org, ref] = enforceSourceAndAuthorLineage.mock.calls[0] as unknown[];
    expect(exec).toBe(client);
    expect(org).toBe(5);
    expect(ref).toEqual({ documentTable: 'cerv2_510k_sections', documentId: '77' });
    expect(out.lineage.citedSources).toBe(1);
    expect(out.lineage.sourcesDropped).toEqual([]);
  });
});
