/**
 * Unit tests for the toxicologic-pathology adversity classifier.
 *
 * Pure module — no mocks. Confirms the established adaptive/adverse calls, the
 * escalation rules (correlates and severity), human-relevance flags, and the
 * overview summary assembly.
 */

import { describe, it, expect } from 'vitest';

import { classifyToxFinding, classifyToxFindings } from '../tox-findings-classifier';

describe('classifyToxFinding', () => {
  it('frames hepatocellular hypertrophy as adaptive / non-adverse', () => {
    const r = classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy' });
    expect(r.adversity).toBe('adaptive_non_adverse');
    expect(r.humanRelevance).toBe('low');
    expect(r.reversibility).toBe('reversible');
    expect(r.overviewFraming).toMatch(/adaptive hepatic enzyme induction/);
    expect(r.escalated).toBe(false);
  });

  it('escalates hepatocellular hypertrophy to adverse when necrosis is a correlate', () => {
    const r = classifyToxFinding({
      organ: 'liver',
      finding: 'hepatocellular hypertrophy',
      correlates: ['centrilobular necrosis', 'increased ALT'],
    });
    expect(r.adversity).toBe('adverse');
    expect(r.escalated).toBe(true);
    expect(r.rationale).toMatch(/adverse correlates/);
  });

  it('escalates on moderate-or-greater severity', () => {
    const r = classifyToxFinding({
      organ: 'liver',
      finding: 'hepatocellular hypertrophy',
      severity: 'marked',
    });
    expect(r.adversity).toBe('adverse');
    expect(r.escalated).toBe(true);
  });

  it('frames phospholipidosis as a finding to monitor', () => {
    const r = classifyToxFinding({ organ: 'lung', finding: 'phospholipidosis (foamy macrophages)' });
    expect(r.adversity).toBe('monitor');
    expect(r.overviewFraming).toMatch(/phospholipidosis/);
  });

  it('flags thyroid follicular hypertrophy as rodent-specific', () => {
    const r = classifyToxFinding({ organ: 'thyroid', finding: 'follicular cell hypertrophy' });
    expect(r.adversity).toBe('adaptive_non_adverse');
    expect(r.humanRelevance).toBe('rodent_specific');
  });

  it('classifies necrosis as adverse', () => {
    const r = classifyToxFinding({ organ: 'kidney', finding: 'tubular necrosis' });
    expect(r.adversity).toBe('adverse');
  });

  it('returns indeterminate for an unrecognised finding', () => {
    const r = classifyToxFinding({ organ: 'spleen', finding: 'extramedullary haematopoiesis' });
    expect(r.adversity).toBe('indeterminate');
    expect(r.humanRelevance).toBe('unknown');
  });
});

describe('classifyToxFindings — overview summary', () => {
  it('separates adverse, adaptive, and monitor findings', () => {
    const s = classifyToxFindings([
      { organ: 'liver', finding: 'hepatocellular hypertrophy' },
      { organ: 'lung', finding: 'phospholipidosis' },
      { organ: 'kidney', finding: 'tubular necrosis' },
      { organ: 'spleen', finding: 'extramedullary haematopoiesis' },
    ]);
    expect(s.adverseFindings.map(f => f.finding)).toContain('tubular necrosis');
    expect(s.adaptiveFindings.map(f => f.finding)).toContain('hepatocellular hypertrophy');
    expect(s.monitorFindings.map(f => f.finding)).toContain('phospholipidosis');
    expect(s.indeterminateFindings).toHaveLength(1);
    expect(s.overviewParagraph).toMatch(/define the NOAEL/);
    expect(s.overviewParagraph).toMatch(/monitor/i);
  });

  it('states when no adverse findings are present', () => {
    const s = classifyToxFindings([{ organ: 'liver', finding: 'hepatocellular hypertrophy' }]);
    expect(s.adverseFindings).toHaveLength(0);
    expect(s.overviewParagraph).toMatch(/No frankly adverse/);
  });
});
