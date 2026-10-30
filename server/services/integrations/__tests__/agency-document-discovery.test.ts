import { afterEach, describe, expect, it, vi } from 'vitest';
import ema from './fixtures/ema-zinplava-2026-10-27.json';
import fda from './fixtures/fda-zinplava-2026-10-27.json';
import { searchEmaEpar, clearEmaEparCache } from '../ema-epar-client';
import { searchDrugApprovals } from '../drug-approvals-client';
import { FDADrugsConnector } from '../../connectors/fda-drugs';
import { EMAEPARConnector } from '../../connectors/ema-epar';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => { clearEmaEparCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('official agency metadata retains document identity without claiming acquisition', () => {
  it('searches the official human-medicine feed and joins documents by EMA product number', async () => {
    const request = vi.fn(async (url: string) => url.includes('medicines_json')
      ? json({ data: [ema.medicine, { ...ema.medicine, category: 'Veterinary', ema_product_number: 'EMEA/V/C/999' }] })
      : json({ data: ema.documents }));
    vi.stubGlobal('fetch', request);
    const result = await searchEmaEpar({ query: 'difficile', activeSubstance: 'bezlotoxumab' });
    expect(result.status).toBe('ok');
    expect(result.totalCount).toBe(1);
    expect(result.medicines[0]).toMatchObject({ productNumber: 'EMEA/H/C/004136', medicineName: 'Zinplava', authorisationStatus: 'Withdrawn', url: ema.medicine.medicine_url });
    expect((result.medicines[0] as any).documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://www.ema.europa.eu/en/documents/assessment-report/zinplava-epar-public-assessment-report_en.pdf', agencyType: 'assessment-report', classification: 'regulatory_assessment', acquisitionStatus: 'listed_only' }),
    ]));
    expect(request.mock.calls.every(([url]) => url.startsWith('https://www.ema.europa.eu/en/documents/report/'))).toBe(true);
    expect(request.mock.calls.every(([url]) => url.endsWith('.json'))).toBe(true);
    await searchEmaEpar({ query: 'Zinplava' });
    const record = await new EMAEPARConnector().fetch('ema:EMEA/H/C/004136');
    expect(record).toMatchObject({ title: 'Zinplava', type: 'epar_metadata', url: ema.medicine.medicine_url });
    expect(JSON.parse(record.content).documents).toHaveLength(9);
    expect(request).toHaveBeenCalledTimes(2); // Six-hour metadata cache, no PDF calls.
  });

  it('refuses an oversized feed before consuming its body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[]}', { headers: {
      'content-type': 'application/json', 'content-length': '100000000',
    } })));
    expect(await searchEmaEpar({ query: 'Zinplava' })).toMatchObject({ status: 'unavailable', medicines: [], message: expect.stringMatching(/byte limit/) });
  });

  it('does not turn failure of the document index into a successful empty document list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('medicines_json')
      ? json({ data: [ema.medicine] }) : new Response('not found', { status: 404 })));
    expect(await searchEmaEpar({ query: 'Zinplava' })).toMatchObject({ status: 'unavailable', medicines: [], message: expect.stringMatching(/HTTP 404/) });
  });

  it('preserves FDA submission document URLs and types through both live search surfaces', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fda)));
    const result = await searchDrugApprovals({ brandName: 'Zinplava' });
    const documents = (result.approvals[0] as any).applicationDocuments;
    expect(documents).toHaveLength(6);
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '46104', agencyType: 'Review', classification: 'review_package_index', url: 'http://www.accessdata.fda.gov/drugsatfda_docs/nda/2016/761046_toc.html', acquisitionStatus: 'listed_only' }),
      expect.objectContaining({ id: '46110', agencyType: 'Summary Review', classification: 'regulatory_review' }),
    ]));
    const [connected] = await new FDADrugsConnector().search({ keywords: ['Zinplava'] });
    expect(connected.metadata.applicationDocuments).toEqual(documents);
    expect(documents.some((d: any) => /csr|clinical.study.report/i.test(d.classification))).toBe(false);
  });

  it('rejects HTML and an unexpected FDA payload instead of reporting zero matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>language selection</html>', { headers: { 'content-type': 'text/html' } })));
    const emaResult = await searchEmaEpar({ query: 'Zinplava' });
    expect(emaResult.status).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'maintenance' })));
    await expect(searchDrugApprovals({ brandName: 'Zinplava' })).rejects.toThrow(/unexpected|results/i);
    await expect(new FDADrugsConnector().search({ keywords: ['Zinplava'] })).rejects.toThrow(/unexpected|results/i);
  });

  it('fails closed if medicine record fields drift instead of filtering the entire feed to zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ changed_product_field: 'Zinplava' }] })));
    expect(await searchEmaEpar({ query: 'Zinplava' })).toMatchObject({ status: 'unavailable', medicines: [], message: expect.stringMatching(/unexpected shape/) });
  });
});
