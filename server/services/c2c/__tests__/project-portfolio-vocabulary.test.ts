/**
 * The portfolio card projects what it can stand behind, in the one pathway
 * vocabulary (2026-10-31 client demo).
 *
 *   • No `blocker`: it was a literal `NULL::text AS blocker`, so the Projects
 *     list's Blocker column read "—" on every row. Nothing at list level
 *     assesses a blocker; the field is gone, not faked.
 *   • The pathway filter admits the drug and biologic applications: every IND
 *     and NDA was filed under "Other", so filtering to an IND found nothing.
 *     The filter's choices are REGULATORY_PATHWAYS itself, so the client's chips
 *     and the server's filter cannot disagree.
 */
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PROJECT_CARD_CREATED_SQL, PROJECT_CARD_LIST_SQL, portfolioPathwayFilter } from '../project-portfolio';
import { REGULATORY_PATHWAYS } from '../../../../shared/constants/mdx';
import { pathwaySqlCase } from '../../../../shared/constants/domain/product-types';

describe('the portfolio card', () => {
  it('projects no blocker, in the list and in the creator’s 201', () => {
    for (const sql of [PROJECT_CARD_LIST_SQL, PROJECT_CARD_CREATED_SQL]) {
      expect(sql).not.toMatch(/\bAS blocker\b/i);
    }
  });

  it('filters by a drug or biologic pathway, and refuses one outside the vocabulary', () => {
    for (const pathway of ['ind', 'nda', 'bla', 'anda', 'cta', 'maa', 'de_novo', 'k510']) {
      expect(portfolioPathwayFilter(pathway)).toBe(pathway);
    }
    expect(portfolioPathwayFilter('all')).toBeNull();
    expect(() => portfolioPathwayFilter('IND')).toThrow('INVALID_PORTFOLIO_FILTER');
    expect(() => portfolioPathwayFilter('made_up')).toThrow('INVALID_PORTFOLIO_FILTER');
  });

  it('classifies an IND, an NDA and a De Novo in SQL as the filter names them', async () => {
    const db = new PGlite();
    try {
      const sql = pathwaySqlCase('p.program_type', 'p.regulatory_path');
      const read = async (programType: string, path: string | null) => (await db.query<{ pathway: string }>(
        `SELECT ${sql} AS pathway FROM (SELECT $1::text AS program_type, $2::text AS regulatory_path) p`, [programType, path],
      )).rows[0].pathway;
      expect(await read('ind', null)).toBe('ind');
      expect(await read('nda', null)).toBe('nda');
      expect(await read('de_novo', null)).toBe('de_novo');
      expect(await read('510k', '510k')).toBe('k510');
      for (const pathway of [await read('ind', null), await read('nda', null)]) {
        expect(REGULATORY_PATHWAYS).toContain(pathway);
      }
    } finally {
      await db.close();
    }
  });
});
