/**
 * semantic-checks tests — prove the meaning-level gate flags terminology drift
 * (a locked glossary term whose mandated target rendering is missing) and
 * back-translation divergence (a low source↔round-trip lexical overlap), while
 * staying quiet on faithful translations. Pure module — imported directly.
 */

import { describe, it, expect } from 'vitest';

import {
  glossaryAdherenceCheck,
  backTranslationDivergenceCheck,
} from '../semantic-checks';
import type { BackTranslationResult, GlossaryTerm } from '../../types';

function lockedTerm(sourceTerm: string, targetTerm: string): GlossaryTerm {
  return {
    id: 1,
    organizationId: 1,
    sourceTerm,
    targetTerm,
    doNotTranslate: false,
    category: 'preferred_term',
  };
}

describe('glossaryAdherenceCheck', () => {
  it('warns when a locked source term is present but its mandated target rendering is absent', () => {
    const findings = glossaryAdherenceCheck({
      source: 'A serious adverse event was reported.',
      target: '重篤な事象が報告された。', // missing the mandated 有害事象
      glossary: [lockedTerm('adverse event', '有害事象')],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe('glossary-term-adherence');
    expect(findings[0].severity).toBe('warning');
  });

  it('passes when the mandated target rendering is present', () => {
    const findings = glossaryAdherenceCheck({
      source: 'A serious adverse event was reported.',
      target: '重篤な有害事象が報告された。',
      glossary: [lockedTerm('adverse event', '有害事象')],
    });
    expect(findings).toHaveLength(0);
  });

  it('ignores terms not present in the source and tolerates a missing glossary', () => {
    expect(
      glossaryAdherenceCheck({
        source: 'No matching term here.',
        target: '一致する用語はない。',
        glossary: [lockedTerm('adverse event', '有害事象')],
      }),
    ).toHaveLength(0);
    expect(glossaryAdherenceCheck({ source: 'x', target: 'y' })).toHaveLength(0);
  });

  it('does not enforce DNT terms (identifier preservation is the structural layer)', () => {
    const dnt: GlossaryTerm = {
      id: 2,
      organizationId: 1,
      sourceTerm: 'PMDA',
      doNotTranslate: true,
      category: 'agency_name',
    };
    expect(
      glossaryAdherenceCheck({ source: 'Submit to PMDA.', target: '提出する。', glossary: [dnt] }),
    ).toHaveLength(0);
  });
});

describe('backTranslationDivergenceCheck', () => {
  const source = 'The patient received ten milligrams of the study drug once daily.';
  function bt(backText: string): BackTranslationResult {
    return {
      targetLang: 'ja',
      backText,
      engine: 'test',
      similarity: 0,
      verified: false,
      performedAt: '2026-06-29T00:00:00.000Z',
    };
  }

  it('passes a faithful back-translation (high lexical overlap)', () => {
    const findings = backTranslationDivergenceCheck({
      source,
      target: '患者は治験薬を1日1回10 mg投与された。',
      backTranslation: bt('The patient received ten milligrams of the study drug once daily.'),
    });
    expect(findings).toHaveLength(0);
  });

  it('warns on a low-overlap back-translation', () => {
    const findings = backTranslationDivergenceCheck({
      source,
      target: '患者は治験薬を1日1回10 mg投与された。',
      backTranslation: bt('Completely unrelated sentence about tomorrow weather forecasts.'),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe('back-translation-drift');
    expect(findings[0].severity).toBe('warning');
  });

  it('produces no finding when no back-translation has been run', () => {
    expect(backTranslationDivergenceCheck({ source, target: '…' })).toHaveLength(0);
  });
});
