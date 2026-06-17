/**
 * Contract for the shared post-upload safety helper.
 *
 * assertUploadSafe composes the existing signature check + AV scan and
 * adds the fail-closed-in-production policy. These tests pin:
 *   - signature mismatch ⇒ 400 FILE_SIGNATURE_MISMATCH
 *   - virus FOUND ⇒ 400 FILE_SCAN_REJECTED (no signature name leaked)
 *   - scanner unavailable + NODE_ENV=production ⇒ 503 FILE_SCAN_UNAVAILABLE
 *   - scanner unavailable + NODE_ENV!=production ⇒ resolves (permissive)
 *   - clean scan ⇒ resolves
 *   - path input is read from disk
 */

import net from 'node:net';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertUploadSafe, UploadSafetyError } from '../uploadSafety';

const ORIGINAL_HOST = process.env.CLAMAV_HOST;
const ORIGINAL_PORT = process.env.CLAMAV_PORT;
const ORIGINAL_ENV = process.env.NODE_ENV;

// A valid PDF buffer (passes verifyFileSignature for application/pdf).
const PDF_BUF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 0x20)]);

interface MockServer {
  port: number;
  close(): Promise<void>;
}

function startMockClamd(reply: string | null): Promise<MockServer> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      socket.on('data', raw => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (chunk.length >= 4 && chunk.readUInt32BE(chunk.length - 4) === 0) {
          if (reply == null) socket.end();
          else {
            socket.write(`${reply}\x00`);
            socket.end();
          }
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, close: () => new Promise(r => server.close(() => r())) });
    });
    server.on('error', reject);
  });
}

afterEach(() => {
  process.env.CLAMAV_HOST = ORIGINAL_HOST;
  process.env.CLAMAV_PORT = ORIGINAL_PORT;
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('assertUploadSafe — signature check', () => {
  beforeEach(() => {
    delete process.env.CLAMAV_HOST;
    process.env.NODE_ENV = 'test';
  });

  it('rejects bytes that do not match the declared MIME (400)', async () => {
    const notPdf = Buffer.from('this is plainly not a pdf at all');
    await expect(assertUploadSafe(notPdf, 'application/pdf', 'x.pdf')).rejects.toMatchObject({
      status: 400,
      code: 'FILE_SIGNATURE_MISMATCH',
    });
  });

  it('rejects an empty buffer (400)', async () => {
    await expect(assertUploadSafe(Buffer.alloc(0), 'application/pdf', 'x.pdf')).rejects.toBeInstanceOf(
      UploadSafetyError
    );
  });
});

describe('assertUploadSafe — AV scan', () => {
  it('rejects on a virus FOUND without leaking the signature name (400)', async () => {
    const server = await startMockClamd('stream: Eicar-Test-Signature FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const err = await assertUploadSafe(PDF_BUF, 'application/pdf', 'x.pdf').catch(e => e);
      expect(err).toBeInstanceOf(UploadSafetyError);
      expect(err.status).toBe(400);
      expect(err.code).toBe('FILE_SCAN_REJECTED');
      expect(JSON.stringify(err.body)).not.toContain('Eicar');
    } finally {
      await server.close();
    }
  });

  it('resolves on a clean scan', async () => {
    const server = await startMockClamd('stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    process.env.NODE_ENV = 'production';
    try {
      await expect(assertUploadSafe(PDF_BUF, 'application/pdf', 'x.pdf')).resolves.toBeUndefined();
    } finally {
      await server.close();
    }
  });
});

describe('assertUploadSafe — fail-closed in production', () => {
  beforeEach(() => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
  });

  it('rejects (503) when scanner is not configured and NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertUploadSafe(PDF_BUF, 'application/pdf', 'x.pdf')).rejects.toMatchObject({
      status: 503,
      code: 'FILE_SCAN_UNAVAILABLE',
    });
  });

  it('resolves (permissive) when scanner is not configured and NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    await expect(assertUploadSafe(PDF_BUF, 'application/pdf', 'x.pdf')).resolves.toBeUndefined();
  });

  it('resolves (permissive) in development', async () => {
    process.env.NODE_ENV = 'development';
    await expect(assertUploadSafe(PDF_BUF, 'application/pdf', 'x.pdf')).resolves.toBeUndefined();
  });
});

describe('assertUploadSafe — path input', () => {
  it('reads bytes from a filesystem path', async () => {
    delete process.env.CLAMAV_HOST;
    process.env.NODE_ENV = 'test';
    const tmp = path.join(os.tmpdir(), `uploadsafety-${Date.now()}.pdf`);
    await fs.writeFile(tmp, PDF_BUF);
    try {
      await expect(assertUploadSafe(tmp, 'application/pdf', 'x.pdf')).resolves.toBeUndefined();
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });
});
