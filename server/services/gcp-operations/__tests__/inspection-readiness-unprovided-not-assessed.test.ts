/**
 * Inspection readiness does not score what was not provided (audit finding 7
 * of the f/g/h fabrication sweep, 2026-10-15).
 *
 * What the code used to do: assessInspectionReadiness defaulted
 * essentialDocsCompletePercent to 100 and openCapas to 0, and scored every
 * unstated flag as 50. With the ten flags true and no completeness figure it
 * reported the TMF area 100/'ready', readinessScore 100, 'ready' and "No
 * material gaps detected"; with `{}` it said "No documented CAPA process
 * detected" although nothing had been inspected.
 *
 * Now an area whose input is absent is 'not_assessed' with a null score, the
 * overall score is null and the verdict is 'not_assessed' unless the assessed
 * areas already settle it, and the CAPA lines say "not provided".
 */
import { describe, expect, it } from 'vitest';
import {
  assessInspectionReadiness,
  type InspectionReadinessParams,
} from '../gcp-operations-knowledge';

const TEN_FLAGS_TRUE: InspectionReadinessParams = {
  tmfContemporaneous: true,
  consentDocumentationComplete: true,
  delegationLogCurrent: true,
  trainingRecordsComplete: true,
  ipAccountabilityReconciled: true,
  safetyReportingCurrent: true,
  protocolDeviationsLogged: true,
  monitoringReportsCurrent: true,
  dataTraceabilityVerified: true,
  computerizedSystemsValidated: true,
};

describe('assessInspectionReadiness: absent inputs are not assessed', () => {
  it('does not call the TMF complete, or the site ready, without a completeness figure', () => {
    const r = assessInspectionReadiness({ ...TEN_FLAGS_TRUE, capaProcessInPlace: true });
    const tmf = r.areaScores.find((a) => a.area.startsWith('Essential documents'))!;

    expect(tmf.score).toBeNull();
    expect(tmf.status).toBe('not_assessed');
    expect(r.readinessScore).toBeNull();
    expect(r.overallReadiness).toBe('not_assessed');
    expect(r.prioritizedActions.join(' ')).not.toMatch(/No material gaps/);
  });

  it('says "not provided", not "detected", about a CAPA process and open CAPAs nobody described', () => {
    const r = assessInspectionReadiness({});

    const capa = r.capaPosture.join(' ');
    expect(capa).not.toMatch(/detected/);
    expect(capa).toMatch(/CAPA process status not provided/);
    expect(capa).toMatch(/open CAPAs not provided/);
    expect(r.areaScores.every((a) => a.status === 'not_assessed' && a.score === null)).toBe(true);
  });

  it('settles a verdict the unassessed areas cannot change', () => {
    const nineFalseOneUnstated: InspectionReadinessParams = {
      tmfContemporaneous: false,
      consentDocumentationComplete: false,
      delegationLogCurrent: false,
      trainingRecordsComplete: false,
      ipAccountabilityReconciled: false,
      safetyReportingCurrent: false,
      protocolDeviationsLogged: false,
      dataTraceabilityVerified: false,
      computerizedSystemsValidated: false,
    };
    const r = assessInspectionReadiness(nineFalseOneUnstated);

    expect(r.readinessScore).toBeNull();
    expect(r.overallReadiness).toBe('not_ready');
  });

  it('scores readiness when every input is provided', () => {
    const r = assessInspectionReadiness({
      ...TEN_FLAGS_TRUE,
      essentialDocsCompletePercent: 100,
      capaProcessInPlace: true,
      openCapas: 0,
    });

    expect(r.readinessScore).toBe(100);
    expect(r.overallReadiness).toBe('ready');
    expect(r.prioritizedActions[0]).toMatch(/^No material gaps in the facts provided/);
  });
});
