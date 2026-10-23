// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { C2CForm } from '../C2CForm';

afterEach(() => cleanup());

describe('optional C2CForm field renderer', () => {
  it('leaves native select labeling, descriptions, defaults and submitted values intact when it declines a field', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={{ title: 'Existing form', fields: [
      { key: 'source', label: 'Source', type: 'select', options: ['first', 'second'], default: 'second', desc: 'Choose an existing source.', required: true },
    ] }} onCancel={vi.fn()} onSubmit={onSubmit} renderField={() => undefined} />);
    const select = screen.getByRole('combobox', { name: 'Source' }) as HTMLSelectElement;
    expect(select.value).toBe('second');
    expect(document.getElementById(select.getAttribute('aria-describedby')!)?.textContent).toBe('Choose an existing source.');
    fireEvent.change(select, { target: { value: 'first' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ source: 'first' });
  });

  it('passes form values and accessibility state to a custom field and preserves required validation', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={{ title: 'Existing form', fields: [
      { key: 'source', label: 'Source', type: 'select', required: true, desc: 'Required source.' },
    ] }} onCancel={vi.fn()} onSubmit={onSubmit} renderField={(field, control) => field.key === 'source'
      ? <input id={control.id} value={control.value} aria-required={control.required} aria-invalid={control.invalid}
          aria-describedby={control.describedBy} onChange={event => control.onChange(event.target.value)} /> : undefined} />);
    const input = screen.getByRole('textbox', { name: 'Source' }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(input.getAttribute('aria-invalid')).toBe('true'); expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByRole('alert').id);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'chosen' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ source: 'chosen' }); expect(screen.queryByRole('alert')).toBeNull();
  });
});
