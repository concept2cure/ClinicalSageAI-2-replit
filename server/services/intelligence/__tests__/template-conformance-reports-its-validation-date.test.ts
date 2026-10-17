/**
 * The readiness summary dates the template validation its conformance comes
 * from, and does not count a validation of unknown age as current.
 *
 * computeReadiness read the latest intelligence.template_validations row for
 * the draft and reported its conformance with no date: a validation of any age
 * read as the draft's current conformance, weighed 0.25 in the composite and
 * recommended on in the present tense ("Template conformance is 62%"). The
 * read also ordered validated_at DESC with NULLs first, so an undated row
 * outranked every dated one.
 *
 * Now the summary carries templateValidatedAt. A row with no readable date is
 * of unknown age: its figure is reported, the summary says its age is unknown,
 * and it stays out of the composite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));

const { computeReadiness } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');

const templateSql: string[] = [];

function stores(validatedAt: Date | null) {
  mockPool.query.mockImplementation((text: string) => {
    if (/EXISTS[\s\S]*intelligence\.pattern_warnings/.test(text)) return Promise.resolve({ rows: [{ reached: true }] });
    if (/FROM intelligence\.pattern_warnings/.test(text)) return Promise.resolve({ rows: [] });
    if (/intelligence\.template_validations/.test(text)) {
      templateSql.push(text);
      return Promise.resolve({ rows: [{ conformance_score: '0.62', template_name: 'FDA NDA', validated_at: validatedAt }] });
    }
    return Promise.resolve({ rows: [], rowCount: 0 }); // no model, no prior
  });
}

const DRAFT = { organizationId: 42, submissionType: 'NDA', targetAgency: 'FDA', presentSections: ['1.1', '1.2'] };

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset();
  templateSql.length = 0;
});

describe('computeReadiness — template conformance', () => {
  it('reports the date of the validation the figure comes from', async () => {
    stores(new Date('2026-09-01T09:30:00.000Z'));
    const summary = await computeReadiness(DRAFT);

    expect(summary.templateConformance).toBe(62);
    expect(summary.templateValidatedAt).toBe('2026-09-01T09:30:00.000Z');
    expect(summary.componentsAssessed).toContain('template_conformance');
    expect(summary.recommendations.some(r => r.includes('62%') && r.includes('2026-09-01T09:30:00.000Z'))).toBe(true);
    // The latest DATED validation is the latest; an undated row does not outrank it.
    expect(templateSql[0]).toMatch(/ORDER BY tv\.validated_at DESC NULLS LAST/);
  });

  it('treats a validation with no recorded date as of unknown age, not as current', async () => {
    stores(null);
    const summary = await computeReadiness(DRAFT);

    expect(summary.templateConformance).toBe(62);
    expect(summary.templateValidatedAt).toBeNull();
    expect(summary.componentsAssessed).not.toContain('template_conformance');
    expect(summary.componentsNotAssessed).toContain('template_conformance');
    expect(summary.recommendations.some(r => /62%/.test(r) && /no recorded date/i.test(r))).toBe(true);
    expect(summary.recommendations.some(r => /Template conformance is 62%/.test(r))).toBe(false);
  });
});
