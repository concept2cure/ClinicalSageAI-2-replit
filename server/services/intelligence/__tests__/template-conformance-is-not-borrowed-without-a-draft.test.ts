/**
 * computeReadiness does not borrow another draft's template conformance.
 *
 * What the code used to do (until 2026-10-15): with neither a projectId nor an
 * artifactId, the template-validation read was
 * `WHERE organization_id = $1 AND ($2 IS NULL OR …) AND ($3 IS NULL OR …)`, so it
 * matched the organization's latest validation of ANY draft and reported it as
 * this draft's templateConformance — counted in the composite at weight 0.25
 * and recommended on ("Template conformance was 62% …").
 *
 * Now, with neither, no validation can be tied to this draft: template
 * conformance is not assessed, says why, and nothing is read for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));

const { computeReadiness } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');

const templateReads: unknown[][] = [];

beforeEach(() => {
  _invalidateModelCacheForTests();
  templateReads.length = 0;
  mockPool.query.mockReset().mockImplementation((text: string, params: unknown[] = []) => {
    if (/EXISTS[\s\S]*intelligence\.pattern_warnings/.test(text)) return Promise.resolve({ rows: [{ reached: true }] });
    if (/FROM intelligence\.pattern_warnings/.test(text)) return Promise.resolve({ rows: [] });
    if (/intelligence\.template_validations/.test(text)) {
      templateReads.push(params);
      // The organization's latest validation — of some other draft.
      return Promise.resolve({ rows: [{ conformance_score: '0.62', template_name: 'FDA NDA', validated_at: new Date('2026-09-01T09:30:00.000Z') }] });
    }
    return Promise.resolve({ rows: [], rowCount: 0 }); // no model, no prior
  });
});

const UNSCOPED = { organizationId: 42, submissionType: 'NDA', targetAgency: 'FDA', presentSections: ['1.1', '1.2'] };

describe('computeReadiness — a draft with neither a project nor an artifact', () => {
  it('does not assess template conformance, and says why', async () => {
    const summary = await computeReadiness(UNSCOPED);

    expect(summary.templateConformance, "the organization's latest validation of another draft was reported as this draft's").toBeNull();
    expect(summary.templateName).toBeNull();
    expect(summary.templateValidatedAt).toBeNull();
    expect(summary.componentsAssessed).not.toContain('template_conformance');
    expect(summary.componentsNotAssessed).toContain('template_conformance');
    expect(summary.recommendations.some(r => /Template conformance not assessed/.test(r) && /project or artifact/.test(r))).toBe(true);
    expect(summary.recommendations.some(r => /62%/.test(r))).toBe(false);
    expect(templateReads).toEqual([]);
  });

  it('still reads the validation of the draft it is given', async () => {
    const summary = await computeReadiness({ ...UNSCOPED, artifactId: 'artifact-7' });

    expect(templateReads).toHaveLength(1);
    expect(templateReads[0]).toEqual([42, null, 'artifact-7']);
    expect(summary.templateConformance).toBe(62);
    expect(summary.componentsAssessed).toContain('template_conformance');
  });
});
