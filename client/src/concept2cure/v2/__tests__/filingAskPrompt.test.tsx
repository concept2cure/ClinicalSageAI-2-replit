// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const promptFactory = vi.hoisted(() => vi.fn((name: string) => `Shared filing question: ${name}`));
vi.mock('@shared/regulatory/filing-catalog', async original => ({
  ...(await original<typeof import('@shared/regulatory/filing-catalog')>()),
  filingAskPrompt: promptFactory,
}));

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request }));
import { RegistryPicker } from '../surfaces/AnaVerbs';
import '../surfaces/RegistryBridge';
import { resolveFilingCatalogEntry } from '@shared/regulatory/filing-catalog';

beforeEach(() => {
  promptFactory.mockClear();
  request.mockImplementation(async (_method: string, raw: string) => {
    const url = new URL(raw, 'http://test');
    return { ok: true, status: 200, json: async () => ({ markets: [{ agency: url.searchParams.get('market') || 'FDA',
      offer: { tier: 'author_only', label: 'Author documents for this market', reason: 'Server offer' } }] }) };
  });
});
afterEach(cleanup);

describe('the canonical picker preserves the filing catalogue Ask AnA question', () => {
  it('uses the shared builder for the chosen real catalog filing without changing selection', async () => {
    const onAsk = vi.fn();
    const onChange = vi.fn();
    const filingName = resolveFilingCatalogEntry('us_ind')!.displayName;
    render(<RegistryPicker value="us_ind" onChange={onChange} onAsk={onAsk} applicationTypeOf={() => 'ind'} />);
    const note = await screen.findByTestId('rpk-chosen-offer');
    fireEvent.click(within(note).getByRole('button', { name: 'Ask AnA' }));
    expect(promptFactory).toHaveBeenCalledExactlyOnceWith(filingName);
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(`Shared filing question: ${filingName}`);
    expect(onChange).not.toHaveBeenCalled();
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
