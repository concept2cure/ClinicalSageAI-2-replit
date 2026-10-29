/**
 * The submission readiness twin records only what it assessed.
 *
 * What it used to do (fabrication sweep 2026-10-15, intelligence/innovation #29):
 *  - a conditional criterion with no content was 'not_applicable' and scored 100,
 *    so every unaddressed conditional requirement RAISED readiness, and one such
 *    criterion on its own scored a program 100% ready;
 *  - completeness was 100 when no mandatory criterion was on file; consistency was
 *    100 minus the spread of the criterion scores, quality their mean, compliance
 *    a share no automated run could move off 0 — none of them measured;
 *  - with no criteria on file it still recorded a completed assessment scoring 0;
 *  - generatePredictions returned the latest score (0 when there was none) as
 *    "predictedScore" with an invented ±5 confidenceInterval;
 *  - getDashboard reported trend 'stable' / delta 0 from fewer than two points,
 *    and unmetCriteriaCount 0 when the stored count was NULL;
 *  - the constructor seeded 20 FDA NDA criteria with invented weights at runtime,
 *    outside the migration set (CLAUDE.md RULE 1);
 *  - a criterion or assessment the INSERT did not return was returned anyway,
 *    with a random id, as if stored; every gap carried an invented 4 h / 16 h
 *    effort estimate; and an assessment was filed under the type as typed
 *    ('NDA') while the dashboard looks it up by registry id ('US_NDA').
 */
import { describe, it, expect, vi } from 'vitest';

type Row = Record<string, unknown>;
type Route = (text: string, params: unknown[]) => Row[] | undefined;

const flat = (t: string) => t.replace(/\s+/g, ' ').trim();

/** One query function behind both pool.query and the checked-out client. */
function harness(route: Route) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text: flat(text), params });
    const rows = route(flat(text), params) ?? [];
    return { rows, rowCount: rows.length };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  const issued = (prefix: string) => calls.filter((c) => c.text.startsWith(prefix));
  return { pool, issued, calls, client };
}

async function loadService(pool: unknown) {
  vi.resetModules();
  const { SubmissionReadinessTwinService } = await import('../submission-readiness-twin-service');
  const service = new SubmissionReadinessTwinService(pool as never);
  // The constructor's table check is not awaited; let it finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return service;
}

const criterion = (over: Row): Row => ({
  id: `c-${String(over.criterion_code)}`,
  submission_type: 'US_NDA',
  agency: 'FDA',
  module_path: 'm1',
  criterion_name: String(over.criterion_code),
  description: `content for ${String(over.criterion_code)}`,
  requirement_type: 'mandatory',
  condition_expression: null,
  weight: 1,
  impact_on_rejection: null,
  guidance_reference: null,
  regulation_reference: null,
  is_active: true,
  effective_date: null,
  ...over,
});

const ASSESSMENT_INSERT = 'INSERT INTO innovation.readiness_twin_assessments';
const EVALUATION_INSERT = 'INSERT INTO innovation.readiness_criterion_evaluations';

/** Answers the reads and writes runAssessment issues. */
function assessmentRoute(criteria: Row[], { returnAssessment = true } = {}): Route {
  return (text, params) => {
    if (text.startsWith('SELECT COUNT(*)::int AS cnt FROM innovation.readiness_criteria')) return [{ cnt: 1 }];
    if (text.startsWith('SELECT * FROM innovation.readiness_criteria')) return criteria;
    if (text.startsWith(ASSESSMENT_INSERT) && returnAssessment) {
      return [{
        id: 'a-1', program_id: params[0], submission_type: params[1], target_agency: params[2],
        overall_readiness_score: params[3], module_scores: JSON.parse(String(params[4])),
        completeness_score: params[5], quality_score: params[6], consistency_score: params[7],
        compliance_score: params[8], predicted_approval_probability: params[9],
        predicted_review_time_days: params[10], predicted_deficiency_count: params[11],
        risk_factors: JSON.parse(String(params[12])), status: 'completed', assessed_at: new Date(),
      }];
    }
    return undefined;
  };
}

const CLINICAL_OVERVIEW = criterion({ criterion_code: 'clinical_overview', module_path: 'm2.5', weight: 2 });
const PEDIATRIC_PLAN = criterion({
  criterion_code: 'pediatric_plan',
  criterion_name: 'Pediatric Study Plan',
  requirement_type: 'conditional',
});
const PRESENT = new Map([['m2.5', 'module 2.5 text']]);

