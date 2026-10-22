/** VR-18 (row D2): the one metadata predicate over vault.documents. The parser
 * refuses what the Vault does not record; the in-app search and the public API
 * build their predicates here and nowhere else. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseVaultFilters, vaultFilterSql, VAULT_LIFECYCLE_STAGE_FILTERS } from '../vault-document-filter';
import { VAULT_CLASSIFICATIONS as SCHEMA_CLASSIFICATIONS } from '../vault-document-index.service';
import { VAULT_CLASSIFICATIONS } from '../../../../shared/constants/domain/vault-taxonomy';

describe('parseVaultFilters', () => {
  it('reads repeated parameters and comma lists, drops blanks and duplicates, normalises CTD codes', () => {
    const r = parseVaultFilters({ documentType: ['CSR', 'SAR,CSR', ''], ctdSection: 'm3.2.p.5, 3.2.P.5', classification: '' });
    expect(r).toEqual({ filters: { documentTypes: ['CSR', 'SAR'], ctdSections: ['3.2.P.5'] } });
  });

  it('checks a folder against the program view, and refuses one with no view', () => {
    expect(parseVaultFilters({ folderId: 'module-3' }, { view: 'pharma' })).toEqual({ filters: { folderIds: ['module-3'] } });
    expect(parseVaultFilters({ folderId: 'module-3' })).toMatchObject({ refusal: { parameter: 'folderId' } });
    expect(parseVaultFilters({ folderId: 'module-9' }, { view: 'pharma' })).toMatchObject({ refusal: { error: 'INVALID_FILTER', parameter: 'folderId' } });
  });

  it('refuses more than twenty values in one dimension rather than truncating', () => {
    const many = Array.from({ length: 21 }, (_, i) => `3.${i}`);
    expect(parseVaultFilters({ ctdSection: many })).toMatchObject({ refusal: { parameter: 'ctdSection' } });
  });

  it('offers "none" (not sent for review) beside every canonical stage', () => {
    expect(VAULT_LIFECYCLE_STAGE_FILTERS[0]).toBe('none');
    expect(parseVaultFilters({ lifecycleStage: 'none,approved' })).toEqual({ filters: { lifecycleStages: ['none', 'approved'] } });
  });
});

describe('vaultFilterSql', () => {
  it('appends after the positions already bound and leaves them where they are', () => {
    const params: unknown[] = [7, 'q', ['p']];
    const sql = vaultFilterSql({ documentTypes: ['CSR'], placementStatuses: ['unfiled', 'suggested'] }, params, 'd');
    expect(params).toEqual([7, 'q', ['p'], ['CSR']]);
    expect(sql).toContain('d.document_type = ANY($4::text[])');
    expect(sql).toMatch(/d\.folder_id IS NULL OR COALESCE\(d\.placement_status, 'unfiled'\) = 'unfiled'\) OR \(d\.folder_id IS NOT NULL AND d\.placement_status = 'suggested'\)/);
  });

  it('keeps the public API exact: a raw CTD string, no whole-segment widening', () => {
    const params: unknown[] = [1];
    const sql = vaultFilterSql({ ctdSections: ['3.2.P'] }, params, 'd', { ctdMatch: 'exact' });
    expect(sql).toBe(' AND d.ctd_section = ANY($2::text[])');
    expect(params).toEqual([1, ['3.2.P']]);
  });
});

describe('one vocabulary, one predicate', () => {
  it('the taxonomy classifications are the schema enum, in the same order', () => {
    expect([...VAULT_CLASSIFICATIONS]).toEqual([...SCHEMA_CLASSIFICATIONS]);
  });

  it('no other server module that reads vault.documents builds its own metadata predicate', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|js|mjs)$/.test(entry.name) || p.endsWith(path.join('vault', 'vault-document-filter.ts'))) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (!/FROM vault\.documents/.test(src)) continue;
        if (/\bd\.(document_type|classification(::text)?|evidence_kind|ctd_section)\s*=\s*(\$|ANY\()/.test(src)) offenders.push(p);
      }
    };
    walk('server');
    expect(offenders).toEqual([]);
  });
});
