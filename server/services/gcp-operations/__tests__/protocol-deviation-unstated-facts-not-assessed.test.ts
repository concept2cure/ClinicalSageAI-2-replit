/**
 * An unstated protocol-deviation impact fact is not "no impact" (audit finding
 * 3 of the f/g/h fabrication sweep, 2026-10-15).
 *
 * What the code used to do: classifyProtocolDeviation read every impact fact
 * with `=== true` and started participantSafetyImpact and dataIntegrityImpact
 * at 'none', so a deviation nobody had assessed came back
 * `importance: 'non_important', severity: 'minor', reportToIRB: false` with
 * the sentence "Non-important deviation with no safety or IRB-protocol impact
 * … (no individual prompt IRB report required)". AnA served that as
 * `status: 'computed'` with "Report these numbers verbatim".
 *
 * Now a verdict that an unstated fact could change is 'not_assessed' /
 * 'undetermined', the unstated facts are listed in notAssessed, and "no
 * impact" is said only when every fact was stated false.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyProtocolDeviation,
  type ProtocolDeviationParams,
} from '../gcp-operations-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const IMPACT_FACTS = [
  'category',
  'affectsParticipantSafety',
  'involvedUnreportedSAE',
  'increasedRiskToSubjects',
  'affectsConsentValidity',
  'affectsPrimaryEndpoint',
  'affectsEligibilityCriticalCriterion',
  'deviationFromIRBApprovedProtocol',
  'isRecurring',
];

const ALL_STATED_FALSE: ProtocolDeviationParams = {
  category: 'visit_window',
  affectsParticipantSafety: false,
  involvedUnreportedSAE: false,
  increasedRiskToSubjects: false,
  affectsConsentValidity: false,
  affectsPrimaryEndpoint: false,
  affectsEligibilityCriticalCriterion: false,
  deviationFromIRBApprovedProtocol: false,
  isRecurring: false,
};

describe('classifyProtocolDeviation: an unstated fact is not "no impact"', () => {
  it('leaves a deviation with no facts stated not assessed and its IRB reportability undetermined', () => {
    const r = classifyProtocolDeviation({
      description: 'Participant took study drug twice daily instead of once',
    });

    expect(r.importance).toBe('not_assessed');
    expect(r.severity).toBe('not_assessed');
    expect(r.participantSafetyImpact).toBe('not_assessed');
    expect(r.dataIntegrityImpact).toBe('not_assessed');
    expect(r.reportability.reportToIRB).toBe('undetermined');
    expect(r.reportability.promptReportingRequired).toBe('undetermined');
    expect([...r.notAssessed].sort()).toEqual([...IMPACT_FACTS].sort());
    const text = r.reportability.rationale.join(' ');
    expect(text).not.toMatch(/no safety or IRB-protocol impact/);
    expect(text).not.toMatch(/no individual prompt IRB report required/);
    expect(text).toMatch(/not stated/);
  });

  it('says "no impact" only when every fact is stated false', () => {
    const r = classifyProtocolDeviation(ALL_STATED_FALSE);

    expect(r.importance).toBe('non_important');
    expect(r.severity).toBe('minor');
    expect(r.participantSafetyImpact).toBe('none');
    expect(r.dataIntegrityImpact).toBe('minor');
    expect(r.reportability.reportToIRB).toBe(false);
    expect(r.notAssessed).toEqual([]);
  });

  it('keeps the classification open while one fact that could make it important is unstated', () => {
    const r = classifyProtocolDeviation({ ...ALL_STATED_FALSE, isRecurring: undefined });

    expect(r.importance).toBe('not_assessed');
    expect(r.reportability.reportToIRB).toBe('undetermined');
    expect(r.notAssessed).toEqual(['isRecurring']);
  });

  it('classifies on one stated true fact without waiting for the rest', () => {
    const r = classifyProtocolDeviation({ affectsParticipantSafety: true });

    expect(r.importance).toBe('important');
    expect(r.severity).toBe('critical');
    expect(r.participantSafetyImpact).toBe('actual');
    expect(r.reportability.reportToIRB).toBe(true);
    expect(r.reportability.promptReportingRequired).toBe(true);
  });
});

describe('classify_protocol_deviation through AnA', () => {
  it('serves an unassessed deviation as not_assessed, not as non-important', async () => {
    const out = JSON.parse(
      await getToolHandler('classify_protocol_deviation')!(
        { description: 'Participant took study drug twice daily instead of once' } as never,
        {} as never,
      ),
    );

    expect(out.status).toBe('computed');
    expect(out.result.importance).toBe('not_assessed');
    expect(out.result.reportability.reportToIRB).toBe('undetermined');
    expect(out.result.notAssessed.length).toBe(IMPACT_FACTS.length);
  });
});
