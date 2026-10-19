/**
 * A horizon scan names what it could not read. It never reports a quiet week instead.
 *
 * Until 2026-10-15 the harvester resolved every failed fetch (an HTTP error, a
 * timeout, blocked egress, a feed URL answering with a page that is not a feed)
 * to an empty list. The distiller resolved every failed model call to null,
 * which is also what it returns for "no substantive change". So the scan could
 * not tell a failure from a quiet week. A run in which every source failed
 * produced "0 change(s) ingested … ✅ Nothing needs your attention this week".
 * Each failed source was also marked scanned, so it was not retried until its
 * cadence had elapsed (up to 30 days).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiComplete = vi.fn();
vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: (...args: unknown[]) => aiComplete(...args) },
}));

import { enabledSources, getSource } from '../regulatory-horizon-sources';
import { harvest } from '../harvester';
import { distill } from '../distiller';
import { buildHorizonDigest } from '../horizon-digest';

const fetchMock = vi.fn();
const ich = getSource('ich-workproducts')!;
const PAGE =
  '<html><body><h1>ICH E6(R3)</h1><p>Good Clinical Practice reached Step 4 and was adopted by the Assembly.</p></body></html>';

beforeEach(() => {
  fetchMock.mockReset();
  aiComplete.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('harvest', () => {
  it('returns the read error, not an empty list, when the source answers HTTP 503', async () => {
    fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    const result = await harvest(ich);
    expect(result.error).toBe('HTTP 503');
    expect(result.items).toEqual([]);
  });

  it('returns the read error when the request itself fails', async () => {
    fetchMock.mockImplementation(async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND www.ich.org'), { code: 'ENOTFOUND' }),
      });
    });
    const result = await harvest(ich);
    expect(result.error).toBe('request failed (ENOTFOUND)');
    expect(result.items).toEqual([]);
  });

  it('a feed URL that answers with a page that is not a feed is a failed read, not an empty feed', async () => {
    process.env.HORIZON_FEED_ICH = 'https://feeds.example.test/ich';
    try {
      fetchMock.mockImplementation(async () => new Response('<html><body>Sign in</body></html>', { status: 200 }));
      const result = await harvest(ich);
      expect(result.error).toBe('response is not an RSS or Atom feed');
      expect(result.items).toEqual([]);
    } finally {
      delete process.env.HORIZON_FEED_ICH;
    }
  });

  it('a page that was read carries no error', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE, { status: 200 }));
    const result = await harvest(ich);
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
  });
});

describe('distill', () => {
  const item = {
    sourceId: ich.id,
    title: ich.title,
    url: ich.url,
    content: 'ICH E6(R3) Good Clinical Practice reached Step 4 and was adopted by the Assembly.',
  };

  it('a model call that fails is a failed distillation, not "no change"', async () => {
    aiComplete.mockRejectedValue(new Error('No AI provider configured'));
    expect(await distill(item, ich)).toEqual({ status: 'failed', reason: 'model call failed' });
  });

  it('model output that is not JSON is a failed distillation', async () => {
    aiComplete.mockResolvedValue('I cannot help with that.');
    expect(await distill(item, ich)).toMatchObject({ status: 'failed' });
  });

  it('model output that does not say whether there is a change is a failed distillation', async () => {
    aiComplete.mockResolvedValue('{}');
    expect(await distill(item, ich)).toMatchObject({ status: 'failed' });
  });

  it('an item with too little text to read is a failed distillation', async () => {
    expect(await distill({ ...item, content: 'Q&A.' }, ich)).toMatchObject({ status: 'failed' });
    expect(aiComplete).not.toHaveBeenCalled();
  });

  it('"no change" only when the model read the item and said so', async () => {
    aiComplete.mockResolvedValue(JSON.stringify({ isRegulatoryChange: false }));
    expect(await distill(item, ich)).toEqual({ status: 'no_change' });
  });
});

describe('buildHorizonDigest', () => {
  it('an incomplete scan is labelled incomplete and never says nothing needs attention', () => {
    const d = buildHorizonDigest([], {
      sourcesDue: 2,
      unreadSources: [{ sourceId: 'fda-guidance', error: 'HTTP 503' }],
      itemsHarvested: 1,
      undistilledItems: [{ sourceId: 'ema-news', url: 'https://www.ema.europa.eu/en/news', reason: 'model call failed' }],
    });
    expect(d.markdown).not.toContain('Nothing needs your attention');
    expect(d.complete).toBe(false);
    expect(d.totals).toMatchObject({ sourcesScanned: 1, sourcesUnread: 1, itemsHarvested: 1, itemsUndistilled: 1 });
    expect(d.markdown).toContain('1 of 2 source(s) could not be read');
    expect(d.markdown).toContain('fda-guidance: HTTP 503');
    expect(d.markdown).toContain('1 of 1 harvested item(s) could not be distilled');
  });
});

describe('runRegulatoryHorizonScan', () => {
  const NOW = new Date('2026-10-12T06:00:00Z');

  /** A fresh module per test: the job keeps last-run times in module state. */
  async function freshJob() {
    vi.resetModules();
    return import('../../../jobs/regulatoryHorizonScan');
  }

  it('when no source can be read, the digest says so and makes no claim about the week', async () => {
    fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    const { runRegulatoryHorizonScan } = await freshJob();
    const due = enabledSources().length;

    const { digest } = await runRegulatoryHorizonScan(NOW);

    expect(digest.markdown).not.toContain('Nothing needs your attention');
    expect(digest.complete).toBe(false);
    expect(digest.totals.sourcesUnread).toBe(due);
    expect(digest.totals.sourcesScanned).toBe(0);
    expect(digest.markdown).toContain(`${due} of ${due} source(s) could not be read`);
  });

  it('a source that could not be read is not marked scanned, so the next run retries it', async () => {
    fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    const { runRegulatoryHorizonScan } = await freshJob();

    await runRegulatoryHorizonScan(NOW);
    const firstRun = fetchMock.mock.calls.length;
    await runRegulatoryHorizonScan(NOW);

    expect(firstRun).toBe(enabledSources().length);
    expect(fetchMock.mock.calls.length).toBe(firstRun * 2);
  });

  it('items the model could not distil are counted and named, not dropped as "no change"', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE, { status: 200 }));
    aiComplete.mockRejectedValue(new Error('No AI provider configured'));
    const { runRegulatoryHorizonScan } = await freshJob();
    const due = enabledSources().length;

    const { digest } = await runRegulatoryHorizonScan(NOW);

    expect(digest.markdown).not.toContain('Nothing needs your attention');
    expect(digest.complete).toBe(false);
    expect(digest.totals.itemsUndistilled).toBe(due);
    expect(digest.undistilledItems[0]).toMatchObject({ reason: 'model call failed' });
    expect(digest.markdown).toContain(`${due} of ${due} harvested item(s) could not be distilled`);
  });

  it('a source whose items could not be distilled is retried on the next run', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE, { status: 200 }));
    aiComplete.mockRejectedValue(new Error('No AI provider configured'));
    const { runRegulatoryHorizonScan } = await freshJob();

    await runRegulatoryHorizonScan(NOW);
    const firstRun = fetchMock.mock.calls.length;
    await runRegulatoryHorizonScan(NOW);

    expect(fetchMock.mock.calls.length).toBe(firstRun * 2);
  });

  it('a complete scan with nothing to review still says so', async () => {
    fetchMock.mockImplementation(async () => new Response(PAGE, { status: 200 }));
    aiComplete.mockResolvedValue(JSON.stringify({ isRegulatoryChange: false }));
    const { runRegulatoryHorizonScan } = await freshJob();

    const { digest } = await runRegulatoryHorizonScan(NOW);

    expect(digest.complete).toBe(true);
    expect(digest.totals.sourcesScanned).toBe(enabledSources().length);
    expect(digest.markdown).toContain('Nothing needs your attention');
  });
});
