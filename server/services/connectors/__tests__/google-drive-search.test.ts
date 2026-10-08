/**
 * The Google Drive search request (AnA Summary S2, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md).
 *
 * Two defects in the request `search()` sends to files.list:
 *  - The query was quoted for `'` only. A backslash went through raw, so the
 *    Drive query language read it as an escape: `O'Brien \ x` became
 *    `'O\'Brien \ x'`, which Drive parses as something other than what was
 *    asked, and a trailing `\` swallowed the closing quote.
 *  - It carried none of supportsAllDrives, includeItemsFromAllDrives or
 *    corpora=allDrives, so a file kept in a shared drive — where regulatory
 *    teams keep their controlled copies — was never found.
 *
 * The token endpoint and the Drive API are stubbed; the connector, its JWT
 * signing and its request building are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { GoogleDriveConnector } from '../google-drive.js';

const realFetch = globalThis.fetch;
const requests: URL[] = [];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  requests.length = 0;
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'tok', expires_in: 3600 });
    requests.push(new URL(url));
    return json({ files: [{ id: 'f1', name: 'Stability protocol 2025.pdf', mimeType: 'application/pdf' }] });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function connected(): Promise<GoogleDriveConnector> {
  const drive = new GoogleDriveConnector();
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  await drive.authenticate({ clientId: 'svc@test.iam', clientSecret: privateKey });
  return drive;
}

async function searchRequest(text: string): Promise<URL> {
  await (await connected()).search({ keywords: [text] });
  expect(requests).toHaveLength(1);
  expect(requests[0].origin + requests[0].pathname).toBe('https://www.googleapis.com/drive/v3/files');
  return requests[0];
}

describe('GoogleDriveConnector.search — the files.list request', () => {
  it("escapes a backslash before a quote: O'Brien \\ x → fullText contains 'O\\'Brien \\\\ x'", async () => {
    const url = await searchRequest("O'Brien \\ x");
    expect(url.searchParams.get('q')).toBe("fullText contains 'O\\'Brien \\\\ x' and trashed = false");
  });

  it('a trailing backslash cannot swallow the closing quote', async () => {
    const url = await searchRequest('protocol\\');
    expect(url.searchParams.get('q')).toBe("fullText contains 'protocol\\\\' and trashed = false");
  });

  it('searches shared drives: supportsAllDrives, includeItemsFromAllDrives and corpora=allDrives', async () => {
    const url = await searchRequest('stability protocol');
    expect(url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(url.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(url.searchParams.get('corpora')).toBe('allDrives');
  });

  it('sends no orderBy with a fullText query: Drive refuses sorting on fullText terms', async () => {
    // files.list answers a fullText query that carries orderBy with "Sorting is
    // not supported for queries with fullText terms. Results are always in
    // descending relevance order." So every live search failed. search() only
    // ever builds fullText queries, so it never sends orderBy.
    const url = await searchRequest('stability protocol');
    expect(url.searchParams.get('q')).toMatch(/fullText contains/);
    expect(url.searchParams.has('orderBy')).toBe(false);
  });

  it('still returns the files Drive found', async () => {
    const results = await (await connected()).search({ keywords: ['stability protocol'] });
    expect(results.map((r) => [r.sourceConnector, r.title])).toEqual([['google_drive', 'Stability protocol 2025.pdf']]);
  });
});
