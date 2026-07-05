/**
 * Writing Precision Gate — pure critique + terminology consistency + live tool.
 * These lock the deterministic behavior that decides whether a draft is precise
 * enough to ship: grounding, in-document value/abbreviation consistency,
 * readability, abbreviation definition, and the score/verdict/revision brief.
 */

import { describe, it, expect } from 'vitest';

import {
  checkValueConsistency,
  checkAbbreviationConsistency,
  checkPreferredTermConsistency,
  checkTerminologyConsistency,
} from '../terminology-consistency';
import { checkOverclaims } from '../claim-precision';
import { critiqueDraft, buildRevisionBrief, verifyRevision } from '../writing-precision-gate';
import { CRITIQUE_DRAFT, VERIFY_REVISION } from '../writingQualityTools';
import { getToolHandler } from '../AnaToolExecutor';

describe('terminology consistency', () => {
  it('flags the same quantity stated with two different values', () => {
    const text =
      'A total of N=186 subjects were randomized in the pivotal study. ' +
      'The efficacy analysis population comprised N=184 subjects who completed treatment through week 12.';
    const findings = checkValueConsistency(text);
    const sample = findings.find(f => f.label === 'sample_size');
    expect(sample).toBeTruthy();
    expect(sample!.variants.sort()).toEqual(['184', '186']);
    expect(sample!.severity).toBe('high');
  });

  it('does not flag a value that is stated consistently', () => {
    const text =
      'A total of N=186 subjects were randomized. All N=186 subjects were included in the safety analysis set.';
    expect(checkValueConsistency(text)).toHaveLength(0);
  });

  it('flags an acronym expanded two different ways', () => {
    const text =
      'Progression-Free Survival (PFS) was the primary endpoint. ' +
      'The Partial Function Score (PFS) was a secondary measure.';
    const findings = checkAbbreviationConsistency(text);
    const pfs = findings.find(f => f.label === 'PFS');
    expect(pfs).toBeTruthy();
    expect(pfs!.variants.length).toBe(2);
  });

  it('flags US/UK spelling drift and mixed interchangeable terms', () => {
    const drift = checkPreferredTermConsistency(
      'Subjects were randomized to treatment. Participants were then randomised again at week 12.'
    );
    const labels = drift.map(f => f.label).sort();
    expect(labels).toContain('randomize/randomise');
    expect(labels).toContain('subject/participant');
  });

  it('does not flag a single consistent spelling', () => {
    expect(
      checkPreferredTermConsistency('Subjects were randomized to treatment and analyzed for efficacy.')
    ).toHaveLength(0);
  });

  it('combined report reports ok when clean', () => {
    const report = checkTerminologyConsistency('The study enrolled N=186 subjects across 20 sites in total.');
    expect(report.ok).toBe(true);
  });
});

describe('over-claim detection', () => {
  it('flags absolute safety, guarantees, and causal overreach', () => {
    const safety = checkOverclaims('The device is completely safe with no side effects.');
    expect(safety.findings.some(f => f.kind === 'absolute_safety')).toBe(true);

    const guarantee = checkOverclaims('This therapy guarantees a proven response in all patients.');
    expect(guarantee.findings.some(f => f.severity === 'high')).toBe(true);

    const causal = checkOverclaims('The treatment cures the disease and prevents recurrence.');
    expect(causal.findings.some(f => f.kind === 'causal_overreach')).toBe(true);
  });

  it('does not flag appropriately hedged scientific prose', () => {
    const ok = checkOverclaims(
      'The treatment was associated with a 42% response rate; the difference versus control was statistically significant.'
    );
    expect(ok.ok).toBe(true);
  });
});

describe('critiqueDraft', () => {
  it('penalizes an ungrounded number and a self-contradiction, verdict revise', () => {
    const text =
      'The response rate was 42% in the treatment arm. ' +
      'A total of N=186 subjects were randomized. The N=184 subjects were analyzed for efficacy.';
    const report = critiqueDraft({ text, audience: 'regulator' });
    expect(report.verdict).toBe('revise');
    expect(report.score).toBeLessThan(100);
    expect(report.findings.some(f => f.category === 'grounding')).toBe(true);
    expect(report.findings.some(f => f.category === 'consistency')).toBe(true);
    // Most severe first.
    expect(report.findings[0].severity).toBe('critical');
  });

  it('a grounded, consistent regulator paragraph passes', () => {
    const text =
      'The primary endpoint was met: the response rate was 42% in the treatment arm versus 21% in the ' +
      'control arm (p<0.001, per the SAP). A total of 186 subjects were randomized, ' +
      'and all 186 were included in the primary analysis according to the protocol.';
    const report = critiqueDraft({ text, audience: 'regulator' });
    expect(report.verdict).toBe('pass');
    expect(report.findings.every(f => f.severity !== 'critical' && f.severity !== 'high')).toBe(true);
  });

  it('buildRevisionBrief lists findings most-severe first, or empty on pass', () => {
    const revise = critiqueDraft({ text: 'The response rate was 42% in the treatment arm.', audience: 'regulator' });
    const brief = buildRevisionBrief(revise);
    expect(brief).toMatch(/verdict: revise/);
    expect(brief).toMatch(/grounding/);

    const clean = critiqueDraft({ text: '', audience: 'regulator' });
    expect(buildRevisionBrief(clean)).toBe('');
  });
});

describe('critique_draft tool', () => {
  it('is well-formed and requires text', () => {
    expect(CRITIQUE_DRAFT.input_schema.required).toEqual(['text']);
    expect(CRITIQUE_DRAFT.input_schema.type).toBe('object');
  });

  it('runs live and returns a score, verdict, and revision brief', async () => {
    const handler = getToolHandler('critique_draft');
    expect(handler).toBeTypeOf('function');
    const out = JSON.parse(await handler!({ text: 'The response rate was 42% in the treatment arm.' }, {}));
    expect(out.status).toBe('computed');
    expect(typeof out.score).toBe('number');
    expect(['pass', 'revise']).toContain(out.verdict);
    expect(typeof out.revisionBrief).toBe('string');
  });

  it('rejects an empty draft as needs_parameters', async () => {
    const handler = getToolHandler('critique_draft')!;
    const out = JSON.parse(await handler({ text: '   ' }, {}));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('verifyRevision + verify_revision tool', () => {
  const ungrounded = 'The response rate was 42% in the treatment arm.';
  const grounded =
    'The response rate was 42% in the treatment arm (p<0.001, per the SAP), according to the protocol.';

  it('confirms a revision that fixes the finding improved and now passes', () => {
    const v = verifyRevision({ text: ungrounded }, { text: grounded });
    expect(v.afterScore).toBeGreaterThan(v.beforeScore);
    expect(v.resolvedFindings).toBeGreaterThanOrEqual(1);
    expect(v.passesNow).toBe(true);
  });

  it('detects a non-improving revision', () => {
    const v = verifyRevision({ text: ungrounded }, { text: ungrounded });
    expect(v.afterScore).toBe(v.beforeScore);
    expect(v.passesNow).toBe(false);
  });

  it('tool contract requires both texts and runs live', async () => {
    expect(VERIFY_REVISION.input_schema.required).toEqual(['originalText', 'revisedText']);
    const handler = getToolHandler('verify_revision')!;
    const out = JSON.parse(await handler({ originalText: ungrounded, revisedText: grounded }, {}));
    expect(out.status).toBe('computed');
    expect(out.result.passesNow).toBe(true);
  });
});
