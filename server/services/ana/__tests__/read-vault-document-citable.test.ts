/**
 * Ledger L154, residual: a retrieval tool that hands the model text to quote
 * must also hand it something to cite with.
 *
 * `read_vault_document` returns the CONTENT of a Data Room artifact — the words
 * AnA then reproduces into a filing section. It returned no
 * `cre_evidence_sources.id`, and a drafting tool can only record a verified
 * quote against one. So every clause drawn from a vault document fell to author
 * (or machine-draft) lineage, and the evidence behind a filed sentence was
 * unrecoverable — not because the source was unknown, but because the id was
 * dropped between reading and writing.
 *
 * What this pins is the contract: the id is RESOLVED (existence + tenant
 * ownership, through the one resolver the drafting tools use), null when it
 * cannot be, and the hint tells the truth in both cases. The resolver itself is
 * proven elsewhere; a guessed id is the thing to prevent here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { pool, resolveEvidenceSourceIdsByArtifact } = vi.hoisted(() => {
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM concept2cure_artifacts')) {
        const wanted = String(params?.[1] ?? '');
        if (wanted === 'missing') return { rows: [] };
        return {
          rows: [
            {
              id: 3,
              artifact_id: wanted,
              title: 'Bench test report',
              type: 'report',
              category: 'engineering',
              ctd_section: '4.2',
              status: 'final',
              version: 2,
              content: 'The device met the acceptance criterion at every tested condition.',
              content_hash: 'abc',
              created_at: 't0',
              updated_at: 't1',
              locked_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    }),
    connect: vi.fn(),
  };
  // 'art-known' is this tenant's; nothing else resolves.
  const resolveEvidenceSourceIdsByArtifact = vi.fn(async (_org: number, keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) if (k === 'art-known') m.set(k, 12);
    return m;
  });
  return { pool, resolveEvidenceSourceIdsByArtifact };
});

vi.mock('../../../db', () => ({ getPool: () => pool, pool, db: {} }));
vi.mock('../../clinical-regulatory-evidence/retrieval-source-link', () => ({
  resolveEvidenceSourceIdsByArtifact,
}));

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 5, userId: 41, organizationUuid: 'org-uuid' };

beforeEach(() => {
  pool.query.mockClear();
  resolveEvidenceSourceIdsByArtifact.mockClear();
});

describe('read_vault_document — what the model can cite', () => {
  it('returns the resolved evidence_source_id and says how to pass it', async () => {
    const out = JSON.parse(
      await getToolHandler('read_vault_document')!({ artifact_id: 'art-known' }, CTX as never),
    );
    expect(out.ok).toBe(true);
    expect(out.evidence_source_id).toBe(12);
    // The hint has to name the actual id and the actual parameter, or it is
    // decoration: the model has to know what to put where.
    expect(out.citation_hint).toContain('evidence_source_id: 12');
    expect(out.citation_hint).toContain('excerpt');
  });

  it('is null — and says so — when the artifact has no Data Room source', async () => {
    const out = JSON.parse(
      await getToolHandler('read_vault_document')!({ artifact_id: 'art-orphan' }, CTX as never),
    );
    expect(out.ok).toBe(true);
    expect(out.evidence_source_id).toBeNull();
    expect(out.citation_hint).toMatch(/does not resolve|cannot be recorded|not as evidence/i);
    // Honest silence, never a plausible-looking number.
    expect(JSON.stringify(out)).not.toMatch(/evidence_source_id":\s*\d/);
  });

  it('resolves through the tenant-checking resolver, not from the row it just read', async () => {
    await getToolHandler('read_vault_document')!({ artifact_id: 'art-known' }, CTX as never);
    expect(resolveEvidenceSourceIdsByArtifact).toHaveBeenCalledTimes(1);
    expect(resolveEvidenceSourceIdsByArtifact.mock.calls[0][0]).toBe(5);
    expect(resolveEvidenceSourceIdsByArtifact.mock.calls[0][1]).toEqual(['art-known']);
  });

  it('still returns the document when attribution prep fails — a read is not lost to it', async () => {
    resolveEvidenceSourceIdsByArtifact.mockRejectedValueOnce(new Error('resolver down'));
    const out = JSON.parse(
      await getToolHandler('read_vault_document')!({ artifact_id: 'art-known' }, CTX as never),
    );
    expect(out.ok).toBe(true);
    expect(out.content).toContain('acceptance criterion');
    expect(out.evidence_source_id).toBeNull();
  });
});
