/**
 * IND lifecycle document → PDF rendering. Proves the safety-report / annual-report
 * models render to valid, navigable, deterministic PDF leaves. No DB, no binaries.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderIndSafetyReportPdf, renderIndAnnualReportPdf } from '../ind-document-renderer';
import { assembleIndSafetyReport } from '../ind-safety-report-service';
import type {
  AdverseEvent,
  EventType,
  SeriousnessCriteria,
  Causality,
  Outcome,
} from '../../compliance/pharmacovigilanceService';
import { assembleIndAnnualReport, type IndAnnualReportInput } from '../ind-annual-report-service';

const D = new Date('2026-03-01T00:00:00.000Z');

function makeEvent(): AdverseEvent {
  return {
    id: 'ae-1',
    organizationId: 'org-1',
    projectId: 'proj-1',
    eventType: 'SAE' as EventType,
    patientId: 'subj-001',
    eventDescription: 'Acute hepatic failure following dosing.',
    onsetDate: D,
    reportDate: D,
    seriousnessCriteria: 'life_threatening' as SeriousnessCriteria,
    causality: 'probable' as Causality,
    outcome: 'not_recovered' as Outcome,
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: D,
    reportedToAuthorities: false,
    expeditedReportRequired: true,
    expectedness: 'unexpected',
    createdAt: D,
  };
}

describe('renderIndSafetyReportPdf', () => {
  it('renders a valid, navigable PDF from the safety-report document model', async () => {
    const { document } = assembleIndSafetyReport(makeEvent(), { now: D });
    const buf = await renderIndSafetyReportPdf(document);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    // Multi-section outline present, with the document's first heading.
    expect(buf.toString('latin1')).toContain('/Outlines');
    expect(buf.toString('latin1')).toContain('Identification');
  });

  it('is deterministic — same model yields byte-identical PDF', async () => {
    const { document } = assembleIndSafetyReport(makeEvent(), { now: D });
    const a = await renderIndSafetyReportPdf(document);
    const b = await renderIndSafetyReportPdf(document);
    expect(a.equals(b)).toBe(true);
  });
});

describe('renderIndAnnualReportPdf', () => {
  it('renders a valid PDF with a bookmark outline', async () => {
    const input: IndAnnualReportInput = {
      organizationId: 'org-1',
      projectId: 'proj-1',
      indNumber: '123456',
      productName: 'C2C-001',
      reportingPeriodStart: new Date('2025-03-01'),
      reportingPeriodEnd: new Date('2026-02-28'),
      studyStatuses: [],
      safetyReportsInPeriod: [],
      ibChanges: [],
    };
    const model = assembleIndAnnualReport(input);
    const buf = await renderIndAnnualReportPdf(model);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('/Outlines');
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
