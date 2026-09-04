// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  DeviceProfilePanel,
  classificationAutofill,
  profilePatch,
  standardsStatusLine,
} from '../DeviceProfilePanel';

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
  commonName: 'Continuous glucose monitor',
  classificationName: 'Glucose Monitor, Continuous',
  regulationNumber: '862.1355',
  associatedProductCodes: 'DQA; NBW',
  indicationsForUseCitation: 'Attachment 4, page 1',
};

const OPENFDA_HIT = {
  deviceName: 'Glucose Monitor, Continuous',
  productCode: 'DQA',
  deviceClass: '3',
  regulationNumber: '862.1355',
  medicalSpecialty: 'Clinical Chemistry',
  reviewPanel: 'CH',
};

/** The PUT the panel issued, decoded — null when no write was sent. */
function sentPut(): Record<string, unknown> | null {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const put = calls.find(([, init]) => (init as { method?: string } | undefined)?.method === 'PUT');
  return put ? (JSON.parse((put[1] as { body: string }).body) as Record<string, unknown>) : null;
}

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
    /* W0-5: the panel states why it is empty rather than instructing.
       The behaviour under test — an honest summary, a disabled Edit, no
       fetch — is unchanged. */
    expect(screen.getByText('The device profile is held per program')).toBeTruthy();
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
    /* The hit's regulation number and its classification "device name" are
       offered into the two eSTAR fields that hold those facts. */
    expect((screen.getByLabelText('Regulation number (21 CFR)') as HTMLInputElement).value).toBe(
      '862.1355',
    );
    expect((screen.getByLabelText('Classification name') as HTMLInputElement).value).toBe(
      'Glucose Monitor, Continuous',
    );
    /* Autofill never saved anything — Save is now enabled for the user. */
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false);
    expect(sentPut()).toBeNull();
  });

});

