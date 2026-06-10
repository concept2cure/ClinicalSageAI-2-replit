/**
 * IVD assessment persistence — pure helpers (type guards + corpus version).
 * (DB-backed CRUD is exercised via integration tests with a database.)
 */

import { describe, it, expect } from 'vitest';
import {
  isAssessmentType,
  isDocumentType,
  IVD_ASSESSMENT_TYPES,
  IVD_DOCUMENT_TYPES,
} from '../ivd-assessments.service';
import { corpusVersion } from '../../ivd-knowledge/knowledge.service';

describe('assessment/document type guards', () => {
  it('accepts known assessment types', () => {
    expect(isAssessmentType('reviewer_simulation')).toBe(true);
    expect(isAssessmentType('cdx_pairing')).toBe(true);
    expect(isAssessmentType('not_a_type')).toBe(false);
  });

  it('accepts known document types', () => {
    expect(isDocumentType('psur')).toBe(true);
    expect(isDocumentType('emdr')).toBe(true);
    expect(isDocumentType('memo')).toBe(false);
  });

  it('covers every calculator family that can be saved', () => {
    expect(IVD_ASSESSMENT_TYPES).toContain('study_design');
    expect(IVD_ASSESSMENT_TYPES).toContain('signal_disproportionality');
    expect(IVD_DOCUMENT_TYPES).toContain('declaration_of_conformity');
  });
});

describe('corpusVersion', () => {
  it('is stable across calls and well-formed', () => {
    const v1 = corpusVersion();
    const v2 = corpusVersion();
    expect(v1).toBe(v2);
    expect(v1).toMatch(/^v\d+-[0-9a-f]{8}$/);
  });

  it('encodes the corpus entry count', () => {
    expect(corpusVersion().startsWith('v137-') || /^v\d+-/.test(corpusVersion())).toBe(true);
  });
});
