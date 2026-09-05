/**
 * @vitest-environment jsdom
 */
/**
 * useDeviceProfile — the device-intake read/write contract.
 *
 * Two properties matter most: save() carries the same Bearer +
 * x-organization-id headers as the read path (a bare PUT 401s at the global
 * /api gate and would silently discard intake edits), and the openFDA
 * classification lookup passes { available:false, unavailableReason } through
 * untouched — a failed lookup must never fabricate a product code or class.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useDeviceProfile,
  lookupClassification,
  lookupRecognizedStandards,
  classificationQueryUrl,
  recognizedStandardsUrl,
  deviceProfileUrl,
  romanDeviceClass,
  type DeviceProfileView,
} from '../useDeviceProfile';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROFILE: DeviceProfileView = {
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
  commonName: 'Continuous glucose monitor',
  classificationName: 'Glucose Monitor, Continuous',
  regulationNumber: '862.1355',
  associatedProductCodes: 'DQA; NBW',
  indicationsForUseCitation: 'Attachment 4, page 1',
};

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Calls that are reads (useFetchJson sets no method → GET). */
const getCalls = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === undefined);

describe('deviceProfileUrl (ident contract)', () => {
  it('is null without an ident — no request for a deselected program', () => {
    expect(deviceProfileUrl(null)).toBeNull();
  });

  it('encodes the ident so a code with reserved characters cannot break the query', () => {
    expect(deviceProfileUrl('BX 204/α')).toBe('/api/510k/device/profile?ident=BX%20204%2F%CE%B1');
  });
});

describe('useDeviceProfile', () => {
  it('loads the profile from the {profile} envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profile: PROFILE }));
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    expect(result.current.profile?.productCode).toBe('MDS');
    expect(getCalls()[0][0]).toBe(`/api/510k/device/profile?ident=${PROFILE.id}`);
  });

  it('save PUTs the patch with auth headers and refreshes the read on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profile: PROFILE }));
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    const readsBefore = getCalls().length;

    let saved: DeviceProfileView | null = null;
    await act(async () => {
      saved = await result.current.save({ productCode: 'DQA', deviceClass: 'II' });
    });
    expect(saved).toEqual(PROFILE);

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    const [url, init] = putCall as [string, RequestInit];
    expect(url).toBe(`/api/510k/device/profile?ident=${PROFILE.id}`);
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
    expect(JSON.parse(init.body as string)).toEqual({ productCode: 'DQA', deviceClass: 'II' });

    /* refresh() after the PUT → a second read of the same URL. */
    await waitFor(() => expect(getCalls().length).toBe(readsBefore + 1));
  });

});

describe('useDeviceProfile — the five eSTAR device fields', () => {
  it('exposes the five eSTAR device fields the profile carries (view mapping)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profile: PROFILE }));
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    const p = result.current.profile as DeviceProfileView;
    expect(p.commonName).toBe('Continuous glucose monitor');
    expect(p.classificationName).toBe('Glucose Monitor, Continuous');
    expect(p.regulationNumber).toBe('862.1355');
    expect(p.associatedProductCodes).toBe('DQA; NBW');
    expect(p.indicationsForUseCitation).toBe('Attachment 4, page 1');
  });

  it('save sends the eSTAR device fields verbatim — an empty string is the clear signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profile: PROFILE }));
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(async () => {
      await result.current.save({
        commonName: 'CGM',
        classificationName: 'Glucose Monitor, Continuous',
        regulationNumber: '862.1355',
        associatedProductCodes: 'DQA',
        indicationsForUseCitation: '',
      });
    });
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'PUT',
    ) as [string, { body: string }];
    expect(JSON.parse(putCall[1].body)).toEqual({
      commonName: 'CGM',
      classificationName: 'Glucose Monitor, Continuous',
      regulationNumber: '862.1355',
      associatedProductCodes: 'DQA',
      indicationsForUseCitation: '',
    });
  });
});

describe('useDeviceProfile — rejected and failed writes', () => {
  it('save is a no-op returning null without an ident — nothing is sent', async () => {
    const { result } = renderHook(() => useDeviceProfile(null));
    let saved: DeviceProfileView | null = PROFILE;
    await act(async () => {
      saved = await result.current.save({ productName: 'X' });
    });
    expect(saved).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('save returns null on a rejected write and does NOT refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ profile: PROFILE })) // mount read
      .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, false, 403)); // PUT
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    let saved: DeviceProfileView | null = PROFILE;
    await act(async () => {
      saved = await result.current.save({ productName: 'Renamed' });
    });
    expect(saved).toBeNull();
    expect(getCalls().length).toBe(1); // still only the mount read
  });

  it('save returns null when the request never reaches the server', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ profile: PROFILE }))
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useDeviceProfile(PROFILE.id));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    let saved: DeviceProfileView | null = PROFILE;
    await act(async () => {
      saved = await result.current.save({ productName: 'Renamed' });
    });
    expect(saved).toBeNull();
  });
});