describe('DeviceProfilePanel — the five eSTAR device fields', () => {
  it('shows the stored eSTAR device fields in the intake form', async () => {
    mockFetch(() => okJson({ profile: PROFILE }));
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect(value('Common name')).toBe('Continuous glucose monitor');
    expect(value('Classification name')).toBe('Glucose Monitor, Continuous');
    expect(value('Regulation number (21 CFR)')).toBe('862.1355');
    expect(value('Associated product codes')).toBe('DQA; NBW');
    expect(value('Indications for Use citation (attachment and page)')).toBe('Attachment 4, page 1');
    /* Nothing changed yet — Save stays disabled. */
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save PUTs only the edited eSTAR fields — and an emptied one as "" to clear it', async () => {
    mockFetch(() => okJson({ profile: PROFILE }));
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Common name'), { target: { value: '  CGM system ' } });
    fireEvent.change(screen.getByLabelText('Indications for Use citation (attachment and page)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(sentPut()).toEqual({ commonName: 'CGM system', indicationsForUseCitation: '' });
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

describe('profilePatch — the five eSTAR device fields', () => {
  const form = {
    productName: PROFILE.productName,
    deviceClass: 'II',
    regulatoryPath: '510k',
    productCode: 'MDS',
    intendedUse: '',
    commonName: PROFILE.commonName,
    classificationName: PROFILE.classificationName,
    regulationNumber: PROFILE.regulationNumber,
    associatedProductCodes: PROFILE.associatedProductCodes,
    indicationsForUseCitation: PROFILE.indicationsForUseCitation,
  };

  it('is empty when the form mirrors the profile', () => {
    expect(profilePatch(PROFILE, form)).toEqual({});
  });

  it('sends a changed field trimmed and an emptied field as "" (the clear signal)', () => {
    expect(
      profilePatch(PROFILE, {
        ...form,
        regulationNumber: ' 862.1345 ',
        associatedProductCodes: '',
        indicationsForUseCitation: '   ',
      }),
    ).toEqual({ regulationNumber: '862.1345', associatedProductCodes: '', indicationsForUseCitation: '' });
  });

  it('does not clear a field that was already blank', () => {
    const blank = { ...PROFILE, commonName: null, classificationName: null };
    expect(profilePatch(blank, { ...form, commonName: '', classificationName: ' ' })).toEqual({});
  });
});

describe('classificationAutofill — openFDA hit → intake fields, offered not saved', () => {
  const typed = {
    productName: 'CGM',
    deviceClass: '',
    regulatoryPath: '',
    productCode: '',
    intendedUse: '',
    commonName: '',
    classificationName: '',
    regulationNumber: '',
    associatedProductCodes: '',
    indicationsForUseCitation: '',
  };

  it('maps regulationNumber → regulationNumber and deviceName → classificationName', () => {
    const next = classificationAutofill(typed, OPENFDA_HIT);
    expect(next.productCode).toBe('DQA');
    expect(next.deviceClass).toBe('III');
    expect(next.regulationNumber).toBe('862.1355');
    expect(next.classificationName).toBe('Glucose Monitor, Continuous');
    /* Facts the hit does not carry are untouched. */
    expect(next.commonName).toBe('');
    expect(next.associatedProductCodes).toBe('');
    expect(next.productName).toBe('CGM');
  });

  it('leaves a typed value alone when the hit has nothing for it', () => {
    const next = classificationAutofill(
      { ...typed, regulationNumber: '870.1', classificationName: 'Typed', deviceClass: 'II' },
      { ...OPENFDA_HIT, regulationNumber: '', deviceName: '', deviceClass: 'U' },
    );
    expect(next.regulationNumber).toBe('870.1');
    expect(next.classificationName).toBe('Typed');
    expect(next.deviceClass).toBe('II');
  });
});

/**
 * The recognized-standards half. The dataset is a vendored FDA export that is
 * not in this repository, so the state these tests care most about is the one
 * this deployment is actually in: the list is not held, and the panel says so
 * instead of showing a plausible set of standards.
 */
const STANDARD = {
  recognitionNumber: '99-001',
  sdo: 'FIXTURE-SDO',
  designationNumber: 'FIXTURE A-1',
  title: 'First fixture standard',
  extentOfRecognition: 'Clauses 1 to 4 only.',
  recognitionStatus: 'transition',
  transitionEndDate: '2027-01-01',
};

const PROVENANCE = {
  source: 'FDA CDRH Recognized Consensus Standards Database',
  sourceUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm',
  recognitionListNumber: 'TEST-FIXTURE-000',
  publishedOn: '2026-01-15',
  retrievedOn: '2026-01-20',
  retrievedBy: 'fixture',
};

async function openStandards(standardsBody: unknown) {
  mockFetch((url) => {
    if (url.includes('/device/standards')) return okJson(standardsBody);
    return okJson({ profile: PROFILE });
  });
  render(<DeviceProfilePanel ident={PROFILE.id} />);
  await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.click(screen.getByText('Recognized standards'));
}

describe('standardsStatusLine — the three states stay three', () => {
  it('names an absent dataset as unavailable, quoting the server reason', () => {
    expect(
      standardsStatusLine({
        productCode: 'MDS',
        available: false,
        unavailableReason: 'the dataset has not been vendored',
        datasetLoaded: false,
        standards: [],
        matched: 0,
        source: 'fda-recognized-consensus-standards',
      }),
    ).toBe('Recognized standards unavailable — the dataset has not been vendored');
  });

  it("calls a loaded-but-empty answer the list's answer, not a gap", () => {
    const line = standardsStatusLine({
      productCode: 'MDS',
      available: true,
      datasetLoaded: true,
      standards: [],
      matched: 0,
      source: 'fda-recognized-consensus-standards',
    });
    expect(line).toMatch(/holds no consensus standard against product code MDS/);
    expect(line).toMatch(/not a gap in the lookup/);
  });

  it('counts real hits and cites the recognition list they came from', () => {
    expect(
      standardsStatusLine({
        productCode: 'MDS',
        available: true,
        datasetLoaded: true,
        standards: [STANDARD],
        matched: 1,
        provenance: PROVENANCE,
        source: 'fda-recognized-consensus-standards',
      }),
    ).toBe('1 recognized standard for product code MDS · FDA Recognition List TEST-FIXTURE-000');
  });

  it('distinguishes a failed request from the server saying "unavailable"', () => {
    expect(standardsStatusLine(null)).toMatch(/could not reach the server/);
  });
});

describe('DeviceProfilePanel — recognized standards', () => {
  it('shows nothing about standards until asked', async () => {
    mockFetch(() => okJson({ profile: PROFILE }));
    render(<DeviceProfilePanel ident={PROFILE.id} />);
    await waitFor(() => expect(screen.getByText(/code MDS/)).toBeTruthy());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.queryByText('FDA recognized consensus standards')).toBeNull();
  });

  it('says the list is not held rather than showing a plausible one', async () => {
    await openStandards({
      productCode: 'MDS',
      available: false,
      unavailableReason:
        'The FDA recognized-consensus-standards dataset has not been vendored — expected /repo/assets/fda-recognized-standards/fda-recognized-consensus-standards.json',
      datasetLoaded: false,
      standards: [],
      matched: 0,
      source: 'fda-recognized-consensus-standards',
    });

    await waitFor(() =>
      expect(screen.getByText(/Recognized standards unavailable — .*has not been vendored/)).toBeTruthy(),
    );
    /* No provenance footer, because there is no source to cite. */
    expect(screen.queryByText(/Recognition is FDA's/)).toBeNull();
  });

  it('renders FDA fields verbatim, with the extent of recognition and the source', async () => {
    await openStandards({
      productCode: 'MDS',
      available: true,
      datasetLoaded: true,
      standards: [STANDARD],
      matched: 1,
      provenance: PROVENANCE,
      source: 'fda-recognized-consensus-standards',
    });

    await waitFor(() => expect(screen.getByText(/1 recognized standard/)).toBeTruthy());
    expect(screen.getByText(/FIXTURE A-1 · FIXTURE-SDO · recognition 99-001 · transition/)).toBeTruthy();
    expect(screen.getByText('First fixture standard')).toBeTruthy();
    expect(screen.getByText('Extent of recognition: Clauses 1 to 4 only.')).toBeTruthy();
    expect(screen.getByText(/Transition ends 2027-01-01/)).toBeTruthy();
    expect(screen.getByText(/Recognition is FDA's/)).toBeTruthy();
  });

  it('reports a loaded list that holds nothing for this code as exactly that', async () => {
    await openStandards({
      productCode: 'MDS',
      available: true,
      datasetLoaded: true,
      standards: [],
      matched: 0,
      provenance: PROVENANCE,
      source: 'fda-recognized-consensus-standards',
    });

    await waitFor(() =>
      expect(screen.getByText(/holds no consensus standard against product code MDS/)).toBeTruthy(),
    );
  });
});
