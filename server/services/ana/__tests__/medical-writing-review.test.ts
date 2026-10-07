/**
 * Medical-writing self-review — unit tests. Deterministic, no IO.
 */
import { describe, it, expect } from 'vitest';
import { reviewMedicalWriting } from '../medical-writing-review';
import { getDocumentTypeStandard, listMedicalWritingCatalog } from '../medical-writing';

const manuscriptHeadings = getDocumentTypeStandard('manuscript')!.structure;
const headingDraft = (headings: string[], style: 'markdown' | 'numbered' | 'html' | 'plain' = 'markdown') =>
  headings.map((heading, index) => {
    const title = heading.replace(/^\d+(?:\.\d+)*\.?\s+/, '');
    if (style === 'numbered') return `${index + 1}. ${title}\nSupported prose still needs evidence review.`;
    if (style === 'html') return `<h2>${title}</h2><p>Supported prose still needs evidence review.</p>`;
    if (style === 'plain') return `${title}\nSupported prose still needs evidence review.`;
    return `## ${title}\nSupported prose still needs evidence review.`;
  }).join('\n');

describe('reviewMedicalWriting', () => {
  it('returns a pre-draft checklist (structure as review) when no draft is given', () => {
    const r = reviewMedicalWriting('csr');
    expect(r.documentType).toBe('csr');
    expect(r.governingStandards.join(' ')).toContain('ICH E3');
    expect(r.structureCoverage).toBeUndefined();
    expect(r.checklist.some(c => c.category === 'structure' && c.status === 'review')).toBe(true);
    expect(r.checklist.some(c => c.category === 'requirement')).toBe(true);
    expect(r.checklist.some(c => c.category === 'pitfall')).toBe(true);
    expect(r.readiness).toMatch(/Pre-draft/i);
    expect(r.structureStatus).toBe('not_checked');
    expect(r.evidenceReviewed).toBe(false);
    expect(r.scientificCompleteness).toBe('not_assessed');
    expect(r.approvalStatus).toBe('not_assessed');
    expect(r.clarificationQuestions.length).toBeGreaterThan(0);
  });

  it('flags missing sections when a thin draft is reviewed', () => {
    const thin = 'Introduction. The objectives were met. Safety was acceptable.';
    const r = reviewMedicalWriting('csr', thin);
    expect(r.structureCoverage).toBeDefined();
    expect((r.missingSections ?? []).length).toBeGreaterThan(0);
    expect(r.readiness).toMatch(/NOT READY/);
  });

  it('never treats narrative mentions of every heading keyword as complete structure', () => {
    const prose = 'The abstract introduction discusses methods, results, discussion, limitations, conclusions, declarations and references in one paragraph.';
    const r = reviewMedicalWriting('manuscript', prose);
    expect(r.missingSections).toEqual(manuscriptHeadings);
    expect(r.structureCoverage?.every(section => !section.present)).toBe(true);
    expect(r.detectedHeadings).toEqual([]);
    expect(r.readiness).not.toMatch(/Structure complete|compliant|approved/i);
  });

  it.each(['markdown', 'numbered', 'html', 'plain'] as const)('recognizes actual %s headings without certifying scientific completeness', style => {
    const r = reviewMedicalWriting('manuscript', headingDraft(manuscriptHeadings, style));
    expect(r.missingSections).toEqual([]);
    expect(r.structureStatus).toBe('checked');
    expect(r.structureCoverage?.every(section => section.present && section.matchedHeadings.length > 0)).toBe(true);
    expect(r.readiness).toMatch(/headings.*detected/i);
    expect(r.readiness).toMatch(/evidence.*review|scientific.*review/i);
    expect(r.readiness).not.toMatch(/Structure complete/);
    expect(r.evidenceReviewed).toBe(false);
    expect(r.scientificCompleteness).toBe('not_assessed');
    expect(r.approvalStatus).toBe('not_assessed');
    expect(r.checklist.filter(item => item.category !== 'structure').every(item => item.status === 'review')).toBe(true);
  });

  it('does not promote a partial heading or heading-only skeleton to substantive completion', () => {
    const partial = reviewMedicalWriting('manuscript', '## Methods planned\n## Results anticipated\n## Reference interval study');
    expect(partial.missingSections).toEqual(manuscriptHeadings);
    const skeleton = reviewMedicalWriting('manuscript', manuscriptHeadings.map(heading => `# ${heading}`).join('\n'));
    expect(skeleton.missingSections).toEqual([]);
    expect(skeleton.scientificCompleteness).toBe('not_assessed');
    expect(skeleton.approvalStatus).toBe('not_assessed');
  });

  it.each(listMedicalWritingCatalog().documentTypes.map(type => type.id))('uses the existing %s standard rather than a second heading catalog', type => {
    const expected = getDocumentTypeStandard(type)!.structure;
    const r = reviewMedicalWriting(type, headingDraft(expected));
    expect(r.structureCoverage?.map(section => section.section)).toEqual(expected);
    expect(r.missingSections).toEqual([]);
  });
});

