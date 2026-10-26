// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const promptFactory = vi.hoisted(() => vi.fn((name: string) => `Shared filing question: ${name}`));
vi.mock('@shared/regulatory/filing-catalog', async original => ({
  ...(await original<typeof import('@shared/regulatory/filing-catalog')>()),
  filingAskPrompt: promptFactory,
}));

import { FilingsCatalog } from '../surfaces/FilingsCatalog';
import { resolveFilingCatalogEntry } from '@shared/regulatory/filing-catalog';

beforeEach(() => promptFactory.mockClear());
afterEach(cleanup);

describe('the existing catalog Ask AnA control shares its filing question', () => {
  it('uses the shared builder for the chosen real catalog filing and closes its detail', () => {
    const onAsk = vi.fn();
    const onNav = vi.fn();
    const filingName = resolveFilingCatalogEntry('us_ind')!.displayName;
    render(<FilingsCatalog surface={{ id: 'filings-catalog', label: 'Filings' } as never}
      onAsk={onAsk} onNav={onNav} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filings' }), {
      target: { value: 'Investigational New Drug Application' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Investigational New Drug Application/ }));
    const detail = screen.getByRole('dialog', { name: filingName });
    fireEvent.click(within(detail).getByRole('button', { name: 'Ask AnA' }));
    expect(promptFactory).toHaveBeenCalledExactlyOnceWith(filingName);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(`Shared filing question: ${filingName}`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('preserves the existing question wording and the catalog display name', async () => {
    const catalog = await vi.importActual<typeof import('@shared/regulatory/filing-catalog')>('@shared/regulatory/filing-catalog');
    expect(typeof catalog.filingAskPrompt).toBe('function');
    const selected = catalog.resolveFilingCatalogEntry('us_ind');
    expect(selected).toBeTruthy();
    expect(catalog.filingAskPrompt(selected!.displayName)).toBe(
      `Tell me about the ${selected!.displayName} — when it's required, what it contains, and what evidence I need.`,
    );
  });
});
