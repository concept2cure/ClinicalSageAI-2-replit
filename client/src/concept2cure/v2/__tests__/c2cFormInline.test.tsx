// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { ceremonyOpen } from '../ceremony';
import { surfaceLeaveRefusal } from '../navParams';

const CONFIG: C2CFormConfig = {
  title: 'Study design inputs', governed: true, submitLabel: 'Record inputs',
  fields: [{ key: 'reason', label: 'Reason for change', type: 'textarea', required: true }],
};

function Host({ onCancel = vi.fn(), loading = false, showForm = true }: { onCancel?: () => void; loading?: boolean; showForm?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Record study inputs</button>
    {open && showForm && <C2CForm key={loading ? 'loading' : 'ready'} presentation="inline"
      config={loading ? { ...CONFIG, busy: 'Reading the saved design…' } : CONFIG}
      onSubmit={vi.fn()} onCancel={() => { setOpen(false); onCancel(); }} />}
    <button>Other project work</button>
  </>;
}

afterEach(cleanup);

describe('shared governed form inline placement and navigation', () => {
  it('renders one accessible region in normal DOM flow without a dialog or backdrop', () => {
    const { container } = render(<C2CForm presentation="inline" config={{ ...CONFIG, fields: [{ ...CONFIG.fields[0], half: true }] }} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Study design inputs' });
    expect(region.classList.contains('de-inline')).toBe(true);
    expect(region.parentElement).toBe(container);
    expect(region.getAttribute('aria-modal')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.de-bd')).toBeNull();
    expect(container.querySelector('.de-field.half')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('does not trap page keyboard focus or dismiss unsaved input on Escape', () => {
    const onCancel = vi.fn();
    render(<Host onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record study inputs' }));
    const reason = screen.getByRole('textbox', { name: 'Reason for change' }) as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'Retain this recorded scientific rationale' } });
    const outside = screen.getByRole('button', { name: 'Other project work' });
    outside.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(reason.value).toBe('Retain this recorded scientific rationale');
  });

  it('focuses the new main-flow form and returns to its opener after explicit cancel', () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Record study inputs' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Study design inputs' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(opener);
  });

  it('does not steal focus that has moved elsewhere in the project when unmounted', () => {
    const { rerender } = render(<Host />);
    const opener = screen.getByRole('button', { name: 'Record study inputs' });
    opener.focus(); fireEvent.click(opener);
    const outside = screen.getByRole('button', { name: 'Other project work' });
    outside.focus();
    rerender(<Host showForm={false} />);
    expect(document.activeElement).toBe(outside);
  });

  it('carries focus through a keyed loading transition and returns to the original opener', () => {
    const { rerender } = render(<Host loading />);
    const opener = screen.getByRole('button', { name: 'Record study inputs' });
    opener.focus(); fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Study design inputs' }));
    rerender(<Host loading={false} />);
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Study design inputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(opener);
  });

  it('keeps the real pending-work channels armed without using a dialog and cleans them up on cancel', () => {
    render(<Host />);
    expect(ceremonyOpen()).toBe(false);
    expect(surfaceLeaveRefusal()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record study inputs' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ceremonyOpen()).toBe(true);
    expect(surfaceLeaveRefusal()).toBe('Finish or cancel the open form before switching work.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ceremonyOpen()).toBe(false);
    expect(surfaceLeaveRefusal()).toBeNull();
  });

});

describe('shared governed form inline data entry', () => {
  it('preserves required validation, custom controls and derived submitted values inline', () => {
    const onSubmit = vi.fn();
    render(<C2CForm presentation="inline" onCancel={vi.fn()} onSubmit={onSubmit}
      config={{ ...CONFIG, fields: [
        { key: 'reason', label: 'Reason for change', type: 'textarea', required: true, desc: 'State the design rationale.' },
        { key: 'display', label: 'Recorded rationale', type: 'text', derive: (values) => values.reason || null },
      ] }}
      renderField={(field, control) => field.key === 'reason'
        ? <textarea id={control.id} value={control.value} aria-required={control.required}
            aria-invalid={control.invalid} aria-describedby={control.describedBy}
            onChange={(event) => control.onChange(event.target.value)} /> : undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record inputs' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const reason = screen.getByRole('textbox', { name: 'Reason for change' });
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(reason.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByRole('alert').id);
    fireEvent.change(reason, { target: { value: 'Prespecified primary outcome' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record inputs' }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'Prespecified primary outcome', display: 'Prespecified primary outcome' });
    expect((screen.getByLabelText('Recorded rationale') as HTMLInputElement).readOnly).toBe(true);
  });

  it('keeps busy and refusal notices accessible and adopts confirmed defaults after loading', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<C2CForm presentation="inline" config={{ ...CONFIG,
      busy: 'Reading the saved design…', notice: 'Only confirmed project inputs are available.' }}
      onCancel={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Record inputs' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Reason for change' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record inputs' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain('Reading the saved design…');
    rerender(<C2CForm presentation="inline" config={{ ...CONFIG,
      fields: [{ ...CONFIG.fields[0], default: 'Previously recorded rationale' }] }} onCancel={vi.fn()} onSubmit={onSubmit} />);
    expect((screen.getByRole('textbox', { name: 'Reason for change' }) as HTMLTextAreaElement).value).toBe('Previously recorded rationale');
    fireEvent.click(screen.getByRole('button', { name: 'Record inputs' }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'Previously recorded rationale' });
  });
});
