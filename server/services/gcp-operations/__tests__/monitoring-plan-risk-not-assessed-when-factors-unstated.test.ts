/**
 * A monitoring plan's risk level is not "low" when nobody stated the risk
 * factors (audit finding 7 of the f/g/h fabrication sweep, 2026-10-15).
 *
 * What the code used to do: designMonitoringPlan defaulted the phase to
 * 'phase3' and read every risk contributor with `=== true`, so
 * `designMonitoringPlan({})` scored 0/100, "Overall risk assessed as low",
 * and recommended the low-risk mix (70/8/22) with "Reduced, sample-based SDV"
 * and no warning, for a trial no risk factor had been given for.
 *
 * Now the band is reported only when the unstated factors cannot change it;
 * otherwise overallRiskLevel is 'not_assessed', riskScore and the monitoring
 * mix are null, and notAssessed lists the factors to ask for.
 */
import { describe, expect, it } from 'vitest';
import {
  designMonitoringPlan,
  type MonitoringPlanParams,
} from '../gcp-operations-knowledge';

const LOW_RISK_ALL_STATED: MonitoringPlanParams = {
  phase: 'phase3',
  isFirstInHuman: false,
  noveltyOfIntervention: 'established',
  vulnerablePopulation: false,
  complexProtocol: false,
  endpointObjectivity: 'objective',
  isMultiRegional: false,
  numberOfSites: 12,
  usesInvestigationalDevice: false,
  experiencedSites: true,
  electronicDataCapture: true,
  priorInspectionFindings: false,
};

describe('designMonitoringPlan: unstated risk factors leave the risk level not assessed', () => {
  it('does not call a trial with no stated factors low risk', () => {
    const r = designMonitoringPlan({});

    expect(r.overallRiskLevel).toBe('not_assessed');
    expect(r.riskScore).toBeNull();
    expect(r.monitoringMix).toBeNull();
    expect(r.notAssessed).toEqual(expect.arrayContaining(['isFirstInHuman', 'phase', 'numberOfSites', 'electronicDataCapture']));
    expect(r.warnings.join(' ')).toMatch(/not assessed/);
  });

  it('scores the plan when every factor is stated', () => {
    const r = designMonitoringPlan(LOW_RISK_ALL_STATED);

    expect(r.overallRiskLevel).toBe('low');
    expect(r.riskScore).toBe(0);
    expect(r.notAssessed).toEqual([]);
    expect(r.monitoringMix?.centralizedPercent).toBe(70);
  });

  it('reports a band the unstated factors cannot change, without an exact score', () => {
    // 30 (first-in-human) + 20 (first-in-class) + 18 (vulnerable) = 68: critical whatever else is true.
    const r = designMonitoringPlan({
      isFirstInHuman: true,
      noveltyOfIntervention: 'first_in_class',
      vulnerablePopulation: true,
    });

    expect(r.overallRiskLevel).toBe('critical');
    expect(r.riskScore).toBeNull();
    expect(r.monitoringMix?.onSitePercent).toBe(45);
  });
});
