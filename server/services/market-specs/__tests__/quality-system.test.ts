/**
 * Tests for the QMS (ISO 13485 ↔ FDA QMSR/QSR) module.
 */
import { describe, it, expect } from 'vitest';
import { QMS_CLAUSES, getQmsClause, qmsReviewerQuestions, assessQmsReadiness, FDA_QMSR_NOTE } from '../quality-system';

describe('QMS clauses', () => {
  it('covers the major ISO 13485 clauses with FDA mapping + reviewer questions', () => {
    const ids = QMS_CLAUSES.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['design_controls', 'capa', 'feedback_complaints', 'nonconforming', 'purchasing']));
    for (const c of QMS_CLAUSES) {
      expect(c.fdaMapping).toBeTruthy();
      expect(c.reviewerQuestions.length).toBeGreaterThan(0);
    }
  });

  it('maps design controls to 21 CFR 820.30 and CAPA to 820.100', () => {
    expect(getQmsClause('design_controls')?.fdaMapping).toMatch(/820\.30/);
    expect(getQmsClause('capa')?.fdaMapping).toMatch(/820\.100/);
  });

  it('asks about reportability and design verification/validation', () => {
    const qs = qmsReviewerQuestions();
    expect(qs.some((q) => q.clauseId === 'feedback_complaints' && /reportab/i.test(q.question))).toBe(true);
    expect(qs.some((q) => q.clauseId === 'design_controls' && /verification AND validation/i.test(q.question))).toBe(true);
  });

  it('carries the QMSR transition note (effective 2026-02-02)', () => {
    expect(FDA_QMSR_NOTE).toMatch(/2026-02-02/);
    expect(FDA_QMSR_NOTE).toMatch(/ISO 13485:2016/);
  });
});

describe('QMS readiness assessment', () => {
  it('is ready when all major clauses are present', () => {
    const all = QMS_CLAUSES.map((c) => c.id);
    const a = assessQmsReadiness(all);
    expect(a.ready).toBe(true);
    expect(a.missingRequiredClauses).toHaveLength(0);
    expect(a.fdaNote).toMatch(/QMSR/);
  });

  it('reports missing clauses for a partial QMS', () => {
    const a = assessQmsReadiness(['qms_general', 'management']);
    expect(a.ready).toBe(false);
    expect(a.missingRequiredClauses).toEqual(expect.arrayContaining(['design_controls', 'capa']));
  });
});
