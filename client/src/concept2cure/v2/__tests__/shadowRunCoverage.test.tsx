// @vitest-environment jsdom
/**
 * A Shadow Review run says what its reviewer read (2026-10-25, row D7;
 * ShadowRunCoverage.tsx). "No findings" over three leaves read out of fourteen
 * is not a clean review of fourteen, and a run recorded before the reviewer was
 * sent any text says so rather than reading as a full review.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ShadowRunCoverage } from '../surfaces/ShadowRunCoverage';

afterEach(cleanup);

describe('ShadowRunCoverage', () => {
  it('names how many leaves were read, how many were cut, and each leaf that was not read', () => {
    render(<ShadowRunCoverage run={{
      id: 12, status: 'complete',
      inputCoverage: {
        textSent: true, charsSent: 24000, leafDigest: 'recorded',
        leaves: [
          { sectionCode: 'm1.2', status: 'read' },
          { sectionCode: 'm2.5', status: 'truncated' },
          { sectionCode: 'm5.3.5.1', status: 'withheld', reason: 'Withheld: the text holds identifiers classified as PHI (dob), and a simulated reviewer is not sent them.' },
        ],
      },
    }} />);
    const note = screen.getByTestId('shadow-run-coverage');
    expect(note.textContent).toContain('The reviewer read the text of 2 of 3 leaves (1 cut to the review budget).');
    expect(note.textContent).toContain('m5.3.5.1: Withheld: the text holds identifiers classified as PHI');
  });

  it('says a run read titles only when the gateway refused the text, and why', () => {
    render(<ShadowRunCoverage run={{
      id: 13, status: 'complete',
      inputCoverage: { textSent: false, charsSent: 0, textWithheld: 'The AI gateway refused the leaves\' text.', leaves: [{ sectionCode: 'm2.5', status: 'not_read' }] },
    }} />);
    expect(screen.getByTestId('shadow-run-coverage').textContent)
      .toBe('The reviewer was sent section codes and titles only. The AI gateway refused the leaves\' text.');
  });

  it('a run recorded before coverage existed reads as titles only, never as a full review', () => {
    render(<ShadowRunCoverage run={{ id: 4, status: 'complete' }} />);
    expect(screen.getByTestId('shadow-run-coverage').textContent)
      .toBe('Run #4\'s reviewer was sent section codes and titles only; it did not read the documents.');
  });

  it('says nothing for a waived or running row', () => {
    const { container } = render(<><ShadowRunCoverage run={{ id: 5, status: 'waived' }} /><ShadowRunCoverage run={{ id: 6, status: 'running' }} /></>);
    expect(container.textContent).toBe('');
  });
});
