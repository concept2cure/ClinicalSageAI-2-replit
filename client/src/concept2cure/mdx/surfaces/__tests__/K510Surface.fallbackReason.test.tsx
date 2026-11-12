// @vitest-environment jsdom
/**
 * GA-DEMO-07 (2026-11-10): the 510(k) page printed the server's raw reason.
 *
 * On the rehearsal app, with predicate intelligence not configured and no
 * outbound route to openFDA, the line under the banner read
 *   "Reduced openFDA fallback unavailable — openFDA device/510k.json unreachable: fetch failed"
 * which is a dataset path and a runtime error, shown to a buyer. The reason is
 * now said in words, and a reason the server gave in plain words still shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { K510Surface, fallbackReasonInWords } from '../K510Surface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'NeuroPanel-Dx',
  code: 'NEUR',
  stageIdx: 0,
  status: 'active',
} as unknown as Program;

let reason = '';
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/api/predicate-intelligence/')) {
      return json(503, { error: { code: 'PREDICATE_INTELLIGENCE_NOT_CONFIGURED', message: 'Not configured.' } });
    }
    if (url.includes('/api/510k/device/predicates')) {
      return json(200, { available: false, unavailableReason: reason, results: [] });
    }
    if (url.includes('/api/510k/device/profile')) {
      return json(200, { profile: { productName: 'NeuroPanel-Dx', productCode: 'QNX' } });
    }
    return json(200, { sections: [] });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <K510Surface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}

const text = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ');

describe('K510Surface: the clearance lookup says why it could not run, in words', () => {
  it('does not print the raw "fetch failed" reason the rehearsal app showed', async () => {
    reason = 'openFDA device/510k.json unreachable: fetch failed';
    const { container } = mount();
    await waitFor(() => expect(text(container)).toMatch(/clearance lookup could not run|fallback unavailable/i));
    const shown = text(container);
    expect(shown).not.toMatch(/fetch failed/i);
    expect(shown).not.toMatch(/510k\.json/);
    expect(shown).not.toMatch(/unreachable:/);
    expect(shown).toMatch(/could not be reached from this server/);
  });
});

describe('fallbackReasonInWords', () => {
  it.each([
    ['openFDA device/510k.json unreachable: fetch failed', /could not be reached from this server/],
    ['openFDA device/510k.json unreachable: getaddrinfo ENOTFOUND api.fda.gov', /could not be reached from this server/],
    ['openFDA device/510k.json timed out after 10000ms', /did not answer in time/],
    ['openFDA device/510k.json responded 500', /answered with an error/],
    ['openFDA unavailable', /could not be searched/],
    ['', /could not be searched/],
    // V-L8-1: the machine-text catch-all, reached by no transport branch above.
    ['openFDA device/510k.json returned an unexpected body', /could not be searched/],
    ['device/510k.json parse error', /could not be searched/],
  ])('%j reads as words', (raw, words) => {
    const out = fallbackReasonInWords(raw);
    expect(out).toMatch(words);
    expect(out).not.toMatch(/\.json|fetch failed|ENOTFOUND|\d{4,}ms|unreachable:/);
  });

  it('keeps a reason already written as a sentence for a person', () => {
    // Over-correction guard: the hook's own copy is not jargon.
    const plain = 'Enter a product code or a device name (2+ characters) first';
    expect(fallbackReasonInWords(plain)).toBe(`${plain}.`);
  });
});
