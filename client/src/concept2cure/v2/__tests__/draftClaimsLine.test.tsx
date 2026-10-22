// @vitest-environment jsdom
/**
 * The editor's line for the save's cross-document claims check
 * (authoring/section-claims-check.ts): a figure the section and a cited
 * document state differently for the same frame is named with both values, and
 * no recorded check says nothing — never "no conflicts".
 *
 * This is the question the figure line cannot answer. The figure line says
 * whether a number is in a source at all; this says whether it agrees.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { describeClaimsCheck } from '../editor/provenance';
import { DraftClaimsLine } from '../editor/DraftClaimsLine';

afterEach(cleanup);

const provenance = (claims: unknown) => ({
  source: 'ana',
  projectSourceReferences: [{ sectionCode: '2.7.4', sources: [], qualification: 'unassessed', verification: 'current_at_save', claims }],
});

const conflict = {
  outcome: 'conflict',
  measure: 'incidence:any:pt:nausea',
  arm: 'dapralutide 1.5 mg',
  detail: 'nausea 12.0 vs 18.0',
  section: { values: ['12.0'], quote: 'nausea was reported in 12.0% of patients', start: 0, end: 40 },
  source: { values: ['18.0'], quote: 'Nausea was reported in 55 subjects (18.0%)', start: 0, end: 42, documentId: 'doc-1', contentHash: 'h' },
};

describe('describeClaimsCheck', () => {
  it('sums the sections and lists each conflict with both values and its section', () => {
    const s = describeClaimsCheck(
      provenance({
        sectionRole: 'm2_7_4',
        sources: [{ documentId: 'doc-1', contentHash: 'h', role: 'csr' }],
        verdict: 'conflicts_found',
        compared: 3,
        conflicts: 1,
        comparisons: [conflict, { ...conflict, outcome: 'consistent', section: { ...conflict.section, values: ['8.9'] } }],
        notCompared: [{ measure: 'n:treated', reason: 'population_differs', why: 'population pp vs fas' }],
        truncated: false,
      }),
    );
    expect(s).not.toBeNull();
    expect(s!.compared).toBe(3);
    expect(s!.conflicts).toBe(1);
    expect(s!.notCompared).toBe(1);
    expect(s!.conflictItems).toEqual([
      { section: '2.7.4', measure: 'incidence:any:pt:nausea', arm: 'dapralutide 1.5 mg', sectionValue: '12.0', sourceValue: '18.0' },
    ]);
  });

  it('is null when no check was recorded, so nothing reads as no conflicts', () => {
    expect(describeClaimsCheck({ source: 'ana' })).toBeNull();
    expect(describeClaimsCheck({ source: 'ana', projectSourceReferences: [{ sectionCode: '2.7.4', sources: [] }] })).toBeNull();
    expect(describeClaimsCheck(null)).toBeNull();
  });
});

describe('DraftClaimsLine', () => {
  const summary = (over: Record<string, unknown> = {}) => ({
    compared: 3,
    conflicts: 1,
    notCompared: 1,
    conflictItems: [
      { section: '2.7.4', measure: 'incidence:any:pt:nausea', arm: 'dapralutide 1.5 mg', sectionValue: '12.0', sourceValue: '18.0' },
    ],
    truncated: false,
    ...over,
  });

  it('names the disagreement with both values as written', () => {
    render(<DraftClaimsLine check={summary()} />);
    const line = screen.getByTestId('doc-claims-check');
    expect(line.textContent).toContain('12.0');
    expect(line.textContent).toContain('18.0');
    expect(line.textContent).toContain('2.7.4');
  });

  it('says what it compared, and never calls agreement a clean bill', () => {
    render(<DraftClaimsLine check={summary({ conflicts: 0, conflictItems: [] })} />);
    const text = screen.getByTestId('doc-claims-check').textContent ?? '';
    expect(text).toContain('3');
    expect(text).not.toMatch(/\ball (?:figures|numbers) (?:agree|match)\b/i);
    expect(text).not.toMatch(/\bconsistent\b/i);
    expect(text).not.toMatch(/\bverified\b/i);
  });

  it('says nothing was compared rather than implying agreement', () => {
    render(<DraftClaimsLine check={summary({ compared: 0, conflicts: 0, conflictItems: [], notCompared: 4 })} />);
    const text = screen.getByTestId('doc-claims-check').textContent ?? '';
    expect(text).toMatch(/no figure|nothing/i);
    expect(text).toContain('4');
  });

  it('says when it kept fewer than it found', () => {
    render(<DraftClaimsLine check={summary({ truncated: true })} />);
    expect(screen.getByTestId('doc-claims-check').textContent).toMatch(/more|not all/i);
  });
});

describe('the line is on the surface the author already reads', () => {
  it('is rendered by the workbench wherever the figure line is, from the same provenance read', () => {
    // Node built-ins through the jsdom environment: the assertion is on the source, not the DOM.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const wb = readFileSync(join(__dirname, '..', 'editor', 'DocumentWorkbench.tsx'), 'utf8');
    expect(wb).toContain("import { DraftClaimsLine } from './DraftClaimsLine'");
    expect(wb).toContain('describeClaimsCheck(body.document.provenance)');
    // Beside the figure line, in every place it appears: the document masthead and the section one.
    const figureAt = [...wb.matchAll(/\{docFigures && <DraftFigureLine check=\{docFigures\} \/>\}/g)];
    const claimsAt = [...wb.matchAll(/\{docClaims && <DraftClaimsLine check=\{docClaims\} \/>\}/g)];
    expect(figureAt.length).toBeGreaterThan(0);
    expect(claimsAt.length).toBe(figureAt.length);
    // And cleared when the document changes, so a stale check is never shown against new text.
    expect(wb).toContain('setDocClaims(null)');
  });
});
