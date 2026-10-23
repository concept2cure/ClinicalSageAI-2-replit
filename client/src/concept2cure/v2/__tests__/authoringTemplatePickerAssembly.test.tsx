// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthoringTemplatePicker, BLANK_DOCUMENT, type AuthoringTemplate, type TemplateCatalogState } from '../surfaces/AuthoringTemplatePicker';

const templates: AuthoringTemplate[] = [
  { id: 'jp-diagnostic', name: 'Diagnostic preparation', description: 'Performance evidence', regions: ['JP'], template_type: 'PMDA', families: ['IVD'] },
  { id: 17, name: 'Clinical overview', regions: ['FDA'], module: 'M2' },
];
const changed = vi.fn();
function Harness({ purpose, catalog = 'ok', disabled = false, initialQuery = '', rows = templates }: {
  purpose?: 'assembly'; catalog?: TemplateCatalogState; disabled?: boolean; initialQuery?: string; rows?: AuthoringTemplate[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState('');
  return <><label htmlFor="test-template">Template</label><AuthoringTemplatePicker templates={rows}
    purpose={purpose} disabled={disabled} catalog={catalog} query={query} onQueryChange={setQuery}
    control={{ id: 'test-template', value: selected, onChange: value => { changed(value); setSelected(value); }, describedBy: 'template-note' }} />
    <p id="template-note">Choose a reference, then preview.</p></>;
}
const select = () => screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement;
const search = () => screen.getByRole('searchbox', { name: 'Search templates' }) as HTMLInputElement;
afterEach(() => { cleanup(); changed.mockClear(); });

describe('the existing template picker in assembly', () => {
  it('offers the loaded templates with a template-only empty choice', () => {
    render(<Harness purpose="assembly" />);
    expect(screen.getByText('2 of 2 templates')).toBeTruthy();
    expect(within(select()).getByRole('option', { name: 'Choose a template' })).toBeTruthy();
    expect(within(select()).queryByRole('option', { name: BLANK_DOCUMENT })).toBeNull();
    expect(select().value).toBe('');
  });

  it('searches recorded details, keeps an excluded choice and submits only deliberate exact native values', () => {
    render(<Harness purpose="assembly" />);
    fireEvent.change(search(), { target: { value: '  pmDA  ' } });
    expect(screen.getByText('1 of 2 templates')).toBeTruthy();
    fireEvent.change(select(), { target: { value: 'jp-diagnostic' } });
    fireEvent.change(search(), { target: { value: 'M2' } });
    expect(select().value).toBe('jp-diagnostic');
    expect(within(select()).getByRole('option', { name: 'Diagnostic preparation' }).closest('optgroup')?.label).toBe('Selected template');
    expect(changed.mock.calls).toEqual([['jp-diagnostic']]);
    fireEvent.change(select(), { target: { value: '17' } });
    expect(changed.mock.calls).toEqual([['jp-diagnostic'], ['17']]);
  });

  it('gives a no-match remedy without offering blank creation and clears with keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Harness purpose="assembly" initialQuery="no-matching-reference" />);
    const notice = screen.getByText(/No templates match/);
    expect(notice.textContent).toContain('Clear search to browse the loaded templates.');
    expect(notice.textContent).not.toMatch(/blank document/i);
    const clear = screen.getByRole('button', { name: 'Clear template search' });
    clear.focus(); await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(search());
    expect(search().value).toBe('');
    expect(screen.getByText('2 of 2 templates')).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['ok', 'unavailable'] as const)('explains an empty %s roster without a creation action', catalog => {
    render(<Harness purpose="assembly" rows={[]} catalog={catalog} />);
    expect(screen.getByText(/No (loaded )?templates are available\./).textContent).not.toMatch(/blank|start/i);
    expect(within(select()).getAllByRole('option')).toHaveLength(1);
  });

  it.each(['loading', 'failed'] as const)('keeps the %s roster distinct from emptiness and disables all inputs', catalog => {
    render(<Harness purpose="assembly" catalog={catalog} initialQuery="PMDA" />);
    const notice = screen.getByRole(catalog === 'failed' ? 'alert' : 'status');
    expect(notice.textContent).toMatch(catalog === 'failed' ? /template list didn’t load/i : /loading templates/i);
    expect(notice.textContent).not.toMatch(/blank|no templates are available/i);
    expect(select().disabled).toBe(true); expect(search().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear template search' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables search, Clear and native selection while the existing assembly lane is held', async () => {
    const user = userEvent.setup();
    render(<Harness purpose="assembly" disabled initialQuery="PMDA" />);
    expect(search().disabled).toBe(true); expect(select().disabled).toBe(true);
    const clear = screen.getByRole('button', { name: 'Clear template search' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true); await user.click(clear);
    expect(search().value).toBe('PMDA'); expect(changed).not.toHaveBeenCalled();
  });

  it('keeps the existing creation defaults and blank fallback when purpose is omitted', () => {
    render(<Harness catalog="failed" />);
    expect(within(select()).getByRole('option', { name: BLANK_DOCUMENT })).toBeTruthy();
    expect(select().disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toMatch(/Only a blank document can be started/);
  });
});
