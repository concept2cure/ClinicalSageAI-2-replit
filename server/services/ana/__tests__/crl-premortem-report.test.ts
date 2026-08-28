/**
 * E14 — CRL/RTF pre-mortem decision-artifact assembly tests (pure core).
 *
 * Drives the pure crl-premortem-report core off premortem-verdict + precedent
 * fixtures. Covers: approval-probability estimation from the precedent
 * approve/deny split; risk→precedent grounding (every risk cited); fix-list
 * ordering; and the honesty/exportability guards — probability framed as an
 * estimate, sample/not_assessed non-exportable, unsealed export allowed but
 * marked unsealed.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOutcome,
  estimateApprovalProbability,
  bindRisksToGrounding,
  buildFixList,
  assembleCrlPremortemArtifact,
  renderArtifactMarkdown,
  type PrecedentOutcomeRecord,
} from '../crl-premortem-report.js';
import { composePremortem, type PremortemFinding } from '../submission-premortem-core.js';

function finding(over: Partial<PremortemFinding> = {}): PremortemFinding {
  return {
    patternId: 'p1',
    title: 'Unsupported efficacy claim',
    category: 'reviewer_trigger',
    severity: 'high',
    matchedText: 'highly effective',
    matchConfidence: 0.8,
    reviewerQuestion: 'What evidence supports this efficacy claim?',
    regulatoryBasis: '21 CFR 314.126',
    remediation: 'Cite the controlled trial and effect size.',
    ...over,
  };
}

const PRECEDENTS: PrecedentOutcomeRecord[] = [
  { id: 'K1', label: 'K123456', outcome: 'CLEARED' },
  { id: 'K2', label: 'K223456', outcome: 'APPROVED' },
  { id: 'K3', label: 'K323456', outcome: 'CRL' },
  { id: 'K4', label: 'K423456', outcome: 'PENDING' },
];

describe('classifyOutcome', () => {
  it('maps approval, denial, and unknown outcomes', () => {
    expect(classifyOutcome('CLEARED')).toBe('approved');
    expect(classifyOutcome('approved')).toBe('approved');
    expect(classifyOutcome('CRL')).toBe('denied');
    expect(classifyOutcome('REFUSE_TO_FILE')).toBe('denied');
    expect(classifyOutcome('PENDING')).toBe('unknown');
    expect(classifyOutcome('')).toBe('unknown');
  });
});

describe('estimateApprovalProbability', () => {
  it('estimates the approve-rate over precedents with a known outcome', () => {
    const est = estimateApprovalProbability(PRECEDENTS, 'medium');
    // 2 approved, 1 denied, 1 unknown → 2/3 over calibrated.
    expect(est.approved).toBe(2);
    expect(est.denied).toBe(1);
    expect(est.unknown).toBe(1);
    expect(est.value).toBeCloseTo(2 / 3, 5);
    expect(est.class).toBe('high');
    expect(est.denominator).toBe(4);
  });

  it('frames the figure as an estimate, never a guarantee', () => {
    const est = estimateApprovalProbability(PRECEDENTS, 'medium');
    expect(est.framing).toMatch(/ESTIMATE/);
    expect(est.framing).toMatch(/not a guarantee/i);
  });

  it('does not estimate when no precedent has a known outcome', () => {
    const est = estimateApprovalProbability(
      [{ id: 'x', label: 'x', outcome: 'PENDING' }],
      'low',
    );
    expect(est.value).toBeNull();
    expect(est.class).toBeNull();
    expect(est.framing).toMatch(/NOT ESTIMATED/);
  });

  it('does not estimate over an empty corpus', () => {
    expect(estimateApprovalProbability([], 'low').value).toBeNull();
  });
});

describe('bindRisksToGrounding — every risk carries a precedent citation', () => {
  it('binds each ranked risk to a precedent record when the corpus is present', () => {
    const verdict = composePremortem({
      findings: [finding(), finding({ patternId: 'p2', title: 'Missing safety database', severity: 'critical' })],
      precedentCount: 4,
      precedentCitations: [
        { id: 'K1', label: 'K123456', outcome: 'CLEARED' },
        { id: 'K3', label: 'K323456', outcome: 'CRL' },
      ],
      submissionType: '510(k)',
    });
    const risks = bindRisksToGrounding(verdict.findings, verdict.precedentCitations);
    expect(risks.length).toBe(2);
    for (const r of risks) {
      expect(r.grounding.citationId).toBeTruthy();
      expect(r.grounding.fromCorpus).toBe(true);
    }
  });

  it('falls back to the regulatory basis (never uncited) when the corpus is empty', () => {
    const verdict = composePremortem({
      findings: [finding()],
      precedentCount: 0,
      precedentCitations: [],
    });
    const risks = bindRisksToGrounding(verdict.findings, verdict.precedentCitations);
    expect(risks[0].grounding.fromCorpus).toBe(false);
    expect(risks[0].grounding.citationId).toBe('21 CFR 314.126');
  });
});

describe('buildFixList', () => {
  it('orders criticals/highs first and ties each fix to a citation', () => {
    const findings = [
      finding({ patternId: 'low1', title: 'Style nit', severity: 'low' }),
      finding({ patternId: 'crit1', title: 'No control arm', severity: 'critical' }),
      finding({ patternId: 'high1', title: 'Weak endpoint', severity: 'high' }),
    ];
    const verdict = composePremortem({ findings, precedentCount: 1, precedentCitations: [{ id: 'K1', label: 'K1', outcome: 'CLEARED' }] });
    const risks = bindRisksToGrounding(verdict.findings, verdict.precedentCitations);
    const fixes = buildFixList(verdict.findings, risks);
    expect(fixes[0].priority).toBe('critical');
    expect(fixes[fixes.length - 1].priority).toBe('low');
    for (const f of fixes) expect(f.citationId).toBeTruthy();
  });
});

describe('assembleCrlPremortemArtifact — status + exportability guard', () => {
  it('produces an estimable, exportable, UNSEALED artifact when grounded', () => {
    const verdict = composePremortem({
      findings: [finding()],
      precedentCount: PRECEDENTS.length,
      precedentCitations: PRECEDENTS.slice(0, 3),
      submissionType: '510(k)',
    });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: PRECEDENTS });
    expect(artifact.status).toBe('estimated');
    expect(artifact.exportable).toBe(true);
    expect(artifact.sealable).toBe(true);
    expect(artifact.sealStatus).toBe('unsealed');
    expect(artifact.approvalProbability.value).not.toBeNull();
  });

  it('marks not_assessed (and non-exportable) when the corpus cannot calibrate', () => {
    const verdict = composePremortem({ findings: [finding()], precedentCount: 0, precedentCitations: [] });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: [] });
    expect(artifact.status).toBe('not_assessed');
    expect(artifact.exportable).toBe(false);
    expect(artifact.sealable).toBe(false);
    expect(artifact.approvalProbability.value).toBeNull();
  });

  it('marks a sample artifact non-exportable even when grounded', () => {
    const verdict = composePremortem({
      findings: [finding()],
      precedentCount: PRECEDENTS.length,
      precedentCitations: PRECEDENTS.slice(0, 3),
    });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: PRECEDENTS, isSample: true });
    expect(artifact.status).toBe('sample');
    expect(artifact.exportable).toBe(false);
    expect(artifact.sealable).toBe(false);
  });
});

describe('renderArtifactMarkdown — export rendering + honesty guards', () => {
  it('renders a board-ready report, marked UNSEALED, with cited risks and fix-list', () => {
    const verdict = composePremortem({
      findings: [finding(), finding({ patternId: 'p2', title: 'No control arm', severity: 'critical' })],
      precedentCount: PRECEDENTS.length,
      precedentCitations: PRECEDENTS.slice(0, 3),
      submissionType: '510(k)',
    });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: PRECEDENTS });
    const md = renderArtifactMarkdown(artifact);
    expect(md).toMatch(/UNSEALED DRAFT/);
    expect(md).toMatch(/Approval-probability estimate/);
    expect(md).toMatch(/ESTIMATE/);
    expect(md).toMatch(/Top risks/);
    expect(md).toMatch(/Grounding precedent/);
    // The precedent→risk pairing is positional, not topical, so every
    // corpus-grounded citation must disclose that it is not verified as
    // topically specific — a reviewer must not read list order as evidence.
    expect(md).toMatch(/not verified as topically specific/i);
    expect(md).toMatch(/Prioritized fix-list/);
    expect(md).toMatch(/Precedent citations/);
  });

  it('refuses to render a not_assessed artifact (export guard)', () => {
    const verdict = composePremortem({ findings: [finding()], precedentCount: 0, precedentCitations: [] });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: [] });
    expect(() => renderArtifactMarkdown(artifact)).toThrow(/not exportable/);
  });

  it('refuses to render a sample artifact (export guard)', () => {
    const verdict = composePremortem({
      findings: [finding()],
      precedentCount: PRECEDENTS.length,
      precedentCitations: PRECEDENTS.slice(0, 3),
    });
    const artifact = assembleCrlPremortemArtifact({ verdict, precedents: PRECEDENTS, isSample: true });
    expect(() => renderArtifactMarkdown(artifact)).toThrow(/not exportable/);
  });
});
