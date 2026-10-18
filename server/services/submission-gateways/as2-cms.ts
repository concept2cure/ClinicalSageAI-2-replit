/** RFC 4130 CMS primitives. OpenSSL is an explicit runtime dependency, not a shell. */
import { execFile, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, X509Certificate, timingSafeEqual, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TransportError } from './types';

export interface As2CmsEnvelope { body: Buffer; contentType: string; mic: string; micAlgorithm: 'sha-256' }

export function as2CmsAvailable(): boolean {
  const result = spawnSync('openssl', ['version'], { timeout: 1500, stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

function validateCertificate(pem: string): X509Certificate {
  try {
    const cert = new X509Certificate(pem);
    const now = Date.now();
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) throw new Error('outside validity');
    return cert;
  } catch { throw new TransportError('AS2 certificate is invalid or outside its validity period. Nothing was transmitted.', null); }
}

export function validateAs2CmsCredentials(clientCertPem: string, clientKeyPem: string, agencyCertPem: string): void {
  const cert = validateCertificate(clientCertPem); validateCertificate(agencyCertPem);
  try { if (!cert.checkPrivateKey(createPrivateKey(clientKeyPem))) throw new Error('key mismatch'); }
  catch { throw new TransportError('AS2 signing certificate and private key do not match. Nothing was transmitted.', null); }
}

async function cms(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('openssl', ['cms', ...args], { timeout: 60_000, maxBuffer: 16_384, windowsHide: true }, error => {
      // OpenSSL diagnostics, keys and payloads never enter application errors/logs.
      if (error) reject(new TransportError('AS2 CMS operation failed or OpenSSL is unavailable.', null));
      else resolve();
    });
  });
}

