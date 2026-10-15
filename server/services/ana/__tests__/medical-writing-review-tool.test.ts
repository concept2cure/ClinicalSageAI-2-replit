/** Existing registered tool delivery, not provider or source-review validation. */
import { describe, expect, it } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { MEDICAL_WRITING_REVIEW } from '../evidence-literature-tool-defs';
import { getDocumentTypeStandard } from '../medical-writing';

describe('medical_writing_review existing tool output', () => {
  it('surfaces heading-only evidence and unassessed scientific/approval states', async () => {
    const headings = getDocumentTypeStandard('manuscript')!.structure;
    const result = JSON.parse(await getToolHandler('medical_writing_review')!({
      document_type: 'manuscript', draft_text: headings.map(heading => `## ${heading}`).join('\n'),
    }, {}));
    expect(result.source).toBe('AnA Medical-Writing QC');
    expect(result.missingSections).toEqual([]);
    expect(result.structureCoverage.every((section: { matchedHeadings: string[] }) => section.matchedHeadings.length)).toBe(true);
    expect(result.evidenceReviewed).toBe(false);
    expect(result.scientificCompleteness).toBe('not_assessed');
    expect(result.approvalStatus).toBe('not_assessed');
    expect(result.readiness).not.toMatch(/Structure complete/);
    expect(result.clarificationQuestions.length).toBeLessThanOrEqual(3);
  });

  it('does not certify prose or invent a standard for an unsupported type', async () => {
    const result = JSON.parse(await getToolHandler('medical_writing_review')!({
      document_type: 'manuscript', draft_text: 'The abstract introduction mentions methods, results, discussion, limitations, conclusions, declarations and references.',
    }, {}));
    expect(result.missingSections).toEqual(getDocumentTypeStandard('manuscript')!.structure);
    const unknown = JSON.parse(await getToolHandler('medical_writing_review')!({ document_type: 'CMC stability report' }, {}));
    expect(unknown.documentType).toBeNull();
    expect(unknown.inquiryScope).toBe('unavailable');
    expect(unknown.structureStatus).toBe('not_checked');
  });

  it('describes the actual limits rather than expert conformance or approval', () => {
    expect(MEDICAL_WRITING_REVIEW.description).toMatch(/heading.*outline/i);
    expect(MEDICAL_WRITING_REVIEW.description).toMatch(/does not read or verify source evidence/i);
    expect(MEDICAL_WRITING_REVIEW.description).not.toMatch(/readiness verdict|QC it like an expert/i);
  });
});
