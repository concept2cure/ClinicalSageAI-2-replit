import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Throwaway offline certificates: no private test key is committed or logged. */
export function as2CmsFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-as2-fixture-'));
  const path = (name: string) => join(directory, name);
  const cli = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe', timeout: 20_000 });
  for (const role of ['sponsor', 'agency', 'rogue']) cli('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', `/CN=offline-${role}`, '-keyout', path(`${role}.key`), '-out', path(`${role}.pem`));
  const pem = (role: string) => readFileSync(path(`${role}.pem`), 'utf8');
  const key = (role: string) => readFileSync(path(`${role}.key`), 'utf8');
  let counter = 0;
  function signedReceipt(report: Buffer, role = 'agency') {
    const id = counter++, input = path(`report-${id}.mime`), output = path(`receipt-${id}.mime`);
    writeFileSync(input, report, { mode: 0o600 });
    cli('cms', '-sign', '-binary', '-md', 'sha256', '-nosmimecap', '-in', input, '-signer', path(`${role}.pem`), '-inkey', path(`${role}.key`), '-outform', 'DER', '-out', output);
    const boundary = `offline-signature-${id}`, encoded = readFileSync(output).toString('base64').match(/.{1,64}/g)!.join('\r\n');
    return { contentType: `multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`,
      body: Buffer.concat([Buffer.from(`--${boundary}\r\n`, 'ascii'), report, Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pkcs7-signature\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded}\r\n--${boundary}--\r\n`, 'ascii')]) };
  }
  function roundtrip(body: Buffer, role = 'agency', signerCertificate?: string) {
    const id = counter++, input = path(`wire-${id}.der`), signed = path(`decoded-${id}.mime`), verified = path(`verified-${id}.mime`);
    writeFileSync(input, body, { mode: 0o600 });
    cli('cms', '-decrypt', '-binary', '-inform', 'DER', '-in', input, '-recip', path(`${role}.pem`), '-inkey', path(`${role}.key`), '-out', signed);
    // Independently extract the exact multipart content/signature, then ask
    // OpenSSL to verify DER. Its binary SMIME reader adds a stray framing CR.
    const mime = readFileSync(signed), boundary = mime.subarray(0, mime.indexOf('\r\n\r\n')).toString('ascii').match(/boundary="([^"]+)"/)![1];
    const marker = Buffer.from(`\r\n--${boundary}`), first = mime.indexOf(Buffer.from(`--${boundary}\r\n`)) + boundary.length + 4, second = mime.indexOf(marker, first);
    const part = mime.subarray(second + marker.length + 2, mime.indexOf(marker, second + marker.length));
    const signature = Buffer.from(part.subarray(part.indexOf('\r\n\r\n') + 4).toString('ascii').replace(/\s/g, ''), 'base64');
    const contentPath = path(`content-${id}.mime`), signaturePath = path(`signature-${id}.der`);
    writeFileSync(contentPath, mime.subarray(first, second), { mode: 0o600 }); writeFileSync(signaturePath, signature, { mode: 0o600 });
    const signerPath = signerCertificate ? path(`signer-${id}.pem`) : path('sponsor.pem');
    if (signerCertificate) writeFileSync(signerPath, signerCertificate, { mode: 0o600 });
    cli('cms', '-verify', '-binary', '-inform', 'DER', '-in', signaturePath, '-content', contentPath, '-certfile', signerPath, '-nointern', '-noverify', '-out', verified);
    return readFileSync(verified);
  }
  return { directory, pem, key, signedReceipt, roundtrip, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

export function receiptReport(messageId: string, mic: string, disposition = 'processed'): Buffer {
  return Buffer.from(`Content-Type: multipart/report; report-type=disposition-notification; boundary="mdn-report"\r\n\r\n--mdn-report\r\nContent-Type: text/plain\r\n\r\nThe receipt is below.\r\n--mdn-report\r\nContent-Type: message/disposition-notification\r\n\r\nOriginal-Message-ID: ${messageId}\r\nDisposition: automatic-action/MDN-sent-automatically; ${disposition}\r\nReceived-content-MIC: ${mic}, sha-256\r\n\r\n--mdn-report--\r\n`, 'utf8');
}
