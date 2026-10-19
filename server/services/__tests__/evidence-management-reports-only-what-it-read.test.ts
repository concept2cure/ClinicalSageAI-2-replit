/**
 * EvidenceManagementService reports what the evidence says and what was read,
 * and reads only the caller's organization.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 *   - Gap analysis: `file_count` was the number of (section, status) GROUPS,
 *     not files; a requirement was "complete" when its groups were approved,
 *     whichever sections they covered (Biocompatibility "complete" on one
 *     cytotoxicity report); `completeness` divided by all 8 requirements, so a
 *     project with every REQUIRED requirement done read 75%.
 *   - Citations dated the test with the file's upload timestamp.
 *   - Form auto-population wrote `iso_10993_compliance: false` when the result
 *     was simply not stated, and took the last biocompatibility file read.
 *   - Extraction sent the first 4,000 characters to the model and reported
 *     `issues: null` (no deviations) for the unread remainder.
 *   - getStageEvidence, generateCitations, autoPopulateForm and every UPDATE
 *     had no organization predicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const { execute, completeSpy } = vi.hoisted(() => ({ execute: vi.fn(), completeSpy: vi.fn() }));
vi.mock('../../db', () => ({ db: { execute }, pool: {} }));
vi.mock('../../lib/unified-ai-client', () => ({ aiComplete: completeSpy }));

import { EvidenceManagementService } from '../EvidenceManagementService';

const ORG = 7;
const svc = new EvidenceManagementService();
const dialect = new PgDialect();
const rendered = (call = 0) => dialect.sqlToQuery(execute.mock.calls[call][0] as SQL);

/** One grouped row per (requirement, section), every file approved. */
const approvedGroups = (req: string, sections: string[], filesEach = 1) =>
  sections.map((s) => ({ fda_requirement: req, fda_section: s, regulatory_status: 'approved', file_count: String(filesEach) }));

const REQUIRED: Record<string, string[]> = {
  device_desc: ['physical_characteristics', 'materials_composition', 'design_drawings', 'specifications'],
  performance: ['bench_testing', 'animal_testing', 'computational_modeling', 'validation_verification'],
  biocompat: ['iso_10993', 'cytotoxicity', 'sensitization', 'irritation', 'systemic_toxicity', 'hemocompatibility'],
  sterilization: ['validation', 'sterility_assurance', 'residuals', 'packaging'],
  labeling: ['device_label', 'ifu', 'patient_labeling', 'physician_labeling'],
  manufacturing: ['process_flow', 'quality_controls', 'device_history', 'facility_info'],
};

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ rows: [], rowCount: 1 });
  completeSpy.mockReset();
});

describe('gap analysis counts files and sections, over the required requirements', () => {
  it('counts files, not (section, status) groups', async () => {
    execute.mockResolvedValue({
      rows: [
        ...approvedGroups('sterilization', ['sterility_assurance', 'residuals', 'packaging']),
        { fda_requirement: 'sterilization', fda_section: 'validation', regulatory_status: 'approved', file_count: '2' },
      ],
    });
    const r = await svc.performGapAnalysis('p1', ORG);
    expect(r.fulfilled.find((f) => f.requirement === 'sterilization')?.file_count).toBe(5);
  });

  it('is complete only when every listed section has approved evidence', async () => {
    execute.mockResolvedValue({
      rows: [{ fda_requirement: 'biocompat', fda_section: 'cytotoxicity', regulatory_status: 'approved', file_count: '3' }],
    });
    const r = await svc.performGapAnalysis('p1', ORG);
    expect(r.fulfilled.map((f) => f.requirement)).not.toContain('biocompat');
    const partial = r.partial.find((p) => p.requirement === 'biocompat');
    expect(partial?.sections_missing).toContain('iso_10993');
    expect(partial?.total).toBe(3);
  });

  it('measures completeness over the required requirements only', async () => {
    execute.mockResolvedValue({
      rows: Object.entries(REQUIRED).flatMap(([req, sections]) => approvedGroups(req, sections)),
    });
    const r = await svc.performGapAnalysis('p1', ORG);
    // Software and Clinical are optional; leaving them out is not a gap.
    expect(r.completeness).toBe(100);
  });
});