describe('reviewMedicalWriting — unresolved evidence and honest scope', () => {
  it('asks bounded source, study/SAP and population/units questions for an unverified clinical draft', () => {
    const r = reviewMedicalWriting('csr', '## Introduction\nResponse was 42, but study identifier, units and analysis population are unresolved.');
    expect(r.clarificationQuestions.length).toBeLessThanOrEqual(3);
    const questions = r.clarificationQuestions.map(question => `${question.question} ${question.requestedEvidence}`).join(' ');
    expect(questions).toMatch(/source.*version|version.*source/i);
    expect(questions).toMatch(/study.*identifier|protocol.*number/i);
    expect(questions).toMatch(/SAP.*approval|approved.*SAP/i);
    expect(questions).toMatch(/population.*denominator/i);
    expect(questions).toMatch(/units/);
    expect(r.clarificationQuestions.every(question => question.why && question.requestedEvidence)).toBe(true);
    expect(r.clarificationNotice).toMatch(/project sources.*prior answers/i);
    expect(r.clarificationNotice).toMatch(/not.*proof|do not.*verify/i);
  });

  it('asks for CMC material, methods and stability conditions only when relevant to the draft', () => {
    const r = reviewMedicalWriting('clinical_overview', '## Product development rationale\nCMC stability and assay records for the clinical batch are unresolved.');
    const quality = r.clarificationQuestions.find(question => question.topic === 'quality');
    expect(quality).toBeDefined();
    expect(`${quality?.question} ${quality?.requestedEvidence}`).toMatch(/batch|material/i);
    expect(`${quality?.question} ${quality?.requestedEvidence}`).toMatch(/methods/i);
    expect(`${quality?.question} ${quality?.requestedEvidence}`).toMatch(/conditions|timepoints/i);
    const manuscript = reviewMedicalWriting('manuscript', '## Methods\nA retrospective literature study is described.');
    expect(manuscript.clarificationQuestions.some(question => question.topic === 'quality')).toBe(false);
  });

  it('keeps device inquiries on the indexed writing standard, not a medicinal-product preparation plan', () => {
    const r = reviewMedicalWriting('per', '## Analytical performance\nPerformance evidence remains unresolved.');
    expect(r.inquiryScope).toBe('writing_standard');
    const questions = r.clarificationQuestions.map(question => question.question).join(' ');
    expect(questions).toMatch(/scientific validity|analytical performance|clinical performance/i);
    expect(r.evidenceReviewed).toBe(false);
  });

  it('preserves separately supplied canonical headings without treating prose as a heading', () => {
    const r = reviewMedicalWriting('manuscript', 'The supplied sections contain draft body text.', manuscriptHeadings);
    expect(r.missingSections).toEqual([]);
    expect(r.detectedHeadings).toEqual(manuscriptHeadings);
  });

  it('ignores fenced examples, list items and hidden HTML instead of promoting them to headings', () => {
    const examples = `\`\`\`markdown\n${manuscriptHeadings.map(heading => `# ${heading}`).join('\n')}\n\`\`\``;
    const list = manuscriptHeadings.map(heading => `- ${heading}`).join('\n');
    const hidden = `<script>${manuscriptHeadings.map(heading => `<h2>${heading}</h2>`).join('')}</script>`;
    const r = reviewMedicalWriting('manuscript', `${examples}\n${list}\n${hidden}`);
    expect(r.detectedHeadings).toEqual([]);
    expect(r.missingSections).toEqual(manuscriptHeadings);
  });

  it('does not silently stop checking after the search extractor default of forty headings', () => {
    const preceding = Array.from({ length: 45 }, (_, index) => `## Context note ${index}`).join('\n');
    const r = reviewMedicalWriting('manuscript', `${preceding}\n${headingDraft(manuscriptHeadings)}`);
    expect(r.detectedHeadings.length).toBe(45 + manuscriptHeadings.length);
    expect(r.missingSections).toEqual([]);
  });

  it('handles an unknown document type without throwing', () => {
    const r = reviewMedicalWriting('not-a-doc');
    expect(r.documentType).toBeNull();
    expect(r.checklist).toEqual([]);
    expect(r.readiness).toMatch(/Unknown document type/i);
    expect(r.availableDocumentTypes).toContain('csr');
    expect(r.structureStatus).toBe('not_checked');
    expect(r.inquiryScope).toBe('unavailable');
    expect(r.evidenceReviewed).toBe(false);
    expect(r.scientificCompleteness).toBe('not_assessed');
    expect(r.clarificationQuestions[0].question).toMatch(/document type/i);
  });
});
