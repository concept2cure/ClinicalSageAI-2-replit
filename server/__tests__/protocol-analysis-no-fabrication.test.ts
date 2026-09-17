/**
 * The protocol analyser must report what a document STATES — never what a
 * protocol usually says.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `ProtocolAnalyzerService.analyzeProtocol()` extracted nine fields, and every
 * extraction was a `match ? real : invented` ternary:
 *
 *   phase               -> 'Phase 2'
 *   sample_size         -> 100
 *   duration_weeks      -> 24
 *   primary_endpoint    -> 'Overall Response Rate'
 *   secondary_endpoints -> ['Progression-Free Survival', 'Safety and Tolerability']
 *   design              -> 'Randomized, Double-Blind, Placebo-Controlled'
 *   arms                -> 2
 *   sponsor             -> 'Unknown Sponsor'
 *
 * So ANY non-empty string produced a complete, plausible clinical protocol. The
 * result was stamped `confidence_score: 0.85` — a constant, on every result —
 * and a `summary` sentence was composed FROM the invented values, so the
 * fabrication came back as fluent prose:
 *
 *   "Protocol for a Phase 2 clinical trial investigating Oncology with 100
 *    participants over 24 weeks. The primary endpoint is Overall Response Rate."
 *
 * It also asserted `global_compliance: { FDA: true, EMA: true, ... }` — a
 * regulatory compliance verdict, unconditionally, from a handful of regexes.
 *
 * ── AND HOW IT REACHED A REAL DOCUMENT ───────────────────────────────────────
 * POST /api/protocol/analyze-file never read the bytes of a .pdf, .docx or
 * .doc. It substituted the literal string "Extracted text from <name>. In a
 * real implementation, we would use proper libraries for extraction from <ext>
 * files." and analysed THAT. The .txt branch read the file correctly, so the
 * defect was invisible to anyone testing with a text file.
 *
 * The combination is what made it serious: a customer uploaded a real protocol
 * PDF and received a full analysis — sample size, endpoints, arms, design, an
 * FDA/EMA compliance verdict — of a placeholder sentence about placeholders.
 */
import { describe, it, expect } from 'vitest';

import { protocolAnalyzerService } from '../protocol-analyzer-service';

describe('analyzeProtocol reports only what the document states', () => {
  it('invents nothing for a document that states nothing', async () => {
    const result = await protocolAnalyzerService.analyzeProtocol(
      'This document contains no protocol parameters whatsoever.'
    );

    // Each of these was a hardcoded default before.
    expect(result.phase).toBeUndefined();
    expect(result.sample_size).toBeUndefined();
    expect(result.duration_weeks).toBeUndefined();
    expect(result.primary_endpoint).toBeUndefined();
    expect(result.secondary_endpoints).toBeUndefined();
    expect(result.design).toBeUndefined();
    expect(result.arms).toBeUndefined();
    expect(result.sponsor).toBeUndefined();
  });

  it('does not compose a summary out of values it never found', async () => {
    const result = await protocolAnalyzerService.analyzeProtocol(
      'This document contains no protocol parameters whatsoever.'
    );

    const summary = result.summary ?? '';
    expect(summary).not.toMatch(/Phase 2/);
    expect(summary).not.toMatch(/100 participants/);
    expect(summary).not.toMatch(/24 weeks/);
    expect(summary).not.toMatch(/Overall Response Rate/);
    expect(summary).toMatch(/No protocol parameters could be read/i);
  });

  it('reports coverage rather than a constant confidence', async () => {
    const empty = await protocolAnalyzerService.analyzeProtocol('Nothing here.');
    const rich = await protocolAnalyzerService.analyzeProtocol(
      [
        'Phase 3 study.',
        'sample size: 480',
        'duration: 52 weeks',
        'primary endpoint: overall survival',
        'secondary endpoints: progression-free survival, safety',
        'study design: randomized, double-blind',
        '3 arms',
        'sponsor: Acme Therapeutics',
        'inclusion criteria: adults 18 and over',
        'exclusion criteria: prior therapy',
      ].join('\n')
    );

    // `confidence_score` was 0.85 on BOTH of these.
    expect((empty as { confidence_score?: number }).confidence_score).toBeUndefined();
    expect(empty.extraction_coverage).toBeLessThan(rich.extraction_coverage!);
    expect(empty.fields_not_stated!.length).toBeGreaterThan(rich.fields_not_stated!.length);
    // And the named-missing list is the honest inverse of coverage.
    expect(empty.fields_not_stated).toContain('sample_size');
    expect(rich.fields_not_stated).not.toContain('sample_size');
  });

  it('still reads the values a document does state', async () => {
    // The point is not to return less — it is to return only what is there.
    const result = await protocolAnalyzerService.analyzeProtocol(
      'Phase 3 study. sample size: 480\nduration: 52 weeks\nprimary endpoint: overall survival'
    );

    expect(result.phase).toMatch(/3|III/);
    expect(result.sample_size).toBe(480);
    expect(result.duration_weeks).toBe(52);
    expect(result.primary_endpoint).toMatch(/overall survival/i);
    expect(result.summary).toMatch(/480 participants/);
  });

  it('makes no regulatory compliance claim about the document', async () => {
    const result = await protocolAnalyzerService.analyzeProtocol(
      'Phase 3 oncology study. sample size: 480'
    );

    // `global_compliance: { FDA: true, EMA: true, PMDA: ..., NMPA: ... }` was
    // returned for every document. A compliance verdict is the output of a
    // review against a requirements set; nothing here performs one.
    expect(result.global_compliance).toBeUndefined();
    // Nor a determination about this study's monitoring, nor where it runs.
    expect(result.safety_monitoring).toBeUndefined();
    expect(result.geographic_regions).toBeUndefined();
  });

  it('marks the generic reference text as generic', async () => {
    // These strings are identical for every document. They are kept because a
    // requirements checklist is useful, but they must not read as findings.
    const result = await protocolAnalyzerService.analyzeProtocol('Phase 1 study.');

    expect(result.regulatory_notes).toMatch(/GENERIC GUIDANCE/);
    expect(result.ethical_considerations!.every(s => /GENERIC GUIDANCE/.test(s))).toBe(true);
  });
});