describe('runAssessment', () => {
  it('does not score a conditional criterion whose applicability nobody determined', async () => {
    const { pool, issued } = harness(assessmentRoute([CLINICAL_OVERVIEW, PEDIATRIC_PLAN]));
    const service = await loadService(pool);
    const result = await service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    // Only the clinical overview was scored: content present, adequacy unreviewed.
    expect(result.overallReadinessScore).toBe(50);
    expect(issued(EVALUATION_INSERT).map((c) => c.params[1])).toEqual(['c-clinical_overview']);
    expect(JSON.stringify(result.riskFactors)).toMatch(/Applicability not determined: Pediatric Study Plan/);
  });

  it('records no score when the only criterion is a conditional one nobody determined', async () => {
    const { pool, issued } = harness(assessmentRoute([PEDIATRIC_PLAN]));
    const service = await loadService(pool);
    await expect(service.runAssessment('prog-1', 'NDA', 'FDA')).rejects.toThrow(/could be scored/);
    expect(issued(ASSESSMENT_INSERT)).toHaveLength(0);
  });

  it('records no assessment when no criteria are on file', async () => {
    const { pool, issued } = harness(assessmentRoute([]));
    const service = await loadService(pool);
    await expect(service.runAssessment('prog-1', 'NDA', 'FDA')).rejects.toThrow(
      /No readiness criteria on file for US_NDA \/ FDA/,
    );
    expect(issued(ASSESSMENT_INSERT)).toHaveLength(0);
  });

  it('leaves unmeasured dimensions null instead of 100 or 0', async () => {
    const { pool, issued } = harness(
      assessmentRoute([criterion({ criterion_code: 'patent_info', requirement_type: 'recommended' })]),
    );
    const service = await loadService(pool);
    await service.runAssessment('prog-1', 'NDA', 'FDA');
    const [insert] = issued(ASSESSMENT_INSERT);
    // completeness (no mandatory criterion), quality, consistency, compliance
    expect(insert.params.slice(5, 9)).toEqual([null, null, null, null]);
  });

  it('measures completeness as mandatory content present, the one thing it checks', async () => {
    const { pool, issued } = harness(
      assessmentRoute([CLINICAL_OVERVIEW, criterion({ criterion_code: 'drug_product', module_path: 'm3.2.p' })]),
    );
    const service = await loadService(pool);
    await service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    expect(issued(ASSESSMENT_INSERT)[0].params[5]).toBe(50);
  });

  it('attaches no effort estimate nobody made', async () => {
    const { pool, issued } = harness(assessmentRoute([CLINICAL_OVERVIEW]));
    const service = await loadService(pool);
    await service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    expect(issued(EVALUATION_INSERT)[0].params[8]).toBeNull();
  });

  it('files the assessment under the registry id the dashboard reads it by', async () => {
    const { pool, issued } = harness(assessmentRoute([CLINICAL_OVERVIEW]));
    const service = await loadService(pool);
    await service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    expect(issued(ASSESSMENT_INSERT)[0].params[1]).toBe('US_NDA');
  });

  it('ranks a mandatory gap first among the top risks', async () => {
    // `severityOrder[s] || 2` read 'high' (0) as 2, below every 'medium'.
    const recommended = Array.from({ length: 11 }, (_, i) =>
      criterion({ criterion_code: `recommended_${i}`, requirement_type: 'recommended' }),
    );
    const { pool } = harness(assessmentRoute([...recommended, criterion({ criterion_code: 'form_356h' })]));
    const service = await loadService(pool);
    const result = await service.runAssessment('prog-1', 'NDA', 'FDA');
    expect((result.riskFactors as unknown as Array<{ risk: string }>)[0].risk).toBe('Gap in: form_356h');
  });

  it('fails rather than returning an assessment the INSERT did not return', async () => {
    const { pool, issued } = harness(assessmentRoute([CLINICAL_OVERVIEW], { returnAssessment: false }));
    const service = await loadService(pool);
    await expect(service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT)).rejects.toThrow(/not recorded/);
    expect(issued('COMMIT')).toHaveLength(0);
  });
});

describe('createCriteria', () => {
  it('fails rather than returning a criterion the INSERT did not return', async () => {
    const { pool } = harness(() => undefined);
    const service = await loadService(pool);
    await expect(
      service.createCriteria({ programId: 'prog-1', category: 'm1', name: 'Cover letter', description: 'x', weight: 1 }),
    ).rejects.toThrow(/not recorded/);
  });
});

describe('construction', () => {
  it('seeds no criteria outside the migration set', async () => {
    const { pool, issued } = harness((text) =>
      text.startsWith('SELECT COUNT(*)') ? [{ cnt: 0 }] : undefined,
    );
    await loadService(pool);
    expect(issued('INSERT INTO innovation.readiness_criteria')).toHaveLength(0);
  });
});

