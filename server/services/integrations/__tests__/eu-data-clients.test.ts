/**
 * EU/global live-data clients — unit tests.
 *
 * The live EU APIs are unreachable from CI egress, so `fetch` is mocked with
 * embedded FIXTURE responses. These lock in query construction, defensive
 * normalization/mapping, base-URL override, and — critically — the GRACEFUL
 * DEGRADATION contract: a network failure or non-2xx response yields a typed
 * `status: 'unavailable'` result (never a throw), so the AnA handlers can fall
 * back to manual-search guidance. No live network is performed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildEudamedQuery,
  normalizeDevice,
  searchEudamed,
  EUDAMED_SOURCE,
} from '../eudamed-client';
import {
  buildEmaEparQuery,
  normalizeMedicine,
  searchEmaEpar,
  EMA_EPAR_SOURCE,
} from '../ema-epar-client';
import {
  buildEuCtisBody,
  normalizeTrial,
  searchEuCtis,
  EU_CTIS_SOURCE,
} from '../eu-ctis-client';

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const EUDAMED_FIXTURE = {
  totalElements: 2,
  content: [
    {
      basicUdiDiData: { code: '0123456789012AB' },
      tradeName: 'CardioStent X',
      manufacturer: { name: 'Acme Medical GmbH', srn: 'DE-MF-000012345' },
      riskClass: 'III',
      versionState: 'PUBLISHED',
    },
  ],
};

const EMA_EPAR_FIXTURE = {
  totalElements: 1,
  content: [
    {
      productNumber: 'EMEA/H/C/004842',
      medicineName: 'Onco-Drug',
      activeSubstance: 'examplemab',
      authorisationStatus: 'Authorised',
      therapeuticArea: 'Carcinoma, Non-Small-Cell Lung',
      marketingAuthorisationHolder: 'Acme Pharma BV',
    },
  ],
};

const EU_CTIS_FIXTURE = {
  pagination: { totalRecords: 5 },
  data: [
    {
      ctNumber: '2022-500001-30-00',
      ctTitle: 'A Phase III Study of Examplemab in NSCLC',
      sponsor: 'Acme Pharma BV',
      conditions: ['Non-Small Cell Lung Cancer'],
      trialPhase: 'Phase III',
      ctStatus: 'Ongoing',
    },
  ],
};

function okJson(json: unknown) {
  return { ok: true, status: 200, json: async () => json } as any;
}

describe('eu-data clients', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.EUDAMED_API_BASE_URL;
    delete process.env.EMA_EPAR_API_BASE_URL;
    delete process.env.EU_CTIS_API_BASE_URL;
    vi.restoreAllMocks();
  });

  // ─── EUDAMED ────────────────────────────────────────────────────────────────
  describe('eudamed-client', () => {
    it('builds a keyword query and clamps page size to [1,50]', () => {
      const qs = buildEudamedQuery({ query: 'stent', manufacturer: 'Acme', riskClass: 'III', pageSize: 999 });
      expect(qs.get('keyword')).toBe('stent');
      expect(qs.get('manufacturerName')).toBe('Acme');
      expect(qs.get('riskClass')).toBe('III');
      expect(qs.get('size')).toBe('50');
    });

    it('maps a fixture device into the citeable shape', () => {
      const d = normalizeDevice(EUDAMED_FIXTURE.content[0]);
      expect(d).toEqual({
        basicUdiDi: '0123456789012AB',
        deviceName: 'CardioStent X',
        manufacturer: 'Acme Medical GmbH',
        manufacturerSrn: 'DE-MF-000012345',
        riskClass: 'III',
        status: 'PUBLISHED',
        url: 'https://ec.europa.eu/tools/eudamed/#/screen/search-device?basicUdiData.code=0123456789012AB',
      });
    });

    it('is defensive against missing fields', () => {
      const d = normalizeDevice({});
      expect(d.basicUdiDi).toBe('');
      expect(d.url).toBe('https://ec.europa.eu/tools/eudamed/#/screen/home');
    });

    it('returns status ok with mapped devices on success and honors base-URL override', async () => {
      process.env.EUDAMED_API_BASE_URL = 'https://eudamed-proxy.internal/api/';
      global.fetch = vi.fn().mockResolvedValue(okJson(EUDAMED_FIXTURE)) as any;
      const r = await searchEudamed({ query: 'stent', pageSize: 5 });
      expect(r.source).toBe(EUDAMED_SOURCE);
      expect(r.status).toBe('ok');
      expect(r.totalCount).toBe(2);
      expect(r.devices).toHaveLength(1);
      expect(r.devices[0].basicUdiDi).toBe('0123456789012AB');
      const url = (global.fetch as any).mock.calls[0][0] as string;
      expect(url.startsWith('https://eudamed-proxy.internal/api/devices/search?')).toBe(true);
    });

    it('degrades to status unavailable on a network error (never throws)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
      const r = await searchEudamed({ query: 'stent' });
      expect(r.status).toBe('unavailable');
      expect(r.devices).toEqual([]);
      expect(r.totalCount).toBe(0);
      expect(r.message).toMatch(/ECONNREFUSED/);
    });

    it('degrades to status unavailable on a non-2xx response (never throws)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }) as any;
      const r = await searchEudamed({ query: 'stent' });
      expect(r.status).toBe('unavailable');
      expect(r.message).toMatch(/HTTP 503/);
    });

    it('treats a 404 (zero matches) as an empty OK result', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
      const r = await searchEudamed({ query: 'nonesuch' });
      expect(r.status).toBe('ok');
      expect(r.devices).toEqual([]);
    });
  });

  // ─── EMA EPAR ───────────────────────────────────────────────────────────────
  describe('ema-epar-client', () => {
    it('builds a searchTerm query', () => {
      const qs = buildEmaEparQuery({ query: 'examplemab', therapeuticArea: 'NSCLC', pageSize: 5 });
      expect(qs.get('searchTerm')).toBe('examplemab');
      expect(qs.get('therapeuticArea')).toBe('NSCLC');
      expect(qs.get('pageSize')).toBe('5');
    });

    it('maps a fixture medicine and derives an EPAR url when none is provided', () => {
      const m = normalizeMedicine(EMA_EPAR_FIXTURE.content[0]);
      expect(m.productNumber).toBe('EMEA/H/C/004842');
      expect(m.activeSubstance).toBe('examplemab');
      expect(m.authorisationStatus).toBe('Authorised');
      expect(m.url).toBe('https://www.ema.europa.eu/en/medicines/human/EPAR/onco-drug');
    });

    it('returns status ok with mapped medicines on success', async () => {
      global.fetch = vi.fn().mockResolvedValue(okJson(EMA_EPAR_FIXTURE)) as any;
      const r = await searchEmaEpar({ query: 'examplemab' });
      expect(r.source).toBe(EMA_EPAR_SOURCE);
      expect(r.status).toBe('ok');
      expect(r.totalCount).toBe(1);
      expect(r.medicines[0].medicineName).toBe('Onco-Drug');
    });

    it('degrades to status unavailable on a network error (never throws)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;
      const r = await searchEmaEpar({ query: 'x' });
      expect(r.status).toBe('unavailable');
      expect(r.medicines).toEqual([]);
    });
  });

  // ─── EU CTIS ────────────────────────────────────────────────────────────────
  describe('eu-ctis-client', () => {
    it('builds a POST search body with criteria and clamped page size', () => {
      const body = buildEuCtisBody({ condition: 'NSCLC', sponsor: 'Acme', phase: '3', status: 'Ongoing', pageSize: 0 });
      expect(body).toMatchObject({
        pagination: { size: 1, offset: 0 },
        searchCriteria: { medicalCondition: 'NSCLC', sponsor: 'Acme', trialPhase: '3', status: 'Ongoing' },
      });
    });

    it('maps a fixture trial into the citeable shape', () => {
      const t = normalizeTrial(EU_CTIS_FIXTURE.data[0]);
      expect(t).toEqual({
        euTrialNumber: '2022-500001-30-00',
        title: 'A Phase III Study of Examplemab in NSCLC',
        sponsor: 'Acme Pharma BV',
        conditions: ['Non-Small Cell Lung Cancer'],
        phase: 'Phase III',
        status: 'Ongoing',
        url: 'https://euclinicaltrials.eu/ctis-public/view/2022-500001-30-00',
      });
    });

    it('returns status ok with mapped trials and POSTs the request', async () => {
      global.fetch = vi.fn().mockResolvedValue(okJson(EU_CTIS_FIXTURE)) as any;
      const r = await searchEuCtis({ query: 'NSCLC', pageSize: 5 });
      expect(r.source).toBe(EU_CTIS_SOURCE);
      expect(r.status).toBe('ok');
      expect(r.totalCount).toBe(5);
      expect(r.trials[0].euTrialNumber).toBe('2022-500001-30-00');
      const init = (global.fetch as any).mock.calls[0][1];
      expect(init.method).toBe('POST');
    });

    it('degrades to status unavailable on a network error (never throws)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as any;
      const r = await searchEuCtis({ query: 'x' });
      expect(r.status).toBe('unavailable');
      expect(r.trials).toEqual([]);
      expect(r.message).toMatch(/timeout/);
    });
  });
});
