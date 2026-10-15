/**
 * An openFDA read that failed is not an empty one, and a MAUDE report's event
 * type is the one FDA recorded.
 *
 * - fetchDeviceRecalls / fetchMaudeEvents read res.json() without the status:
 *   a 429 or 5xx normalised to [] — AnA's search_device_recalls reported "no
 *   recalls" for a device it never got an answer about.
 * - openFDA answers "no matches" as 404 NOT_FOUND; the MAUDE client rejected
 *   it, reading a true zero as a failed search.
 * - The MAUDE client guessed event type from narrative keywords ("no death
 *   occurred" counted as Death) and labelled reports with the searched-for
 *   device and manufacturer when they stated none.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fetchDeviceRecalls, fetchMaudeEvents } from '../openfda-surveillance';

type MaudeRow = Record<string, unknown>;
let transformMaudeResults: (r: { results: unknown[] }) => MaudeRow[];
beforeAll(async () => {
  // A JavaScript module: its named export is read through the namespace.
  const mod = (await import('../../../fda_maude_client.js')) as unknown as { transformMaudeResults: typeof transformMaudeResults };
  transformMaudeResults = mod.transformMaudeResults;
});

const reply = (status: number, body: unknown) => vi.fn(async () => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
}));

describe('openFDA fetch seam', () => {
  it.each([
    [429, { error: { code: 'OVER_RATE_LIMIT', message: 'API rate limit exceeded' } }],
    [500, { error: { code: 'SERVER_ERROR', message: 'Internal error' } }],
    [503, null],
  ])('a %i reply is a failure, not "no recalls"', async (status, body) => {
    await expect(fetchDeviceRecalls('product_description:pump', { fetcher: reply(status, body) }))
      .rejects.toThrow(new RegExp(`HTTP ${status}`));
    await expect(fetchMaudeEvents('device.generic_name:pump', { fetcher: reply(status, body) }))
      .rejects.toThrow(new RegExp(`HTTP ${status}`));
  });

  it("openFDA's 404 NOT_FOUND is a true zero", async () => {
    const notFound = { error: { code: 'NOT_FOUND', message: 'No matches found!' } };
    await expect(fetchDeviceRecalls('product_description:pump', { fetcher: reply(404, notFound) })).resolves.toEqual([]);
    await expect(fetchMaudeEvents('device.generic_name:pump', { fetcher: reply(404, notFound) })).resolves.toEqual([]);
  });

  it('a 404 that is not "no matches" is still a failure', async () => {
    await expect(fetchDeviceRecalls('x', { fetcher: reply(404, { error: { code: 'BAD_PATH' } }) })).rejects.toThrow(/HTTP 404/);
  });
});

describe('MAUDE reports say what FDA recorded', () => {
  const report = (over: Record<string, unknown>) => ({
    report_number: 'R1', date_received: '20260101',
    device: [{ generic_name: 'Infusion pump', manufacturer_d_name: 'Acme', product_code: 'FRN' }],
    mdr_text: [{ text_type_code: 'Description of Event or Problem', text: 'Pump alarmed; no death occurred and no malfunction found.' }],
    ...over,
  });

  it("takes the event type from openFDA's event_type, not the narrative", () => {
    const [r] = transformMaudeResults({ results: [report({ event_type: 'Injury' })] });
    expect(r.event_type).toBe('Injury');
  });

  it('says "Not stated" when the report records no event type', () => {
    const [r] = transformMaudeResults({ results: [report({})] });
    expect(r.event_type).toBe('Not stated');
  });

  it('does not label a report with the device and manufacturer that were searched for', () => {
    const [r] = transformMaudeResults({ results: [report({ device: [{}] })] });
    expect(r).toMatchObject({ device_name: 'Not stated', manufacturer: 'Not stated', product_code: '' });
  });
});
