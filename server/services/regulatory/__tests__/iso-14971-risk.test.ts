/**
 * ISO 14971 risk-management engine tests.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateRisk,
  evaluateRiskItem,
  summarizeRiskFile,
  determineBenefitRisk,
  type RiskItem,
} from '../iso-14971-risk';

describe('estimateRisk', () => {
  it('high severity + frequent harm is unacceptable', () => {
    const e = estimateRisk('catastrophic', 'frequent', 'frequent');
    expect(e.region).toBe('unacceptable');
  });

  it('negligible + improbable is acceptable', () => {
    const e = estimateRisk('negligible', 'improbable', 'improbable');
    expect(e.region).toBe('acceptable');
  });
});

describe('evaluateRiskItem', () => {
  it('flags an unacceptable residual with no control', () => {
    const item: RiskItem = {
      id: 'r1',
      hazard: 'incorrect result',
      hazardousSituation: 'false negative reported',
      harm: 'delayed treatment',
      initialSeverity: 'critical',
      initialP1: 'probable',
      initialP2: 'probable',
    };
    const ev = evaluateRiskItem(item);
    expect(ev.residual.region).toBe('unacceptable');
    expect(ev.hasControl).toBe(false);
    expect(ev.gaps.length).toBeGreaterThan(0);
  });

  it('credits a verified control that reduces residual risk', () => {
    const item: RiskItem = {
      id: 'r2',
      hazard: 'incorrect result',
      hazardousSituation: 'false negative',
      harm: 'delayed treatment',
      initialSeverity: 'serious',
      initialP1: 'probable',
      initialP2: 'occasional',
      controls: [
        { id: 'c1', option: 'inherent_safety_by_design', description: 'dual-check', verified: true },
      ],
      residualSeverity: 'serious',
      residualP1: 'remote',
      residualP2: 'improbable',
    };
    const ev = evaluateRiskItem(item);
    expect(ev.hasVerifiedControl).toBe(true);
    expect(ev.riskReduced).toBe(true);
    expect(ev.residual.region).toBe('acceptable');
  });

  it('flags reduction claimed via information-for-safety only', () => {
    const item: RiskItem = {
      id: 'r3',
      hazard: 'misuse',
      hazardousSituation: 'wrong specimen type',
      harm: 'erroneous result',
      initialSeverity: 'serious',
      initialP1: 'probable',
      initialP2: 'probable',
      controls: [
        { id: 'c1', option: 'information_for_safety', description: 'IFU warning', verified: true },
      ],
      residualSeverity: 'serious',
      residualP1: 'remote',
      residualP2: 'remote',
    };
    const ev = evaluateRiskItem(item);
    expect(ev.controlOptionsRespectPriority).toBe(false);
    expect(ev.gaps.some(g => g.includes('information-for-safety'))).toBe(true);
  });
});

describe('summarizeRiskFile + benefit-risk', () => {
  const items: RiskItem[] = [
    {
      id: 'a', hazard: 'h', hazardousSituation: 's', harm: 'm',
      initialSeverity: 'serious', initialP1: 'probable', initialP2: 'occasional',
      controls: [{ id: 'c', option: 'protective_measure', description: 'guard', verified: true }],
      residualSeverity: 'serious', residualP1: 'improbable', residualP2: 'improbable',
    },
    {
      id: 'b', hazard: 'h', hazardousSituation: 's', harm: 'm',
      initialSeverity: 'minor', initialP1: 'remote', initialP2: 'remote',
    },
  ];

  it('reports overall residual acceptability', () => {
    const s = summarizeRiskFile(items);
    expect(s.itemCount).toBe(2);
    expect(s.overallResidualAcceptable).toBe(true);
    expect(s.residualAcceptableShare).toBe(1);
  });

  it('benefit-risk is favorable when residual is acceptable and benefit documented', () => {
    const s = summarizeRiskFile(items);
    const br = determineBenefitRisk({
      benefitDocumented: true,
      overallResidualAcceptable: s.overallResidualAcceptable,
      investigateResidualCount: s.byResidualRegion.investigate,
    });
    expect(br.favorable).toBe(true);
  });

  it('benefit-risk is unfavorable when an unacceptable residual remains', () => {
    const br = determineBenefitRisk({
      benefitDocumented: true,
      overallResidualAcceptable: false,
      investigateResidualCount: 0,
    });
    expect(br.favorable).toBe(false);
  });
});
