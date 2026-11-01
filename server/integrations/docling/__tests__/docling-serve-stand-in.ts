/**
 * A stand-in for docling-serve's v1 file endpoint, for the P-90 tests.
 *
 * It answers only what the real reader answers to (docling-project/docling-serve
 * docs/usage.md): POST /v1/convert/file with a multipart form. Any other path is
 * FastAPI's 404 `{"detail":"Not Found"}`, which is what the old client's
 * `POST /parse` met. Its document is a real DoclingDocument from Docling's own
 * test data (fixtures/README.md), not one typed for the test.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const doclingFixture = (name: 'multi_page' | 'masked_tables') =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.docling.json`), 'utf8'));

export interface SeenRequest { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }

export interface StandIn {
  url: string;
  seen: SeenRequest[];
  /** What the next conversions answer: a document, an HTTP status, a conversion status, or a delay. */
  answer: { document?: unknown; httpStatus?: number; status?: string; delayMs?: number; apiKey?: string };
  close(): Promise<void>;
}

/** The multipart field `name`'s value, as the form sent it. */
export function formField(body: Buffer, name: string): string[] {
  const text = body.toString('latin1');
  const out: string[] = [];
  const re = new RegExp(`name="${name}"(?:; filename="[^"]*")?\\r\\n(?:Content-Type: [^\\r]*\\r\\n)?\\r\\n([\\s\\S]*?)\\r\\n--`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1]);
  return out;
}

export async function startDoclingServeStandIn(): Promise<StandIn> {
  const standIn = { seen: [] as SeenRequest[], answer: {} as StandIn['answer'] };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const seen = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) };
      standIn.seen.push(seen);
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const a = standIn.answer;
      if (seen.method !== 'POST' || seen.url !== '/v1/convert/file') return reply(404, { detail: 'Not Found' });
      if (!String(req.headers['content-type'] ?? '').startsWith('multipart/form-data')) return reply(422, { detail: 'multipart form required' });
      if (a.apiKey && req.headers['x-api-key'] !== a.apiKey) return reply(401, { detail: 'Invalid API key' });
      const send = () => reply(a.httpStatus ?? 200, {
        document: { filename: 'x', md_content: null, json_content: a.document ?? null, html_content: null, text_content: null, doctags_content: null },
        status: a.status ?? 'success', errors: [], processing_time: 0.1, timings: {},
      });
      if (a.delayMs) setTimeout(send, a.delayMs); else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get seen() { return standIn.seen; },
    get answer() { return standIn.answer; },
    set answer(v) { standIn.answer = v; },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  } as StandIn;
}
