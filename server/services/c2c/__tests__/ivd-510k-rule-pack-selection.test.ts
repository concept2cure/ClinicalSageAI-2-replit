import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findActiveRulePack, listActiveRulePacks } from '../rule-pack-lookup';
import { scaffoldProjectDocuments } from '../scaffold-project-documents';
import { readProgramBinder, readProgramFolderIndex } from '../../vault/vault-folders';
import type { PoolClient } from 'pg';

const IVD = 'fda-estar-510k-ivd-v1.0';
const GENERIC = 'fda-estar-510k-v1.1';
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE c2c_rule_packs (
    doc_type text, agency text, version text, label text, required_sections jsonb,
    effective_from date, superseded_by text,
    PRIMARY KEY (doc_type, agency, version));`);
  const rows = [
    ['k510', 'fda', GENERIC, 'Non-IVD', [{ key: 'E5', label: 'Bench performance testing', path_order: 1 }], '2026-10-05'],
    ['k510', 'fda', IVD, 'IVD', [{ key: 'E9', label: 'Analytical performance', path_order: 1 }], '2026-11-14'],
    ['k510', 'ich', 'legacy-ich', 'Unrelated fallback', [], '2026-10-01'],
    ['denovo', 'fda', 'fda-estar-denovo-v1.1', 'De Novo', [], '2026-10-05'],
  ];
  for (const row of rows) await pg.query(
    'INSERT INTO c2c_rule_packs VALUES ($1,$2,$3,$4,$5,$6,NULL)',
    [row[0], row[1], row[2], row[3], JSON.stringify(row[4]), row[5]],
  );
});
afterAll(async () => { await pg.close(); });

describe('the recorded product chooses the FDA 510(k) outline', () => {
  it.each(['ivd', 'cdx'])('selects the IVD version for %s', async productType => {
    expect((await findActiveRulePack(pg, 'k510', 'fda', productType))?.version).toBe(IVD);
  });
  it.each([undefined, null, 'device', 'samd', 'drug', 'not-ivd'])('keeps the non-IVD pack for %s', async productType => {
    expect((await findActiveRulePack(pg, 'k510', 'fda', productType))?.version).toBe(GENERIC);
  });
  it('does not change another filing class', async () => {
    expect((await findActiveRulePack(pg, 'denovo', 'fda', 'ivd'))?.version).toBe('fda-estar-denovo-v1.1');
  });
  it('keeps the market listing on its existing default variant', async () => {
    expect((await listActiveRulePacks(pg)).find(row => row.doc_type === 'k510' && row.agency === 'fda')?.version).toBe(GENERIC);
  });
  it('uses the same IVD pack for the existing Vault binder', async () => {
    const result = await readProgramBinder(pg, '510k', 'FDA', 'ivd');
    expect(result.binder?.version).toBe(IVD);
    expect(result.binder?.nodes.map(node => node.key)).toEqual(['E9']);
  });
  it('reads the recorded product when a Vault caller supplies only the project id', async () => {
    const seen: string[] = [];
    const q = { query: async (sql: string, params?: unknown[]) => {
      seen.push(sql);
      if (sql.includes('FROM regulatory_programs')) return { rows: [{ program_type: '510k', primary_agency: 'FDA', product_type: 'ivd' }] };
      if (sql.includes('to_regclass')) return { rows: [{ packs: true, folders: false }] };
      return pg.query(sql, params);
    } };
    expect((await readProgramFolderIndex(q, '7b02f561-0ec1-4f5e-80f5-df2bf84fe234', 1, 'ivd')).binder?.version).toBe(IVD);
    expect(seen.find(sql => sql.includes('FROM regulatory_programs'))).toMatch(/SELECT[^;]*product_type/);
  });
  it('refuses a missing IVD pack without selecting the generic or ICH pack or inserting a document', async () => {
    await pg.query('UPDATE c2c_rule_packs SET superseded_by = $1 WHERE version = $2', ['held-for-test', IVD]);
    try {
      expect(await findActiveRulePack(pg, 'k510', 'fda', 'ivd')).toBeNull();
      expect(await findActiveRulePack(pg, 'k510', 'ich', 'ivd')).toBeNull();
      const statements: string[] = [];
      const client = { query: async (sql: string, params?: unknown[]) => {
        statements.push(sql);
        if (sql.includes('FROM c2c_documents')) return { rows: [] };
        return pg.query(sql, params);
      } };
      const result = await scaffoldProjectDocuments({
        client: client as unknown as PoolClient, orgId: 1, userId: 7,
        projectId: '7b02f561-0ec1-4f5e-80f5-df2bf84fe234',
        programType: '510k', primaryAgency: 'FDA', productType: 'ivd', productName: 'Assay',
      });
      expect(result.skipped).toBe('NO_RULE_PACK');
      expect(statements.some(sql => /INSERT INTO c2c_documents/.test(sql))).toBe(false);
      expect((await readProgramBinder(pg, '510k', 'FDA', 'ivd')).binder).toBeNull();
    } finally {
      await pg.query('UPDATE c2c_rule_packs SET superseded_by = NULL WHERE version = $1', [IVD]);
    }
  });
});
