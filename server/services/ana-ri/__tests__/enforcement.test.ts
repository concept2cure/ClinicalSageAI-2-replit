/**
 * Tests for enforcement — AnA's output system-law: response-structure scoring,
 * evidence-discipline (with overclaim detection), and the artifact quality gate
 * that blocks low-grade or placeholder content from persistence. These are the
 * guards that keep ungrounded or filler output from reaching a regulated dossier.
 */
import { describe, it, expect } from 'vitest';
import {
  validateResponseStructure,
  checkEvidenceDiscipline,
  validateArtifactQuality,
  buildArtifactContract,
} from '../enforcement.js';

describe('validateResponseStructure', () => {
  it('reports everything missing for an empty response', () => {
    const r = validateResponseStructure('');
    expect(r.valid).toBe(false);
    expect(r.score).toBe(0);
    expect(r.maxScore).toBe(6);
    expect(r.missing).toHaveLength(6);
  });

  it('passes a fully structured, evidence-labeled response', () => {
    const response = [
      '## Overall Assessment',
      'Solid overall.',
      '## Reviewer Concerns',
      'One major risk noted.',
      '## Recommended Actions',
      'Submit additional data.',
      '[KNOWN] anchor',
      '[INFERRED] derived',
      '[MISSING] gap',
    ].join('\n');
    const r = validateResponseStructure(response);
    expect(r.valid).toBe(true);
    expect(r.score).toBe(6);
    expect(r.missing).toHaveLength(0);
  });

  it('is valid at the 50% threshold of required sections', () => {
    const response = '## Overall Assessment\nx\n## Recommended Actions\ny\n[KNOWN] z';
    const r = validateResponseStructure(response);
    expect(r.score).toBe(3);
    expect(r.valid).toBe(true);
  });
});

describe('checkEvidenceDiscipline', () => {
  it('counts labels and computes the known ratio', () => {
    const r = checkEvidenceDiscipline('[KNOWN] a [KNOWN] b [INFERRED] c [MISSING] d');
    expect(r.knownCount).toBe(2);
    expect(r.inferredCount).toBe(1);
    expect(r.missingCount).toBe(1);
    expect(r.totalLabels).toBe(4);
    expect(r.knownRatio).toBeCloseTo(0.5);
  });

  it('does not penalize a short, non-substantive response', () => {
    const r = checkEvidenceDiscipline('A brief note about the risk.');
    expect(r.hasUnlabeledClaims).toBe(false);
    expect(r.compliant).toBe(true);
  });

  it('flags a substantive response with no evidence labels as non-compliant', () => {
    const response =
      '## Risk Assessment\nThe **safety** risk is significant and the evidence around the endpoint and strategy must be addressed before any claim can be made about the deficiency in the dataset reviewed to date. A reviewer would expect every assertion here to be anchored to a labeled source before it ships to the client.';
    const r = checkEvidenceDiscipline(response);
    expect(r.hasUnlabeledClaims).toBe(true);
    expect(r.compliant).toBe(false);
  });

  it('flags overclaim language used without [KNOWN] backing', () => {
    const response =
      '## Risk Assessment\nThe analysis provides conclusive evidence that the endpoint was met. [INFERRED] The risk profile is acceptable based on the available safety data reviewed across the program to date and the strategy adopted, and the evidence base supports the overall conclusion drawn in this assessment.';
    const r = checkEvidenceDiscipline(response);
    expect(r.hasOverclaims).toBe(true);
    expect(r.hasUnlabeledClaims).toBe(false); // an [INFERRED] label is present
    expect(r.compliant).toBe(false);
  });
});

describe('validateArtifactQuality', () => {
  it('rejects content that is too short', () => {
    const r = validateArtifactQuality('Too short.', 'risk_memo');
    expect(r.pass).toBe(false);
    expect(r.grade).toBe('rejected');
  });

  it('rejects content riddled with filler and no structure', () => {
    const content =
      "I'd be happy to help. Here's a template you can use. TODO: fill this in. TBD. " +
      'This is a placeholder paragraph that goes on for a while so it clears the minimum length gate but carries no real governed content whatsoever.';
    const r = validateArtifactQuality(content, 'strategy_note');
    expect(r.pass).toBe(false);
    expect(r.grade).toBe('rejected');
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('grades a thorough, grounded risk memo as high', () => {
    const content = [
      '## Overall Assessment',
      'The primary safety risk is driven by inadequate sealing of the sterile barrier, caused by an undersized weld zone. [KNOWN]',
      '',
      '## Reviewer Concerns',
      'Critical risk: the design verification data shows only 12 cycles versus the 50 cycles required by ISO 11607. [KNOWN] This deficiency poses a major risk to sterility maintenance over the labeled shelf life. [INFERRED]',
      '',
      '## Recommended Actions',
      'Conduct an extended seal-strength study, gather additional aging data per ASTM F1980, and revise the weld parameters before the next submission. [MISSING]',
    ].join('\n');
    const r = validateArtifactQuality(content, 'risk_memo');
    expect(r.pass).toBe(true);
    expect(r.grade).toBe('high');
    expect(r.issues).toHaveLength(0);
  });
});

describe('buildArtifactContract', () => {
  it('assembles a draft contract with provenance from the content', () => {
    const content = '## Section A\nbody [KNOWN] anchor\n## Section B\nmore body';
    const c = buildArtifactContract({
      documentType: 'risk_memo',
      projectId: 1,
      organizationId: 2,
      intentLens: 'risk',
      userRole: 'regulatory',
      content,
      provider: 'anthropic',
      model: 'ana-1.0',
      conversationLength: 5,
    });
    expect(c.version).toBe(1);
    expect(c.status).toBe('draft');
    expect(c.source).toBe('ana_ri');
    expect(c.structureSections).toEqual(['Section A', 'Section B']);
    expect(c.provenance.evidenceLabels).toBe(1);
    expect(c.provenance.aiModel).toBe('ana-1.0');
  });
});
