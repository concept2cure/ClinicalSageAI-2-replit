/**
 * Tests for the PDF/A submission-grade gate (audit gap P0-2: fail closed).
 * Pure functions — no DB, no filesystem, no network.
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeSubmissionGrade,
  evaluateSubmissionGrade,
  pdfaRequiredFromEnv,
  type LeafGradeRecord,
} from '../pdfa-readiness';

const leaf = (over: Partial<LeafGradeRecord> = {}): LeafGradeRecord => ({
  fileName: 'doc.pdf',
  isPdf: true,
  converted: true,
  ...over,
});

describe('summarizeSubmissionGrade', () => {
  it('counts PDF leaves and flags the unconverted ones', () => {
    const s = summarizeSubmissionGrade([
      leaf({ fileName: 'a.pdf', converted: true }),
      leaf({ fileName: 'b.pdf', converted: false }),
      leaf({ fileName: 'index.xml', isPdf: false, converted: false }),
    ]);
    expect(s.total).toBe(3);
    expect(s.pdfLeaves).toBe(2);
    expect(s.pdfaConverted).toBe(1);
    expect(s.notConverted).toEqual(['b.pdf']);
    expect(s.allPdfA).toBe(false);
  });

  it('reports allPdfA when every PDF converted (non-PDFs ignored)', () => {
    const s = summarizeSubmissionGrade([
      leaf({ fileName: 'a.pdf', converted: true }),
      leaf({ fileName: 'util.xml', isPdf: false, converted: false }),
    ]);
    expect(s.allPdfA).toBe(true);
    expect(s.notConverted).toEqual([]);
  });
});

describe('evaluateSubmissionGrade', () => {
  const unconverted = [leaf({ fileName: 'cover.pdf', converted: false })];

  it('blocks a production package with an unconverted PDF when PDF/A is required', () => {
    const r = evaluateSubmissionGrade({ leaves: unconverted, environment: 'production', requirePdfA: true });
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toMatch(/not converted to PDF\/A/);
    expect(r.blockers[0]).toContain('cover.pdf');
  });

  it('does NOT block when PDF/A is not required (graceful-degradation default)', () => {
    const r = evaluateSubmissionGrade({ leaves: unconverted, environment: 'production', requirePdfA: false });
    expect(r.cleared).toBe(true);
    expect(r.summary.allPdfA).toBe(false); // still reported for visibility
  });

  it('does NOT block staging even when PDF/A is required', () => {
    const r = evaluateSubmissionGrade({ leaves: unconverted, environment: 'staging', requirePdfA: true });
    expect(r.cleared).toBe(true);
  });

  it('clears a production package when every PDF is PDF/A', () => {
    const r = evaluateSubmissionGrade({
      leaves: [leaf({ converted: true })],
      environment: 'production',
      requirePdfA: true,
    });
    expect(r.cleared).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe('pdfaRequiredFromEnv', () => {
  it('is true only for the literal "true"', () => {
    expect(pdfaRequiredFromEnv({ ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(pdfaRequiredFromEnv({ ECTD_REQUIRE_PDFA: 'TRUE' } as NodeJS.ProcessEnv)).toBe(true);
    expect(pdfaRequiredFromEnv({ ECTD_REQUIRE_PDFA: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(pdfaRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
