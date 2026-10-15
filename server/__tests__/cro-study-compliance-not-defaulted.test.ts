/**
 * A CRO study nothing has assessed is not "compliant".
 *
 * cro_studies.compliance_status was NOT NULL DEFAULT 'compliant', so every
 * study created through POST /api/cro/studies (which asks only for a client,
 * a number and a title) read 'compliant' in GET /api/cro/studies. The table's
 * DDL comes from this model (drizzle push; no deploy-set migration creates
 * it), so the model is what is tested.
 */
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { croStudies } from '../../shared/schema';

describe('cro_studies.compliance_status', () => {
  it('has no default and may be null: not assessed', () => {
    const col = getTableConfig(croStudies).columns.find((c) => c.name === 'compliance_status');
    expect(col).toBeDefined();
    expect(col!.hasDefault).toBe(false);
    expect(col!.notNull).toBe(false);
  });
});
