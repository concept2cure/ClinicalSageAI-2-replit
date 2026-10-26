import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as mdx from '../../mdx';
import * as productTypes from '../product-types';
import { REGIONAL_DEVICE_APPLICATION_CLASSES } from '../../../regulatory/filing-catalog';

const cases: Array<[string | null, string | null, string]> = [
  ['510K', null, 'k510'], [' 510(K) ', null, 'k510'], ['de-novo', null, 'k510'],
  ['PMA', null, 'pma'], ['CER', null, 'cer'], ['MDR', '510k', 'cer'],
  ['MDR_TD', 'pma', 'cer'], ['IVDR_TD', '510k', 'ivdr'], ['IVD', '510k', 'k510'],
  ['IVDR', null, 'ivdr'], ['IDE', null, 'ide'], ['device', null, 'device'],
  ['HDE', null, 'hde'], ['MDL', null, 'mdl'], ['ivd_licence', null, 'ivd_licence'],
  ['SHONIN', null, 'shonin'], ['ninsho', null, 'ninsho'], ['todokede', null, 'todokede'],
  ['IVD_APPROVAL', null, 'ivd_approval'], ['JP_CDX', null, 'jp_cdx'],
  ['unknown', 'IVDR', 'ivdr'], ['unknown', 'unknown', 'other'],
  ['IND', null, 'other'], [null, null, 'other'], ['', '', 'other'],
  ['__proto__', 'constructor', 'other'],
];

describe('shared portfolio pathway classification', () => {
  let db: PGlite;
  beforeAll(async () => { db = new PGlite(); await db.waitReady; });
  afterAll(async () => { await db.close(); });

  it.each(cases)('keeps JS and SQL consistent for %s / %s', async (programType, regulatoryPath, expected) => {
    expect(mdx.pathwayForProgram(programType, regulatoryPath)).toBe(expected);
    const sql = productTypes.pathwaySqlCase('p.program_type', 'p.regulatory_path');
    const result = await db.query<{ pathway: string }>(
      `SELECT ${sql} AS pathway FROM (SELECT $1::text AS program_type, $2::text AS regulatory_path) p`,
      [programType, regulatoryPath],
    );
    expect(result.rows[0].pathway).toBe(expected);
  });

  it('classifies every admitted regional device application', () => {
    for (const filing of REGIONAL_DEVICE_APPLICATION_CLASSES) {
      expect(mdx.pathwayForProgram(filing.docType, null)).not.toBe('other');
    }
  });

  it('has a label for every declared pathway, including Other', () => {
    expect(mdx.REGULATORY_PATHWAYS).toContain('other');
    for (const pathway of mdx.REGULATORY_PATHWAYS) expect(mdx.PATHWAY_LABEL[pathway]).toBeTruthy();
  });
});