describe('lookupClassification (openFDA autofill, honest by construction)', () => {
  it('passes available:false + unavailableReason through untouched — no fabricated hits', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        available: false,
        unavailableReason: 'openFDA device/classification.json responded 500',
        results: [],
        source: 'openfda',
      }),
    );
    const result = await lookupClassification({ productCode: 'MDS' });
    expect(result?.available).toBe(false);
    expect(result?.unavailableReason).toMatch(/responded 500/);
    expect(result?.results).toEqual([]);
  });

  it('sends the same auth headers as the read path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ available: true, results: [], source: 'openfda' }));
    await lookupClassification({ productCode: 'MDS', deviceName: 'glucose monitor' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/510k/device/classification?productCode=MDS&deviceName=glucose+monitor');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
  });

  it('returns null when the request itself fails — never a made-up classification', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await lookupClassification({ productCode: 'MDS' })).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 500));
    expect(await lookupClassification({ productCode: 'MDS' })).toBeNull();
  });

  it('refuses an unusable query without issuing a request', async () => {
    const empty = await lookupClassification({});
    expect(empty?.available).toBe(false);
    expect(empty?.unavailableReason).toMatch(/product code or a device name/);

    const tooShort = await lookupClassification({ deviceName: 'x' });
    expect(tooShort?.available).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('classificationQueryUrl (query contract)', () => {
  it('builds and encodes multi-term queries', () => {
    expect(
      classificationQueryUrl({ productCode: ' MDS ', regulationNumber: '862.1355' }),
    ).toBe('/api/510k/device/classification?productCode=MDS&regulationNumber=862.1355');
  });

  it('drops a sub-2-character deviceName rather than sending a query the server 400s', () => {
    expect(classificationQueryUrl({ deviceName: 'x' })).toBeNull();
    expect(classificationQueryUrl({ deviceName: 'x', productCode: 'MDS' })).toBe(
      '/api/510k/device/classification?productCode=MDS',
    );
  });

  it('is null with no usable terms', () => {
    expect(classificationQueryUrl({})).toBeNull();
    expect(classificationQueryUrl({ productCode: '   ' })).toBeNull();
  });
});

describe('recognizedStandardsUrl (query contract)', () => {
  it('sends both terms so the server can prefer the typed code over the saved one', () => {
    expect(recognizedStandardsUrl({ ident: 'BX-204', productCode: ' MDS ' })).toBe(
      '/api/510k/device/standards?ident=BX-204&productCode=MDS',
    );
  });

  it('encodes the ident and accepts either term alone', () => {
    expect(recognizedStandardsUrl({ ident: 'BX 204/α' })).toBe(
      '/api/510k/device/standards?ident=BX+204%2F%CE%B1',
    );
    expect(recognizedStandardsUrl({ productCode: 'MDS' })).toBe(
      '/api/510k/device/standards?productCode=MDS',
    );
  });

  it('is null with no usable terms', () => {
    expect(recognizedStandardsUrl({})).toBeNull();
    expect(recognizedStandardsUrl({ ident: '  ', productCode: null })).toBeNull();
  });
});

describe('lookupRecognizedStandards (vendored FDA list, never inferred)', () => {
  it('keeps datasetLoaded distinct from an empty list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        productCode: 'MDS',
        available: true,
        datasetLoaded: true,
        standards: [],
        matched: 0,
        source: 'fda-recognized-consensus-standards',
      }),
    );
    const result = await lookupRecognizedStandards({ productCode: 'MDS' });
    expect(result?.available).toBe(true);
    expect(result?.datasetLoaded).toBe(true);
    expect(result?.matched).toBe(0);
  });

  it('passes the unavailable envelope through untouched', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        productCode: 'MDS',
        available: false,
        unavailableReason: 'The FDA recognized-consensus-standards dataset has not been vendored',
        datasetLoaded: false,
        standards: [],
        matched: 0,
        source: 'fda-recognized-consensus-standards',
      }),
    );
    const result = await lookupRecognizedStandards({ ident: 'BX-204' });
    expect(result?.available).toBe(false);
    expect(result?.datasetLoaded).toBe(false);
    expect(result?.unavailableReason).toMatch(/not been vendored/);
  });

  it('sends the same auth headers as the read path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ available: true, datasetLoaded: true, standards: [], matched: 0 }),
    );
    await lookupRecognizedStandards({ productCode: 'MDS' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
  });

  it('returns null when the request itself fails — never a made-up standard', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await lookupRecognizedStandards({ productCode: 'MDS' })).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 500));
    expect(await lookupRecognizedStandards({ productCode: 'MDS' })).toBeNull();
  });

  it('refuses an unusable query without issuing a request', async () => {
    const empty = await lookupRecognizedStandards({});
    expect(empty?.available).toBe(false);
    expect(empty?.datasetLoaded).toBe(false);
    /* Copy retired by W0-5: the reason states the precondition, it no
       longer instructs ("Select a program or enter a product code first").
       What is pinned here is that a reason is GIVEN and no request is made. */
    expect(empty?.unavailableReason).toMatch(/program is open, or a product code/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('romanDeviceClass (openFDA numeric → profile Roman numerals)', () => {
  it('maps 1/2/3 and passes Roman numerals through', () => {
    expect(romanDeviceClass('1')).toBe('I');
    expect(romanDeviceClass('2')).toBe('II');
    expect(romanDeviceClass('3')).toBe('III');
    expect(romanDeviceClass('II')).toBe('II');
    expect(romanDeviceClass('iii')).toBe('III');
  });

  it('returns null — never a guess — for unclassified/unknown markers', () => {
    expect(romanDeviceClass('U')).toBeNull();
    expect(romanDeviceClass('N')).toBeNull();
    expect(romanDeviceClass('f')).toBeNull();
    expect(romanDeviceClass('')).toBeNull();
    expect(romanDeviceClass(null)).toBeNull();
    expect(romanDeviceClass(undefined)).toBeNull();
  });
});
