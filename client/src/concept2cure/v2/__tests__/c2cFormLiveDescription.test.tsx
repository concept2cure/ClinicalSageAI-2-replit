// @vitest-environment jsdom
/**
 * A field's description: the fixed part, and the part that changes, live
 * (accessibility review of F15/F22, 2026-10-15; reworked 2026-10-22).
 *
 * `descLive` made the whole description a live region, so a screen reader read
 * all of it again when one clause changed. The changing part (`descStatus`) is
 * now its own polite region, drawn even while empty so its first change is
 * heard; the fixed part is not live. The field is described by both.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { C2CForm, type C2CFormField } from '../C2CForm';

afterEach(cleanup);

const form = (fields: C2CFormField[]) => (
  <C2CForm config={{ title: 'Form', submitLabel: 'Save', fields }} onSubmit={vi.fn()} onCancel={vi.fn()} />
);

describe("a field's changing description is the only live part", () => {
  it('the fixed part is not live; the changing part is, alone', () => {
    const fixed = 'From this project’s record.';
    const { rerender } = render(form([{ key: 'r', label: 'Region', type: 'text', desc: fixed, descStatus: 'Reading the markets…' }]));
    const field = screen.getByLabelText('Region');
    const desc = document.getElementById(field.getAttribute('aria-describedby')!)!;
    expect(desc.getAttribute('aria-live')).toBeNull();
    const live = desc.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe(' Reading the markets…');
    expect(desc.textContent).toBe(`${fixed} Reading the markets…`);
    rerender(form([{ key: 'r', label: 'Region', type: 'text', desc: fixed, descStatus: 'EU (EMA): no transmit channel.' }]));
    expect(desc.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live.textContent).toBe(' EU (EMA): no transmit channel.');
  });

  it('an empty changing part is still drawn, so its first change is heard; it alone describes the field', () => {
    render(form([{ key: 'o', label: 'Owner', type: 'text', descStatus: '' }]));
    const desc = document.getElementById(screen.getByLabelText('Owner').getAttribute('aria-describedby')!)!;
    expect(desc.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });

  it('a field with only a fixed description has no live region', () => {
    render(form([{ key: 'n', label: 'Name', type: 'text', desc: 'Up to 200 characters.' }]));
    const desc = document.getElementById(screen.getByLabelText('Name').getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toBe('Up to 200 characters.');
    expect(desc.querySelector('[aria-live]')).toBeNull();
  });
});
