// @vitest-environment jsdom
/**
 * A-0928-1 — the placement reason is required, and the field says so to a
 * screen reader before anything is typed. It used to carry no required state,
 * its "*" was read out as "star", and its note only mentioned the floor after
 * a too-short value had been typed.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { PlacementReasonField } from '../surfaces/filingTarget';

afterEach(() => cleanup());

describe.each(['dialog', 'inline'] as const)('PlacementReasonField (%s)', (variant) => {
  it('is announced as required, with the floor stated on first render', () => {
    render(<PlacementReasonField value="" onChange={() => {}} idPrefix="t" variant={variant} />);
    const field = screen.getByRole('textbox', { name: 'Reason for this placement' });
    expect(field.getAttribute('aria-required')).toBe('true');
    expect(field.hasAttribute('aria-invalid')).toBe(false);
    const note = document.getElementById(field.getAttribute('aria-describedby')!);
    expect(note?.textContent).toBe(
      `Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the placement in the audit trail.`,
    );
  });

  it('marks a too-short value invalid and keeps the requirement in the note', () => {
    render(<PlacementReasonField value="ab" onChange={() => {}} idPrefix="t" variant={variant} />);
    const field = screen.getByRole('textbox', { name: 'Reason for this placement' });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const note = document.getElementById(field.getAttribute('aria-describedby')!);
    expect(note?.textContent).toMatch(new RegExp(`at least ${GOVERNED_REASON_MIN} characters`, 'i'));
  });
});
