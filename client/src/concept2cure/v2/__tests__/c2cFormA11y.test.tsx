// @vitest-environment jsdom
/**
 * C2CForm — the governed drawer fifteen surfaces mount — keyboard and
 * screen-reader contract. It used to open without moving focus into the
 * panel, drop focus to <body> on close, and report a missing required field
 * as an unannounced summary tied to no control. Each case here is the failing
 * behaviour the accessibility review named, now pinned:
 *   - focus moves into the dialog on open and returns to the opener on close
 *     (WCAG 2.4.3), Escape closes (2.1.1);
 *   - a failed submit is announced (role="alert") and each empty required
 *     control is aria-invalid and described by the message (3.3.1 / 4.1.3);
 *   - editing the field clears both.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';

const CONFIG: C2CFormConfig = {
  title: 'Record regulatory identifiers',
  governed: true,
  submitLabel: 'Record',
  fields: [
    { key: 'applicationNumber', label: 'Application number', type: 'text', required: true, desc: 'Letters, digits, ".", "_" or "-".' },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true },
    { key: 'note', label: 'Note', type: 'text' },
  ],
};

afterEach(() => cleanup());

function Host({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (v: Record<string, string>) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Record identifiers</button>
      {open && <C2CForm config={CONFIG} onCancel={() => { setOpen(false); onCancel(); }} onSubmit={onSubmit} />}
    </div>
  );
}

describe('C2CForm keyboard and screen-reader contract', () => {
  it('moves focus into the modal dialog on open, closes on Escape, and returns focus to the opener', () => {
    const onCancel = vi.fn();
    render(<Host onCancel={onCancel} onSubmit={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'Record identifiers' });
    opener.focus();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Record regulatory identifiers' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('announces a failed submit and ties it to each empty required control; editing clears both', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={CONFIG} onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(onSubmit).not.toHaveBeenCalled();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Complete the required fields: Application number, Reason (governed)');

    const appNo = screen.getByLabelText(/Application number/) as HTMLInputElement;
    const reason = screen.getByLabelText(/Reason \(governed\)/) as HTMLTextAreaElement;
    const note = screen.getByLabelText(/^Note/) as HTMLInputElement;
    expect(appNo.getAttribute('aria-invalid')).toBe('true');
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(note.getAttribute('aria-invalid')).toBeNull();
    // Described by its own description AND the error, in that order.
    const described = (appNo.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(described[1]).toBe(alert.id);
    expect(reason.getAttribute('aria-describedby')).toBe(alert.id);

    fireEvent.change(appNo, { target: { value: 'IND123456' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(appNo.getAttribute('aria-invalid')).toBeNull();
    expect(reason.getAttribute('aria-invalid')).toBeNull();
  });
});
