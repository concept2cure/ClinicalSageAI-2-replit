// @vitest-environment jsdom
/**
 * What was checked about this answer — the strip under every AnA reply.
 *
 * WHAT WENT WRONG (to 2026-10-04)
 * The strip was built from AnA's own [KNOWN]/[INFERRED] labels and read
 * "3 of 3 claims grounded · 2 sources" with a green check: a label is the
 * model describing its own claim, and the "sources" were the labels counted.
 * The server's deterministic comparison of the answer with the turn's tool
 * results was computed and shown nowhere. And a label check that ran and
 * FAILED (any overclaim, any contradiction) read "not assessed", because the
 * client dropped `attempted`.
 *
 * THE RULES THIS SUITE EXISTS FOR
 * - The engine's check leads; a check mark is earned only by it.
 * - Labels are reported as AnA's, never as grounding or sources.
 * - A zero is never a clean bill of health: no source consulted is "not
 *   checked", nothing to check is not a pass, not assessed shows no count.
 * - A failed label check shows its flags; it is not "not assessed".
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AnaGrounding, type AnaGroundingEvidence } from '../AnaGrounding';
import type { AnswerCheckView } from '../../components/ana/anaAnswerCheck';

afterEach(cleanup);

const check = (over: Partial<AnswerCheckView> = {}): AnswerCheckView => ({
  engine: 'answer-check/1',
  basis: 'sources',
  claims: 5,
  checked: 5,
  found: 3,
  notFound: [
    { kind: 'nct', text: 'NCT09999999' },
    { kind: 'figure', text: '31%' },
  ],
  unchecked: [],
  sources: ['tool:get_trial_details', 'web', 'context'],
  unreadable: [],
  verdicts: [],
  ...over,
});

const labels: AnaGroundingEvidence = {
  attempted: true,
  validated: true,
  sourceCount: 6,
  groundedClaims: 11,
  weakClaims: 2,
  missingSupport: 0,
  flaggedClaims: [
    { kind: 'overclaim', text: 'the three cited precedents cleared at 0.4-0.55' },
    { kind: 'ungrounded', text: 'EMA accepts this without further justification' },
  ],
};

describe('AnaGrounding — the engine\'s check leads', () => {
  it('says how many specific claims were not found in this turn\'s sources, and quotes them by kind', () => {
    const { container } = render(<AnaGrounding evidence={{ ...labels, check: check() }} />);
    expect(screen.getByText(/2 of 5 specific claims not found in this turn's sources/)).toBeTruthy();
    expect(screen.getByText(/“NCT09999999” — trial id/)).toBeTruthy();
    expect(screen.getByText(/“31%” — figure/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-row .ana-grounding-ic.is-weak')).toBeTruthy();
  });

  it('names what it checked against', () => {
    render(<AnaGrounding evidence={{ ...labels, check: check() }} />);
    expect(screen.getByText('Checked against: get trial details, web, project context')).toBeTruthy();
  });

  it('earns its check mark only when every specific claim was found', () => {
    const { container } = render(
      <AnaGrounding evidence={{ ...labels, check: check({ found: 5, notFound: [] }) }} />,
    );
    expect(screen.getByText(/All 5 specific claims found in this turn's sources/)).toBeTruthy();
    expect(container.querySelectorAll('.ana-grounding-ic.is-ok')).toHaveLength(1);
  });

  it('with no source consulted, the claims are not checked — never found, never a pass', () => {
    const { container } = render(
      <AnaGrounding
        evidence={{
          ...labels,
          check: check({ basis: 'no_sources', checked: 0, found: 0, notFound: [], unchecked: [{ kind: 'figure', text: '1,066 patients' }], claims: 1, sources: ['person'] }),
        }}
      />,
    );
    expect(screen.getByText(/No source consulted this turn — 1 specific claim not checked/)).toBeTruthy();
    expect(screen.getByText(/“1,066 patients” — figure/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-ok')).toBeNull();
    expect(container.textContent).not.toMatch(/Checked against/);
  });

  it('nothing to check is not a pass', () => {
    const { container } = render(
      <AnaGrounding evidence={{ ...labels, check: check({ claims: 0, checked: 0, found: 0, notFound: [] }) }} />,
    );
    expect(screen.getByText(/No specific claims to check against this turn's sources/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-ok')).toBeNull();
  });

  it('names a verdict the answer states, and says where verdicts come from', () => {
    render(
      <AnaGrounding
        evidence={{ ...labels, check: check({ verdicts: [{ text: 'is ready to file', reason: 'States a readiness verdict.' }] }) }}
      />,
    );
    expect(screen.getByText(/States a verdict — verdicts come from engines/)).toBeTruthy();
    expect(screen.getByText(/“is ready to file”/)).toBeTruthy();
  });

  it('names a source the check could not read', () => {
    render(<AnaGrounding evidence={{ ...labels, check: check({ unreadable: ['attachment:Protocol v3.pdf'] }) }} />);
    expect(screen.getByText('Not readable by this check: Protocol v3.pdf')).toBeTruthy();
  });

  it('lists three claims and counts the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ kind: 'figure', text: `${i + 10}%` }));
    render(<AnaGrounding evidence={{ ...labels, check: check({ claims: 5, found: 0, notFound: many }) }} />);
    expect(screen.getByText('and 2 more')).toBeTruthy();
    expect(screen.queryByText(/“13%”/)).toBeNull();
  });
});

describe('AnaGrounding — AnA\'s labels are hers', () => {
  it('reports labels as labelled, never as grounded, and never as sources', () => {
    const { container } = render(<AnaGrounding evidence={{ ...labels, check: check() }} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/AnA's labels: 11 claims labelled · 2 unlabelled or overclaimed/);
    expect(text).not.toMatch(/grounded/i);
    expect(text).not.toMatch(/6 sources/);
  });

  it('names the flags by kind and quotes the first', () => {
    render(<AnaGrounding evidence={{ ...labels, check: check() }} />);
    expect(screen.getByText(/one overclaim, one unlabelled/)).toBeTruthy();
    expect(screen.getByText(/the three cited precedents cleared at 0\.4-0\.55/)).toBeTruthy();
  });

  it('a label check that ran and failed shows what failed — it is not "not assessed"', () => {
    const failed: AnaGroundingEvidence = {
      attempted: true,
      validated: false,
      sourceCount: 0,
      groundedClaims: 0,
      weakClaims: 2,
      missingSupport: 0,
      riskSummary: '2/2 claims (100%) lack nearby evidence labels; 2 overclaim(s).',
      flaggedClaims: [{ kind: 'overclaim', text: 'Approval is therefore guaranteed' }],
    };
    const { container } = render(<AnaGrounding evidence={failed} />);
    expect(container.textContent).not.toMatch(/not assessed/i);
    expect(screen.getByText(/Approval is therefore guaranteed/)).toBeTruthy();
    expect(screen.getByText('2/2 claims (100%) lack nearby evidence labels; 2 overclaim(s).')).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-weak')).toBeTruthy();
  });

  it('a failed label check with no counts still shows what failed, beside the engine\'s check', () => {
    const contradiction: AnaGroundingEvidence = {
      attempted: true,
      validated: false,
      sourceCount: 0,
      groundedClaims: 0,
      weakClaims: 0,
      missingSupport: 0,
      riskSummary: '1 internal contradiction(s) detected.',
      flaggedClaims: [{ kind: 'contradiction', text: 'Conflicting data sufficiency' }],
    };
    render(<AnaGrounding evidence={{ ...contradiction, check: check({ found: 5, notFound: [] }) }} />);
    expect(screen.getByText(/one contradiction/)).toBeTruthy();
    expect(screen.getByText('1 internal contradiction(s) detected.')).toBeTruthy();
  });

  it('clean labels carry no check mark: a label is not verification', () => {
    const clean = { ...labels, weakClaims: 0, groundedClaims: 13, flaggedClaims: [], riskSummary: 'Every claim carries an evidence label.' };
    const { container } = render(<AnaGrounding evidence={clean} />);
    expect(screen.getByText(/AnA's labels: 13 claims labelled/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-ok')).toBeNull();
    expect(container.querySelector('.ana-grounding-ic.is-weak')).toBeNull();
  });
});

describe('AnaGrounding — not assessed is not a clean bill of health', () => {
  const unassessed: AnaGroundingEvidence = {
    attempted: false, validated: false, sourceCount: 0, groundedClaims: 0, weakClaims: 0, missingSupport: 0,
  };

  it('with no check either, says the answer was not assessed and shows no count', () => {
    const { container } = render(<AnaGrounding evidence={{ ...unassessed, sourceCount: 4, groundedClaims: 9, weakClaims: 1 }} />);
    expect(screen.getByText(/not assessed/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/9|4 sources|1 unlabelled/);
    expect(container.querySelector('.ana-grounding-ic.is-unknown')).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-weak')).toBeNull();
  });

  it('with a check, the unassessed labels add nothing to it', () => {
    const { container } = render(<AnaGrounding evidence={{ ...unassessed, check: check({ found: 5, notFound: [] }) }} />);
    expect(container.textContent).not.toMatch(/labels|not assessed/i);
    expect(screen.getByText(/All 5 specific claims found/)).toBeTruthy();
  });

  it('renders nothing when the turn carries no verdict at all', () => {
    const { container } = render(<AnaGrounding />);
    expect(container.firstChild).toBeNull();
  });

  it('never states a verdict in colour alone', () => {
    const { container } = render(<AnaGrounding evidence={{ ...labels, check: check() }} />);
    for (const ic of container.querySelectorAll('.ana-grounding-ic')) {
      expect(ic.querySelector('svg')).toBeTruthy();
    }
    expect(container.textContent).toContain('not found');
  });
});