describe('a citation states only the test date that was recorded', () => {
  it('does not date the test with the upload timestamp', async () => {
    execute.mockResolvedValue({
      rows: [{
        id: 1, file_name: 'cyto.pdf', test_type: 'biocompatibility', test_date: null,
        created_at: '2026-05-01T10:00:00.000Z', extracted_data: { test_lab: 'NAMSA' },
      }],
    });
    const [c] = (await svc.generateCitations(['1'], 'custom', ORG)) as Array<{ citation: string }>;
    expect(c.citation).not.toContain('2026-05-01');
    expect(c.citation).toContain('test date not recorded');
  });
});

describe('form auto-population does not turn an unstated result into a verdict', () => {
  const biocompat = (results: unknown, id: number) => ({
    id, fda_requirement: 'biocompat', fda_section: 'cytotoxicity', file_name: `f${id}.pdf`,
    extracted_data: { results, test_lab: 'NAMSA' },
  });

  it('leaves ISO 10993 compliance undetermined when no result was stated', async () => {
    execute.mockResolvedValue({ rows: [biocompat(null, 1)] });
    const form = await svc.autoPopulateForm('form-1', 'p1', ORG);
    expect(form.biocompatibility.iso_10993_compliance).toBeNull();
  });

  it('is non-compliant when any report failed, not whatever the last report said', async () => {
    execute.mockResolvedValue({ rows: [biocompat('Fail', 1), biocompat('Pass', 2)] });
    const form = await svc.autoPopulateForm('form-1', 'p1', ORG);
    expect(form.biocompatibility.iso_10993_compliance).toBe(false);
    expect(form.biocompatibility.evidence_refs).toEqual([1, 2]);
  });
});

describe('extraction says how much of the document it read', () => {
  const NO_DEVIATIONS = JSON.stringify({ test_type: 'bench test', test_results: 'Pass', deviations: null });

  it('reports deviations as not assessed when the report was cut short', async () => {
    completeSpy.mockResolvedValue(NO_DEVIATIONS);
    const out = await svc.extractDataFromFile('x'.repeat(10_000), 'long.pdf', 'application/pdf');
    expect(out.ai_extracted).toBe(true);
    expect(out.issues).toBe('not_assessed');
    expect(out.chars_read).toBe(4000);
    expect(out.chars_supplied).toBe(10_000);
  });

  it('keeps "no deviations stated" for a report it read in full', async () => {
    completeSpy.mockResolvedValue(NO_DEVIATIONS);
    const out = await svc.extractDataFromFile('short report', 'short.pdf', 'application/pdf');
    expect(out.issues).toBeNull();
    expect(out.chars_read).toBe('short report'.length);
  });
});

describe("every statement is scoped to the caller's organization", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['getStageEvidence', () => svc.getStageEvidence('p1', 1, ORG)],
    ['getStageEvidence(all)', () => svc.getStageEvidence('p1', 6, ORG)],
    ['generateCitations', () => svc.generateCitations(['1'], 'custom', ORG)],
    ['autoPopulateForm', () => svc.autoPopulateForm('form-1', 'p1', ORG)],
    ['linkToWorkflowStage', () => svc.linkToWorkflowStage('f1', 2, {}, ORG)],
    ['mapToFDARequirements', () => svc.mapToFDARequirements('f1', { test_type: 'biocompatibility' }, ORG)],
    ['submitForReview', () => svc.submitForReview('f1', 'reviewer-9', ORG)],
    ['requestChanges', () => svc.requestChanges('f1', '5', 'fix the table', ORG)],
  ];
  it.each(cases)('%s', async (_name, run) => {
    await run();
    const q = rendered();
    expect(q.sql).toMatch(/organization_id\s*=\s*\$\d+/);
    expect(q.params).toContain(ORG);
  });

  it('refuses an evidence read with no organization', async () => {
    await expect(svc.getStageEvidence('p1', 1)).rejects.toThrow(/organization/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
