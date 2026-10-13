// @vitest-environment jsdom
/**
 * The section-check panel's line for "does this document agree with itself?"
 * (server: authoring/document-figure-consistency.ts).
 *
 * What it must never say: that the figures are consistent. Only pairs whose
 * frames are identical are compared, so "none of the pairs compared disagree"
 * is the strongest true statement, and the count compared is shown beside it. A
 * failed read of the sections is absent, not an empty result — an absent block
 * says nothing, it does not say the document agrees.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

afterEach(cleanup);

/** The panel block as the workbench renders it, extracted so the copy is asserted, not described. */
function ConsistencyBlock({ check }: { check: Record<string, unknown> }) {
  const c = check as {
    conflicts: number;
    compared: number;
    truncated?: boolean;
    comparisons?: Array<{ outcome: string; measure?: string; arm?: string; a?: { section?: string; values?: string[] }; b?: { section?: string; values?: string[] } }>;
  };
  return (
    <div data-testid="section-check-consistency">
      {c.conflicts > 0 ? (
        <>
          <span>
            <b>
              {c.conflicts} of {c.compared} figure pair(s) in this document disagree with each other.
            </b>{' '}
            Each pair states the same thing twice, in two sections, with two different values.
          </span>
          <ul>
            {(c.comparisons ?? [])
              .filter((x) => x.outcome === 'conflict')
              .map((x, i) => (
                <li key={i}>
                  <strong>{(x.a?.values ?? []).join(', ')}</strong>
                  {x.a?.section ? ` in ${x.a.section}` : ''}
                  {' vs '}
                  <strong>{(x.b?.values ?? []).join(', ')}</strong>
                  {x.b?.section ? ` in ${x.b.section}` : ''}
                  {x.measure ? ` — ${x.measure}` : ''}
                </li>
              ))}
          </ul>
          {c.truncated && <span>More were found than the panel lists.</span>}
        </>
      ) : c.compared > 0 ? (
        <span>{c.compared} figure pair(s) in this document were set against each other and none disagree.</span>
      ) : (
        <span>No figure in this document could be set against another in a different section, so nothing was compared.</span>
      )}
    </div>
  );
}

const conflict = {
  outcome: 'conflict',
  measure: 'incidence:any:pt:nausea',
  arm: 'dapralutide 1.5 mg',
  a: { section: '2.7.4.1', values: ['18.0'] },
  b: { section: '2.7.4.2', values: ['12.0'] },
};

describe('the panel names the disagreement, with both sections and both values', () => {
  it('shows each value and the section it is in', () => {
    render(<ConsistencyBlock check={{ verdict: 'conflicts_found', compared: 1, conflicts: 1, comparisons: [conflict] }} />);
    const text = screen.getByTestId('section-check-consistency').textContent ?? '';
    expect(text).toContain('18.0');
    expect(text).toContain('12.0');
    expect(text).toContain('2.7.4.1');
    expect(text).toContain('2.7.4.2');
    expect(text).toContain('1 of 1');
  });

  it('never calls agreement consistency, and says what it compared', () => {
    render(<ConsistencyBlock check={{ verdict: 'no_conflict_among_compared', compared: 4, conflicts: 0, comparisons: [] }} />);
    const text = screen.getByTestId('section-check-consistency').textContent ?? '';
    expect(text).toContain('4');
    expect(text).toMatch(/none disagree/i);
    expect(text).not.toMatch(/\bconsistent\b/i);
    expect(text).not.toMatch(/\bverified\b/i);
    expect(text).not.toMatch(/\ball figures (?:agree|match)\b/i);
  });

  it('says nothing was compared rather than implying agreement', () => {
    render(<ConsistencyBlock check={{ verdict: 'nothing_compared', compared: 0, conflicts: 0, comparisons: [] }} />);
    const text = screen.getByTestId('section-check-consistency').textContent ?? '';
    expect(text).toMatch(/nothing was compared/i);
    expect(text).not.toMatch(/\bagree\b/i);
  });
});

describe('the block is the one the workbench renders', () => {
  const wb = () =>
    readFileSync(join(__dirname, '..', 'editor', 'DocumentWorkbench.tsx'), 'utf8');

  it('is rendered in the section-check panel, only when the server sent it', () => {
    const src = wb();
    expect(src).toContain('data-testid="section-check-consistency"');
    // Guarded: a failed read of the sections is absent, and absent renders nothing.
    expect(src).toContain('{check.document_figure_consistency && (');
    // The same three branches, and the same refusal to call agreement consistency.
    expect(src).toContain('none disagree');
    expect(src).toContain('so nothing was compared');
    const block = src.slice(src.indexOf('data-testid="section-check-consistency"'));
    const end = block.indexOf('{/* Above the canvas');
    expect(block.slice(0, end > 0 ? end : 6000)).not.toMatch(/\bconsistent\b/i);
  });
});
