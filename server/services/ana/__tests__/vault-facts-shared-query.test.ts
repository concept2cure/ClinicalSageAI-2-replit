/**
 * One Vault read serves both the submission plan and anything that must open
 * the documents the plan counted (the dossier reconciler).
 *
 * readVaultDocuments returns each document's id beside the facts the plan
 * reads; readVaultFacts is built on it. They issue the same statement, with
 * the same organization and program scoping, so a reader of document ids can
 * never see a different set of documents than the plan tool does — and the
 * plan's facts are unchanged by the id column.
 */
import { describe, it, expect } from 'vitest';
import * as tools from '../regulatory-knowledge-tools';
import { VAULT_FACTS_MAX, readVaultFacts, type KnowledgeQueryable } from '../regulatory-knowledge-tools';

const ORG = 7;
const PROGRAM = '11111111-2222-4333-8444-555555555555';

type Row = Record<string, unknown>;

function recordingPool(rows: Row[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool: KnowledgeQueryable = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    },
  };
  return { pool, calls };
}

const ROWS: Row[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', ctd_section: '5.3.5.1', folder_id: 'module-5', evidence_kind: 'csr', placement_status: 'confirmed', document_title: 'CSR Study 301' },
  { id: 'a0000000-0000-4000-8000-000000000002', ctd_section: null, folder_id: 'module-5', evidence_kind: 'csr', placement_status: 'suggested', document_title: 'CSR Study 302' },
  { id: 'a0000000-0000-4000-8000-000000000003', ctd_section: '1.14.1', folder_id: null, evidence_kind: null, placement_status: 'confirmed', document_title: 'USPI draft' },
];

/** The WHERE clause through LIMIT, whitespace-normalised. */
const whereOf = (sql: string): string => {
  const m = /\bJOIN\b[\s\S]*\bLIMIT\b\s*\$3/.exec(sql);
  return m ? m[0].replace(/\s+/g, ' ') : '';
};

describe('the Vault facts query that also returns document ids', () => {
  it('is exported beside readVaultFacts', () => {
    expect(typeof (tools as Record<string, unknown>).readVaultDocuments).toBe('function');
  });

  it('issues the identical scoped statement and parameters as readVaultFacts, and selects d.id', async () => {
    const readVaultDocuments = (tools as Record<string, unknown>).readVaultDocuments as typeof readVaultFacts;
    expect(typeof readVaultDocuments).toBe('function');
    const a = recordingPool(ROWS);
    const b = recordingPool(ROWS);
    await readVaultFacts(a.pool, ORG, PROGRAM);
    await readVaultDocuments(b.pool, ORG, PROGRAM);
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    // One statement, not a fork: the text is the same, so the scoping is too.
    expect(b.calls[0].sql).toBe(a.calls[0].sql);
    expect(b.calls[0].params).toEqual(a.calls[0].params);
    expect(a.calls[0].params).toEqual([ORG, PROGRAM, VAULT_FACTS_MAX + 1]);
    const where = whereOf(a.calls[0].sql);
    expect(where).toContain('rp.organization_id = $1');
    expect(where).toContain('WHERE d.program_id = $2');
    expect(where).toContain('d.deleted_at IS NULL');
    expect(whereOf(b.calls[0].sql)).toBe(where);
    expect(b.calls[0].sql).toMatch(/SELECT\s+d\.id\b/);
  });

  it('returns each document id with the same facts readVaultFacts returns', async () => {
    const readVaultDocuments = (tools as Record<string, unknown>).readVaultDocuments as (
      pool: KnowledgeQueryable, organizationId: number, programId: string,
    ) => Promise<{ documents: Array<Record<string, unknown>>; truncated: boolean }>;
    expect(typeof readVaultDocuments).toBe('function');
    const docs = await readVaultDocuments(recordingPool(ROWS).pool, ORG, PROGRAM);
    const facts = await readVaultFacts(recordingPool(ROWS).pool, ORG, PROGRAM);
    expect(docs.documents.map((d) => d.id)).toEqual(ROWS.map((r) => r.id));
    expect(docs.documents.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'id')))).toEqual(facts.facts);
    expect(docs.truncated).toBe(false);
  });

  it('leaves the plan’s facts exactly as they were: no id, same fields', async () => {
    const { facts } = await readVaultFacts(recordingPool(ROWS).pool, ORG, PROGRAM);
    expect(facts).toEqual([
      { ctdSection: '5.3.5.1', folderId: 'module-5', evidenceKind: 'csr', placementStatus: 'confirmed', title: 'CSR Study 301' },
      { ctdSection: null, folderId: 'module-5', evidenceKind: 'csr', placementStatus: 'suggested', title: 'CSR Study 302' },
      { ctdSection: '1.14.1', folderId: null, evidenceKind: null, placementStatus: 'confirmed', title: 'USPI draft' },
    ]);
    for (const f of facts) expect(Object.keys(f)).not.toContain('id');
  });

  it('cuts both reads at the same cap and says so in both', async () => {
    const readVaultDocuments = (tools as Record<string, unknown>).readVaultDocuments as (
      pool: KnowledgeQueryable, organizationId: number, programId: string,
    ) => Promise<{ documents: unknown[]; truncated: boolean }>;
    expect(typeof readVaultDocuments).toBe('function');
    const many = Array.from({ length: VAULT_FACTS_MAX + 1 }, (_, i) => ({ ...ROWS[0], id: `id-${i}` }));
    const docs = await readVaultDocuments(recordingPool(many).pool, ORG, PROGRAM);
    const facts = await readVaultFacts(recordingPool(many).pool, ORG, PROGRAM);
    expect(docs.documents).toHaveLength(VAULT_FACTS_MAX);
    expect(facts.facts).toHaveLength(VAULT_FACTS_MAX);
    expect(docs.truncated).toBe(true);
    expect(facts.truncated).toBe(true);
  });

  it('a failed read throws from both; neither reports an empty Vault', async () => {
    const readVaultDocuments = (tools as Record<string, unknown>).readVaultDocuments as typeof readVaultFacts;
    expect(typeof readVaultDocuments).toBe('function');
    const failing: KnowledgeQueryable = { async query() { throw new Error('relation "vault.documents" does not exist'); } };
    await expect(readVaultFacts(failing, ORG, PROGRAM)).rejects.toThrow();
    await expect(readVaultDocuments(failing, ORG, PROGRAM)).rejects.toThrow();
  });
});