async function workspace<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(join(tmpdir(), 'c2c-as2-cms-'));
  try { await fs.chmod(directory, 0o700); return await work(directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function privateFile(directory: string, name: string, value: string | Buffer): Promise<string> {
  const path = join(directory, name); await fs.writeFile(path, value, { mode: 0o600 }); return path;
}

/** The MIC covers the exact MIME entity that is signed, including its MIME headers. */
export function as2PayloadEntity(body: Buffer, contentType: string, filename: string): Buffer {
  if (/[\r\n]/.test(contentType) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename)) throw new TransportError('Invalid AS2 payload MIME metadata.', null);
  return Buffer.concat([Buffer.from(`Content-Type: ${contentType}\r\nContent-Transfer-Encoding: binary\r\nContent-Disposition: attachment; filename="${filename}"\r\n\r\n`, 'ascii'), body]);
}

/** Detached CMS SignedData inside recipient-encrypted EnvelopedData; payload bytes remain exact. */
export async function buildAs2CmsEnvelope(args: { body: Buffer; contentType: string; filename: string; clientCertPem: string; clientKeyPem: string; agencyCertPem: string }): Promise<As2CmsEnvelope> {
  validateAs2CmsCredentials(args.clientCertPem, args.clientKeyPem, args.agencyCertPem);
  const entity = as2PayloadEntity(args.body, args.contentType, args.filename);
  return workspace(async directory => {
    const [input, signer, key, recipient] = await Promise.all([
      privateFile(directory, 'payload.mime', entity), privateFile(directory, 'signer.pem', args.clientCertPem),
      privateFile(directory, 'signer-key.pem', args.clientKeyPem), privateFile(directory, 'recipient.pem', args.agencyCertPem),
    ]);
    const signed = join(directory, 'signed.mime'), signature = join(directory, 'signature.der'), encrypted = join(directory, 'encrypted.der');
    // Build MIME framing ourselves: OpenSSL -crlfeol can alter already-canonical
    // binary content when writing multipart/signed. DER signs the exact entity.
    await cms(['-sign', '-binary', '-md', 'sha256', '-in', input, '-signer', signer, '-inkey', key, '-nosmimecap', '-outform', 'DER', '-out', signature]);
    const boundary = `c2c-as2-${randomUUID()}`, encoded = (await fs.readFile(signature)).toString('base64').match(/.{1,64}/g)!.join('\r\n');
    await fs.writeFile(signed, Buffer.concat([
      Buffer.from(`MIME-Version: 1.0\r\nContent-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"\r\n\r\n--${boundary}\r\n`, 'ascii'),
      entity, Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pkcs7-signature; name="smime.p7s"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded}\r\n--${boundary}--\r\n`, 'ascii'),
    ]), { mode: 0o600 });
    await cms(['-encrypt', '-binary', '-aes-256-cbc', '-in', signed, '-outform', 'DER', '-out', encrypted, recipient]);
    return { body: await fs.readFile(encrypted), contentType: 'application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"',
      mic: createHash('sha256').update(entity).digest('base64'), micAlgorithm: 'sha-256' };
  });
}

/** Only the pinned agency certificate can verify this receipt; embedded attacker certificates are ignored. */
export async function verifyAs2CmsReceipt(body: Buffer, contentType: string, agencyCertPem: string): Promise<Buffer> {
  const pinnedCertificate = validateCertificate(agencyCertPem).toString();
  if (body.length > 8 * 1024 * 1024 || /[\r\n]/.test(contentType) || !/^(multipart\/signed|application\/(?:x-)?pkcs7-mime)\b/i.test(contentType)) throw new TransportError('AS2 receipt is not a bounded signed S/MIME entity.', null);
  return workspace(async directory => {
    const opaque = /^application\//i.test(contentType);
    const detached = opaque ? null : splitAs2MultipartSignature(body, contentType);
    const input = await privateFile(directory, 'receipt.der', detached?.signature ?? body), certificate = await privateFile(directory, 'agency.pem', pinnedCertificate), output = join(directory, 'verified.mime');
    const content = detached ? await privateFile(directory, 'receipt-content.mime', detached.content) : null;
    // -noverify skips PKI chain lookup, not signature verification. Trust is
    // pinned above: -nointern forbids selecting any embedded signer certificate.
    await cms(['-verify', '-binary', '-inform', 'DER', '-in', input, ...(content ? ['-content', content] : []), '-certfile', certificate, '-nointern', '-noverify', '-out', output]);
    return fs.readFile(output);
  });
}

interface MimeBoundary { at: number; after: number; closing: boolean }
function boundaryLine(body: Buffer, boundary: string, start: number): MimeBoundary | null {
  const token = Buffer.from(`--${boundary}`, 'ascii');
  let at = body.indexOf(token, start);
  while (at >= 0) {
    let after = at + token.length;
    const closing = body.subarray(after, after + 2).toString('ascii') === '--';
    if (closing) after += 2;
    while (body[after] === 32 || body[after] === 9) after++;
    const crlf = body[after] === 13 && body[after + 1] === 10;
    if ((at === 0 || body[at - 1] === 10) && (crlf || body[after] === 10 || after === body.length)) return { at, after: after + (crlf ? 2 : body[after] === 10 ? 1 : 0), closing };
    at = body.indexOf(token, at + token.length);
  }
  return null;
}
function beforeBoundary(body: Buffer, at: number): number {
  return body[at - 2] === 13 && body[at - 1] === 10 ? at - 2 : body[at - 1] === 10 ? at - 1 : at;
}

/** RFC 2046 framing is removed without touching signed bytes. OpenSSL's SMIME
 * reader retains a stray CR in binary mode; verify DER with exact detached content. */
function decodeCmsSignature(part: Buffer): Buffer {
  let separator = part.indexOf('\r\n\r\n'), separatorSize = 4;
  if (separator < 0) { separator = part.indexOf('\n\n'); separatorSize = 2; }
  if (separator < 0) throw new TransportError('AS2 signature MIME headers are missing.', null);
  const headers = part.subarray(0, separator).toString('ascii').replace(/\r?\n[ \t]+/g, ' ');
  if (!/^Content-Type:\s*application\/(?:x-)?pkcs7-signature\b/im.test(headers) || !/^Content-Transfer-Encoding:\s*base64\s*$/im.test(headers)) throw new TransportError('AS2 receipt signature is not base64 CMS SignedData.', null);
  const encoded = part.subarray(separator + separatorSize).toString('ascii').replace(/\s/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new TransportError('AS2 receipt signature encoding is invalid.', null);
  return Buffer.from(encoded, 'base64');
}

export function splitAs2MultipartSignature(body: Buffer, contentType: string): { content: Buffer; signature: Buffer } {
  const boundary = contentType.match(/;\s*boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i)?.slice(1).find(Boolean);
  if (!boundary || boundary.length > 70 || /[\r\n]/.test(boundary)) throw new TransportError('AS2 signed receipt has no valid MIME boundary.', null);
  const first = boundaryLine(body, boundary, 0), second = first && boundaryLine(body, boundary, first.after), end = second && boundaryLine(body, boundary, second.after);
  if (!first || first.closing || !second || second.closing || !end?.closing) throw new TransportError('AS2 signed receipt must contain exactly content and signature parts.', null);
  const signature = decodeCmsSignature(body.subarray(second.after, beforeBoundary(body, end.at)));
  return { content: body.subarray(first.after, beforeBoundary(body, second.at)), signature };
}

export function as2MicMatches(received: string | null | undefined, expected: string): boolean {
  if (typeof received !== 'string') return false;
  const parts = received.split(',').map(s => s.trim());
  if (parts.length !== 2 || !/^sha-?256$/i.test(parts[1]) || !/^[A-Za-z0-9+/]{43}=$/.test(parts[0])) return false;
  const actual = Buffer.from(parts[0], 'base64'), wanted = Buffer.from(expected, 'base64');
  return actual.length === 32 && wanted.length === 32 && timingSafeEqual(actual, wanted);
}
