/**
 * Writing Precision Gate — pure critique + terminology consistency + live tool.
 * Ported from abandoned PR #1003 onto v2 (see writing-precision-gate.ts).
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
import { critiqueDraft, buildRevisionBrief, verifyRevision, critiqueDocument } from '../writing-precision-gate';
import { CRITIQUE_DRAFT, VERIFY_REVISION, CRITIQUE_DOCUMENT } from '../writingQualityTools';
import { getToolHandler } from '../AnaToolExecutor';

describe('terminology consistency', () => {
  it('flags the same document-level quantity stated with two different values', () => {
    const text =
      'Randomized: 186 subjects in the pivotal study, per the protocol. ' +
      'Efficacy results are reported for all subjects (randomized = 184) through week 12.';
    const findings = checkValueConsistency(text);
    const sample = findings.find(f => f.label === 'sample_size:randomized');
    expect(sample).toBeTruthy();
    expect(sample!.variants.sort()).toEqual(['184', '186']);
    expect(sample!.severity).toBe('high');
  });

  it('does not flag legitimately multi-valued quantities (n per arm, p per endpoint, week per visit)', () => {
    // The #1003 original grouped by bare label, so this ordinary results
    // paragraph was a HIGH finding and forced 'revise'.
    const text =
      'A total of N=186 subjects were randomized; n=93 received drug and n=93 placebo. ' +
      'The primary endpoint differed at week 12 (p=0.003) and the key secondary at week 24 (p=0.041); ' +
      'N=184 subjects completed treatment.';
    expect(checkValueConsistency(text)).toHaveLength(0);
  });

  it('does not flag a value that is stated consistently', () => {
    const text =
      'Randomized: 186 subjects across 20 sites. Of these (randomized = 186), all were in the safety set.';
    expect(checkValueConsistency(text)).toHaveLength(0);
  });

  it('does not treat a leading qualifier as a second expansion', () => {
    const text =
      'Median Progression-Free Survival (PFS) was 11 months. Progression-Free Survival (PFS) was assessed by BICR.';
    expect(checkAbbreviationConsistency(text)).toHaveLength(0);
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

describe('claims dimension (composes promotional-screening, no second lexicon)', () => {
  it('flags absolute safety, guarantees, and causal overreach as claims findings', () => {
    const safety = critiqueDraft({ text: 'The device is completely safe with no side effects.' });
    expect(safety.findings.some(f => f.category === 'claims' && f.severity === 'high')).toBe(true);

    const causal = critiqueDraft({ text: 'The treatment cures the disease and eliminates recurrence.' });
    expect(causal.findings.some(f => f.category === 'claims' && /causal_overreach/.test(f.message))).toBe(true);
    expect(causal.verdict).toBe('revise');
  });

  it('does not flag appropriately hedged scientific prose', () => {
    const ok = critiqueDraft({
      text: 'The treatment was associated with a 42% response rate (per the SAP); the difference versus control was statistically significant.',
    });
    expect(ok.findings.filter(f => f.category === 'claims')).toEqual([]);
  });
});

describe('critiqueDraft', () => {
  it('penalizes an ungrounded number and a self-contradiction, verdict revise', () => {
    const text =
      'The response rate was 42% in the treatment arm. ' +
      'Randomized: 186 subjects. Efficacy was analyzed in all subjects (randomized = 184).';
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

describe('critiqueDocument + critique_document tool', () => {
  it('catches a value stated inconsistently ACROSS sections', () => {
    const doc = critiqueDocument([
      { title: 'Methods', text: 'Enrolled: 186 subjects were treated according to the protocol.' },
      { title: 'Results', text: 'Efficacy was assessed in all subjects (enrolled = 184) per the SAP.' },
    ]);
    expect(doc.crossSectionFindings.some(f => f.category === 'consistency')).toBe(true);
    expect(doc.verdict).toBe('revise');
  });

  it('passes a coherent two-section document', () => {
    const doc = critiqueDocument([
      { title: 'Methods', text: 'A total of 186 subjects were randomized to treatment according to the protocol.' },
      { title: 'Results', text: 'All 186 subjects were analyzed for efficacy, per the SAP and the protocol.' },
    ]);
    expect(doc.crossSectionFindings).toHaveLength(0);
    expect(doc.verdict).toBe('pass');
  });

  it('tool requires sections and runs live', async () => {
    expect(CRITIQUE_DOCUMENT.input_schema.required).toEqual(['sections']);
    const handler = getToolHandler('critique_document')!;
    const out = JSON.parse(await handler({
      sections: [
        { title: 'A', text: 'Enrolled: 186 subjects were treated according to the protocol.' },
        { title: 'B', text: 'Efficacy was assessed in all subjects (enrolled = 184) per the SAP.' },
      ],
    }, {}));
    expect(out.status).toBe('computed');
    expect(out.crossSectionFindings.some((f: { category: string }) => f.category === 'consistency')).toBe(true);
  });
});
