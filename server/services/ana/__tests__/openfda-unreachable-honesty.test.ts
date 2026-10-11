/**
 * A register AnA could not reach is not a register with nothing in it.
 *
 * WHAT WENT WRONG
 * Both openFDA adverse-event tools answered a FAILED request as a successful
 * search that found nothing. The FAERS client returns `{ error, results: {...} }`
 * on a transport failure and the MAUDE client returned `[]`; neither handler
 * looked. `analyzeFaersData` then read no counts off that empty body, so the
 * tool returned:
 *
 *   "Analysis of undefined FDA FAERS reports found undefined serious reports
 *    (0%) and 0 unique adverse events."
 *
 * with provenance titled "(0 reports)". Found by calling all 145 read tools
 * against the local database (docs/evidence/W1/2026-09-28-ana-drive/
 * tool-honesty.txt): openFDA answered 403 here, and AnA was handed a clean
 * zero. On a safety register that is the worst possible lie — "no adverse
 * events reported for this product" when nobody asked the register.
 *
 * WHAT IS PINNED
 *   1. A failed search says so, carries no counts, and tells AnA not to read
 *      it as a finding of zero.
 *   2. A call naming nothing to search for is refused as needs_parameters
 *      rather than sent (both clients answer a criteria-less search with an
 *      empty result, which read the same way).
 *   3. A search that really ran still reports its real counts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const faers = vi.hoisted(() => ({ searchAdverseEvents: vi.fn(), analyzeFaersData: vi.fn() }));
const maude = vi.hoisted(() => ({ searchDeviceReports: vi.fn(), analyzeMaudeData: vi.fn() }));
vi.mock('../../../fda_faers_client.js', () => ({ default: faers }));
vi.mock('../../../fda_maude_client.js', () => ({ default: maude }));

import { getToolHandler } from '../AnaToolExecutor';

const call = async (tool: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!(input, {} as any));

/** No count, no zero, and nothing that reads as "nothing was reported". */
function claimsNothingFound(body: string): boolean {
  return /0 reports|0 unique|no .*data found|total_reports/i.test(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  faers.analyzeFaersData.mockReturnValue({ total_reports: 42, serious_reports: 4, adverse_events_count: 9 });
  maude.analyzeMaudeData.mockReturnValue({ total_reports: 7 });
});

describe('FAERS could not be searched', () => {
  it('the client reporting a failed request is not a finding of zero adverse events', async () => {
    // What the real client returns on a transport failure: empty, with `error`.
    faers.searchAdverseEvents.mockResolvedValue({ error: 'HTTP Error: 403 Forbidden', meta: { total: 0 }, results: { adverse_events: [] } });
    const out = await call('search_drug_adverse_events', { product_name: 'aspirin' });

    expect(out.status).toBe('unavailable');
    expect(out.error).toMatch(/403/);
    expect(out.error).toMatch(/not a finding of zero adverse events/i);
    expect(out.summary, 'a failed search must carry no counts').toBeUndefined();
    expect(claimsNothingFound(JSON.stringify(out))).toBe(false);
  });

  it('a thrown request says so too', async () => {
    faers.searchAdverseEvents.mockRejectedValue(new Error('socket hang up'));
    const out = await call('search_drug_adverse_events', { product_name: 'aspirin' });
    expect(out.status).toBe('unavailable');
    expect(out.error).toMatch(/socket hang up/);
    expect(claimsNothingFound(JSON.stringify(out))).toBe(false);
  });

  it('a search naming nothing is refused, not sent as a blank query', async () => {
    const out = await call('search_drug_adverse_events', {});
    expect(out.status).toBe('needs_parameters');
    expect(faers.searchAdverseEvents).not.toHaveBeenCalled();
  });

  it('a search that ran reports its real counts', async () => {
    faers.searchAdverseEvents.mockResolvedValue({ results: { adverse_events: [{ term: 'nausea' }] } });
    const out = await call('search_drug_adverse_events', { product_name: 'aspirin' });
    expect(out.summary.total_reports).toBe(42);
    expect(out.provenance[0].citation.title).toMatch(/42 reports/);
  });
});

describe('MAUDE could not be searched', () => {
  it('a thrown request is not a finding of zero device reports', async () => {
    maude.searchDeviceReports.mockRejectedValue(new Error('HTTP Error: 403 Forbidden'));
    const out = await call('search_device_adverse_events', { device_name: 'insulin pump' });

    expect(out.status).toBe('unavailable');
    expect(out.error).toMatch(/403/);
    expect(out.error).toMatch(/not a finding of zero adverse events/i);
    expect(out.summary).toBeUndefined();
    expect(claimsNothingFound(JSON.stringify(out))).toBe(false);
  });

  it('a search naming nothing is refused, not sent as a blank query', async () => {
    const out = await call('search_device_adverse_events', {});
    expect(out.status).toBe('needs_parameters');
    expect(maude.searchDeviceReports).not.toHaveBeenCalled();
  });

  it('a search that ran reports its real counts', async () => {
    maude.searchDeviceReports.mockResolvedValue([{ y: 1 }]);
    const out = await call('search_device_adverse_events', { device_name: 'insulin pump' });
    expect(out.summary.total_reports).toBe(7);
    expect(out.provenance[0].citation.title).toMatch(/7 reports/);
  });
});

describe('the MAUDE client itself', () => {
  it('raises a failed search instead of returning an empty list', async () => {
    // The real client's catch returned [], which every caller read as "no
    // reports for this device". It must raise so the caller can tell the two
    // apart; AnA's tool catches it above, and data_integration.js already
    // catches and leaves MAUDE out of its source list. Read from the source:
    // the module is plain JS with no types, and the behaviour under test is a
    // transport failure this suite deliberately does not perform.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../fda_maude_client.js', import.meta.url), 'utf8');
    const tail = src.slice(src.indexOf("console.error('Error searching FDA MAUDE:"));
    expect(tail, 'the catch must be there to read').not.toBe('');
    expect(tail.slice(0, 400), 'the catch must rethrow, not swallow into []').toMatch(/throw error;/);
  });
});
