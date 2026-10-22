// @vitest-environment jsdom
/**
 * The editor's line for the save's figure check (S5a): a figure no cited
 * source states is named with its section; no recorded check says nothing,
 * never "all found".
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { describeFigureCheck } from '../editor/provenance';
import { DraftFigureLine } from '../editor/DraftFigureLine';

afterEach(cleanup);

const provenance = (figures: unknown) => ({
  source: 'ana',
  projectSourceReferences: [{ sectionCode: '2.5.4', sources: [], qualification: 'unassessed', verification: 'current_at_save', figures }],
});

describe('describeFigureCheck', () => {
  it('sums the sections and lists each unverified figure with its section', () => {
    const s = describeFigureCheck(provenance({
      checked: 2, found: 1, unverified: 1, truncated: false,
      figures: [{ text: '55%', kind: 'percent', status: 'unverified' }, { text: '30 subjects', kind: 'count', status: 'found' }],
    }));
    expect(s).toEqual({ checked: 2, found: 1, unverified: 1, truncated: false, unverifiedItems: [{ section: '2.5.4', text: '55%' }] });
  });

  it('is null when no check was recorded, so nothing reads as all clear', () => {
    expect(describeFigureCheck({ source: 'ana' })).toBeNull();
    expect(describeFigureCheck({ source: 'ana', projectSourceReferences: [{ sectionCode: '2.5.4', sources: [] }] })).toBeNull();
    expect(describeFigureCheck(null)).toBeNull();
  });
});

describe('DraftFigureLine', () => {
  it('names the unverified figure and its section', () => {
    render(<DraftFigureLine check={{ checked: 2, found: 1, unverified: 1, truncated: false, unverifiedItems: [{ section: '2.5.4', text: '55%' }] }} />);
    const line = screen.getByTestId('doc-figure-check');
    expect(line.textContent).toContain('1 of 2 figure(s) are not stated in the cited sources');
    expect(line.textContent).toContain('55% (2.5.4)');
  });

  it('says when every figure was found', () => {
    render(<DraftFigureLine check={{ checked: 3, found: 3, unverified: 0, truncated: false, unverifiedItems: [] }} />);
    expect(screen.getByTestId('doc-figure-check').textContent).toContain('All 3 figure(s) were found');
  });
});
