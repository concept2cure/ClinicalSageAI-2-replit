import { describe, it, expect } from 'vitest';
import { summarizeModule3Gate } from '../context-enrichment.js';

/**
 * What AnA is told about whether a Module 3 submission can actually be filed.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * The CMC enrichment reported stale sections and a count of canonical sources.
 * Staleness is one of three conditions the final-export gate fails closed on —
 * the other two, unapproved sections and open critical contradictions, were not
 * in the context at all. So on the first question a CMC lead asks ("what is
 * stopping me filing?") AnA had to fall back on generic advice about the one
 * thing the canonical data answers exactly.
 *
 * ── Why the VERDICT and not the counts ────────────────────────────────────────
 * Handing the model "3 of 10 approved" makes it infer whether that is enough.
 * The gate is deterministic, so an inference there is strictly worse than the
 * fact. These tests pin the two ways that can go wrong: claiming a pass that was
 * not established, and naming a blocker that is not real.
 */

const base = {
  totalSections: 10,
  approvedSections: 10,
  staleApprovedSections: 0,
  openContradictionsBySeverity: [] as Array<{ severity: string; count: number }>,
  openCriticalContradictions: 0,
};

describe('summarizeModule3Gate', () => {
  it('says nothing at all when there are no sections', () => {
    // Nothing has been compiled, so there is no gate verdict to report. An
    // "export would pass" on zero sections would be true and useless — and read
    // as though a submission were ready.
    expect(summarizeModule3Gate({ ...base, totalSections: 0, approvedSections: 0 })).toBe('');
  });

  it('states a pass only when every condition is clear', () => {
    const out = summarizeModule3Gate(base);
    expect(out).toContain('10 of 10 §3.2 sections approved');
    expect(out).toContain('Final export would pass the gate');
    expect(out).not.toContain('BLOCKED');
    // Nothing that is zero is narrated as a problem.
    expect(out).not.toMatch(/contradiction|stale/);
  });

  it('names an unapproved section as a blocker', () => {
    const out = summarizeModule3Gate({ ...base, approvedSections: 7 });
    expect(out).toContain('7 of 10 §3.2 sections approved');
    expect(out).toContain('BLOCKED by: 3 section(s) not approved');
  });

  it('names a section that went stale AFTER approval — approval alone is not enough', () => {
    // All ten are approved, so a count-only summary would read as ready. The
    // gate disagrees, and this is the case most likely to be missed.
    const out = summarizeModule3Gate({ ...base, staleApprovedSections: 2 });
    expect(out).toContain('10 of 10 §3.2 sections approved');
    expect(out).toContain('BLOCKED');
    expect(out).toContain('2 approved section(s) went stale after approval');
  });

  it('names open critical contradictions', () => {
    const out = summarizeModule3Gate({
      ...base,
      openContradictionsBySeverity: [{ severity: 'critical', count: 1 }, { severity: 'high', count: 4 }],
      openCriticalContradictions: 1,
    });
    expect(out).toContain('Open contradictions: critical (1), high (4)');
    expect(out).toContain('BLOCKED by: 1 open critical contradiction(s)');
  });

  it('does not block on a non-critical contradiction, but still reports it', () => {
    // The gate only fails closed on critical. Reporting a high-severity finding
    // as a blocker would be a fabricated refusal; hiding it would be a
    // fabricated all-clear. Both are wrong, so it is reported and not blocking.
    const out = summarizeModule3Gate({
      ...base,
      openContradictionsBySeverity: [{ severity: 'high', count: 3 }],
      openCriticalContradictions: 0,
    });
    expect(out).toContain('Open contradictions: high (3)');
    expect(out).toContain('Final export would pass the gate');
    expect(out).not.toContain('BLOCKED');
  });

  it('lists every blocker rather than only the first', () => {
    const out = summarizeModule3Gate({
      totalSections: 10,
      approvedSections: 6,
      staleApprovedSections: 2,
      openContradictionsBySeverity: [{ severity: 'critical', count: 3 }],
      openCriticalContradictions: 3,
    });
    expect(out).toMatch(
      /BLOCKED by: 4 section\(s\) not approved; 2 approved section\(s\) went stale after approval; 3 open critical contradiction\(s\)/,
    );
    // And it tells the model these are the gate's conditions, not advice.
    expect(out).toContain("gate's own conditions");
  });

  it('drops a zero-count severity rather than printing a hollow entry', () => {
    const out = summarizeModule3Gate({
      ...base,
      openContradictionsBySeverity: [{ severity: 'critical', count: 0 }, { severity: 'low', count: 2 }],
    });
    expect(out).toContain('Open contradictions: low (2)');
    expect(out).not.toContain('critical');
  });
});
