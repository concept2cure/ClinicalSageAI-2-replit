/**
 * The ICH M2–M5 record cites ICH Q2(R2) for analytical-procedure validation,
 * never the superseded Q2(R1) (Q2(R2) replaced it at Step 4 on 2023-11-01).
 *
 * Carried over from tests/schema-contract/regulatory-templates-cite-q2r2.contract.test.ts
 * (D2 cleanup S05a, 2026-10-26). That pin read db/migrations/100_regulatory_templates.sql,
 * a seed on no applier that was deleted with it; the briefs a sponsor drafts to
 * are the record's, so the pin now reads the record.
 */
import { describe, expect, it } from 'vitest';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';

const text = (code: string) => JSON.stringify(CTD_AUTHORING_GUIDANCE[code] ?? null);

describe('the record cites ICH Q2(R2)', () => {
  it('no brief cites Q2(R1)', () => {
    const r1 = Object.values(CTD_AUTHORING_GUIDANCE).filter((s) => JSON.stringify(s).includes('Q2(R1)')).map((s) => s.code);
    expect(r1).toEqual([]);
  });

  it.each(['3.2.S.4.2', '3.2.S.4.3', '3.2.P.5.2', '3.2.P.5.3'])('%s cites Q2(R2)', (code) => {
    expect(text(code)).toContain('Q2(R2)');
  });
});