describe('generatePredictions', () => {
  it('has no score, and no interval, for a program never assessed', async () => {
    const { pool } = harness(() => undefined);
    const service = await loadService(pool);
    expect(await service.generatePredictions('prog-1')).toEqual({ latestRecordedScore: null });
  });

  it('returns the latest recorded score as recorded, without an invented interval', async () => {
    const { pool } = harness((text) =>
      text.startsWith('SELECT overall_readiness_score') ? [{ overall_readiness_score: '72.5' }] : undefined,
    );
    const service = await loadService(pool);
    expect(await service.generatePredictions('prog-1')).toEqual({ latestRecordedScore: 72.5 });
  });
});

describe('getDashboard', () => {
  const assessmentRow = {
    id: 'a-1', program_id: 'prog-1', submission_type: 'US_NDA', target_agency: 'FDA',
    overall_readiness_score: 20, module_scores: {}, predicted_review_time_days: null,
    predicted_deficiency_count: null, risk_factors: [], status: 'completed', assessed_at: new Date(),
  };
  const evaluation = (status: string, score: unknown, module_path = 'm1') => ({
    status, score, module_path, requirement_type: 'mandatory', criterion_name: status,
    gaps_identified: [], recommendations: [], estimated_effort_hours: null,
  });
  const dashboardRoute = (evaluations: Row[], trends: Row[]): Route => (text) => {
    if (text.startsWith('SELECT * FROM innovation.readiness_twin_assessments')) return [assessmentRow];
    if (text.startsWith('SELECT ce.*')) return evaluations;
    if (text.startsWith('SELECT * FROM innovation.readiness_trends')) return trends;
    return undefined;
  };

  it('reports the trend unknown from a single point, and counts unmet criteria from the evaluations', async () => {
    const { pool } = harness(
      dashboardRoute(
        [evaluation('not_met', 0), evaluation('not_met', 0), evaluation('partially_met', 50)],
        [{ overall_score: 20, trend_date: '2026-10-15' }],
      ),
    );
    const service = await loadService(pool);
    const dashboard = await service.getDashboard('prog-1', 'NDA', 'FDA');
    expect({ trend: dashboard.trend, trendDelta: dashboard.trendDelta }).toEqual({ trend: 'unknown', trendDelta: null });
    expect(dashboard.assessmentOutlook.unmetCriteriaCount).toBe(3);
  });

  it('averages module scores as numbers when the driver returns NUMERIC as text', async () => {
    const { pool } = harness(dashboardRoute([evaluation('partially_met', '50'), evaluation('not_met', '0')], []));
    const service = await loadService(pool);
    const dashboard = await service.getDashboard('prog-1', 'NDA', 'FDA');
    expect(dashboard.moduleReadiness.map((m) => m.score)).toEqual([25]);
  });
});

describe('getAssessmentHistory', () => {
  it('reads a recorded zero as zero, not as absent', async () => {
    const { pool } = harness((text) =>
      text.startsWith('SELECT * FROM innovation.readiness_twin_assessments')
        ? [{ id: 'a-1', overall_readiness_score: 0, completeness_score: 0, predicted_deficiency_count: 0 }]
        : undefined,
    );
    const service = await loadService(pool);
    const [assessment] = await service.getAssessmentHistory('prog-1');
    expect([assessment.completenessScore, assessment.predictedDeficiencyCount]).toEqual([0, 0]);
  });
});

describe('P-70: no session setting widens the tenant scope', () => {
  const SWITCH = /app\.(bypass_rls|is_admin)/;

  it('runAssessment and createCriteria set neither app.bypass_rls nor app.is_admin', async () => {
    const { pool, calls } = harness(assessmentRoute([CLINICAL_OVERVIEW]));
    const service = await loadService(pool);
    await service.runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    await service
      .createCriteria({ programId: 'prog-1', category: 'm1', name: 'Cover letter', description: 'x', weight: 1 })
      .catch(() => undefined);
    expect(calls.filter((c) => SWITCH.test(c.text)).map((c) => c.text)).toEqual([]);
  });

  it('returns the connection after an assessment, and destroys it when the rollback cannot be confirmed', async () => {
    const ok = harness(assessmentRoute([CLINICAL_OVERVIEW]));
    await (await loadService(ok.pool)).runAssessment('prog-1', 'NDA', 'FDA', PRESENT);
    expect(ok.client.release).toHaveBeenLastCalledWith(false);

    const broken = harness(assessmentRoute([]));
    const query = broken.client.query.getMockImplementation()!;
    broken.client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      if (flat(text) === 'ROLLBACK') throw new Error('connection terminated');
      return query(text, params);
    });
    await expect((await loadService(broken.pool)).runAssessment('prog-1', 'NDA', 'FDA')).rejects.toThrow(
      /No readiness criteria on file/,
    );
    expect(broken.client.release).toHaveBeenLastCalledWith(true);
  });
});
