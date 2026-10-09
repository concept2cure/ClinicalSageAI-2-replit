/**
 * TOTP codes for the validation identities (RFC 6238: HMAC-SHA1, 30-second
 * steps, 6 digits — the parameters server/services/mfaService.ts verifies).
 *
 * A server that is not in development with ALLOW_DEV_AUTH=1 — staging, the
 * production image — has no dev-login and answers every password login with
 * an MFA challenge. The OQ runners complete that challenge the way a person
 * does, with an authenticator: the secret of the identity's enrolled TOTP
 * factor is supplied through the environment, never written to a record, and
 * the harness computes the current code.
 *
 * A code is never used twice for the same identity. RFC 6238 §5.2 requires a
 * verifier to reject a second use of a code that already validated; each
 * protocol runs in its own process, so the last time step used per identity is
 * kept in a file in the OS temp directory (keyed by a hash of the email, holding
 * no secret), and a login that would reuse it waits for the next step.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode an RFC 4648 base32 string (case-insensitive; spaces and padding ignored). */
export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('TOTP secret is not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP over a raw key and a counter. */
export function hotp(key, counter, digits = TOTP_DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(bin).padStart(digits, '0');
}

/** The time step a moment falls in. */
export function timeStep(epochMs = Date.now()) {
  return Math.floor(epochMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The TOTP code of a base32 secret at a moment. */
export function totp(secretBase32, epochMs = Date.now(), digits = TOTP_DIGITS) {
  return hotp(base32Decode(secretBase32), timeStep(epochMs), digits);
}

function lastStepFile(email) {
  const key = crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `oq-totp-last-step-${key}.json`);
}

/**
 * A code for this identity that has not been used before, waiting for the next
 * time step when the current one was already spent. Records the step used.
 */
export async function freshTotp(email, secretBase32) {
  const file = lastStepFile(email);
  let last = -1;
  try {
    last = JSON.parse(fs.readFileSync(file, 'utf8')).step ?? -1;
  } catch {
    // no record yet
  }
  let now = Date.now();
  if (timeStep(now) <= last) {
    const nextStepAt = (last + 1) * TOTP_PERIOD_SECONDS * 1000;
    await new Promise((r) => setTimeout(r, Math.max(0, nextStepAt - now) + 50));
    now = Date.now();
  }
  const step = timeStep(now);
  fs.writeFileSync(file, JSON.stringify({ step }));
  return totp(secretBase32, now);
}
