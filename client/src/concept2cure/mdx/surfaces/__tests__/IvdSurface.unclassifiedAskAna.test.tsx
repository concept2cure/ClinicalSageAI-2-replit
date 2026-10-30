// @vitest-environment jsdom
/**
 * The Annex VIII table's Ask AnA chip does not ask about a class the row does
 * not have.
 *
 * Audit 2 [4]. A classification row whose class is not A–D reads "Not
 * classified" (useIvd sets `classification` to null), but the chip beside it
 * still sent "Explain the IVDR Annex VIII rule that puts <device> in Class
 * null." — a request built on a class that was never determined. For such a
 * row the chip asks AnA to classify the device instead; a classified row keeps
 * its question (the positive control).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IvdSurface } from '../IvdSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Dx-1 Assay',
  code: 'DX-1',
  status: 'active',
  dueLabel: 'No target set',
} as unknown as Program;

/** Two rows from the canonical classification route: one with no class, one Class C. */
const CLASSIFICATIONS = [
  { id: 1, device_name: 'Unclassified Assay', intended_purpose: 'Screening', ivdr_class: null, classification_rule: null },
  { id: 2, device_name: 'Classified Assay', intended_purpose: 'Diagnosis', ivdr_class: 'C', classification_rule: 'Rule 3' },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => (String(url).includes('/ivdr/classifications') ? { data: CLASSIFICATIONS } : { data: [] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount(onAskAna: (text: string) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <IvdSurface program={PROGRAM} onAskAna={onAskAna} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('IvdSurface — Ask AnA on an unclassified device', () => {
  it('asks AnA to classify it, not to explain the rule for "Class null"', async () => {
    const onAskAna = vi.fn();
    mount(onAskAna);
    await waitFor(() => expect(screen.getByTestId('ivd-class-unrecorded')).toBeTruthy());

    const row = screen.getByText('Unclassified Assay').closest('tr') as HTMLElement;
    const chip = row.querySelector('.ask-ana-chip') as HTMLElement;
    expect(chip).toBeTruthy();
    fireEvent.click(chip);

    expect(onAskAna).toHaveBeenCalledTimes(1);
    const prompt = String(onAskAna.mock.calls[0][0]);
    expect(prompt).not.toMatch(/Class null|Class undefined/);
    expect(prompt).not.toMatch(/rule that puts/);
    expect(prompt).toMatch(/^Classify Unclassified Assay under IVDR Annex VIII/);
  });

  it('positive control: a classified device keeps its question about its own class', async () => {
    const onAskAna = vi.fn();
    mount(onAskAna);
    await waitFor(() => expect(screen.getByText('Classified Assay')).toBeTruthy());

    const row = screen.getByText('Classified Assay').closest('tr') as HTMLElement;
    fireEvent.click(row.querySelector('.ask-ana-chip') as HTMLElement);

    expect(onAskAna).toHaveBeenCalledTimes(1);
    expect(String(onAskAna.mock.calls[0][0])).toBe(
      'Explain the IVDR Annex VIII rule that puts Classified Assay in Class C.',
    );
  });
});
