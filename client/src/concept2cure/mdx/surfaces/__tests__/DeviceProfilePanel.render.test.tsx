// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeviceProfilePanel } from '../DeviceProfilePanel';

/**
 * Mount tests for the device-profile intake card.
 *
 * The honest-state contract: no program → say so and stay inert; a loaded
 * profile summarizes real fields only; a classification lookup that comes
 * back { available:false } shows the server's unavailableReason as a status
 * line; an available lookup only OFFERS autofill (fills the form — the user
 * still Saves), and an unmappable device class is left alone.
 */

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

const PROFILE = {
  id: 'a2b4c6d8-0000-0000-0000-000000000001',
  name: 'BX-204',
  code: 'BX-204',
  productName: 'Continuous Glucose Monitor',
  productType: 'device',
  deviceClass: 'II',
  regulatoryPath: '510k',
  productCode: 'MDS',
  intendedUse: null,
  indication: null,
  predicateDevices: null,
};

function mockFetch(handler: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => handler(String(input))));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('DeviceProfilePanel — honest states', () => {
  it('says so — and fetches nothing — when no program is selected', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<DeviceProfilePanel ident={null} />);
    expect(screen.getByText('Select a program to load its device profile')).toBeTruthy();
    expect((screen.getByText('Edit') as HTMLButtonElement).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders while the profile request is still pending', () => {
    mockFetch(() => new Promise<Response>(() => {})); // never resolves
    render(<DeviceProfilePanel ident="BX-204" />);
    expect(screen.getByText('Device profile')).toBeTruthy();
    expect(screen.getByText('Loading device profile…')).toBeTruthy();
  });

  it('summarizes the loaded profile from real fields only', async () => {
    mockFetch(() => okJson({ profile: PROFILE }));
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() =>
      expect(
        screen.getByText('Continuous Glucose Monitor · Class II · 510(k) · code MDS'),
      ).toBeTruthy(),
    );
  });

  it('shows the profile error instead of a blank success shell', async () => {
    mockFetch(() =>
      Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('not found') } as Response),
    );
    render(<DeviceProfilePanel ident="NOPE-1" />);
    await waitFor(() => expect(screen.getByText(/Device profile unavailable — HTTP 404/)).toBeTruthy());
  });

  it('surfaces the lookup unavailableReason honestly — no fabricated autofill', async () => {
    mockFetch((url) => {
      if (url.includes('/device/classification')) {
        return okJson({
          available: false,
          unavailableReason: 'openFDA device/classification.json unreachable: getaddrinfo ENOTFOUND',
          results: [],
          source: 'openfda',
        });
      }
      return okJson({ profile: PROFILE });
    });
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Look up classification'));
    await waitFor(() =>
      expect(
        screen.getByText(/Classification lookup unavailable — openFDA .* unreachable/),
      ).toBeTruthy(),
    );
    /* The form kept the org's own values — nothing was invented. */
    expect((screen.getByLabelText('Product code') as HTMLInputElement).value).toBe('MDS');
  });

  it('offers the top hit as autofill — fields fill, the user still Saves', async () => {
    mockFetch((url) => {
      if (url.includes('/device/classification')) {
        return okJson({
          available: true,
          results: [
            {
              deviceName: 'Glucose Monitor, Continuous',
              productCode: 'DQA',
              deviceClass: '3',
              regulationNumber: '862.1355',
              medicalSpecialty: 'Clinical Chemistry',
              reviewPanel: 'CH',
            },
          ],
          source: 'openfda',
        });
      }
      return okJson({ profile: PROFILE });
    });
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Look up classification'));
    await waitFor(() => expect(screen.getByText(/review and Save/)).toBeTruthy());

    expect((screen.getByLabelText('Product code') as HTMLInputElement).value).toBe('DQA');
    expect((screen.getByLabelText('Device class') as HTMLSelectElement).value).toBe('III');
    /* Autofill never saved anything — Save is now enabled for the user. */
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports an honest empty when openFDA matches nothing', async () => {
    mockFetch((url) => {
      if (url.includes('/device/classification')) {
        return okJson({ available: true, results: [], source: 'openfda' });
      }
      return okJson({ profile: PROFILE });
    });
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Look up classification'));
    await waitFor(() =>
      expect(screen.getByText(/No openFDA classification matched/)).toBeTruthy(),
    );
  });
});
