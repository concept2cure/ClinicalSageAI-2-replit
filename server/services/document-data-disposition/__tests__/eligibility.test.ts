import { describe, expect, it } from 'vitest';
import {
  artifactDataEligibleSql,
  artifactOriginalFileAvailableSql,
  atomDataEligibleSql,
  atomOriginalFileAvailableSql,
  capturedBinaryAvailableSql,
  capturedDataEligibleSql,
  capturedDispositionChoiceSql,
  ragDataEligibleSql,
  ragOriginalFileAvailableSql,
  uploadedBinaryAvailableSql,
  vaultBinaryAvailableSql,
  vaultDataEligibleSql,
  vaultDispositionChoiceSql,
} from '../eligibility';

const helpers = {
  artifactDataEligibleSql,
  artifactOriginalFileAvailableSql,
  atomDataEligibleSql,
  atomOriginalFileAvailableSql,
  capturedBinaryAvailableSql,
  capturedDataEligibleSql,
  capturedDispositionChoiceSql,
  ragDataEligibleSql,
  ragOriginalFileAvailableSql,
  uploadedBinaryAvailableSql,
  vaultBinaryAvailableSql,
  vaultDataEligibleSql,
  vaultDispositionChoiceSql,
};

describe('disposition SQL alias validation', () => {
  for (const [name, helper] of Object.entries(helpers)) {
    it(`${name} accepts a SQL identifier and rejects SQL fragments`, () => {
      const sql=helper('source_2');
      expect(sql).toMatch(/organization_id/);
      expect(sql).toContain('source_2.');
      for (const alias of ['', '2source', 'source.id', 'source; DROP TABLE organizations', 'source--', 'source other', '"source"']) {
        expect(() => helper(alias)).toThrow('Invalid SQL alias');
      }
    });
  }
});
